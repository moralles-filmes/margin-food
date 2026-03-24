
-- FORCE RLS ON para todas as tabelas do módulo Salmão
ALTER TABLE public.salmon_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_manipulations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_daily_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_purchase_targets FORCE ROW LEVEL SECURITY;
