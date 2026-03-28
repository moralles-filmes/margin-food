-- 1. Limpa permissões antigas do admin para evitar duplicatas ou lixo (opcional, mas recomendado para consistência)
-- DELETE FROM role_permissions WHERE role = 'admin';

-- 2. Atribui TODAS as permissões existentes ao papel 'admin'
INSERT INTO role_permissions (role, permission_key)
SELECT 'admin', key FROM permissions
ON CONFLICT (role, permission_key) DO NOTHING;

-- 3. Verifica a contagem
SELECT count(*) as total_perms_admin FROM role_permissions WHERE role = 'admin';
