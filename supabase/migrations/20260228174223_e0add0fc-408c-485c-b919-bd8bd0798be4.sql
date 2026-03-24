-- Insert missing permission keys
INSERT INTO permissions (key, description, module, action) VALUES
  ('inventory:count', 'Lançar contagem no inventário', 'inventario', 'count'),
  ('inventory:finalize', 'Finalizar inventário', 'inventario', 'finalize'),
  ('inventory:reopen', 'Reabrir inventário', 'inventario', 'reopen')
ON CONFLICT (key) DO NOTHING;
-- Assign all inventory permissions to admin role
INSERT INTO role_permissions (role, permission_key) VALUES
  ('admin', 'inventory:read'),
  ('admin', 'inventory:create'),
  ('admin', 'inventory:count'),
  ('admin', 'inventory:finalize'),
  ('admin', 'inventory:edit'),
  ('admin', 'inventory:delete'),
  ('admin', 'inventory:approve'),
  ('admin', 'inventory:reopen')
ON CONFLICT (role, permission_key) DO NOTHING;