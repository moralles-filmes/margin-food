
-- ─── JOB ROLES (custom roles/cargos) ───
CREATE TABLE public.job_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage job_roles" ON public.job_roles
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated can read active job_roles" ON public.job_roles
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Add job_role_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_role_id UUID REFERENCES public.job_roles(id);

-- ─── PERMISSIONS CATALOG ───
CREATE TABLE public.permissions (
  key TEXT NOT NULL PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  module TEXT NOT NULL,
  submodule TEXT,
  action TEXT NOT NULL DEFAULT 'read'
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

-- ─── ROLE_PERMISSIONS (default permissions per system role) ───
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  UNIQUE(role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Authenticated can read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- ─── USER_PERMISSIONS (per-user overrides: ALLOW/DENY) ───
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  effect TEXT NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage user_permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─── SECURITY DEFINER: get effective permissions ───
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_perms AS (
    -- All permissions from user's system roles
    SELECT rp.permission_key
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = _user_id
  ),
  user_allows AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = _user_id AND effect = 'ALLOW'
  ),
  user_denies AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = _user_id AND effect = 'DENY'
  ),
  combined AS (
    SELECT permission_key FROM role_perms
    UNION
    SELECT permission_key FROM user_allows
  )
  SELECT COALESCE(array_agg(permission_key ORDER BY permission_key), ARRAY[]::TEXT[])
  FROM combined
  WHERE permission_key NOT IN (SELECT permission_key FROM user_denies)
$$;

-- ─── SEED: Permission catalog ───
INSERT INTO public.permissions (key, description, module, submodule, action) VALUES
  -- Relatórios
  ('reports:read', 'Ver Relatórios Gerais', 'reports', NULL, 'read'),
  ('reports:export', 'Exportar Relatórios', 'reports', NULL, 'export'),
  -- Dashboard Salmão
  ('salmon:dashboard:read', 'Ver Dashboard Salmão', 'salmon', 'dashboard', 'read'),
  ('salmon:entries:read', 'Ver Lançamentos Salmão', 'salmon', 'entries', 'read'),
  ('salmon:entries:create', 'Criar Lançamentos Salmão', 'salmon', 'entries', 'create'),
  ('salmon:entries:edit', 'Editar Lançamentos Salmão', 'salmon', 'entries', 'edit'),
  ('salmon:entries:delete', 'Excluir Lançamentos Salmão', 'salmon', 'entries', 'delete'),
  ('salmon:manipulation:read', 'Ver Manipulações', 'salmon', 'manipulation', 'read'),
  ('salmon:manipulation:create', 'Criar Manipulações', 'salmon', 'manipulation', 'create'),
  -- Estoque
  ('stock:read', 'Ver Controle de Estoque', 'stock', NULL, 'read'),
  ('stock:edit', 'Editar Estoque', 'stock', NULL, 'edit'),
  ('stock:delete', 'Excluir itens de Estoque', 'stock', NULL, 'delete'),
  ('stock:movements:read', 'Ver Movimentações', 'stock', 'movements', 'read'),
  ('stock:movements:create', 'Criar Movimentações', 'stock', 'movements', 'create'),
  ('stock:requisitions:read', 'Ver Requisições de Estoque', 'stock', 'requisitions', 'read'),
  ('stock:requisitions:create', 'Criar Requisições de Estoque', 'stock', 'requisitions', 'create'),
  ('stock:requisitions:approve', 'Aprovar Requisições de Estoque', 'stock', 'requisitions', 'approve'),
  -- Inventário
  ('inventory:read', 'Ver Inventário', 'inventory', NULL, 'read'),
  ('inventory:create', 'Criar Inventário', 'inventory', NULL, 'create'),
  ('inventory:edit', 'Editar Inventário', 'inventory', NULL, 'edit'),
  ('inventory:delete', 'Excluir Inventário', 'inventory', NULL, 'delete'),
  ('inventory:approve', 'Aprovar Inventário', 'inventory', NULL, 'approve'),
  -- Compras
  ('purchases:read', 'Ver Compras', 'purchases', NULL, 'read'),
  ('purchases:create', 'Criar Compras', 'purchases', NULL, 'create'),
  ('purchases:approve', 'Aprovar Compras', 'purchases', NULL, 'approve'),
  ('purchases:market:read', 'Ver Mercados & Sazonais', 'purchases', 'market', 'read'),
  ('purchases:market:edit', 'Editar Mercados & Sazonais', 'purchases', 'market', 'edit'),
  ('purchases:receiving:read', 'Ver Recebimento de Mercadorias', 'purchases', 'receiving', 'read'),
  ('purchases:receiving:confirm', 'Confirmar Recebimento', 'purchases', 'receiving', 'confirm'),
  ('purchases:confirmations:read', 'Ver Confirmações de Recebimento', 'purchases', 'confirmations', 'read'),
  -- Fornecedores
  ('suppliers:read', 'Ver Fornecedores', 'suppliers', NULL, 'read'),
  ('suppliers:edit', 'Editar Fornecedores', 'suppliers', NULL, 'edit'),
  -- CMV
  ('cmv:read', 'Ver Centro de CMV', 'cmv', NULL, 'read'),
  -- Ficha Técnica
  ('recipes:read', 'Ver Ficha Técnica', 'recipes', NULL, 'read'),
  ('recipes:edit', 'Editar Ficha Técnica', 'recipes', NULL, 'edit'),
  -- Planejamento
  ('planning:read', 'Ver Planejamento', 'planning', NULL, 'read'),
  -- IA
  ('ai:use', 'Usar Central de IA', 'ai', NULL, 'use'),
  -- RH
  ('rh:read', 'Ver RH', 'rh', NULL, 'read'),
  ('rh:manage', 'Gerenciar RH', 'rh', NULL, 'manage'),
  ('rh:ponto', 'Registrar Ponto', 'rh', 'ponto', 'create'),
  ('rh:admin', 'Administrar RH', 'rh', NULL, 'admin'),
  -- Financeiro
  ('finance:read', 'Ver Financeiro', 'finance', NULL, 'read'),
  ('finance:manage', 'Gerenciar Financeiro', 'finance', NULL, 'manage'),
  ('finance:export', 'Exportar Financeiro', 'finance', NULL, 'export'),
  -- Admin
  ('users:manage', 'Gerenciar Usuários', 'admin', 'users', 'manage'),
  ('settings:manage', 'Gerenciar Configurações', 'admin', 'settings', 'manage')
