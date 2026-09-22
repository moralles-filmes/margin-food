-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — Fase 1: chaves RBAC
--
-- Registra as chaves do novo módulo em `permissions` (espelhando o que
-- src/permissions/registry.ts passou a declarar) e concede aos papéis que já
-- recebem o catálogo inteiro. `operador` NÃO é contemplado aqui de propósito:
-- o acesso operacional é concedido usuário a usuário em Admin → Permissões,
-- junto com os setores que a pessoa pode movimentar.
--
-- Cuidado documentado: o papel `operador` carrega hoje as chaves legadas
-- `stock:read` e `stock:movements:read`, que satisfazem `produtos_select` e
-- `movimentacoes_select` — ou seja, quem tem esse papel JÁ enxerga custo via
-- PostgREST. Usuário puramente operacional não deve receber o papel `operador`.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.permissions (key, description, module, submodule, action)
values
  ('operacional:movimentacao:view',   'Movimentação Operacional → Entrada e Saída → Ver',          'operacional', 'movimentacao', 'view'),
  ('operacional:movimentacao:create', 'Movimentação Operacional → Entrada e Saída → Criar',        'operacional', 'movimentacao', 'create'),
  ('operacional:historico:view',      'Movimentação Operacional → Últimas Movimentações → Ver',    'operacional', 'historico',    'view'),
  ('operacional:setores:view',        'Movimentação Operacional → Setores por Usuário → Ver',      'operacional', 'setores',      'view'),
  ('operacional:setores:manage',      'Movimentação Operacional → Setores por Usuário → Gerenciar','operacional', 'setores',      'manage')
on conflict (key) do update
  set description = excluded.description,
      module      = excluded.module,
      submodule   = excluded.submodule,
      action      = excluded.action;

insert into public.role_permissions (role, permission_key)
select r.role, p.key
from (values ('admin'), ('diretor'), ('gerente_geral')) as r(role)
cross join (values
  ('operacional:movimentacao:view'),
  ('operacional:movimentacao:create'),
  ('operacional:historico:view'),
  ('operacional:setores:view'),
  ('operacional:setores:manage')
) as p(key)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role = r.role and rp.permission_key = p.key
);
