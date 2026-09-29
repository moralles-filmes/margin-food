-- ─────────────────────────────────────────────────────────────────────────────
-- Nova movimentação (módulo administrativo) — lote idempotente.
--
-- Antes: `NovaMovimentacaoModal` → INSERT multi-linha direto via PostgREST, sem
-- chave. Atômico, mas duplo clique ou retry depois de resposta perdida gravava o
-- lote inteiro de novo (entrada em dobro no saldo e no custo).
--
-- Onde mora a chave — decisão:
--   `idx_mov_reference_unique` é UNIQUE(reference_type, reference_id) WHERE
--   status='ATIVO': uma linha ativa por referência. Um lote de N linhas precisa
--   de N referências, então a chave vai POR LINHA: reference_id =
--   '<chave do lote>:<n>' (n = posição no lote, base 1), com reference_type
--   próprio 'ESTOQUE_MANUAL'. Escolhido em vez de coluna nova porque:
--     · é o mesmo mecanismo que o operacional já usa (reference_type
--       'OPERACIONAL' + uq_mov_operacional_request) e que o cancelamento já
--       entende: o estorno herda reference_type e grava reference_id||'_ESTORNO',
--       que não colide com a linha original nem com outra do lote;
--     · reference_type/reference_id hoje ficam NULL nas movimentações manuais —
--       nenhuma função nem tela trata "reference_type IS NULL" como manual
--       (origem continua 'Manual');
--     · evita coluna + índice novos na tabela mais quente do estoque.
--   `uq_mov_manual_request` (company_id, reference_id) é a garantia com tenant,
--   no molde de uq_mov_operacional_request.
--
-- A RPC é SECURITY INVOKER de propósito: grava sob a MESMA RLS do INSERT direto
-- (movimentacoes_insert + multiunit_scope_boundary + triggers), então não amplia
-- nada do que o usuário já podia. O que muda: company_id e created_by saem do
-- servidor, e reference_type/reference_id não são aceitos do cliente.
--
-- Reenvio: se as N linhas da chave já existem e batem (produto, tipo,
-- quantidade, custo unitário, setor, observação, origem) → devolve as existentes
-- com idempotente=true. Qualquer divergência (inclusive linha cancelada depois)
-- → REQUEST_ID_REUTILIZADO. A data não entra na comparação: é do dia do envio,
-- não uma escolha do usuário, e um retry depois da meia-noite continua sendo o
-- mesmo lote.
--
-- Compatível com o que está em produção: índice parcial só cobre
-- reference_type='ESTOQUE_MANUAL' (nenhuma linha hoje) e o front antigo segue
-- fazendo o INSERT direto.
-- ─────────────────────────────────────────────────────────────────────────────

do $preflight$
begin
  if exists (
    select 1 from public.movimentacoes_estoque
    where reference_type = 'ESTOQUE_MANUAL' and status = 'ATIVO'
    group by company_id, reference_id
    having count(*) > 1
  ) then
    raise exception 'MOV_MANUAL_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_mov_manual_request
  on public.movimentacoes_estoque (company_id, reference_id)
  where reference_type = 'ESTOQUE_MANUAL' and status = 'ATIVO';

