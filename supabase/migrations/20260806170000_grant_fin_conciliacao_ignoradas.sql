-- Corrige "permission denied for table fin_conciliacao_ignoradas": a tabela tinha RLS
-- correta (conciliacao_ignoradas_company_rls / conciliacao_ignoradas_superadmin) mas
-- nunca recebeu GRANT para authenticated/service_role, então o PostgREST negava
-- qualquer SELECT direto do cliente (usado em ConciliacaoBancariaSection ao importar
-- extrato, para não re-sugerir entradas já ignoradas). Mesmo padrão de incidente
-- documentado no CLAUDE.md (tabelas de cotação, 2026-06-24).
GRANT ALL ON TABLE public.fin_conciliacao_ignoradas TO authenticated, service_role;
