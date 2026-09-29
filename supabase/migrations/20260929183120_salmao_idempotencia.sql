-- ─────────────────────────────────────────────────────────────────────────────
-- Salmão — entrada e manipulação idempotentes.
--
-- Entrada (`_salmon_create_entry_guarded` → `create_salmon_entry_atomic`) e
-- manipulação (`_salmon_create_manipulation_guarded` →
-- `create_salmon_manipulation_atomic`) não tinham chave de reenvio: duplo clique,
-- Enter + clique ou retry depois de resposta perdida gravavam a entrada/saída de
-- salmão (e o espelho no estoque) duas vezes.
--
--   · `client_request_id` = chave DERIVADA da operação no cliente (semente do
--     formulário + resumo do conteúdo). Índices únicos parciais por empresa,
--     só sobre registro ACTIVE — cancelado libera a chave, como no operacional.
--   · Caminho rápido antes do INSERT; `unique_violation` tratado como reenvio.
--   · Reenvio só é reenvio se o conteúdo gravado for o mesmo; senão
--     REQUEST_ID_REUTILIZADO. Reenvio devolve o mesmo formato do retorno normal,
--     com `idempotente=true`, sem nova auditoria nem novo espelho no estoque.
--   · Manipulação: o caminho rápido roda depois do FOR UPDATE da entrada, então
--     dois envios simultâneos serializam ali e o segundo já enxerga o primeiro.
--
-- Assinaturas: parâmetro novo `p_client_request_id text default null` no fim.
-- DROP da assinatura antiga antes do CREATE (senão vira overload e a chamada
-- posicional de `_salmon_replace_*_guarded` fica ambígua). O front em produção
-- chama por nome sem o parâmetro novo e continua resolvendo pelo DEFAULT; as
-- funções `_salmon_replace_*` (edição) seguem sem chave, como hoje.
--
-- Corpos copiados do banco vivo (pg_get_functiondef em 2026-09-29), não de
-- migrations antigas. ACL reproduzida: atomic só postgres; guarded authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.salmon_entries
  add column if not exists client_request_id text;
alter table public.salmon_manipulations
  add column if not exists client_request_id text;

alter table public.salmon_entries
  drop constraint if exists salmon_entries_client_request_id_len;
alter table public.salmon_entries
  add constraint salmon_entries_client_request_id_len
  check (client_request_id is null or char_length(client_request_id) between 1 and 200);

alter table public.salmon_manipulations
  drop constraint if exists salmon_manipulations_client_request_id_len;
alter table public.salmon_manipulations
  add constraint salmon_manipulations_client_request_id_len
  check (client_request_id is null or char_length(client_request_id) between 1 and 200);

do $preflight$
begin
  if exists (
    select 1 from public.salmon_entries
    where client_request_id is not null and status = 'ACTIVE'
    group by company_id, client_request_id having count(*) > 1
  ) or exists (
    select 1 from public.salmon_manipulations
    where client_request_id is not null and status = 'ACTIVE'
    group by company_id, client_request_id having count(*) > 1
  ) then
    raise exception 'SALMON_CLIENT_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_salmon_entries_client_request
  on public.salmon_entries (company_id, client_request_id)
  where client_request_id is not null and status = 'ACTIVE';

create unique index if not exists uq_salmon_manipulations_client_request
  on public.salmon_manipulations (company_id, client_request_id)
  where client_request_id is not null and status = 'ACTIVE';

-- ── Entrada ─────────────────────────────────────────────────────────────────

drop function if exists public._salmon_create_entry_guarded(text, text, text, text, integer, integer, numeric, numeric, text, text);
drop function if exists public.create_salmon_entry_atomic(date, text, text, text, integer, integer, numeric, numeric, text, date);

