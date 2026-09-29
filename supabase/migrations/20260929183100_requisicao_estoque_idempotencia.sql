-- ─────────────────────────────────────────────────────────────────────────────
-- Requisição de estoque — criação atômica e idempotente.
--
-- Antes, a Edge `requisicao-estoque` (ação `criar`) gravava o cabeçalho e os
-- itens em dois INSERTs soltos, sem chave de reenvio: duplo clique, retry de
-- rede ou um erro depois do commit (auditoria) viravam uma 2ª requisição igual.
--
--   · Atômica: cabeçalho + itens na mesma transação. Falhou um item, não sobra
--     requisição vazia.
--   · Idempotente: `client_request_id` é a chave DERIVADA da operação no cliente
--     (semente da tela + resumo do conteúdo). O índice único parcial
--     `uq_requisicoes_estoque_client_request` é a garantia; o SELECT prévio é só
--     o caminho rápido. `unique_violation` é tratado como reenvio.
--   · Reenvio só é reenvio se descrever a MESMA requisição (solicitante, setor,
--     observação e o mesmo conjunto de itens/quantidades/unidades). Chave igual
--     com conteúdo diferente → REQUEST_ID_REUTILIZADO, nunca "sucesso" apontando
--     para a requisição anterior.
--   · `idempotente=true` no retorno: a Edge não audita, não gera alerta e não
--     notifica de novo.
--
-- Validação de unidade de compra e o saldo do snapshot continuam na Edge; esta
-- função confere o que é do banco (permissão, tenant, formato, produto da
-- unidade). Sem chave (front antigo), cria como antes — só que atômico.
--
-- Compatível com o que está em produção: coluna nova é nula e a Edge antiga
-- continua inserindo direto. GRANTs no mesmo arquivo: a função nunca fica
-- exposta a PUBLIC nem por um instante (aplicação via MCP/db query, não db push).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.requisicoes_estoque
  add column if not exists client_request_id text;

alter table public.requisicoes_estoque
  drop constraint if exists requisicoes_estoque_client_request_id_len;
alter table public.requisicoes_estoque
  add constraint requisicoes_estoque_client_request_id_len
  check (client_request_id is null or char_length(client_request_id) between 1 and 200);

-- Preflight: a coluna acabou de nascer, mas a migration pode ser reaplicada.
do $preflight$
begin
  if exists (
    select 1 from public.requisicoes_estoque
    where client_request_id is not null
    group by company_id, client_request_id
    having count(*) > 1
  ) then
    raise exception 'REQUISICAO_CLIENT_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_requisicoes_estoque_client_request
  on public.requisicoes_estoque (company_id, client_request_id)
  where client_request_id is not null;

