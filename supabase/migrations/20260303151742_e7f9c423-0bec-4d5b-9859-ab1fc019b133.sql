-- Corrigir unicidade multi-tenant para categorias e locais de estoque
-- Antes: UNIQUE lower(name) global
-- Depois: UNIQUE (company_id, lower(name)) por tenant

DROP INDEX IF EXISTS public.stock_categories_name_unique;
CREATE UNIQUE INDEX stock_categories_name_unique
ON public.stock_categories (company_id, lower(name))
WHERE (is_active = true);

DROP INDEX IF EXISTS public.stock_locations_name_unique;
CREATE UNIQUE INDEX stock_locations_name_unique
ON public.stock_locations (company_id, lower(name))
WHERE (is_active = true);