create function public.create_salmon_entry_atomic(
  p_entry_date date, p_lot text, p_sif text, p_supplier_name text,
  p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric,
  p_notes text default ''::text, p_expiration_date date default null::date,
  p_client_request_id text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
DECLARE
  v_entry_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_supplier_uuid uuid;
  v_caller uuid;
  v_company_id uuid;
  v_key text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_nova boolean := false;
  v_existente RECORD;
BEGIN
  -- Multi-tenant enforcement
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_kg <= 0 THEN RAISE EXCEPTION 'gross_kg deve ser > 0'; END IF;
  IF p_total_value < 0 THEN RAISE EXCEPTION 'total_value não pode ser negativo'; END IF;
  IF p_expiration_date IS NOT NULL AND p_expiration_date < p_entry_date THEN
    RAISE EXCEPTION 'Validade (%) não pode ser anterior à data de entrada (%).', p_expiration_date, p_entry_date;
  END IF;
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN RAISE EXCEPTION 'REQUEST_ID_INVALIDO'; END IF;

  v_cost_per_kg := CASE WHEN p_gross_kg > 0 THEN ROUND(p_total_value / p_gross_kg, 4) ELSE 0 END;

  -- 0. Reenvio: caminho rápido antes de gravar qualquer coisa.
  IF v_key IS NOT NULL THEN
    SELECT id INTO v_entry_id FROM salmon_entries
    WHERE company_id = v_company_id AND client_request_id = v_key AND status = 'ACTIVE';
  END IF;

  -- 1. Insert salmon_entries
  IF v_entry_id IS NULL THEN
    BEGIN
      INSERT INTO salmon_entries (
        entry_date, lot, sif, supplier_name, boxes, units, gross_kg, total_value, notes, created_by, company_id,
        expiration_date, client_request_id
      ) VALUES (
        p_entry_date, COALESCE(p_lot,''), COALESCE(p_sif,''), COALESCE(p_supplier_name,''),
        COALESCE(p_boxes,0), COALESCE(p_units,0), p_gross_kg, p_total_value,
        COALESCE(p_notes,''), v_caller, v_company_id,
        p_expiration_date, v_key
      ) RETURNING id INTO v_entry_id;
      v_nova := true;
    EXCEPTION WHEN unique_violation THEN
      -- Outra transação gravou a mesma chave entre o caminho rápido e o INSERT.
      SELECT id INTO v_entry_id FROM salmon_entries
      WHERE company_id = v_company_id AND client_request_id = v_key AND status = 'ACTIVE';
      IF v_entry_id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF NOT v_nova THEN
    -- Só é reenvio se descrever a MESMA entrada.
    SELECT * INTO v_existente FROM salmon_entries WHERE id = v_entry_id AND company_id = v_company_id;
    IF v_existente.entry_date IS DISTINCT FROM p_entry_date
       OR v_existente.lot IS DISTINCT FROM COALESCE(p_lot,'')
       OR v_existente.sif IS DISTINCT FROM COALESCE(p_sif,'')
       OR v_existente.supplier_name IS DISTINCT FROM COALESCE(p_supplier_name,'')
       OR v_existente.boxes IS DISTINCT FROM COALESCE(p_boxes,0)
       OR v_existente.units IS DISTINCT FROM COALESCE(p_units,0)
       OR v_existente.gross_kg IS DISTINCT FROM p_gross_kg
       OR v_existente.total_value IS DISTINCT FROM p_total_value
       OR COALESCE(v_existente.notes,'') IS DISTINCT FROM COALESCE(p_notes,'')
       OR v_existente.expiration_date IS DISTINCT FROM p_expiration_date THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;

    SELECT id INTO v_mov_id FROM movimentacoes_estoque
      WHERE reference_type = 'SALMON_ENTRY' AND reference_id = v_entry_id::text
        AND status = 'ATIVO' AND company_id = v_company_id;

    RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id,
      'unit_cost', CASE WHEN v_existente.gross_kg > 0 THEN ROUND(v_existente.total_value / v_existente.gross_kg, 4) ELSE 0 END,
      'expiration_date', v_existente.expiration_date, 'company_id', v_company_id, 'idempotente', true);
  END IF;

  -- 2. Ensure salmon raw product (v_produto_id is global reference but logically belongs to the tenant)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  -- 3. Mirror to stock (ENTRADA)
  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = v_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      data = p_entry_date,
      observacao = 'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
      editado_em = now(), editado_por = v_caller,
      salmon_lot_id = p_lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_produto_id, p_entry_date, 'ENTRADA', p_gross_kg, v_cost_per_kg,
      ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão',
      'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
      v_caller, 'ATIVO', 'SALMON_ENTRY', v_entry_id::text, false, 'salmon', p_lot, v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 4. Update produto cost (Global but context of company insert)
  IF v_cost_per_kg > 0 THEN
    UPDATE produtos SET
      last_cost_purchase_unit = v_cost_per_kg, last_cost_base_unit = v_cost_per_kg,
      last_purchase_date = p_entry_date::text, last_supplier = p_supplier_name,
      custo_padrao = CASE WHEN custo_padrao = 0 THEN v_cost_per_kg ELSE custo_padrao END,
      default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN v_cost_per_kg ELSE default_cost_purchase_unit END,
      default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN v_cost_per_kg ELSE default_cost_base_unit END
    WHERE id = v_produto_id AND company_id = v_company_id;
  END IF;

  -- 5. Upsert supplier + supplier_item_prices
  IF p_supplier_name IS NOT NULL AND p_supplier_name != '' THEN
    INSERT INTO suppliers (name, company_id) VALUES (p_supplier_name, v_company_id)
    ON CONFLICT (name, company_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;

    IF v_supplier_uuid IS NOT NULL THEN
      INSERT INTO supplier_item_prices (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, last_updated_at, source, company_id)
      VALUES (p_supplier_name, v_supplier_uuid, v_produto_id, v_cost_per_kg, 'KG', now(), 'salmon', v_company_id)
      ON CONFLICT (supplier_id, stock_item_id, company_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost, supplier_uuid = EXCLUDED.supplier_uuid,
        last_updated_at = EXCLUDED.last_updated_at, source = 'salmon';
    END IF;
  END IF;

  -- 6. Audit (includes company_id)
  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', v_entry_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object('gross_kg', p_gross_kg, 'total_value', p_total_value, 'lot', p_lot,
      'supplier', p_supplier_name, 'mov_id', v_mov_id, 'expiration_date', p_expiration_date));

  RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id, 'unit_cost', v_cost_per_kg,
    'expiration_date', p_expiration_date, 'company_id', v_company_id, 'idempotente', false);
