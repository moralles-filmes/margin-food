-- Corrige timeout intermitente ao listar fin_lancamentos (visto na Conciliacao Bancaria:
-- "erro ao carregar" + lista vazia para contas especificas).
--
-- Causa raiz: as policies RLS chamavam get_current_company_id()/has_permission()/
-- has_any_permission() diretamente na clausula USING/WITH CHECK. Mesmo marcadas STABLE,
-- o Postgres reavalia essas chamadas LINHA A LINHA durante o scan (nao ha memoizacao
-- automatica de predicados em Filter), e get_effective_permissions() (usada por ambas)
-- faz 4 CTEs sobre user_roles/role_permissions/user_permissions a cada chamada.
-- Confirmado com EXPLAIN ANALYZE: SELECT com LIMIT 200 em fin_lancamentos, quando a
-- conta/filtro exige varrer ~200 linhas antes de satisfazer o LIMIT, levava 8,7s
-- (~88 mil buffer hits so nas chamadas de permissao) e estourava o statement_timeout
-- do PostgREST -> 500 "erro ao carregar" no cliente. Contas cujas linhas ficam no
-- topo do scan (datas mais recentes) nao sentiam o problema, mascarando a causa.
--
-- Fix: envolver as chamadas em (select ...). Um scalar subquery sem referencia a
-- colunas da linha externa vira InitPlan e o Postgres avalia UMA UNICA VEZ por
-- execucao da query, nao por linha. Mesmo padrao oficial de otimizacao de RLS do
-- Supabase/Postgres (auth_rls_initplan). Verificado: mesma query cai de 8,7s para
-- ~47ms (185x) com o predicado embrulhado.
ALTER POLICY tenant_read ON public.fin_lancamentos
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view'::text, 'system:global:manage'::text]))
  );

ALTER POLICY tenant_insert ON public.fin_lancamentos
  WITH CHECK (
    company_id = (select public.get_current_company_id())
    AND (select public.has_permission(auth.uid(), 'finance:manage'::text))
  );

ALTER POLICY tenant_update ON public.fin_lancamentos
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_permission(auth.uid(), 'finance:manage'::text))
  )
  WITH CHECK (
    company_id = (select public.get_current_company_id())
    AND (select public.has_permission(auth.uid(), 'finance:manage'::text))
  );

ALTER POLICY tenant_delete ON public.fin_lancamentos
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_permission(auth.uid(), 'finance:manage'::text))
  );
