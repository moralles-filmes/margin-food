
-- 1) Migrate all existing user_roles to 'admin'
UPDATE public.user_roles SET role = 'admin' WHERE role NOT IN ('admin');

-- 2) Clean up role_permissions for old roles (keep admin + operador only)
DELETE FROM public.role_permissions WHERE role NOT IN ('admin', 'operador');

-- 3) Give admin ALL permissions
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', p.key FROM public.permissions p
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role = 'admin' AND rp.permission_key = p.key
);
