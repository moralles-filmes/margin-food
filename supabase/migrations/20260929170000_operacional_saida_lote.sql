-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — saída de vários itens no mesmo lançamento.
--
-- O operador bipa vários produtos, revisa a lista e confirma uma vez só. A lista
-- é gravada inteira ou nada é gravado: um item recusado (saldo, custo, setor)
-- desfaz os anteriores, então nunca sobra meia saída que o operador precise
-- descobrir e completar à mão.
--
-- Cada item passa por `op_registrar_movimentacao`, na mesma transação. As regras
-- (permissão, setor autorizado, produto do setor, saldo sob FOR UPDATE, custo
-- resolvido no servidor, idempotência por item) moram num lugar só — esta função
-- não repete nenhuma delas.
--
--   · Saldo: a soma do mesmo produto no lote é conferida naturalmente — cada
--     chamada enxerga o saldo já debitado pelo item anterior da transação.
--   · Idempotência: cada item leva o seu `client_request_id`, guardado pelo
--     índice `uq_mov_operacional_request`. Reenviar o mesmo lote depois de uma
--     resposta perdida devolve os lançamentos originais (`idempotente=true`)
--     em vez de duplicar.
--   · Deadlock: os produtos do lote são travados antes, em ordem de id. Sem
--     isso, dois lotes com os mesmos produtos em ordens diferentes se travariam.
--   · Erro: sai com o prefixo `LOTE_ITEM=<n>` (base 1) e o SQLSTATE original,
--     para a tela marcar o item recusado.
--
-- Não substitui a RPC unitária: a saída de um item só continua nela.
-- GRANTs no arquivo seguinte (o CLI quebra CREATE FUNCTION + outro statement).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.op_registrar_saidas_lote(
  p_itens      jsonb,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  c_max_itens  constant int := 50;
  c_uuid_re    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_company    uuid := public.assert_tenant();
  v_total      int;
  v_item       jsonb;
  v_idx        int;
  v_resultado  jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_msg        text;
  v_state      text;
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:create', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:create' using errcode = '42501';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'LOTE_INVALIDO';
  end if;

  v_total := jsonb_array_length(p_itens);
  if v_total = 0 or v_total > c_max_itens then
    raise exception 'LOTE_TAMANHO_INVALIDO: %', v_total;
  end if;

  -- Formato antes de qualquer trava: um item malformado não pode deixar
  -- produtos travados até o fim da transação nem cair num erro de cast genérico.
  -- A chave é obrigatória por item: sem ela, reenviar o lote duplicaria tudo.
  for v_item, v_idx in
    select e.value, e.ordinality from jsonb_array_elements(p_itens) with ordinality e
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(v_item->>'produto_id', '') !~* c_uuid_re
       or coalesce(v_item->>'setor_id', '') !~* c_uuid_re
       or jsonb_typeof(v_item->'quantidade') is distinct from 'number'
       or nullif(btrim(coalesce(v_item->>'client_request_id', '')), '') is null then
      raise exception 'LOTE_ITEM=% LOTE_ITEM_INVALIDO', v_idx;
    end if;
  end loop;

  -- Duas linhas com a mesma chave seriam a segunda devolvendo a primeira como
  -- "reenvio" (ou REQUEST_ID_REUTILIZADO) — nunca dois lançamentos.
  if (
    select count(distinct btrim(e->>'client_request_id'))
    from jsonb_array_elements(p_itens) e
  ) <> v_total then
    raise exception 'LOTE_INVALIDO: client_request_id repetido';
  end if;

  perform 1
  from public.produtos p
  where p.company_id = v_company
    and p.id in (select (e->>'produto_id')::uuid from jsonb_array_elements(p_itens) e)
  order by p.id
  for update;

  for v_item, v_idx in
    select e.value, e.ordinality from jsonb_array_elements(p_itens) with ordinality e
  loop
    begin
      v_resultado := public.op_registrar_movimentacao(
        (v_item->>'produto_id')::uuid,
        (v_item->>'setor_id')::uuid,
        'SAIDA',
        (v_item->>'quantidade')::numeric,
        p_observacao,
        v_item->>'client_request_id'
      );
    exception when others then
      -- Relançar aborta a transação inteira: os itens anteriores também voltam.
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      raise exception using
        message = format('LOTE_ITEM=%s %s', v_idx, v_msg),
        errcode = v_state;
    end;

    v_resultados := v_resultados || jsonb_build_array(v_resultado);
  end loop;

  return jsonb_build_object('success', true, 'itens', v_resultados);
end;
$$;
