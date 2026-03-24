
-- Ensure fin_lancamentos.conciliado_por has proper FK with ON DELETE SET NULL
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fin_lancamentos_conciliado_por_fkey'
    AND table_name = 'fin_lancamentos'
  ) THEN
    ALTER TABLE public.fin_lancamentos DROP CONSTRAINT fin_lancamentos_conciliado_por_fkey;
  END IF;
END $$;

ALTER TABLE public.fin_lancamentos
ADD CONSTRAINT fin_lancamentos_conciliado_por_fkey
FOREIGN KEY (conciliado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
