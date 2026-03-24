-- Add setor column to movimentacoes_estoque for sector tracking on saídas
ALTER TABLE public.movimentacoes_estoque
ADD COLUMN setor TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.movimentacoes_estoque.setor IS 'Setor obrigatório para saídas: Cozinha, Salão, Limpeza, Sushi, Peixaria, Copa, Administrativo, Delivery';