
-- CRITICAL: Enable FORCE ROW LEVEL SECURITY on stock module tables
-- Without FORCE RLS, service_role connections bypass all RLS policies

ALTER TABLE public.requisicoes_estoque FORCE ROW LEVEL SECURITY;
ALTER TABLE public.requisicao_estoque_itens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations FORCE ROW LEVEL SECURITY;
