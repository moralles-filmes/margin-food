
-- Final cleanup: drop ALL remaining legacy RH policies without tenant filter

DROP POLICY IF EXISTS "rh_folha_delete_hr" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_select_hr" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_update_hr" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_insert_hr" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "Authenticated can read rh_incidentes" ON public.rh_incidentes;
DROP POLICY IF EXISTS "Colaborador can read own ocorrencias" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "Colaborador can read own rh_onboarding" ON public.rh_onboarding;
DROP POLICY IF EXISTS "Mentor can read assigned rh_onboarding" ON public.rh_onboarding;
DROP POLICY IF EXISTS "Colaborador can read own ajustes" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "Colaborador can read own rh_progresso" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "Colaborador can update own rh_progresso" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "Colaborador can read assigned rh_tarefas" ON public.rh_tarefas;
DROP POLICY IF EXISTS "Colaborador can update assigned rh_tarefas" ON public.rh_tarefas;
DROP POLICY IF EXISTS "Authenticated can read active rh_trilhas" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "Colaborador can read own trocas" ON public.rh_trocas_turno;
