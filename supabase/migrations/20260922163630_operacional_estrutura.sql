-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — Fase 1: estrutura
--
-- Cria as duas tabelas de configuração que o submódulo operacional precisa e que
-- não existiam no schema:
--
--   1. estoque_setor_produtos  — quais produtos podem ser movimentados em cada
--      setor. Não havia NENHUM vínculo produto→setor: `stock_sectors` era só a
--      lista de nomes e `produtos.local_estoque` é local físico (Freezer, Estoque
--      Seco), não setor. Setor vazio (sem nenhum vínculo) significa "catálogo
--      inteiro", para a operação não travar enquanto o vínculo é montado.
--
--   2. estoque_usuario_setores — quais setores cada usuário pode movimentar.
--      `company_memberships.sector` é texto e guarda UM setor só; a operação
--      precisa de N setores por usuário, configuráveis.
--
-- Nada aqui altera o módulo administrativo de movimentações.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Produtos disponíveis por setor ───

create table if not exists public.estoque_setor_produtos (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.get_current_company_id()
              references public.companies(id) on delete cascade,
  setor_id    uuid not null references public.stock_sectors(id) on delete cascade,
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint estoque_setor_produtos_unico unique (company_id, setor_id, produto_id)
);

comment on table public.estoque_setor_produtos is
  'Produtos movimentáveis em cada setor pelo submódulo Movimentação Operacional. Setor sem nenhuma linha = catálogo ativo inteiro.';

create index if not exists idx_estoque_setor_produtos_setor
  on public.estoque_setor_produtos (company_id, setor_id);

create index if not exists idx_estoque_setor_produtos_produto
  on public.estoque_setor_produtos (company_id, produto_id);

alter table public.estoque_setor_produtos enable row level security;
alter table public.estoque_setor_produtos force row level security;

grant select, insert, update, delete on public.estoque_setor_produtos to authenticated;
grant all on public.estoque_setor_produtos to service_role;

-- O vínculo é cadastro de estoque: quem administra Cadastros administra o vínculo.
-- Leitura pelo operador NÃO passa por aqui — passa pelas RPCs op_* (SECURITY DEFINER),
-- para que nenhuma coluna de custo de `produtos` trafegue até ele.
drop policy if exists estoque_setor_produtos_select on public.estoque_setor_produtos;
create policy estoque_setor_produtos_select on public.estoque_setor_produtos
  for select using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:cadastros:view', 'estoque:cadastros:manage',
      'estoque:catalogo:view',  'stock:read', 'system:global:manage'
    ]))
  );

drop policy if exists estoque_setor_produtos_write on public.estoque_setor_produtos;
create policy estoque_setor_produtos_write on public.estoque_setor_produtos
  for all using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:cadastros:create', 'estoque:cadastros:edit',
      'estoque:cadastros:delete', 'estoque:cadastros:manage',
      'stock:edit', 'stock:write', 'system:global:manage'
    ]))
  ) with check (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:cadastros:create', 'estoque:cadastros:edit',
      'estoque:cadastros:delete', 'estoque:cadastros:manage',
      'stock:edit', 'stock:write', 'system:global:manage'
    ]))
  );

-- ─── 2. Setores autorizados por usuário ───

create table if not exists public.estoque_usuario_setores (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.get_current_company_id()
              references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  setor_id    uuid not null references public.stock_sectors(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint estoque_usuario_setores_unico unique (company_id, user_id, setor_id)
);

comment on table public.estoque_usuario_setores is
  'Setores que cada usuário pode movimentar no submódulo Movimentação Operacional. Quem tem operacional:setores:manage ou system:global:manage alcança todos os setores ativos sem precisar de linha aqui.';

create index if not exists idx_estoque_usuario_setores_user
  on public.estoque_usuario_setores (company_id, user_id);

alter table public.estoque_usuario_setores enable row level security;
alter table public.estoque_usuario_setores force row level security;

grant select, insert, update, delete on public.estoque_usuario_setores to authenticated;
grant all on public.estoque_usuario_setores to service_role;

-- O próprio usuário pode ler as suas linhas (a UI mostra os setores dele);
-- quem gerencia vê e edita as de todo mundo dentro do tenant.
drop policy if exists estoque_usuario_setores_select on public.estoque_usuario_setores;
create policy estoque_usuario_setores_select on public.estoque_usuario_setores
  for select using (
    company_id = (select public.get_current_company_id())
    and (
      user_id = (select auth.uid())
      or (select public.has_any_permission(auth.uid(), array[
        'operacional:setores:view', 'operacional:setores:manage',
        'estoque:cadastros:view', 'estoque:cadastros:manage',
        'configuracoes:usuarios:view', 'configuracoes:usuarios:manage',
        'users:manage', 'system:global:manage'
      ]))
    )
  );

drop policy if exists estoque_usuario_setores_write on public.estoque_usuario_setores;
create policy estoque_usuario_setores_write on public.estoque_usuario_setores
  for all using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'operacional:setores:manage', 'estoque:cadastros:manage',
      'configuracoes:usuarios:manage', 'users:manage', 'system:global:manage'
    ]))
  ) with check (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'operacional:setores:manage', 'estoque:cadastros:manage',
      'configuracoes:usuarios:manage', 'users:manage', 'system:global:manage'
    ]))
  );
