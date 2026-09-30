-- ─────────────────────────────────────────────────────────────────────────────
-- Ficha Técnica — componente novo criado numa transação, idempotente.
--
-- Antes, criar um componente eram 2 chamadas à Edge `ficha-tecnica`:
-- `salvar_componente` (cabeçalho) e `salvar_componente_itens` (BOM). Se a 2ª
-- falhava, o retry criava OUTRO componente e o 1º ficava órfão, sem itens. A
-- falha nem precisava de rede: `ficha_salvar_componente_itens_atomic` exige
-- permissão de EDIT, então quem só tem CREATE sempre deixava um órfão. E a
-- auditoria gravada depois do commit, quando falhava, virava 500 e convidava
-- ao reenvio.
--
--   · `ficha_criar_componente_atomic`: cabeçalho + itens na mesma transação,
--     com o gate de CREATE do tipo. Falhou um item, não sobra componente.
--   · `client_request_id` é a chave DERIVADA da operação no cliente (semente +
--     conteúdo). O índice único parcial `uq_ficha_componentes_client_request` é
--     a garantia; `unique_violation` da própria chave é tratado como reenvio.
--     Chave igual com conteúdo diferente → REQUEST_ID_REUTILIZADO.
--   · As regras de hierarquia/BOM saem de `ficha_salvar_componente_itens_atomic`
--     para `_ficha_gravar_componente_itens` (interna, sem EXECUTE para clientes)
--     e as duas funções públicas a chamam — uma regra só. O corpo copiado é o do
--     banco vivo; a assinatura e o gate de EDIT da função existente não mudam.
--
-- Compatível com o front em produção: ele continua usando as ações antigas.
-- GRANTs no mesmo arquivo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ficha_componentes
  add column if not exists client_request_id text;

alter table public.ficha_componentes
  drop constraint if exists ficha_componentes_client_request_id_len;
alter table public.ficha_componentes
  add constraint ficha_componentes_client_request_id_len
  check (client_request_id is null or char_length(client_request_id) between 1 and 200);

-- Preflight: a coluna acabou de nascer, mas a migration pode ser reaplicada.
do $preflight$
begin
  if exists (
    select 1 from public.ficha_componentes
    where client_request_id is not null
    group by company_id, client_request_id
    having count(*) > 1
  ) then
    raise exception 'FICHA_CLIENT_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_ficha_componentes_client_request
  on public.ficha_componentes (company_id, client_request_id)
  where client_request_id is not null;

