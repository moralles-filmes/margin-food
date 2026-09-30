-- ─────────────────────────────────────────────────────────────────────────────
-- Transferência entre locais — volta a gravar, com idempotência e cancelamento
-- das duas pernas.
--
-- Antes, `stock_transfer_between_locations` falhava em 100% das chamadas
-- (nenhuma linha INTERNAL_TRANSFER em produção):
--   1. `v_today` era text e ia para `movimentacoes_estoque.data` (date) → 42804;
--   2. corrigido isso, SAIDA e ENTRADA gravavam o MESMO par
--      ('INTERNAL_TRANSFER', grupo) com status ATIVO, e `idx_mov_reference_unique`
--      (UNIQUE(reference_type, reference_id) WHERE status='ATIVO') barrava a
--      segunda perna → 23505.
--
-- Referência por perna, não exceção no índice:
--   reference_id = '<grupo>:OUT' / '<grupo>:IN'. É o mesmo desenho do lote
--   manual ('<chave>:<n>') e é o único que também funciona no cancelamento:
--   `cancel_stock_movement_atomic` grava o estorno como reference_id||'_ESTORNO'
--   herdando o reference_type — com o grupo compartilhado, o estorno da segunda
--   perna colidiria de novo no mesmo índice. Tirar INTERNAL_TRANSFER do índice
--   exigiria recriar o índice global da tabela mais quente do estoque.
--
-- Idempotência (padrão de op_registrar_movimentacao):
--   `p_client_request_id` (DEFAULT NULL, o front em produção não manda) vira o
--   grupo. `uq_mov_transfer_request` (company_id, reference_id) é a garantia com
--   tenant; unique_violation é tratado como reenvio e devolve a transferência
--   existente; produto/locais/quantidade/motivo divergentes → REQUEST_ID_REUTILIZADO.
--   Sem chave, o grupo continua sendo gen_random_uuid().
--
-- Saldo: lido de `produtos.saldo_atual` (fonte única, já travado pelo FOR UPDATE
-- do produto). A soma anterior sobre movimentacoes_estoque contava os *_ESTORNO
-- ativos e superestimava o saldo depois de um cancelamento.
--
-- Cancelamento: as duas pernas são uma operação só. Cancelar uma perna sozinha
-- deixava a outra ativa e mudava o saldo total do produto; agora
-- `cancel_stock_movement_atomic` estorna e cancela a perna irmã na mesma
-- transação (estorno antes do cancelamento, como exige trg_validate_estorno).
--
-- Compatível com o front em produção: parâmetro novo com DEFAULT, retorno com
-- as mesmas chaves (+ `idempotente`), `list_stock_transfers` com a mesma
-- assinatura. Sem linha INTERNAL_TRANSFER existente, não há legado a migrar.
--
-- Rollback: corpo anterior de cancel_stock_movement_atomic em
-- release/multiunit-stabilization-20260916/sql/20260916221400_stabilization_residual_forward.sql;
-- as funções de transferência nunca gravaram nada, então voltar a elas é só
-- recriar a assinatura de 5 parâmetros.
-- ─────────────────────────────────────────────────────────────────────────────

-- Índice e ALTER em tabela quente: falha rápido em vez de enfileirar escrita
-- atrás de uma transação longa.
set local lock_timeout = '5s';

do $preflight$
begin
  if exists (
    select 1 from public.movimentacoes_estoque
    where reference_type = 'INTERNAL_TRANSFER' and status = 'ATIVO'
    group by company_id, reference_id
    having count(*) > 1
  ) then
    raise exception 'MOV_TRANSFER_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_mov_transfer_request
  on public.movimentacoes_estoque (company_id, reference_id)
  where reference_type = 'INTERNAL_TRANSFER' and status = 'ATIVO';

-- Assinatura nova (parâmetro a mais): sem o DROP, o CREATE criaria um overload
-- e o PostgREST não saberia qual chamar.
drop function if exists public.stock_transfer_between_locations(uuid, text, text, numeric, text);

