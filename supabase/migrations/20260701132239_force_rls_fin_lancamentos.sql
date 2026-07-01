-- Ensure ledger rows are protected even for table owners.
-- Found by rbac_sql_lint_report_quick(): fin_lancamentos had RLS enabled but FORCE RLS disabled in production.
ALTER TABLE public.fin_lancamentos FORCE ROW LEVEL SECURITY;