END;
$function$;

create function public._salmon_create_entry_guarded(
  p_entry_date text, p_lot text, p_sif text, p_supplier_name text,
  p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric,
  p_notes text default ''::text, p_expiration_date text default null::text,
  p_client_request_id text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:entradas:create','salmon:entries:create','salmon:write','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:entradas:create' USING ERRCODE='42501';
  END IF;
  RETURN public.create_salmon_entry_atomic(
    p_entry_date::date, p_lot, p_sif, p_supplier_name,
    p_boxes, p_units, p_gross_kg, p_total_value, p_notes,
    NULLIF(p_expiration_date, '')::date,
    p_client_request_id
  );
END;
$function$;

-- ── Manipulação ─────────────────────────────────────────────────────────────

drop function if exists public._salmon_create_manipulation_guarded(uuid, text, integer, numeric, numeric, numeric, text);
drop function if exists public.create_salmon_manipulation_atomic(uuid, date, integer, numeric, numeric, numeric, text);

create function public.create_salmon_manipulation_atomic(
  p_entry_id uuid, p_manipulation_date date, p_fish_count integer,
  p_gross_out_kg numeric, p_clean_in_kg numeric, p_leftover_kg numeric default 0,
  p_notes text default ''::text, p_client_request_id text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
DECLARE
  v_entry RECORD;
  v_manip_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_caller uuid;
  v_company_id uuid;
  v_key text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_nova boolean := false;
  v_existente RECORD;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_out_kg <= 0 THEN RAISE EXCEPTION 'gross_out_kg deve ser > 0'; END IF;
  IF p_clean_in_kg < 0 THEN RAISE EXCEPTION 'clean_in_kg não pode ser negativo'; END IF;
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN RAISE EXCEPTION 'REQUEST_ID_INVALIDO'; END IF;

  -- Lock parent entry by company_id
  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;

  -- 0. Reenvio: depois da trava da entrada, então envios simultâneos serializam
  -- aqui e o segundo já enxerga o primeiro.
  IF v_key IS NOT NULL THEN
    SELECT id INTO v_manip_id FROM salmon_manipulations
    WHERE company_id = v_company_id AND client_request_id = v_key AND status = 'ACTIVE';
  END IF;

  IF v_manip_id IS NULL THEN
    IF v_entry.status != 'ACTIVE' THEN RAISE EXCEPTION 'Entrada não está ativa (status: %)', v_entry.status; END IF;

    v_cost_per_kg := CASE WHEN v_entry.gross_kg > 0 THEN ROUND(v_entry.total_value / v_entry.gross_kg, 4) ELSE 0 END;

    -- 1. Insert manipulation
    BEGIN
      INSERT INTO salmon_manipulations (
        entry_id, manipulation_date, lot, sif, supplier_name, fish_count,
        gross_out_kg, clean_in_kg, leftover_kg, cost_per_kg_gross, notes, created_by, company_id,
        client_request_id
      ) VALUES (
        p_entry_id, p_manipulation_date, v_entry.lot, v_entry.sif, v_entry.supplier_name,
        COALESCE(p_fish_count, 0), p_gross_out_kg, p_clean_in_kg,
        COALESCE(p_leftover_kg, 0), v_cost_per_kg, COALESCE(p_notes,''), v_caller, v_company_id,
        v_key
      ) RETURNING id INTO v_manip_id;
      v_nova := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_manip_id FROM salmon_manipulations
      WHERE company_id = v_company_id AND client_request_id = v_key AND status = 'ACTIVE';
      IF v_manip_id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF NOT v_nova THEN
    -- Só é reenvio se descrever a MESMA manipulação.
    SELECT * INTO v_existente FROM salmon_manipulations WHERE id = v_manip_id AND company_id = v_company_id;
    IF v_existente.entry_id IS DISTINCT FROM p_entry_id
       OR v_existente.manipulation_date IS DISTINCT FROM p_manipulation_date
       OR v_existente.fish_count IS DISTINCT FROM COALESCE(p_fish_count, 0)
       OR v_existente.gross_out_kg IS DISTINCT FROM p_gross_out_kg
       OR v_existente.clean_in_kg IS DISTINCT FROM p_clean_in_kg
       OR v_existente.leftover_kg IS DISTINCT FROM COALESCE(p_leftover_kg, 0)
       OR COALESCE(v_existente.notes,'') IS DISTINCT FROM COALESCE(p_notes,'') THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;

    SELECT id INTO v_mov_id FROM movimentacoes_estoque
      WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = v_manip_id::text
        AND status = 'ATIVO' AND company_id = v_company_id;

    RETURN jsonb_build_object(
      'manipulation_id', v_manip_id, 'movement_id', v_mov_id,
      'waste_kg', GREATEST(v_existente.gross_out_kg - v_existente.clean_in_kg, 0),
      'yield_percent', CASE WHEN v_existente.gross_out_kg > 0 THEN ROUND(v_existente.clean_in_kg / v_existente.gross_out_kg * 100, 2) ELSE 0 END,
      'cost_per_kg_gross', v_existente.cost_per_kg_gross,
      'company_id', v_company_id,
      'idempotente', true
    );
  END IF;

  -- 2. Mirror to stock (SAIDA for gross)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = v_manip_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_out_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      data = p_manipulation_date,
      observacao = 'Saída Manipulação — Lote: ' || v_entry.lot,
      editado_em = now(), editado_por = v_caller, salmon_lot_id = v_entry.lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_produto_id, p_manipulation_date, 'SAIDA', p_gross_out_kg, v_cost_per_kg,
      ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão', 'Saída Manipulação — Lote: ' || v_entry.lot,
      v_caller, 'ATIVO', 'SALMON_MANIPULATION', v_manip_id::text, true, 'salmon', v_entry.lot, 'Sushi', v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 3. Audit
  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', v_manip_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object(
      'entry_id', p_entry_id, 'gross_out_kg', p_gross_out_kg, 'clean_in_kg', p_clean_in_kg,
      'cost_per_kg', v_cost_per_kg, 'mov_id', v_mov_id
    ));

  RETURN jsonb_build_object(
    'manipulation_id', v_manip_id, 'movement_id', v_mov_id,
    'waste_kg', GREATEST(p_gross_out_kg - p_clean_in_kg, 0),
    'yield_percent', CASE WHEN p_gross_out_kg > 0 THEN ROUND(p_clean_in_kg / p_gross_out_kg * 100, 2) ELSE 0 END,
    'cost_per_kg_gross', v_cost_per_kg,
    'company_id', v_company_id,
    'idempotente', false
  );
