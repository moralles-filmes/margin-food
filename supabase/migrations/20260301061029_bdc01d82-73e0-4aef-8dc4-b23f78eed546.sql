
-- =============================================
-- ETAPA: Tighten RLS policies — granular permissions
-- Adds has_any_permission() helper + updates critical policies
-- =============================================

-- 1) Helper: check if user has ANY of the given permissions
CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id uuid, _permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.get_effective_permissions(_user_id)) AS ep(perm)
    WHERE perm = ANY(_permissions)
  );
$$;

-- =============================================
-- RH: Tighten SELECT policies (error-level findings)
-- Pattern: granular key OR legacy broad key for backward compat
-- =============================================

-- rh_colaboradores → rh:prontuario:view (sensitive: CPF, salary)
DROP POLICY IF EXISTS "perm_rh_colaboradores_select" ON public.rh_colaboradores;
CREATE POLICY "perm_rh_colaboradores_select" ON public.rh_colaboradores
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:view', 'rh:prontuario:manage', 'system:global:manage']));

-- rh_folha_pagamento → rh:folha:view (sensitive: payroll)
DROP POLICY IF EXISTS "perm_rh_folha_select" ON public.rh_folha_pagamento;
CREATE POLICY "perm_rh_folha_select" ON public.rh_folha_pagamento
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:folha:view', 'rh:folha:manage', 'system:global:manage']));

-- rh_beneficios → rh:beneficios:view (sensitive: health/insurance)
DROP POLICY IF EXISTS "perm_rh_beneficios_select" ON public.rh_beneficios;
CREATE POLICY "perm_rh_beneficios_select" ON public.rh_beneficios
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:beneficios:view', 'system:global:manage']));

-- rh_documentos → rh:documentos:view (sensitive: document paths)
DROP POLICY IF EXISTS "perm_rh_documentos_select" ON public.rh_documentos;
CREATE POLICY "perm_rh_documentos_select" ON public.rh_documentos
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:documentos:view', 'rh:documentos:manage', 'system:global:manage']));

-- rh_exames → rh:sst:view (sensitive: medical exams)
DROP POLICY IF EXISTS "perm_rh_exames_select" ON public.rh_exames;
CREATE POLICY "perm_rh_exames_select" ON public.rh_exames
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:sst:view', 'system:global:manage']));

-- rh_ocorrencias_disciplinares → rh:disciplinar:view (sensitive: disciplinary records)
DROP POLICY IF EXISTS "perm_rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares;
CREATE POLICY "perm_rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:disciplinar:view', 'system:global:manage']));

-- rh_ponto_registros → rh:ponto:view (warn-level: geolocation)
DROP POLICY IF EXISTS "perm_rh_ponto_select" ON public.rh_ponto_registros;
CREATE POLICY "perm_rh_ponto_select" ON public.rh_ponto_registros
  FOR SELECT TO authenticated
  USING (
    auth.uid() = colaborador_id
    OR public.has_any_permission(auth.uid(), ARRAY['rh:ponto:view', 'rh:ponto:manage', 'system:global:manage'])
  );

-- rh_escalas → rh:escalas:view (warn-level)
DROP POLICY IF EXISTS "perm_rh_escalas_select" ON public.rh_escalas;
CREATE POLICY "perm_rh_escalas_select" ON public.rh_escalas
  FOR SELECT TO authenticated
  USING (
    (status = 'publicada')
    OR public.has_any_permission(auth.uid(), ARRAY['rh:escalas:view', 'system:global:manage'])
  );

-- rh_banco_horas → rh:banco-horas:view (warn-level)
DROP POLICY IF EXISTS "perm_rh_banco_horas_select" ON public.rh_banco_horas;
CREATE POLICY "perm_rh_banco_horas_select" ON public.rh_banco_horas
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:banco-horas:view', 'rh:banco-horas:manage', 'system:global:manage']));

-- rh_ferias_afastamentos → rh:ferias:view (warn-level)
DROP POLICY IF EXISTS "perm_rh_ferias_select" ON public.rh_ferias_afastamentos;
CREATE POLICY "perm_rh_ferias_select" ON public.rh_ferias_afastamentos
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:ferias:view', 'rh:ferias:approve', 'system:global:manage']));

-- =============================================
-- Finance: Tighten SELECT policies (error-level)
-- =============================================

-- fin_lancamentos → financeiro:lancamentos:view
DROP POLICY IF EXISTS "tenant_read" ON public.fin_lancamentos;
CREATE POLICY "tenant_read" ON public.fin_lancamentos
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'system:global:manage'])
  );

-- fin_contas_pagar → financeiro:pagar:view
DROP POLICY IF EXISTS "tenant_read" ON public.fin_contas_pagar;
CREATE POLICY "tenant_read" ON public.fin_contas_pagar
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view', 'system:global:manage'])
  );

-- fin_contas_receber → financeiro:receber:view
DROP POLICY IF EXISTS "tenant_read" ON public.fin_contas_receber;
CREATE POLICY "tenant_read" ON public.fin_contas_receber
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:view', 'system:global:manage'])
  );

-- fin_contas → financeiro:contas:view (warn-level: bank accounts)
DROP POLICY IF EXISTS "tenant_read" ON public.fin_contas;
CREATE POLICY "tenant_read" ON public.fin_contas
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['financeiro:contas:view', 'system:global:manage'])
  );

-- =============================================
-- Compras/Estoque: Tighten warn-level policies
-- =============================================

-- supplier_item_prices → compras:fornecedores:view (was: all authenticated)
DROP POLICY IF EXISTS "Authenticated users can read supplier prices" ON public.supplier_item_prices;
CREATE POLICY "perm_supplier_prices_select" ON public.supplier_item_prices
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view', 'compras:lista:view', 'system:global:manage']));

-- ficha_componentes → ficha:pre-preparos:view (was: all authenticated)
DROP POLICY IF EXISTS "Authenticated can read ficha_componentes" ON public.ficha_componentes;
CREATE POLICY "perm_ficha_componentes_select" ON public.ficha_componentes
  FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY[
    'ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view',
    'ficha:analise:view', 'ficha:markup:view', 'system:global:manage'
  ]));

-- profiles: tighten admin read policy
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_any_permission(auth.uid(), ARRAY['configuracoes:usuarios:view', 'system:global:manage'])
  );
