-- ─────────────────────────────────────────────────────────────────────────────
-- Múltiplos códigos de barras por produto
--
-- `produtos.barcode` era uma coluna só, então um produto tinha exatamente um
-- código. Isso não cobre o caso comum de compra: o mesmo item de estoque
-- ("Açúcar Refinado 1kg") chega em marcas diferentes, cada uma com seu EAN.
-- Cadastrar o código da segunda marca sobrescrevia o da primeira, e quem
-- bipasse a embalagem antiga recebia "código não cadastrado".
--
-- A coluna antiga NÃO é dropada aqui. O deploy do frontend acontece no merge e,
-- por alguns minutos, o bundle já publicado continua pedindo `barcode` na lista
-- de colunas do catálogo — dropar junto devolveria 400 para quem estivesse com a
-- aba aberta. Ela para de ser lida e escrita nesta entrega; o drop vai em
-- migration de follow-up (expand/contract).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.produto_codigos_barras (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.get_current_company_id()
              references public.companies(id) on delete cascade,
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  -- TEXT, nunca numérico: zero à esquerda é significativo (`0007894900011517`
  -- ≠ `7894900011517`) e GTIN-14 estoura a precisão exata de `Number`.
  codigo      text not null,
  -- Qual embalagem é esta ("União", "Caravelas"). Opcional, mas é o que permite
  -- remover um código com segurança meses depois — sem isso, um produto com
  -- quatro EANs é um enigma.
  rotulo      text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  -- Mesma garantia que o índice parcial de `produtos.barcode` dava: um código
  -- aponta para no máximo um produto dentro da empresa. Por empresa, não global
  -- — um índice global impediria a 2ª unidade de cadastrar o mesmo EAN.
  constraint produto_codigos_barras_unico unique (company_id, codigo),
  constraint produto_codigos_barras_formato
    check (codigo ~ '^[0-9A-Za-z._-]{4,64}$')
);

comment on table public.produto_codigos_barras is
  'Códigos de barras (EAN/GTIN/interno) de um produto. N por produto: o mesmo item de estoque chega em marcas diferentes, cada uma com seu código. Único por empresa.';

comment on column public.produto_codigos_barras.rotulo is
  'Marca/embalagem à qual este código pertence. Opcional, serve para identificar o código na hora de remover.';

create index if not exists idx_produto_codigos_barras_produto
  on public.produto_codigos_barras (company_id, produto_id);

alter table public.produto_codigos_barras enable row level security;
alter table public.produto_codigos_barras force row level security;

grant select, insert, update, delete on public.produto_codigos_barras to authenticated;
grant all on public.produto_codigos_barras to service_role;

-- O operador NÃO lê esta tabela direto: ele passa pelas RPCs `op_*`
-- (SECURITY DEFINER), como em todo o resto do submódulo operacional. As chaves
-- abaixo são as do catálogo administrativo.
drop policy if exists produto_codigos_barras_select on public.produto_codigos_barras;
create policy produto_codigos_barras_select on public.produto_codigos_barras
  for select using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:catalogo:view', 'estoque:cadastros:view',
      'estoque:cadastros:manage', 'stock:read', 'system:global:manage'
    ]))
  );

-- Quem pode editar o produto administra os códigos dele. `cmv:precos:edit`
-- alcança `produtos` (para preço) mas fica de fora daqui de propósito: editar
-- preço não é motivo para mexer em código de barras.
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
  ) with check (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:catalogo:create', 'estoque:catalogo:edit', 'estoque:catalogo:delete',
      'estoque:cadastros:create', 'estoque:cadastros:edit',
      'estoque:cadastros:delete', 'estoque:cadastros:manage',
      'stock:edit', 'stock:write', 'stock:delete', 'system:global:manage'
    ]))
  );

-- ─── Migração dos códigos já cadastrados ───
--
-- Hoje são 0 linhas em produção (o campo nasceu dias atrás), mas a cópia entra
-- mesmo assim: alguém pode cadastrar um código entre esta migration e o deploy
-- do frontend, e perder esse dado seria silencioso.
insert into public.produto_codigos_barras (company_id, produto_id, codigo, created_at)
select p.company_id, p.id, p.barcode, coalesce(p.created_at, now())
from public.produtos p
where p.barcode is not null
  and btrim(p.barcode) <> ''
  and p.barcode ~ '^[0-9A-Za-z._-]{4,64}$'
on conflict (company_id, codigo) do nothing;

comment on column public.produtos.barcode is
  'LEGADO — substituído por public.produto_codigos_barras (N códigos por produto). Não é mais lido nem escrito; mantido apenas até o frontend novo estar publicado, será dropado em migration de follow-up.';
