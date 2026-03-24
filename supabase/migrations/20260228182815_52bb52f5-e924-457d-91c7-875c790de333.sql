
-- =============================================
-- HOTFIX: Estoque Geral — Triggers + FKs cleanup
-- =============================================

-- 1) Remove duplicate audit triggers (keep trg_audit_* which cover INSERT/UPDATE/DELETE)
DROP TRIGGER IF EXISTS audit_movimentacoes_estoque ON movimentacoes_estoque;
DROP TRIGGER IF EXISTS audit_produtos ON produtos;

-- 2) Recreate trg_set_direction to fire on INSERT OR UPDATE (was INSERT+DELETE)
DROP TRIGGER IF EXISTS trg_set_direction ON movimentacoes_estoque;
CREATE TRIGGER trg_set_direction
  BEFORE INSERT OR UPDATE ON movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stock_movement_direction();

-- 3) Recreate trg_validate_stock_movement to fire on INSERT OR UPDATE only (was INSERT+DELETE)
DROP TRIGGER IF EXISTS trg_validate_stock_movement ON movimentacoes_estoque;
CREATE TRIGGER trg_validate_stock_movement
  BEFORE INSERT OR UPDATE ON movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_stock_movement();

-- 4) Remove duplicate FKs — keep fk_mov_produto (RESTRICT) and fk_mov_estorno (SET NULL)
ALTER TABLE movimentacoes_estoque DROP CONSTRAINT IF EXISTS movimentacoes_estoque_produto_id_fkey;
ALTER TABLE movimentacoes_estoque DROP CONSTRAINT IF EXISTS movimentacoes_estoque_estorno_de_id_fkey;