END;
$function$;

create function public._salmon_create_manipulation_guarded(
  p_entry_id uuid, p_manipulation_date text, p_fish_count integer,
  p_gross_out_kg numeric, p_clean_in_kg numeric, p_leftover_kg numeric,
  p_notes text default ''::text, p_client_request_id text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:create','salmon:manipulation:create','salmon:write','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:manipulacao:create' USING ERRCODE='42501';
  END IF;
  RETURN public.create_salmon_manipulation_atomic(
    p_entry_id, p_manipulation_date::date, p_fish_count,
    p_gross_out_kg, p_clean_in_kg, p_leftover_kg, p_notes,
    p_client_request_id
  );
END;
$function$;

-- ── ACL (igual à de antes) ──────────────────────────────────────────────────

revoke all on function public.create_salmon_entry_atomic(date, text, text, text, integer, integer, numeric, numeric, text, date, text) from public, anon, authenticated, service_role;
revoke all on function public.create_salmon_manipulation_atomic(uuid, date, integer, numeric, numeric, numeric, text, text) from public, anon, authenticated, service_role;

revoke all on function public._salmon_create_entry_guarded(text, text, text, text, integer, integer, numeric, numeric, text, text, text) from public, anon, service_role;
revoke all on function public._salmon_create_manipulation_guarded(uuid, text, integer, numeric, numeric, numeric, text, text) from public, anon, service_role;
grant execute on function public._salmon_create_entry_guarded(text, text, text, text, integer, integer, numeric, numeric, text, text, text) to authenticated;
grant execute on function public._salmon_create_manipulation_guarded(uuid, text, integer, numeric, numeric, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
