-- ─────────────────────────────────────────────────────────────────────────────
-- Códigos de barras — gravação atômica e dois reparos da auditoria
--
--   1. O diff (DELETE + INSERT) virou UMA transação. Como duas chamadas
--      PostgREST separadas, o DELETE podia ser commitado e o INSERT falhar logo
--      depois: o produto ficava SEM nenhum código, o leitor parava de reconhecer
--      a embalagem e ninguém era avisado de que o código havia sumido.
--
--   2. A policy de escrita só exigia `company_id = get_current_company_id()`, e
--      a FK aponta para `produtos(id)`, que é único global. Dava para gravar um
--      código da empresa A apontando para um produto da empresa B. Nenhuma
--      leitura vazava (as RPCs casam company_id dos dois lados), mas a linha
--      nascia órfã.
--
--   3. `op_list_produtos` comparava o código contra o termo já escapado para
--      `ILIKE`. Como `_` é caractere válido de código, buscar `ABC_123`
--      comparava contra `ABC\_123` e nunca encontrava.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Gravação atômica do diff ───

create or replace function public.catalogo_salvar_codigos_barras(
  p_produto_id uuid,
  p_remover    uuid[] default '{}',
  p_adicionar  jsonb  default '[]'
)
returns table (id uuid, codigo text, rotulo text)
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
begin
  -- Mesmas chaves da policy de escrita da tabela: quem edita o produto
  -- administra os códigos dele.
  if not public.has_any_permission(auth.uid(), array[
    'estoque:catalogo:create', 'estoque:catalogo:edit', 'estoque:catalogo:delete',
    'estoque:cadastros:create', 'estoque:cadastros:edit',
    'estoque:cadastros:delete', 'estoque:cadastros:manage',
    'stock:edit', 'stock:write', 'stock:delete', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: estoque:catalogo:edit' using errcode = '42501';
  end if;

  -- O produto tem de ser da empresa da sessão. Sem isto, um produto de outro
  -- tenant poderia receber códigos.
  if not exists (
    select 1 from public.produtos p
    where p.id = p_produto_id and p.company_id = v_company
  ) then
    raise exception 'PRODUTO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  -- DELETE antes do INSERT, dentro da mesma transação: trocar o rótulo de um
  -- código é removê-lo e adicioná-lo de novo, e na ordem inversa os dois
  -- disputariam a mesma chave única.
  -- O filtro por produto_id impede que um id de outro produto seja apagado
  -- passando a chave na lista de remoção.
  if p_remover is not null and array_length(p_remover, 1) > 0 then
    delete from public.produto_codigos_barras c
    where c.company_id = v_company
      and c.produto_id = p_produto_id
      and c.id = any(p_remover);
  end if;

  if p_adicionar is not null and jsonb_array_length(p_adicionar) > 0 then
    insert into public.produto_codigos_barras (company_id, produto_id, codigo, rotulo)
    select v_company,
           p_produto_id,
           btrim(item->>'codigo'),
           nullif(btrim(coalesce(item->>'rotulo', '')), '')
    from jsonb_array_elements(p_adicionar) as item;
  end if;

  -- Devolve a lista já com os ids gravados. Sem isso o cliente guardaria os
  -- códigos novos sem id e o próximo diff tentaria inseri-los de novo, batendo
  -- no índice único contra a linha que ele mesmo acabou de criar.
  return query
  select c.id, c.codigo, coalesce(c.rotulo, '')
  from public.produto_codigos_barras c
  where c.company_id = v_company
    and c.produto_id = p_produto_id
  order by c.created_at, c.codigo;
end;
$$;

-- ─── 2. Escrita direta na tabela deixa de ser um caminho ───
--
-- Todo write passa pela RPC acima. A leitura continua direta (o formulário
-- carrega os códigos e checa conflito por SELECT), então só o DML sai.
revoke insert, update, delete on public.produto_codigos_barras from authenticated;

-- A policy continua existindo, agora exigindo que o produto seja do mesmo
-- tenant — se algum dia o GRANT de DML voltar, a brecha não volta junto.
drop policy if exists produto_codigos_barras_write on public.produto_codigos_barras;
create policy produto_codigos_barras_write on public.produto_codigos_barras
  for all using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:catalogo:create', 'estoque:catalogo:edit', 'estoque:catalogo:delete',
      'estoque:cadastros:create', 'estoque:cadastros:edit',
      'estoque:cadastros:delete', 'estoque:cadastros:manage',
      'stock:edit', 'stock:write', 'stock:delete', 'system:global:manage'
    ]))
    and exists (
      select 1 from public.produtos p
      where p.id = produto_codigos_barras.produto_id
        and p.company_id = produto_codigos_barras.company_id
    )
  ) with check (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:catalogo:create', 'estoque:catalogo:edit', 'estoque:catalogo:delete',
      'estoque:cadastros:create', 'estoque:cadastros:edit',
      'estoque:cadastros:delete', 'estoque:cadastros:manage',
      'stock:edit', 'stock:write', 'stock:delete', 'system:global:manage'
    ]))
    and exists (
      select 1 from public.produtos p
      where p.id = produto_codigos_barras.produto_id
        and p.company_id = produto_codigos_barras.company_id
    )
  );

-- ─── 3. Busca por código com `_` ───
--
-- `v_like` é o termo escapado, para o ILIKE. A comparação de código usa o termo
-- CRU: `_` e `%` são caracteres válidos num código, não curingas.
create or replace function public.op_list_produtos(
  p_setor_id uuid,
  p_search   text default null,
  p_limit    integer default 50
)
returns table (
  produto_id     uuid,
  nome           text,
  sku            text,
  unidade_medida text,
  saldo          numeric,
  vinculado      boolean
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company  uuid := public.assert_tenant();
  v_limit    integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_term     text;
  v_like     text;
  v_tem_vinculo boolean;
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:view', 'operacional:movimentacao:create',
    'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:view' using errcode = '42501';
  end if;

  if not public.op_setor_autorizado(v_company, auth.uid(), p_setor_id) then
    raise exception 'SETOR_NAO_AUTORIZADO' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.estoque_setor_produtos v
    where v.company_id = v_company and v.setor_id = p_setor_id
  ) into v_tem_vinculo;

  v_term := nullif(btrim(coalesce(p_search, '')), '');
  v_like := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select p.id,
         p.nome_produto,
         coalesce(p.sku, ''),
         p.unidade_medida,
         round(coalesce(p.saldo_atual, 0), 3),
         v_tem_vinculo
  from public.produtos p
  where p.company_id = v_company
    and p.ativo
    and (
      not v_tem_vinculo
      or exists (
        select 1 from public.estoque_setor_produtos v
        where v.company_id = v_company
          and v.setor_id = p_setor_id
          and v.produto_id = p.id
      )
    )
    and (
      v_term is null
      or p.nome_produto_unaccent ilike '%' || v_like || '%'
      or p.sku_unaccent ilike '%' || v_like || '%'
      or exists (
        select 1 from public.produto_codigos_barras c
        where c.company_id = v_company
          and c.produto_id = p.id
          and c.codigo = v_term
      )
    )
  order by p.nome_produto
  limit v_limit;
end;
$$;
