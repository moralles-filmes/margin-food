-- Idempotent: ensure system:global:manage exists in permissions and is granted to admin
INSERT INTO public.permissions (key, description, module, action)
VALUES ('system:global:manage', 'Super-admin: acesso total ao sistema', 'system', 'manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'system:global:manage')
ON CONFLICT (role, permission_key) DO NOTHING;