-- ─── Regras de BOM (extraídas de ficha_salvar_componente_itens_atomic) ───
-- Quem chama já conferiu tenant e permissão e travou o componente pai.
create or replace function public._ficha_gravar_componente_itens(
  _company_id        uuid,
  _componente_pai_id uuid,
  _parent_tipo       text,
  _rendimento        numeric,
  _perda             numeric,
  _custo_indireto    numeric,
  _itens             jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
DECLARE
  v_company_id uuid := _company_id;
  v_parent_tipo text := _parent_tipo;
  v_child_tipo text;
  v_item jsonb;
  v_idx int := 0;
  v_custo_total numeric := 0;
  v_custo_unitario numeric := 0;
  v_rendimento numeric := _rendimento;
  v_perda numeric := _perda;
  v_rendimento_liq numeric;
  v_custo_indireto numeric := _custo_indireto;
BEGIN
  -- 3. Validate hierarchy for each child component
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    IF v_item->>'componente_filho_id' IS NOT NULL AND v_item->>'componente_filho_id' != '' THEN
      SELECT tipo INTO v_child_tipo
      FROM ficha_componentes
      WHERE id = (v_item->>'componente_filho_id')::uuid
        AND company_id = v_company_id
        AND deleted_at IS NULL;

      IF v_child_tipo IS NULL THEN
        RAISE EXCEPTION 'Componente filho % não encontrado no tenant', v_item->>'componente_filho_id';
      END IF;

      IF v_parent_tipo = 'PRE_PREPARO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Pré-Preparo só aceita insumos e outros pré-preparos. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'ITEM_PRONTO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Item Pronto só aceita insumos, pré-preparos e salmão. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'PRODUTO_FINAL' AND v_child_tipo != 'ITEM_PRONTO' THEN
        RAISE EXCEPTION 'Produto Final só aceita itens prontos e insumos. "%" não permitido.', v_child_tipo;
      END IF;
    END IF;

    -- Block PRODUTO_FINAL from using salmon directly
    IF v_parent_tipo = 'PRODUTO_FINAL' AND (v_item->>'origem') = 'MODULO_SALMAO' THEN
      RAISE EXCEPTION 'Produto Final não pode usar salmão diretamente.';
    END IF;
  END LOOP;

  -- 4. Delete existing items (within tenant scope)
  DELETE FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  -- 5. Insert new items (with explicit company_id)
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    INSERT INTO ficha_componente_itens (
      componente_pai_id, componente_filho_id, produto_id,
      quantidade, unidade, custo_snapshot, ordem, origem,
      unidade_original, quantidade_original, company_id
    ) VALUES (
      _componente_pai_id,
      NULLIF(v_item->>'componente_filho_id', '')::uuid,
      NULLIF(v_item->>'produto_id', '')::uuid,
      COALESCE((v_item->>'quantidade')::numeric, 0),
      COALESCE(v_item->>'unidade', 'un'),
      COALESCE((v_item->>'custo_snapshot')::numeric, 0),
      v_idx,
      COALESCE(v_item->>'origem', 'ESTOQUE_GERAL'),
      COALESCE(v_item->>'unidade_original', ''),
      COALESCE((v_item->>'quantidade_original')::numeric, 0),
      v_company_id
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 6. Simple cost recalculation (sum of snapshots + indirect)
  -- Full recursive calc is done by the EF after this returns
  SELECT COALESCE(SUM(quantidade * custo_snapshot), 0)
  INTO v_custo_total
  FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  v_custo_total := v_custo_total + COALESCE(v_custo_indireto, 0);
  v_rendimento_liq := COALESCE(v_rendimento, 1) * (1 - COALESCE(v_perda, 0) / 100);
  IF v_rendimento_liq > 0 THEN
    v_custo_unitario := v_custo_total / v_rendimento_liq;
  ELSE
    v_custo_unitario := v_custo_total;
  END IF;

  -- 7. Update parent costs
  UPDATE ficha_componentes
  SET custo_total_calculado = ROUND(v_custo_total, 2),
      custo_unitario_calculado = ROUND(v_custo_unitario, 2),
      updated_at = now()
  WHERE id = _componente_pai_id
    AND company_id = v_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'custoTotal', ROUND(v_custo_total, 2),
    'custoUnitario', ROUND(v_custo_unitario, 2),
    'itensCount', v_idx
  );
END;
$function$;

comment on function public._ficha_gravar_componente_itens(uuid, uuid, text, numeric, numeric, numeric, jsonb) is
  'Interna: valida a hierarquia e regrava a BOM do componente. Só para funções que já conferiram tenant, permissão e travaram o pai.';

revoke all on function public._ficha_gravar_componente_itens(uuid, uuid, text, numeric, numeric, numeric, jsonb)
  from public, anon, authenticated;

-- ─── Função existente: mesmo contrato, regras delegadas ───
CREATE OR REPLACE FUNCTION public.ficha_salvar_componente_itens_atomic(_componente_pai_id uuid, _itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_parent_tipo text;
  v_rendimento numeric;
  v_perda numeric;
  v_custo_indireto numeric;
BEGIN
  -- 1. Assert tenant (fail-closed)
  v_company_id := assert_tenant();

  -- 2. Lock parent component (prevent concurrent edits)
  SELECT tipo, rendimento, perda_estimada_percent, custo_indireto
  INTO v_parent_tipo, v_rendimento, v_perda, v_custo_indireto
  FROM ficha_componentes
  WHERE id = _componente_pai_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_parent_tipo IS NULL THEN
    RAISE EXCEPTION 'Componente pai não encontrado ou não pertence ao tenant';
  END IF;

  IF NOT coalesce(public.has_any_permission(auth.uid(),ARRAY[
    CASE v_parent_tipo WHEN 'PRE_PREPARO' THEN 'ficha:pre-preparos:edit' WHEN 'ITEM_PRONTO' THEN 'ficha:itens-prontos:edit' WHEN 'PRODUTO_FINAL' THEN 'ficha:produtos-finais:edit' END,
    'recipes:edit','ficha:write','system:global:manage']),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;

  -- 3–7. Hierarquia, BOM e custo
  RETURN public._ficha_gravar_componente_itens(
    v_company_id, _componente_pai_id, v_parent_tipo, v_rendimento, v_perda, v_custo_indireto, _itens
  );
END;
$function$;

-- ─── Criação atômica e idempotente ───
create or replace function public.ficha_criar_componente_atomic(
  _componente         jsonb,
  _itens              jsonb,
  _client_request_id  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  c_max_itens  constant int := 500;
  v_company    uuid := public.assert_tenant();
  v_uid        uuid := auth.uid();
  v_key        text := nullif(btrim(coalesce(_client_request_id, '')), '');
  v_tipo       text := _componente->>'tipo';
  v_nome       text := btrim(coalesce(_componente->>'nome', ''));
  v_comp       public.ficha_componentes%rowtype;
  v_nova       boolean := false;
  v_constraint text;
  v_itens_res  jsonb := null;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_tipo is null or v_tipo not in ('PRE_PREPARO', 'ITEM_PRONTO', 'PRODUTO_FINAL') then
    raise exception 'TIPO_INVALIDO: %', v_tipo;
  end if;

  if not public.has_any_permission(v_uid, array[
    case v_tipo when 'PRE_PREPARO' then 'ficha:pre-preparos:create'
                when 'ITEM_PRONTO' then 'ficha:itens-prontos:create'
                when 'PRODUTO_FINAL' then 'ficha:produtos-finais:create' end,
    'ficha:write', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  if v_nome = '' then
    raise exception 'NOME_OBRIGATORIO';
  end if;

  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'REQUEST_ID_INVALIDO';
  end if;

  if _itens is null or jsonb_typeof(_itens) <> 'array' or jsonb_array_length(_itens) > c_max_itens then
    raise exception 'ITENS_INVALIDOS';
  end if;

  -- Caminho rápido: reenvio já resolvido.
  if v_key is not null then
    select * into v_comp
    from public.ficha_componentes c
    where c.company_id = v_company and c.client_request_id = v_key;
  end if;

  if v_comp.id is null then
    begin
      insert into public.ficha_componentes (
        tipo, nome, categoria, rendimento, unidade_rendimento, perda_estimada_percent,
        custo_indireto, peso_por_unidade, tempo_preparo_min, modo_preparo, checklist,
        observacoes, created_by, company_id, client_request_id
      ) values (
        v_tipo,
        v_nome,
        coalesce(nullif(_componente->>'categoria', ''), 'Geral'),
        coalesce(nullif((_componente->>'rendimento')::numeric, 0), 1),
        coalesce(nullif(_componente->>'unidade_rendimento', ''), 'un'),
        coalesce((_componente->>'perda_estimada_percent')::numeric, 0),
        coalesce((_componente->>'custo_indireto')::numeric, 0),
        nullif((_componente->>'peso_por_unidade')::numeric, 0),
        round(nullif((_componente->>'tempo_preparo_min')::numeric, 0))::int,
        coalesce(_componente->>'modo_preparo', ''),
        coalesce(_componente->'checklist', '[]'::jsonb),
        coalesce(_componente->>'observacoes', ''),
        v_uid, v_company, v_key
      )
      returning * into v_comp;
      v_nova := true;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'uq_ficha_componentes_client_request' then
        raise;
      end if;
      select * into v_comp
      from public.ficha_componentes c
      where c.company_id = v_company and c.client_request_id = v_key;
      if v_comp.id is null then
        raise;
      end if;
    end;
  end if;

  if v_nova then
    if jsonb_array_length(_itens) > 0 then
      v_itens_res := public._ficha_gravar_componente_itens(
        v_company, v_comp.id, v_comp.tipo, v_comp.rendimento,
        v_comp.perda_estimada_percent, v_comp.custo_indireto, _itens
      );
      select * into v_comp from public.ficha_componentes where id = v_comp.id;
    end if;
  else
    -- Só é reenvio se descrever o MESMO componente: autor, tipo, nome e o mesmo
    -- conjunto de itens (a ordem não importa, quantidade e unidade sim).
    if v_comp.created_by is distinct from v_uid
       or v_comp.tipo is distinct from v_tipo
       or v_comp.nome is distinct from v_nome
       or exists (
         (select i.produto_id, i.componente_filho_id, round(i.quantidade, 6), i.unidade
            from public.ficha_componente_itens i
           where i.componente_pai_id = v_comp.id and i.company_id = v_company
          except all
          select nullif(e.value->>'produto_id', '')::uuid, nullif(e.value->>'componente_filho_id', '')::uuid,
                 round(coalesce((e.value->>'quantidade')::numeric, 0), 6), coalesce(e.value->>'unidade', 'un')
            from jsonb_array_elements(_itens) e)
         union all
         (select nullif(e.value->>'produto_id', '')::uuid, nullif(e.value->>'componente_filho_id', '')::uuid,
                 round(coalesce((e.value->>'quantidade')::numeric, 0), 6), coalesce(e.value->>'unidade', 'un')
            from jsonb_array_elements(_itens) e
          except all
          select i.produto_id, i.componente_filho_id, round(i.quantidade, 6), i.unidade
            from public.ficha_componente_itens i
           where i.componente_pai_id = v_comp.id and i.company_id = v_company)
       ) then
      raise exception 'REQUEST_ID_REUTILIZADO';
    end if;
  end if;

  return (to_jsonb(v_comp) - 'client_request_id')
    || jsonb_build_object('idempotente', not v_nova, 'itens', v_itens_res);
end;
$$;

comment on function public.ficha_criar_componente_atomic(jsonb, jsonb, text) is
  'Cria componente de ficha técnica + BOM numa transação (gate de CREATE do tipo). _client_request_id = chave derivada; reenvio devolve o existente (idempotente=true), conteúdo divergente → REQUEST_ID_REUTILIZADO.';

revoke all on function public.ficha_criar_componente_atomic(jsonb, jsonb, text) from public, anon;
grant execute on function public.ficha_criar_componente_atomic(jsonb, jsonb, text) to authenticated;
grant execute on function public.ficha_criar_componente_atomic(jsonb, jsonb, text) to service_role;

notify pgrst, 'reload schema';
