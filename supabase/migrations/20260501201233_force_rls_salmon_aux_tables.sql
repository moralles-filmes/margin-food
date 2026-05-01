-- =========================================================
-- Hardening RLS: padroniza FORCE em 2 tabelas auxiliares de salmão
-- Data: 2026-05-01
-- Problema: salmon_auditorias_compra e salmon_metas_provisionadas estavam
--   com rls_enabled=true mas force_rls=false. Sem FORCE, o owner da tabela
--   e roles privilegiadas (service_role) bypassam as policies "Tenant
--   isolation" existentes. Edge Functions que rodam com service_role
--   poderiam ler/escrever cross-tenant em código futuro sem perceber.
-- Fix: ALTER TABLE ... FORCE ROW LEVEL SECURITY. As policies tenant-scoped
--   já existentes (cmd=ALL, qual=company_id=get_current_company_id())
--   passam a aplicar para TODOS os roles.
-- =========================================================

ALTER TABLE public.salmon_auditorias_compra FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_metas_provisionadas FORCE ROW LEVEL SECURITY;
