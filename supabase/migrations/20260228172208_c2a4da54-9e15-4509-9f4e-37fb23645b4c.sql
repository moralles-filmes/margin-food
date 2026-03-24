
-- Add planning:manage permission to permissions catalog
INSERT INTO public.permissions (key, module, submodule, action, description)
VALUES ('planning:manage', 'planning', NULL, 'manage', 'Gerenciar Planejamento (metas, configurações)')
ON CONFLICT (key) DO NOTHING;

-- Now add to admin role
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'planning:manage')
ON CONFLICT DO NOTHING;

-- Ensure planning:read exists for admin
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'planning:read')
ON CONFLICT DO NOTHING;
