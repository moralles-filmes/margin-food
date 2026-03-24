
-- Sync ficha-tecnica permissions from registry
-- New permissions: ficha:canais:manage, ficha:markup:manage, ficha:analise:simulate
-- (replacing old ficha:canais:create/edit/delete and ficha:markup:edit)

-- Remove old permissions that no longer exist in registry
DELETE FROM public.permissions WHERE key IN (
  'ficha:canais:create', 'ficha:canais:edit', 'ficha:canais:delete',
  'ficha:markup:edit'
);

-- Insert new permissions (ignore if already exist)
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('ficha:canais:manage', 'Ficha Técnica → Canais → Gerenciar', 'ficha', 'canais', 'manage'),
  ('ficha:markup:manage', 'Ficha Técnica → Markup → Gerenciar (Precificar/Recalcular)', 'ficha', 'markup', 'manage'),
  ('ficha:analise:simulate', 'Ficha Técnica → Análise → Simular Cenário', 'ficha', 'analise', 'simulate')
ON CONFLICT (key) DO NOTHING;

-- Ensure all ficha permissions exist
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('ficha:pre-preparos:view', 'Ficha Técnica → Pré-Preparos → Ver', 'ficha', 'pre-preparos', 'view'),
  ('ficha:pre-preparos:create', 'Ficha Técnica → Pré-Preparos → Criar', 'ficha', 'pre-preparos', 'create'),
  ('ficha:pre-preparos:edit', 'Ficha Técnica → Pré-Preparos → Editar', 'ficha', 'pre-preparos', 'edit'),
  ('ficha:pre-preparos:delete', 'Ficha Técnica → Pré-Preparos → Excluir', 'ficha', 'pre-preparos', 'delete'),
  ('ficha:itens-prontos:view', 'Ficha Técnica → Itens Prontos → Ver', 'ficha', 'itens-prontos', 'view'),
  ('ficha:itens-prontos:create', 'Ficha Técnica → Itens Prontos → Criar', 'ficha', 'itens-prontos', 'create'),
  ('ficha:itens-prontos:edit', 'Ficha Técnica → Itens Prontos → Editar', 'ficha', 'itens-prontos', 'edit'),
  ('ficha:itens-prontos:delete', 'Ficha Técnica → Itens Prontos → Excluir', 'ficha', 'itens-prontos', 'delete'),
  ('ficha:produtos-finais:view', 'Ficha Técnica → Produtos Finais → Ver', 'ficha', 'produtos-finais', 'view'),
  ('ficha:produtos-finais:create', 'Ficha Técnica → Produtos Finais → Criar', 'ficha', 'produtos-finais', 'create'),
  ('ficha:produtos-finais:edit', 'Ficha Técnica → Produtos Finais → Editar', 'ficha', 'produtos-finais', 'edit'),
  ('ficha:produtos-finais:delete', 'Ficha Técnica → Produtos Finais → Excluir', 'ficha', 'produtos-finais', 'delete'),
  ('ficha:canais:view', 'Ficha Técnica → Canais → Ver', 'ficha', 'canais', 'view'),
  ('ficha:analise:view', 'Ficha Técnica → Análise → Ver', 'ficha', 'analise', 'view'),
  ('ficha:markup:view', 'Ficha Técnica → Markup → Ver', 'ficha', 'markup', 'view')
ON CONFLICT (key) DO NOTHING;

-- Grant all ficha:% permissions to admin role
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key FROM public.permissions WHERE key LIKE 'ficha:%'
ON CONFLICT (role, permission_key) DO NOTHING;

-- Remove stale role_permissions for deleted keys
DELETE FROM public.role_permissions 
WHERE permission_key IN ('ficha:canais:create', 'ficha:canais:edit', 'ficha:canais:delete', 'ficha:markup:edit');
