
-- Drop ALL remaining legacy policies without tenant filter
-- These are orphaned from the first partial migration

-- rh_audit_log
DROP POLICY IF EXISTS "perm_rh_audit_select" ON public.rh_audit_log;

-- rh_banco_horas
DROP POLICY IF EXISTS "perm_rh_banco_horas_write" ON public.rh_banco_horas;
DROP POLICY IF EXISTS "perm_rh_banco_horas_select" ON public.rh_banco_horas;
DROP POLICY IF EXISTS "Colaborador can read own banco_horas" ON public.rh_banco_horas;

-- rh_beneficios
DROP POLICY IF EXISTS "perm_rh_beneficios_write" ON public.rh_beneficios;
DROP POLICY IF EXISTS "perm_rh_beneficios_select" ON public.rh_beneficios;
DROP POLICY IF EXISTS "Colaborador can read own beneficios" ON public.rh_beneficios;

-- rh_colaboradores
DROP POLICY IF EXISTS "rh_colaboradores_select_hr" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "rh_colaboradores_select_own" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "rh_colaboradores_update_hr" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "rh_colaboradores_delete_hr" ON public.rh_colaboradores;

-- rh_comunicados
DROP POLICY IF EXISTS "perm_rh_comunicados_write" ON public.rh_comunicados;
DROP POLICY IF EXISTS "perm_rh_comunicados_select" ON public.rh_comunicados;
DROP POLICY IF EXISTS "Authenticated can read active comunicados" ON public.rh_comunicados;

-- rh_custos_mensais
DROP POLICY IF EXISTS "perm_rh_custos_write" ON public.rh_custos_mensais;
DROP POLICY IF EXISTS "perm_rh_custos_select" ON public.rh_custos_mensais;

-- rh_disponibilidade
DROP POLICY IF EXISTS "perm_rh_disponibilidade_write" ON public.rh_disponibilidade;
DROP POLICY IF EXISTS "perm_rh_disponibilidade_select" ON public.rh_disponibilidade;
DROP POLICY IF EXISTS "Colaborador can manage own disponibilidade" ON public.rh_disponibilidade;

-- rh_documentos
DROP POLICY IF EXISTS "perm_rh_documentos_write" ON public.rh_documentos;
DROP POLICY IF EXISTS "perm_rh_documentos_select" ON public.rh_documentos;
DROP POLICY IF EXISTS "Colaborador can read own documentos" ON public.rh_documentos;

-- rh_epis
DROP POLICY IF EXISTS "perm_rh_epis_write" ON public.rh_epis;
DROP POLICY IF EXISTS "perm_rh_epis_select" ON public.rh_epis;
DROP POLICY IF EXISTS "Colaborador can read own epis" ON public.rh_epis;

-- rh_escala_slots
DROP POLICY IF EXISTS "perm_rh_escala_slots_write" ON public.rh_escala_slots;
DROP POLICY IF EXISTS "perm_rh_escala_slots_select" ON public.rh_escala_slots;
DROP POLICY IF EXISTS "Colaborador can read own slots" ON public.rh_escala_slots;
DROP POLICY IF EXISTS "Authenticated can read published slots" ON public.rh_escala_slots;

-- rh_escalas
DROP POLICY IF EXISTS "perm_rh_escalas_write" ON public.rh_escalas;
DROP POLICY IF EXISTS "perm_rh_escalas_select" ON public.rh_escalas;
DROP POLICY IF EXISTS "Authenticated can read published rh_escalas" ON public.rh_escalas;

-- rh_exames
DROP POLICY IF EXISTS "perm_rh_exames_write" ON public.rh_exames;
DROP POLICY IF EXISTS "perm_rh_exames_select" ON public.rh_exames;
DROP POLICY IF EXISTS "Colaborador can read own exames" ON public.rh_exames;

-- rh_ferias_afastamentos
DROP POLICY IF EXISTS "perm_rh_ferias_write" ON public.rh_ferias_afastamentos;
DROP POLICY IF EXISTS "perm_rh_ferias_select" ON public.rh_ferias_afastamentos;
DROP POLICY IF EXISTS "Colaborador can read own ferias" ON public.rh_ferias_afastamentos;

-- rh_ferias_saldo
DROP POLICY IF EXISTS "perm_rh_ferias_saldo_write" ON public.rh_ferias_saldo;
DROP POLICY IF EXISTS "perm_rh_ferias_saldo_select" ON public.rh_ferias_saldo;
DROP POLICY IF EXISTS "Colaborador can read own saldo" ON public.rh_ferias_saldo;
DROP POLICY IF EXISTS "Colaborador can read own ferias_saldo" ON public.rh_ferias_saldo;
