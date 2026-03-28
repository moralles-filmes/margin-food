-- =========================================================
-- ADICIONAR COLUNA COMPANY_ID FALTANTE EM AUDIT_INVENTARIO_LOG
-- Data: 2026-03-28
-- Objetivo: Resolver erro "column company_id does not exist" 
-- na audit_inventario_log que impede criação de inventários.
-- =========================================================

-- 1. Adicionar a coluna company_id
ALTER TABLE public.audit_inventario_log
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 2. Backfill: atribuir company_id da empresa piloto a logs existentes
UPDATE public.audit_inventario_log 
SET company_id = 'e6df6541-154e-4576-ad0c-86047bc57490'
WHERE company_id IS NULL;

-- 3. Índice para filtros por empresa
CREATE INDEX IF NOT EXISTS idx_audit_inv_log_company 
ON public.audit_inventario_log(company_id);

-- 4. Recarregar cache
NOTIFY pgrst, 'reload schema';