ON CONFLICT (key) DO NOTHING;

-- ─── SEED: Role permissions for system roles ───
-- diretor (full access)
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'diretor', key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'gerente_geral', key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key FROM public.permissions
ON CONFLICT DO NOTHING;

-- gerente
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('gerente', 'stock:read'), ('gerente', 'stock:edit'),
  ('gerente', 'stock:movements:read'), ('gerente', 'stock:movements:create'),
  ('gerente', 'stock:requisitions:read'), ('gerente', 'stock:requisitions:create'), ('gerente', 'stock:requisitions:approve'),
  ('gerente', 'rh:read'), ('gerente', 'rh:manage'), ('gerente', 'rh:ponto')
ON CONFLICT DO NOTHING;

-- compras
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('compras', 'stock:read'), ('compras', 'stock:edit'),
  ('compras', 'stock:movements:read'), ('compras', 'stock:movements:create'),
  ('compras', 'stock:requisitions:read'), ('compras', 'stock:requisitions:create'), ('compras', 'stock:requisitions:approve'),
  ('compras', 'salmon:dashboard:read'), ('compras', 'salmon:entries:read'), ('compras', 'salmon:entries:create'), ('compras', 'salmon:entries:edit'),
  ('compras', 'salmon:manipulation:read'), ('compras', 'salmon:manipulation:create'),
  ('compras', 'inventory:read'), ('compras', 'inventory:create'), ('compras', 'inventory:edit'),
  ('compras', 'purchases:read'), ('compras', 'purchases:create'), ('compras', 'purchases:approve'),
  ('compras', 'purchases:market:read'), ('compras', 'purchases:market:edit'),
  ('compras', 'purchases:receiving:read'), ('compras', 'purchases:receiving:confirm'),
  ('compras', 'purchases:confirmations:read'),
  ('compras', 'suppliers:read'), ('compras', 'suppliers:edit')
ON CONFLICT DO NOTHING;

-- compras_assistente
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('compras_assistente', 'stock:read'), ('compras_assistente', 'stock:edit'),
  ('compras_assistente', 'stock:movements:read'),
  ('compras_assistente', 'stock:requisitions:read'), ('compras_assistente', 'stock:requisitions:create'),
  ('compras_assistente', 'salmon:dashboard:read'), ('compras_assistente', 'salmon:entries:read'), ('compras_assistente', 'salmon:entries:create'), ('compras_assistente', 'salmon:entries:edit'),
  ('compras_assistente', 'salmon:manipulation:read'), ('compras_assistente', 'salmon:manipulation:create'),
  ('compras_assistente', 'inventory:read'), ('compras_assistente', 'inventory:create'), ('compras_assistente', 'inventory:edit')
ON CONFLICT DO NOTHING;

-- colaborador
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('colaborador', 'stock:requisitions:read'), ('colaborador', 'stock:requisitions:create'),
  ('colaborador', 'rh:ponto')
ON CONFLICT DO NOTHING;

-- financeiro
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('financeiro', 'reports:read'), ('financeiro', 'reports:export'),
  ('financeiro', 'salmon:dashboard:read'), ('financeiro', 'salmon:entries:read'),
  ('financeiro', 'stock:read'), ('financeiro', 'stock:movements:read'),
  ('financeiro', 'stock:requisitions:read'),
  ('financeiro', 'inventory:read'),
  ('financeiro', 'purchases:read'), ('financeiro', 'purchases:market:read'),
  ('financeiro', 'purchases:receiving:read'), ('financeiro', 'purchases:confirmations:read'),
  ('financeiro', 'suppliers:read'),
  ('financeiro', 'cmv:read'), ('financeiro', 'recipes:read'), ('financeiro', 'planning:read'),
  ('financeiro', 'ai:use'),
  ('financeiro', 'finance:read'), ('financeiro', 'finance:manage'), ('financeiro', 'finance:export')
ON CONFLICT DO NOTHING;

-- chefe_setor
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('chefe_setor', 'stock:requisitions:read'), ('chefe_setor', 'stock:requisitions:create'), ('chefe_setor', 'stock:requisitions:approve'),
  ('chefe_setor', 'rh:read'), ('chefe_setor', 'rh:ponto')
ON CONFLICT DO NOTHING;

-- estoquista
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('estoquista', 'stock:read'), ('estoquista', 'stock:movements:read'),
  ('estoquista', 'stock:requisitions:read'), ('estoquista', 'stock:requisitions:approve'),
  ('estoquista', 'purchases:market:read'), ('estoquista', 'purchases:market:edit'),
  ('estoquista', 'purchases:receiving:read'), ('estoquista', 'purchases:receiving:confirm')
ON CONFLICT DO NOTHING;

-- operador
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('operador', 'stock:read'), ('operador', 'stock:movements:read'),
  ('operador', 'inventory:read')
ON CONFLICT DO NOTHING;

-- viewer
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('viewer', 'stock:read'), ('viewer', 'stock:movements:read')
ON CONFLICT DO NOTHING;