create or replace function public.criar_requisicao_estoque(
  p_setor             text,
  p_observacao        text,
  p_itens             jsonb,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  c_max_itens constant int := 500;
  c_uuid_re   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_company   uuid := public.assert_tenant();
  v_uid       uuid := auth.uid();
  v_key       text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_obs       text := coalesce(p_observacao, '');
  v_total     int;
  v_req_id    uuid;
  v_nova      boolean := false;
  v_existente record;
  v_itens     jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_any_permission(v_uid, array[
    'estoque:requisicoes:create', 'stock:requisitions:create', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: estoque:requisicoes:create' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_setor, '')), '') is null then
    raise exception 'SETOR_OBRIGATORIO';
  end if;

  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'REQUEST_ID_INVALIDO';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'ITENS_INVALIDOS';
  end if;

  v_total := jsonb_array_length(p_itens);
  if v_total = 0 or v_total > c_max_itens then
    raise exception 'ITENS_TAMANHO_INVALIDO: %', v_total;
  end if;

  -- Formato antes de qualquer escrita: item malformado não pode cair num erro
  -- de cast genérico no meio do INSERT. O CASE garante que o cast só roda sobre
  -- número (o SQL não promete a ordem de avaliação do OR).
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
    where jsonb_typeof(e.value) is distinct from 'object'
       or coalesce(e.value->>'produto_id', '') !~* c_uuid_re
       or case when jsonb_typeof(e.value->'quantidade') = 'number'
               then (e.value->>'quantidade')::numeric <= 0
               else true end
       or nullif(btrim(coalesce(e.value->>'unidade', '')), '') is null
       or (e.value ? 'saldo_snapshot' and jsonb_typeof(e.value->'saldo_snapshot') not in ('number', 'null'))
  ) then
    raise exception 'ITEM_INVALIDO';
  end if;

  -- Função é SECURITY DEFINER: a RLS não filtra o produto, então o tenant é
  -- conferido aqui.
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
    where not exists (
      select 1 from public.produtos p
      where p.id = (e.value->>'produto_id')::uuid and p.company_id = v_company
    )
  ) then
    raise exception 'PRODUTO_FORA_DO_TENANT' using errcode = '42501';
  end if;

  -- Caminho rápido: reenvio já resolvido.
  if v_key is not null then
    select r.id into v_req_id
    from public.requisicoes_estoque r
    where r.company_id = v_company and r.client_request_id = v_key;
  end if;

  if v_req_id is null then
    begin
      insert into public.requisicoes_estoque (
        setor, solicitante_user_id, status, observacao, company_id, client_request_id
      ) values (
        p_setor, v_uid, 'SOLICITADA', v_obs, v_company, v_key
      )
      returning id into v_req_id;
      v_nova := true;
    exception when unique_violation then
      -- Outra transação gravou a mesma chave entre o caminho rápido e o INSERT.
      select r.id into v_req_id
      from public.requisicoes_estoque r
      where r.company_id = v_company and r.client_request_id = v_key;
      if v_req_id is null then
        raise;
      end if;
    end;
  end if;

  if v_nova then
    insert into public.requisicao_estoque_itens (
      requisicao_id, produto_id, quantidade_solicitada, unidade, saldo_snapshot, company_id
    )
    select v_req_id,
           (e.value->>'produto_id')::uuid,
           (e.value->>'quantidade')::numeric,
           e.value->>'unidade',
           coalesce((e.value->>'saldo_snapshot')::numeric, 0),
           v_company
    from jsonb_array_elements(p_itens) with ordinality e
    order by e.ordinality;
  else
    -- Só é reenvio se descrever a MESMA requisição. Multiconjunto de itens: a
    -- ordem de envio não importa, quantidade e unidade sim.
    select r.solicitante_user_id, r.setor, coalesce(r.observacao, '') as observacao
      into v_existente
    from public.requisicoes_estoque r
    where r.id = v_req_id;

    if v_existente.solicitante_user_id is distinct from v_uid
       or v_existente.setor is distinct from p_setor
       or v_existente.observacao is distinct from v_obs
       or exists (
         (select i.produto_id, round(i.quantidade_solicitada, 6), i.unidade
            from public.requisicao_estoque_itens i
           where i.requisicao_id = v_req_id and i.company_id = v_company
          except all
          select (e.value->>'produto_id')::uuid, round((e.value->>'quantidade')::numeric, 6), e.value->>'unidade'
            from jsonb_array_elements(p_itens) e)
         union all
         (select (e.value->>'produto_id')::uuid, round((e.value->>'quantidade')::numeric, 6), e.value->>'unidade'
            from jsonb_array_elements(p_itens) e
          except all
          select i.produto_id, round(i.quantidade_solicitada, 6), i.unidade
            from public.requisicao_estoque_itens i
           where i.requisicao_id = v_req_id and i.company_id = v_company)
       ) then
      raise exception 'REQUEST_ID_REUTILIZADO';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'produto_id', i.produto_id,
           'quantidade_solicitada', i.quantidade_solicitada,
           'unidade', i.unidade,
           'saldo_snapshot', i.saldo_snapshot
         ) order by i.created_at, i.id), '[]'::jsonb)
    into v_itens
  from public.requisicao_estoque_itens i
  where i.requisicao_id = v_req_id and i.company_id = v_company;

  return jsonb_build_object(
    'requisicao_id', v_req_id,
    'idempotente', not v_nova,
    'itens', v_itens
  );
end;
$$;

comment on function public.criar_requisicao_estoque(text, text, jsonb, text) is
  'Cria requisição de estoque (cabeçalho + itens) numa transação. client_request_id = chave derivada da operação; reenvio devolve a existente (idempotente=true), conteúdo divergente → REQUEST_ID_REUTILIZADO.';

revoke all on function public.criar_requisicao_estoque(text, text, jsonb, text) from public, anon;
grant execute on function public.criar_requisicao_estoque(text, text, jsonb, text) to authenticated;
grant execute on function public.criar_requisicao_estoque(text, text, jsonb, text) to service_role;

notify pgrst, 'reload schema';
