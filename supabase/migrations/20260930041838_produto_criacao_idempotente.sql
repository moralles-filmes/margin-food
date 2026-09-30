-- ─────────────────────────────────────────────────────────────────────────────
-- Cadastro de produto — idempotente.
--
-- Antes: `addProduto` chamava generate_next_sku a CADA envio e fazia o INSERT
-- direto via PostgREST. Duplo clique, Ctrl+Enter repetido ou retry depois de
-- resposta perdida (ou de falha nos códigos de barras, que rodam depois do
-- INSERT) gravavam outro produto com outro SKU — `produtos_company_sku_unique`
-- não pegava nada, porque cada envio trazia um SKU novo.
--
-- Agora (padrão de op_registrar_movimentacao):
--   · `produtos.client_request_id` + `uq_produtos_client_request`
--     (company_id, client_request_id) é a garantia com tenant;
--   · `estoque_criar_produto` só gera SKU quando vai de fato inserir; reenvio
--     (caminho rápido ou unique_violation) devolve o produto existente com
--     idempotente=true; conteúdo divergente → REQUEST_ID_REUTILIZADO.
--
-- A RPC é SECURITY INVOKER de propósito: grava sob a MESMA RLS do INSERT direto
-- (produtos_insert + multiunit_scope_boundary + produtos_force_company_id), e
-- generate_next_sku continua checando as mesmas permissões de catálogo.
-- company_id sai do servidor.
--
-- Compatível com o front em produção: coluna nula sem default, índice parcial
-- só sobre linhas com chave (nenhuma hoje), e o front antigo segue fazendo
-- generate_next_sku + INSERT direto.
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER/índice em produtos: falha rápido em vez de enfileirar escrita atrás de
-- uma transação longa.
set local lock_timeout = '5s';

alter table public.produtos add column if not exists client_request_id text;

comment on column public.produtos.client_request_id is
  'Chave de idempotência do cadastro (estoque_criar_produto). Nula nos produtos criados por outros caminhos.';

do $preflight$
begin
  if exists (
    select 1 from public.produtos
    where client_request_id is not null
    group by company_id, client_request_id
    having count(*) > 1
  ) then
    raise exception 'PRODUTO_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_produtos_client_request
  on public.produtos (company_id, client_request_id)
  where client_request_id is not null;

create or replace function public.estoque_criar_produto(
  p_produto           jsonb,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_company     uuid := public.assert_tenant();
  v_uid         uuid := auth.uid();
  v_key         text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_in          public.produtos;
  v_sku_in      text;
  v_row         public.produtos;
  v_idempotente boolean := false;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_key is not null and char_length(v_key) > 180 then
    raise exception 'REQUEST_ID_INVALIDO';
  end if;

  if p_produto is null or jsonb_typeof(p_produto) <> 'object' then
    raise exception 'PRODUTO_INVALIDO';
  end if;

  -- Tipagem pelas próprias colunas da tabela (numeric, int, text[] …).
  v_in := jsonb_populate_record(null::public.produtos, p_produto);

  if nullif(btrim(coalesce(v_in.nome_produto, '')), '') is null then
    raise exception 'PRODUTO_INVALIDO: nome_produto';
  end if;

  v_sku_in := nullif(btrim(coalesce(v_in.sku, '')), '');

  -- Caminho rápido: o produto já foi gravado (resposta perdida, duplo clique).
  if v_key is not null then
    select * into v_row
    from public.produtos
    where company_id = v_company and client_request_id = v_key;
    v_idempotente := found;
  end if;

  if not v_idempotente then
    begin
      insert into public.produtos (
        company_id, client_request_id, nome_produto, sku, categoria,
        unidade_medida, unidade_compra, fator_conversao_padrao,
        custo_padrao, default_cost_purchase_unit, default_cost_base_unit,
        estoque_minimo, estoque_ideal, local_estoque, observacoes,
        lead_time_dias, fornecedores_preferenciais, inactivity_days_threshold,
        conta_no_cmv, package_quantity, package_measure_unit, conversion_mode
      ) values (
        v_company, v_key, v_in.nome_produto,
        -- SKU só é gerado quando o INSERT vai acontecer: reenvio não queima número.
        coalesce(v_sku_in, public.generate_next_sku('MP')),
        coalesce(v_in.categoria, 'Outros'),
        coalesce(v_in.unidade_medida, 'UN'),
        coalesce(v_in.unidade_compra, 'UN'),
        coalesce(v_in.fator_conversao_padrao, 1),
        coalesce(v_in.custo_padrao, 0),
        coalesce(v_in.default_cost_purchase_unit, 0),
        coalesce(v_in.default_cost_base_unit, 0),
        coalesce(v_in.estoque_minimo, 0),
        coalesce(v_in.estoque_ideal, 0),
        v_in.local_estoque,
        v_in.observacoes,
        coalesce(v_in.lead_time_dias, 1),
        coalesce(v_in.fornecedores_preferenciais, '{}'::text[]),
        v_in.inactivity_days_threshold,
        coalesce(v_in.conta_no_cmv, true),
        v_in.package_quantity,
        v_in.package_measure_unit,
        coalesce(v_in.conversion_mode, 'manual')
      )
      returning * into v_row;
    exception when unique_violation then
      -- Envio simultâneo com a mesma chave: pode estourar tanto
      -- uq_produtos_client_request quanto o SKU digitado. Só é reenvio se a
      -- chave já existe; qualquer outra colisão (SKU de outro produto)
      -- continua sendo erro.
      if v_key is null then
        raise;
      end if;
      select * into v_row
      from public.produtos
      where company_id = v_company and client_request_id = v_key;
      if not found then
        raise;
      end if;
      v_idempotente := true;
    end;
  end if;

  -- Reenvio: o produto gravado precisa descrever o MESMO cadastro.
  if v_idempotente and (
       v_row.nome_produto is distinct from v_in.nome_produto
    or v_row.categoria is distinct from coalesce(v_in.categoria, 'Outros')
    or v_row.unidade_medida is distinct from coalesce(v_in.unidade_medida, 'UN')
    or v_row.unidade_compra is distinct from coalesce(v_in.unidade_compra, 'UN')
    or round(v_row.fator_conversao_padrao, 6) is distinct from round(coalesce(v_in.fator_conversao_padrao, 1), 6)
    or round(v_row.default_cost_purchase_unit, 6) is distinct from round(coalesce(v_in.default_cost_purchase_unit, 0), 6)
    or (v_sku_in is not null and v_row.sku is distinct from v_sku_in)
  ) then
    raise exception 'REQUEST_ID_REUTILIZADO';
  end if;

  return jsonb_build_object(
    'idempotente', v_idempotente,
    'produto', to_jsonb(v_row)
  );
end;
$$;

comment on function public.estoque_criar_produto(jsonb, text) is
  'Cadastro de produto sob a RLS do chamador. SKU gerado só no INSERT; reenvio com a mesma chave devolve o existente (idempotente=true), divergência → REQUEST_ID_REUTILIZADO.';

revoke all on function public.estoque_criar_produto(jsonb, text) from public, anon;
grant execute on function public.estoque_criar_produto(jsonb, text) to authenticated;
grant execute on function public.estoque_criar_produto(jsonb, text) to service_role;

notify pgrst, 'reload schema';