create or replace function public.stock_transfer_between_locations(
  p_product_id        uuid,
  p_from_location     text,
  p_to_location       text,
  p_quantity          numeric,
  p_reason            text default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
    c_ref_type     constant text := 'INTERNAL_TRANSFER';
    v_actor_id     uuid;
    v_company_id   uuid;
    v_key          text := nullif(btrim(coalesce(p_client_request_id, '')), '');
    v_from         text := btrim(coalesce(p_from_location, ''));
    v_to           text := btrim(coalesce(p_to_location, ''));
    v_obs          text;
    v_product      record;
    v_cost_base    numeric;
    v_group        text;
    v_mov_out      public.movimentacoes_estoque%rowtype;
    v_mov_in       public.movimentacoes_estoque%rowtype;
    v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
    v_idempotente  boolean := false;
    v_existe       boolean;
    v_constraint   text;
begin
    v_actor_id := auth.uid();
    if v_actor_id is null then
        raise exception 'Não autenticado' using errcode = 'P0001';
    end if;

    v_company_id := public.assert_tenant();

    if v_company_id is null or v_company_id = '00000000-0000-0000-0000-000000000001'::uuid then
        raise exception 'Tenant inválido' using errcode = 'P0001';
    end if;

    if not public.has_any_permission(v_actor_id, array['estoque:transferencias:create', 'system:global:manage']) then
        raise exception 'Permissão negada: estoque:transferencias:create necessário' using errcode = 'P0001';
    end if;

    if v_key is not null and char_length(v_key) > 180 then
        raise exception 'REQUEST_ID_INVALIDO';
    end if;

    if v_from = '' then
        raise exception 'Local de origem é obrigatório';
    end if;
    if v_to = '' then
        raise exception 'Local de destino é obrigatório';
    end if;
    if lower(v_from) = lower(v_to) then
        raise exception 'Local de origem e destino devem ser diferentes';
    end if;
    if p_quantity is null or p_quantity <= 0 then
        raise exception 'Quantidade deve ser maior que zero';
    end if;

    v_obs := format('Transferência: %s → %s. %s', v_from, v_to, coalesce(p_reason, ''));

    -- Caminho rápido: a transferência já foi gravada (resposta perdida, duplo clique).
    if v_key is not null then
        select count(*) > 0, coalesce(bool_or(status = 'ATIVO'), false)
          into v_existe, v_idempotente
        from public.movimentacoes_estoque
        where company_id = v_company_id
          and reference_type = c_ref_type
          and reference_id = v_key || ':OUT';

        -- Chave de transferência já cancelada: reenvio atrasado não ressuscita a
        -- operação, e o 2º cancelamento colidiria no estorno '<chave>:OUT_ESTORNO'.
        -- Transferência nova sempre vem com semente nova.
        if v_existe and not v_idempotente then
            raise exception 'REQUEST_ID_REUTILIZADO';
        end if;
    end if;

    if not v_idempotente then
        select * into v_product
        from public.produtos
        where id = p_product_id and company_id = v_company_id
        for update;

        if not found then
            raise exception 'Produto não encontrado';
        end if;
        if not v_product.ativo then
            raise exception 'Produto inativo';
        end if;

        -- Transferência não muda o saldo total; só não pode mover mais do que existe.
        if coalesce(v_product.saldo_atual, 0) < p_quantity then
            raise exception 'Saldo insuficiente. Disponível: % %', round(coalesce(v_product.saldo_atual, 0), 2), v_product.unidade_medida;
        end if;

        v_cost_base := coalesce(nullif(v_product.avg30_cost_base_unit, 0),
                                nullif(v_product.last_cost_base_unit, 0),
                                nullif(v_product.default_cost_base_unit, 0),
                                0);

        v_group := coalesce(v_key, gen_random_uuid()::text);

        begin
            insert into public.movimentacoes_estoque (
                produto_id, company_id, data, tipo, quantidade,
                custo_unitario, custo_total, origem, observacao,
                created_by, setor, reference_type, reference_id,
                internal_transfer, source_module, direction
            ) values (
                p_product_id, v_company_id, v_today, 'SAIDA', p_quantity,
                round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
                'Transferência Interna', v_obs,
                v_actor_id, v_from, c_ref_type, v_group || ':OUT',
                true, 'estoque', 'OUT'
            )
            returning * into v_mov_out;

            insert into public.movimentacoes_estoque (
                produto_id, company_id, data, tipo, quantidade,
                custo_unitario, custo_total, origem, observacao,
                created_by, setor, reference_type, reference_id,
                internal_transfer, source_module, direction
            ) values (
                p_product_id, v_company_id, v_today, 'ENTRADA', p_quantity,
                round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
                'Transferência Interna', v_obs,
                v_actor_id, v_to, c_ref_type, v_group || ':IN',
                true, 'estoque', 'IN'
            )
            returning * into v_mov_in;
        exception when unique_violation then
            -- Só a chave desta transferência é tratada como reenvio; qualquer
            -- outro índice único violado continua sendo erro.
            get stacked diagnostics v_constraint = constraint_name;
            if v_key is null or v_constraint not in ('uq_mov_transfer_request', 'idx_mov_reference_unique') then
                raise;
            end if;
            v_idempotente := true;
        end;
    end if;

    if v_idempotente then
        -- Reenvio: as duas pernas precisam existir e descrever a MESMA transferência.
        select * into v_mov_out from public.movimentacoes_estoque
        where company_id = v_company_id and reference_type = c_ref_type
          and reference_id = v_key || ':OUT' and status = 'ATIVO';
        select * into v_mov_in from public.movimentacoes_estoque
        where company_id = v_company_id and reference_type = c_ref_type
          and reference_id = v_key || ':IN' and status = 'ATIVO';

        if v_mov_out.id is null or v_mov_in.id is null
           or v_mov_out.produto_id is distinct from p_product_id
           or v_mov_in.produto_id is distinct from p_product_id
           or round(v_mov_out.quantidade, 6) is distinct from round(p_quantity, 6)
           or round(v_mov_in.quantidade, 6) is distinct from round(p_quantity, 6)
           or v_mov_out.setor is distinct from v_from
           or v_mov_in.setor is distinct from v_to
           or coalesce(v_mov_out.observacao, '') is distinct from v_obs
        then
            raise exception 'REQUEST_ID_REUTILIZADO';
        end if;

        v_group := v_key;
    else
        -- Ação TRANSFER_CREATE (filtro "Transferência" da auditoria), não
        -- STOCK_TRANSFER: o ramo STOCK_TRANSFER de log_private.stamp_log resolve
        -- o tenant por reference_id = entity_id, que só existia com o grupo
        -- compartilhado. Aqui entity_id é a perna de saída e o tenant sai do
        -- resolvedor genérico por id de movimentacoes_estoque.
        insert into public.audit_logs (
            action, entity, entity_id, module, actor_user_id, company_id,
            severity, source, success, metadata
        ) values (
            'TRANSFER_CREATE', 'movimentacoes_estoque', v_mov_out.id,
            'estoque', v_actor_id, v_company_id,
            'info', 'rpc', true,
            jsonb_build_object(
                'transfer_group_id', v_group,
                'product_id', p_product_id,
                'product_name', v_product.nome_produto,
                'from_location', v_from,
                'to_location', v_to,
                'quantity', p_quantity,
                'unit', v_product.unidade_medida,
                'cost_unit', v_mov_out.custo_unitario,
                'cost_total', v_mov_out.custo_total,
                'reason', coalesce(p_reason, ''),
                'mov_out_id', v_mov_out.id,
                'mov_in_id', v_mov_in.id
            )
        );
    end if;

    return jsonb_build_object(
        'success', true,
        'idempotente', v_idempotente,
        'transfer_group_id', v_group,
        'mov_out_id', v_mov_out.id,
        'mov_in_id', v_mov_in.id,
        'quantity', v_mov_out.quantidade,
        'from_location', v_mov_out.setor,
        'to_location', v_mov_in.setor,
        'cost_total', v_mov_out.custo_total
    );
end;
$function$;

comment on function public.stock_transfer_between_locations(uuid, text, text, numeric, text, text) is
  'Transferência entre locais: SAIDA + ENTRADA (internal_transfer) com reference_id <grupo>:OUT / <grupo>:IN. Com p_client_request_id, reenvio devolve a existente (idempotente=true) e divergência → REQUEST_ID_REUTILIZADO.';

revoke all on function public.stock_transfer_between_locations(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function public.stock_transfer_between_locations(uuid, text, text, numeric, text, text) to authenticated;
grant execute on function public.stock_transfer_between_locations(uuid, text, text, numeric, text, text) to service_role;

-- O EXECUTE de PUBLIC vinha do default do Supabase; assert_tenant já recusava
-- anon, isto só fecha a porta antes.
revoke all on function public.list_stock_transfers(date, date, uuid, text, integer, integer) from public, anon;
grant execute on function public.list_stock_transfers(date, date, uuid, text, integer, integer) to authenticated;
grant execute on function public.list_stock_transfers(date, date, uuid, text, integer, integer) to service_role;

-- Histórico: o grupo agora é o reference_id sem o sufixo da perna.
create or replace function public.list_stock_transfers(
  p_start_date date default (((now() at time zone 'America/Sao_Paulo'::text) - '30 days'::interval))::date,
  p_end_date   date default ((now() at time zone 'America/Sao_Paulo'::text))::date,
  p_product_id uuid default null::uuid,
  p_location   text default null::text,
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
    v_company_id uuid;
    v_transfers jsonb;
    v_total bigint;
begin
    v_company_id := public.assert_tenant();

    if v_company_id is null then
        raise exception 'Tenant inválido';
    end if;

    if not public.has_any_permission(auth.uid(), array['estoque:transferencias:view', 'system:global:manage']) then
        raise exception 'Permissão negada: estoque:transferencias:view necessário';
    end if;

    with transfers as (
        select
            m_out.*,
            left(m_out.reference_id, length(m_out.reference_id) - length(':OUT')) as transfer_group_id,
            m_in.setor as to_location
        from public.movimentacoes_estoque m_out
        left join public.movimentacoes_estoque m_in
            on m_in.company_id = v_company_id
           and m_in.reference_type = 'INTERNAL_TRANSFER'
           and m_in.reference_id = left(m_out.reference_id, length(m_out.reference_id) - length(':OUT')) || ':IN'
           and m_in.direction = 'IN'
           and m_in.status = 'ATIVO'
        where m_out.company_id = v_company_id
          and m_out.reference_type = 'INTERNAL_TRANSFER'
          and m_out.reference_id like '%:OUT'
          and m_out.internal_transfer = true
          and m_out.direction = 'OUT'
          and m_out.status = 'ATIVO'
          and m_out.data >= p_start_date
          and m_out.data <= p_end_date
          and (p_product_id is null or m_out.produto_id = p_product_id)
          and (p_location is null or m_out.setor ilike '%' || p_location || '%' or m_in.setor ilike '%' || p_location || '%')
    ),
    page as (
        select
            t.transfer_group_id,
            t.produto_id,
            p.nome_produto,
            p.unidade_medida,
            p.categoria,
            t.quantidade,
            t.custo_unitario,
            t.custo_total,
            t.setor as from_location,
            t.to_location,
            t.observacao,
            t.created_by,
            t.created_at,
            t.data,
            pr.email as actor_email
        from transfers t
        join public.produtos p on p.id = t.produto_id and p.company_id = v_company_id
        left join public.profiles pr on pr.id = t.created_by
        order by t.created_at desc
        limit p_limit offset p_offset
    )
    select
        (select count(*) from transfers),
        coalesce((select jsonb_agg(to_jsonb(pg) order by pg.created_at desc) from page pg), '[]'::jsonb)
    into v_total, v_transfers;

    return jsonb_build_object(
        'transfers', v_transfers,
        'total', v_total
    );
end;
$function$;

-- Cancelamento: corpo vivo + cascata para a perna irmã da transferência.
create or replace function public.cancel_stock_movement_atomic(p_movement_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path = 'public', 'pg_temp'
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_mov public.movimentacoes_estoque%ROWTYPE;
  v_reversal_type text;
  v_reversal_direction text;
  v_reversal_id uuid;
  v_sibling public.movimentacoes_estoque%ROWTYPE;
  v_sibling_reversal_id uuid;
  v_ref_type text;
  v_ref_id text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'estoque:movimentacoes:cancel', 'estoque:movimentacoes:edit',
    'estoque:movimentacoes:manage', 'stock:movements:cancel', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: estoque:movimentacoes:cancel' USING ERRCODE='42501';
  END IF;

  -- Transferência: serializa pelo grupo ANTES de travar a linha. Sem isso,
  -- cancelar as duas pernas ao mesmo tempo trava OUT→IN e IN→OUT (deadlock);
  -- com isso, o segundo espera e recebe ALREADY_CANCELLED.
  SELECT reference_type, reference_id INTO v_ref_type, v_ref_id
  FROM public.movimentacoes_estoque
  WHERE id = p_movement_id AND company_id = v_cid;
  IF v_ref_type = 'INTERNAL_TRANSFER' AND v_ref_id ~ ':(OUT|IN)$' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'INTERNAL_TRANSFER:' || v_cid::text || ':' || regexp_replace(v_ref_id, ':(OUT|IN)$', ''), 0));
  END IF;

  SELECT * INTO v_mov
  FROM public.movimentacoes_estoque
  WHERE id = p_movement_id AND company_id = v_cid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_mov.status <> 'ATIVO' OR EXISTS (
    SELECT 1 FROM public.movimentacoes_estoque
    WHERE company_id = v_cid AND estorno_de_id = p_movement_id AND status = 'ATIVO'
  ) THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;
  IF v_mov.estorno_de_id IS NOT NULL OR v_mov.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ALLOWED';
  END IF;
  IF v_mov.origem = 'INVENTARIO' AND v_mov.referencia_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inventarios
    WHERE id::text = v_mov.referencia_id AND company_id = v_cid AND status = 'FINALIZADO'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_CLOSED';
  END IF;

  v_reversal_type := CASE
    WHEN coalesce(v_mov.direction, CASE WHEN v_mov.tipo IN ('ENTRADA','AJUSTE_ENTRADA') THEN 'IN' ELSE 'OUT' END) = 'IN'
      THEN 'ENTRADA_ESTORNO' ELSE 'SAIDA_ESTORNO' END;
  v_reversal_direction := CASE WHEN v_reversal_type = 'ENTRADA_ESTORNO' THEN 'OUT' ELSE 'IN' END;

  INSERT INTO public.movimentacoes_estoque (
    produto_id, data, tipo, direction, quantidade, custo_unitario, custo_total,
    origem, referencia_id, observacao, created_by, status, estorno_de_id, setor,
    reference_type, reference_id, internal_transfer, source_module, company_id
  ) VALUES (
    v_mov.produto_id, v_mov.data, v_reversal_type, v_reversal_direction,
    v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total,
    'ESTORNO', p_movement_id::text,
    format('Estorno de %s #%s — %s', v_mov.tipo, left(p_movement_id::text, 8), btrim(p_reason)),
    v_uid, 'ATIVO', p_movement_id, v_mov.setor,
    v_mov.reference_type,
    coalesce(v_mov.reference_id, p_movement_id::text) || '_ESTORNO',
    false, coalesce(v_mov.source_module, 'estoque'), v_cid
  ) RETURNING id INTO v_reversal_id;

  UPDATE public.movimentacoes_estoque
  SET status = 'CANCELADO', cancelado_por = v_uid, cancelado_em = now(),
      justificativa_cancelamento = btrim(p_reason)
  WHERE id = p_movement_id AND company_id = v_cid;

  IF v_mov.source_module = 'salmon' AND v_mov.reference_id IS NOT NULL
     AND v_mov.reference_id !~ '_ESTORNO$' THEN
    IF v_mov.reference_type = 'SALMON_ENTRY' THEN
      UPDATE public.salmon_entries
      SET status = 'CANCELLED', updated_at = now()
      WHERE id = v_mov.reference_id::uuid AND company_id = v_cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALMON_ENTRY_NOT_FOUND'; END IF;
    ELSIF v_mov.reference_type = 'SALMON_MANIPULATION' THEN
      UPDATE public.salmon_manipulations
      SET status = 'CANCELLED', updated_at = now()
      WHERE id = v_mov.reference_id::uuid AND company_id = v_cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALMON_MANIPULATION_NOT_FOUND'; END IF;
    END IF;
  END IF;

  -- Transferência entre locais: as duas pernas são uma operação só. Cancelar só
  -- uma deixaria a outra ativa e mudaria o saldo total do produto. A irmã segue
  -- a mesma ordem: estorno antes do cancelamento (trg_validate_estorno).
  IF v_mov.reference_type = 'INTERNAL_TRANSFER' AND v_mov.reference_id ~ ':(OUT|IN)$' THEN
    SELECT * INTO v_sibling
    FROM public.movimentacoes_estoque
    WHERE company_id = v_cid
      AND reference_type = 'INTERNAL_TRANSFER'
      AND reference_id = regexp_replace(v_mov.reference_id, ':(OUT|IN)$', '')
                         || CASE WHEN v_mov.reference_id ~ ':OUT$' THEN ':IN' ELSE ':OUT' END
      AND status = 'ATIVO'
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO public.movimentacoes_estoque (
        produto_id, data, tipo, direction, quantidade, custo_unitario, custo_total,
        origem, referencia_id, observacao, created_by, status, estorno_de_id, setor,
        reference_type, reference_id, internal_transfer, source_module, company_id
      ) VALUES (
        v_sibling.produto_id, v_sibling.data,
        CASE WHEN v_sibling.direction = 'IN' THEN 'ENTRADA_ESTORNO' ELSE 'SAIDA_ESTORNO' END,
        CASE WHEN v_sibling.direction = 'IN' THEN 'OUT' ELSE 'IN' END,
        v_sibling.quantidade, v_sibling.custo_unitario, v_sibling.custo_total,
        'ESTORNO', v_sibling.id::text,
        format('Estorno de %s #%s — %s', v_sibling.tipo, left(v_sibling.id::text, 8), btrim(p_reason)),
        v_uid, 'ATIVO', v_sibling.id, v_sibling.setor,
        v_sibling.reference_type, v_sibling.reference_id || '_ESTORNO',
        false, coalesce(v_sibling.source_module, 'estoque'), v_cid
      ) RETURNING id INTO v_sibling_reversal_id;

      UPDATE public.movimentacoes_estoque
      SET status = 'CANCELADO', cancelado_por = v_uid, cancelado_em = now(),
          justificativa_cancelamento = btrim(p_reason)
      WHERE id = v_sibling.id AND company_id = v_cid;

      PERFORM public.log_audit('rpc', 'estoque', 'movimentacoes_estoque', v_sibling.id,
        'CANCEL_MOVEMENT', to_jsonb(v_sibling),
        jsonb_build_object('status','CANCELADO','reason',btrim(p_reason),
          'reversal_id',v_sibling_reversal_id,'cascade_from',p_movement_id));
    END IF;
  END IF;

  PERFORM public.log_audit('rpc', 'estoque', 'movimentacoes_estoque', p_movement_id,
    'CANCEL_MOVEMENT', to_jsonb(v_mov),
    jsonb_build_object('status','CANCELADO','reason',btrim(p_reason),'reversal_id',v_reversal_id,
      'transfer_reversal_id',v_sibling_reversal_id));
  RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id,
    'transfer_reversal_id', v_sibling_reversal_id);
END $function$;

notify pgrst, 'reload schema';