create or replace function public.estoque_registrar_movimentacoes_lote(
  p_itens             jsonb,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  c_ref_type   constant text := 'ESTOQUE_MANUAL';
  c_uuid_re    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_company    uuid := public.assert_tenant();
  v_uid        uuid := auth.uid();
  v_key        text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_total      int;
  v_existentes int := 0;
  v_ids        uuid[];
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_key is not null and char_length(v_key) > 180 then
    raise exception 'REQUEST_ID_INVALIDO';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'LOTE_INVALIDO';
  end if;

  v_total := jsonb_array_length(p_itens);
  if v_total = 0 then
    raise exception 'LOTE_TAMANHO_INVALIDO: 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_itens) e
    where jsonb_typeof(e.value) is distinct from 'object'
       or coalesce(e.value->>'produto_id', '') !~* c_uuid_re
       or nullif(btrim(coalesce(e.value->>'tipo', '')), '') is null
       or jsonb_typeof(e.value->'quantidade') is distinct from 'number'
       or jsonb_typeof(e.value->'custo_unitario') is distinct from 'number'
  ) then
    raise exception 'LOTE_ITEM_INVALIDO';
  end if;

  -- Caminho rápido: o lote já foi gravado (resposta perdida, duplo clique).
  if v_key is not null then
    select count(*) into v_existentes
    from public.movimentacoes_estoque m
    where m.company_id = v_company
      and m.reference_type = c_ref_type
      and m.reference_id = any (array(select v_key || ':' || g from generate_series(1, v_total) g))
      and m.status = 'ATIVO';
  end if;

  if v_existentes = 0 then
    begin
      with novas as (
        insert into public.movimentacoes_estoque (
          produto_id, data, tipo, quantidade, custo_unitario, custo_total,
          origem, referencia_id, observacao, created_by, company_id, setor,
          reference_type, reference_id
        )
        select i.produto_id,
               coalesce(i.data, (now() at time zone 'America/Sao_Paulo')::date),
               i.tipo, i.quantidade, i.custo_unitario,
               -- Recalculado por validate_stock_movement; enviado só por completude.
               coalesce(i.custo_total, round(i.quantidade * i.custo_unitario, 2)),
               coalesce(i.origem, 'Manual'), i.referencia_id, i.observacao,
               v_uid, v_company, i.setor,
               case when v_key is null then null else c_ref_type end,
               case when v_key is null then null else v_key || ':' || e.ordinality end
        from jsonb_array_elements(p_itens) with ordinality e
        cross join lateral jsonb_to_record(e.value) as i(
          produto_id uuid, data date, tipo text, quantidade numeric,
          custo_unitario numeric, custo_total numeric, origem text,
          referencia_id text, observacao text, setor text
        )
        order by e.ordinality
        returning id
      )
      select array_agg(id) into v_ids from novas;
    exception when unique_violation then
      -- Só a chave deste lote é tratada como reenvio; qualquer outro índice
      -- único violado continua sendo erro.
      get stacked diagnostics v_constraint = constraint_name;
      if v_key is null or v_constraint not in ('uq_mov_manual_request', 'idx_mov_reference_unique') then
        raise;
      end if;
      v_existentes := -1;
    end;
  end if;

  if v_ids is null then
    -- Reenvio: as N linhas da chave precisam existir, descrever o MESMO lote
    -- posição a posição, e o lote gravado não pode ser mais longo (linha N+1).
    if exists (
      select 1 from public.movimentacoes_estoque m
      where m.company_id = v_company
        and m.reference_type = c_ref_type
        and m.reference_id = v_key || ':' || (v_total + 1)
        and m.status = 'ATIVO'
    )
    or exists (
      select 1
      from jsonb_array_elements(p_itens) with ordinality e
      cross join lateral jsonb_to_record(e.value) as i(
        produto_id uuid, tipo text, quantidade numeric, custo_unitario numeric,
        origem text, observacao text, setor text
      )
      left join public.movimentacoes_estoque m
        on m.company_id = v_company
       and m.reference_type = c_ref_type
       and m.reference_id = v_key || ':' || e.ordinality
       and m.status = 'ATIVO'
      where m.id is null
         or m.produto_id is distinct from i.produto_id
         or m.tipo is distinct from i.tipo
         or round(m.quantidade, 6) is distinct from round(i.quantidade, 6)
         or round(m.custo_unitario, 6) is distinct from round(i.custo_unitario, 6)
         or coalesce(m.origem, '') is distinct from coalesce(i.origem, 'Manual')
         or coalesce(m.observacao, '') is distinct from coalesce(i.observacao, '')
         or coalesce(m.setor, '') is distinct from coalesce(i.setor, '')
    ) then
      raise exception 'REQUEST_ID_REUTILIZADO';
    end if;

    select array_agg(m.id order by g.n) into v_ids
    from generate_series(1, v_total) as g(n)
    join public.movimentacoes_estoque m
      on m.company_id = v_company
     and m.reference_type = c_ref_type
     and m.reference_id = v_key || ':' || g.n
     and m.status = 'ATIVO';
  end if;

  return jsonb_build_object(
    'idempotente', v_existentes <> 0,
    'movimentacoes', coalesce((
      select jsonb_agg(to_jsonb(m) order by array_position(v_ids, m.id))
      from public.movimentacoes_estoque m
      where m.id = any (v_ids) and m.company_id = v_company
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.estoque_registrar_movimentacoes_lote(jsonb, text) is
  'Nova movimentação do módulo administrativo: lote atômico, sob a RLS do chamador. Chave por linha em reference_id (<chave>:<n>, reference_type ESTOQUE_MANUAL); reenvio devolve as existentes (idempotente=true), divergência → REQUEST_ID_REUTILIZADO.';

revoke all on function public.estoque_registrar_movimentacoes_lote(jsonb, text) from public, anon;
grant execute on function public.estoque_registrar_movimentacoes_lote(jsonb, text) to authenticated;
grant execute on function public.estoque_registrar_movimentacoes_lote(jsonb, text) to service_role;

notify pgrst, 'reload schema';
