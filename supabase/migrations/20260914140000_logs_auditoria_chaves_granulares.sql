-- ── Grupo A: RLS de logs/auditoria fora do Financeiro presa a chave legada ──
-- Mesmo bug já corrigido no Financeiro (20260912131731 / 20260912164500 / 20260914120000):
-- a tela é liberada pela chave granular do registry e a RLS só aceita a chave legada.
--
-- has_permission/has_any_permission no banco NÃO expandem LEGACY_PERMISSION_MAP (só o
-- useCan do frontend expande), e admin_upsert_company_membership grava DENY explícito
-- para toda chave default do perfil que não venha marcada na matriz — inclusive as
-- legadas, que a matriz nem renderiza (só chaves do registry aparecem lá).
--
-- Caso real em produção (conferido em 2026-09-14, user_permissions):
--   user 07849560… (empresa c064aa98…): ALLOW em configuracoes:auditoria-seguranca:view
--   + DENY em system:read e system:admin  → vê a aba "Auditoria Segurança" e a lista
--   volta vazia (SELECT em audit_log negado pela RLS).
--   users 6eb5872e… / b1edf680… : ALLOW em inventario:auditoria:view + DENY em
--   inventory:read → mesmo padrão em audit_inventario_log.
--
-- A mudança é ADITIVA: as chaves legadas continuam válidas (admin/diretor/gerente_geral
-- têm system:read e inventory:read via role_permissions e não perdem nada) e
-- system:global:manage entra como escape de super-admin onde faltava.
-- has_any_permission fica embrulhado em (select ...) para virar InitPlan (1x por
-- execução) em vez de ser reavaliado linha a linha.
--
-- Tabelas deste grupo que NÃO são alteradas (ver docs/rbac/ ou o PR desta migration):
--   • public.audit_logs        — perm_audit_logs_select é inócua: a policy irmã
--                                audit_logs_select_tenant (PERMISSIVE, sem checagem de
--                                permissão) já libera o SELECT por OR. Alterar não muda
--                                nada em produção.
--   • public.integration_logs  — nenhum consumidor lê a tabela (nem src/, nem Edge
--                                Function, nem função SQL). Não há gate granular a
--                                espelhar e a tabela não tem company_id.
--   • public.companies         — companies_admin usa system:admin de propósito
--                                (gate de super-admin). NÃO tocar: CLAUDE.md é explícito
--                                que system:admin nunca expande para acesso global.
--
-- NOTA: audit_log e audit_inventario_log seguem sem FORCE RLS e (audit_log) sem
-- company_id — isolamento multi-tenant fora do escopo desta correção RBAC aditiva,
-- registrado como item futuro em CLAUDE.md.

-- ===== audit_log → configuracoes:auditoria-seguranca:view (SecurityAuditView) =====
-- SecurityAuditView.tsx faz .from('audit_log') direto; a aba "Auditoria Segurança" é
-- liberada por useModuleAccess('configuracoes') → configuracoes:auditoria-seguranca:view.
ALTER POLICY "perm_audit_log_select" ON public.audit_log
  USING (
    (SELECT has_any_permission(auth.uid(), ARRAY['configuracoes:auditoria-seguranca:view', 'system:read', 'system:global:manage']))
  );

-- ===== audit_inventario_log → inventario:auditoria:view (Inventário → Auditoria) =====
-- A Edge Function `inventario` (action 'audit_logs') já exige exatamente
-- inventario:auditoria:view antes de ler com service role; esta policy é o caminho
-- PostgREST direto, que ficou preso em inventory:read. Alinhamento + futuro-proof.
-- O isolamento por company_id continua garantido pela policy RESTRICTIVE
-- multiunit_scope_boundary (não tocada), que faz AND por cima desta.
ALTER POLICY "inventory_read_audit_log" ON public.audit_inventario_log
  USING (
    (SELECT has_any_permission(auth.uid(), ARRAY['inventario:auditoria:view', 'inventory:read', 'system:global:manage']))
  );
