
-- Fix UNIQUE SKU to be tenant-scoped
DROP INDEX IF EXISTS public.produtos_sku_unique;
CREATE UNIQUE INDEX produtos_company_sku_unique
ON public.produtos (company_id, sku)
WHERE (sku IS NOT NULL AND sku <> '');
