-- Contenção: suspende writers do Catálogo, sem restaurar ACLs vulneráveis.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.produtos FROM authenticated;
REVOKE ALL ON FUNCTION public.deactivate_produto(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_next_sku(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recalc_product_costs(uuid) FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
