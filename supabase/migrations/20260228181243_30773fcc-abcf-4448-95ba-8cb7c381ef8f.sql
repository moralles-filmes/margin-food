
-- Cleanup: remove legacy has_role() policies on stock_sku_counter
DROP POLICY IF EXISTS "Authenticated can read sku counter" ON public.stock_sku_counter;
DROP POLICY IF EXISTS "Authorized can manage sku counter" ON public.stock_sku_counter;
