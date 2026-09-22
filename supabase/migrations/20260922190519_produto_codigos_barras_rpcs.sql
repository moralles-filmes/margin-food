-- ─────────────────────────────────────────────────────────────────────────────
-- Múltiplos códigos de barras — leitura pelo submódulo operacional
--
-- As três RPCs deixam de comparar `produtos.barcode` e passam a consultar
-- `produto_codigos_barras`. Nada muda para o operador: ele bipa qualquer uma
-- das embalagens do produto e cai no mesmo item, com o mesmo filtro de setor.
-- ─────────────────────────────────────────────────────────────────────────────

-- `op_list_produtos` PERDE a coluna `barcode` do retorno: com N códigos por
-- produto ela obrigaria a eleger um arbitrariamente, e nenhuma tela consome o
-- valor (o cliente já o descartava). A busca por código continua, agora casando
-- contra todos os códigos do produto.
-- Retorno diferente exige DROP — CREATE OR REPLACE não altera tipo de retorno.
-- Os GRANTs caem junto e são refeitos na migration seguinte.
drop function if exists public.op_list_produtos(uuid, text, integer);

create function public.op_list_produtos(
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
  if v_term is not null then
    v_term := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

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
      or p.nome_produto_unaccent ilike '%' || v_term || '%'
      or p.sku_unaccent ilike '%' || v_term || '%'
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

-- Busca por código de barras.
--
-- Devolve UMA linha por setor acessível em que o produto pode ser movimentado.
-- Quem decide entre "resolve sozinho" e "pergunta o setor" é a tela, a partir da
-- contagem de linhas — o servidor nunca devolve um setor que o usuário não
-- alcança, então o leitor não contorna a permissão de setor.
--
-- Zero linhas é ambíguo (código inexistente OU produto só em setor sem acesso);
-- `op_barcode_existe` desfaz a ambiguidade, porque a orientação ao operador
-- muda entre os dois casos.
--
-- O retorno mantém `barcode`: aqui não há ambiguidade, é o código que a pessoa
-- acabou de bipar.
create or replace function public.op_find_produto_por_barcode(p_barcode text)
returns table (
  produto_id      uuid,
  nome            text,
  sku             text,
  barcode         text,
  unidade_medida  text,
  saldo           numeric,
  setor_id        uuid,
  setor_nome      text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
  v_code    text := nullif(btrim(coalesce(p_barcode, '')), '');
  v_produto record;
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:view', 'operacional:movimentacao:create',
    'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:view' using errcode = '42501';
  end if;

  if v_code is null then
    return;
  end if;

  select p.id, p.nome_produto, p.sku, p.unidade_medida, p.saldo_atual
    into v_produto
  from public.produto_codigos_barras c
  join public.produtos p
    on p.id = c.produto_id and p.company_id = c.company_id
  where c.company_id = v_company
    and c.codigo = v_code
    and p.ativo
  limit 1;

  if not found then
    return;
  end if;

  return query
  select v_produto.id,
         v_produto.nome_produto,
         coalesce(v_produto.sku, ''),
         v_code,
         v_produto.unidade_medida,
         round(coalesce(v_produto.saldo_atual, 0), 3),
         s.id,
         s.name
  from public.stock_sectors s
  where s.company_id = v_company
    and s.is_active
    and public.op_setor_autorizado(v_company, auth.uid(), s.id)
    and (
      -- setor sem catálogo próprio aceita qualquer produto ativo
      not exists (
        select 1 from public.estoque_setor_produtos v
        where v.company_id = v_company and v.setor_id = s.id
      )
      or exists (
        select 1 from public.estoque_setor_produtos v
        where v.company_id = v_company
          and v.setor_id = s.id
          and v.produto_id = v_produto.id
      )
    )
  order by s.sort_order nulls last, s.name;
end;
$$;

create or replace function public.op_barcode_existe(p_barcode text)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
  v_code    text := nullif(btrim(coalesce(p_barcode, '')), '');
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:view', 'operacional:movimentacao:create',
    'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:view' using errcode = '42501';
  end if;

  if v_code is null then return false; end if;

  return exists (
    select 1
    from public.produto_codigos_barras c
    join public.produtos p
      on p.id = c.produto_id and p.company_id = c.company_id
    where c.company_id = v_company
      and c.codigo = v_code
      and p.ativo
  );
end;
$$;
