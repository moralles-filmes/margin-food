-- Migration: fix_fk_on_delete_set_null_users
-- Objetivo: Garantir que a exclusão hard-delete de um usuário em auth.users
-- não bloqueie por FK. Todas as referências históricas (movimentações, compras,
-- orçamentos, etc.) devem ser preservadas com created_by/user_id = NULL.

-- 1. movimentacoes_estoque.created_by
ALTER TABLE movimentacoes_estoque
  DROP CONSTRAINT IF EXISTS movimentacoes_estoque_created_by_fkey;
ALTER TABLE movimentacoes_estoque
  ADD CONSTRAINT movimentacoes_estoque_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. solic_compra_mercado.solicitante_user_id (era NOT NULL — removendo restrição)
ALTER TABLE solic_compra_mercado
  ALTER COLUMN solicitante_user_id DROP NOT NULL;
ALTER TABLE solic_compra_mercado
  DROP CONSTRAINT IF EXISTS solic_compra_mercado_solicitante_user_id_fkey;
ALTER TABLE solic_compra_mercado
  ADD CONSTRAINT solic_compra_mercado_solicitante_user_id_fkey
    FOREIGN KEY (solicitante_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. solic_compra_mercado.responsavel_user_id
ALTER TABLE solic_compra_mercado
  DROP CONSTRAINT IF EXISTS solic_compra_mercado_responsavel_user_id_fkey;
ALTER TABLE solic_compra_mercado
  ADD CONSTRAINT solic_compra_mercado_responsavel_user_id_fkey
    FOREIGN KEY (responsavel_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. solic_compra_mercado_item.comprado_por
ALTER TABLE solic_compra_mercado_item
  DROP CONSTRAINT IF EXISTS solic_compra_mercado_item_comprado_por_fkey;
ALTER TABLE solic_compra_mercado_item
  ADD CONSTRAINT solic_compra_mercado_item_comprado_por_fkey
    FOREIGN KEY (comprado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. aprovacoes_solic_compra_mercado.aprovado_por_user_id (era NOT NULL — removendo restrição)
ALTER TABLE aprovacoes_solic_compra_mercado
  ALTER COLUMN aprovado_por_user_id DROP NOT NULL;
ALTER TABLE aprovacoes_solic_compra_mercado
  DROP CONSTRAINT IF EXISTS aprovacoes_solic_compra_mercado_aprovado_por_user_id_fkey;
ALTER TABLE aprovacoes_solic_compra_mercado
  ADD CONSTRAINT aprovacoes_solic_compra_mercado_aprovado_por_user_id_fkey
    FOREIGN KEY (aprovado_por_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. fin_orcamentos.created_by
ALTER TABLE fin_orcamentos
  DROP CONSTRAINT IF EXISTS fin_orcamentos_created_by_fkey;
ALTER TABLE fin_orcamentos
  ADD CONSTRAINT fin_orcamentos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. job_roles.created_by
ALTER TABLE job_roles
  DROP CONSTRAINT IF EXISTS job_roles_created_by_fkey;
ALTER TABLE job_roles
  ADD CONSTRAINT job_roles_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 8. user_permissions.granted_by
ALTER TABLE user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_granted_by_fkey;
ALTER TABLE user_permissions
  ADD CONSTRAINT user_permissions_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 9. stock_categories.created_by
ALTER TABLE stock_categories
  DROP CONSTRAINT IF EXISTS stock_categories_created_by_fkey;
ALTER TABLE stock_categories
  ADD CONSTRAINT stock_categories_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 10. stock_locations.created_by
ALTER TABLE stock_locations
  DROP CONSTRAINT IF EXISTS stock_locations_created_by_fkey;
ALTER TABLE stock_locations
  ADD CONSTRAINT stock_locations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
