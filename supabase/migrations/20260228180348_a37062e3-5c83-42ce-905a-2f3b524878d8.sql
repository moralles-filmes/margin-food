
-- Remove duplicate audit triggers (old naming existed alongside new ones)
DROP TRIGGER IF EXISTS audit_movimentacoes_estoque ON public.movimentacoes_estoque;
DROP TRIGGER IF EXISTS audit_produtos ON public.produtos;
