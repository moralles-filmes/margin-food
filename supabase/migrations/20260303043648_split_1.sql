CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Create triggers (idempotent)
DO $$ 
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'rh_colaboradores', 'rh_beneficios', 'rh_comunicados',
    'rh_onboarding', 'rh_trilhas_treinamento', 'rh_progresso_treinamento',
    'rh_ferias_afastamentos', 'rh_folha_pagamento', 'rh_ponto_registros',
    'rh_tarefas', 'rh_escalas', 'rh_escala_slots', 'rh_trocas_turno',
    'rh_banco_horas', 'rh_incidentes', 'rh_epis', 'rh_exames',
    'rh_documentos'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      -- Check if updated_at column exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'updated_at'
      ) THEN
        EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', tbl);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
      END IF;
    END IF;
  END LOOP;
  
  -- Also handle rh_custos_mensais and rh_ocorrencias_disciplinares
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rh_custos_mensais') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rh_custos_mensais' AND column_name = 'updated_at') THEN
      EXECUTE 'DROP TRIGGER IF EXISTS trg_set_updated_at ON rh_custos_mensais';
      EXECUTE 'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON rh_custos_mensais FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rh_ocorrencias_disciplinares') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rh_ocorrencias_disciplinares' AND column_name = 'updated_at') THEN
      EXECUTE 'DROP TRIGGER IF EXISTS trg_set_updated_at ON rh_ocorrencias_disciplinares';
      EXECUTE 'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON rh_ocorrencias_disciplinares FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
    END IF;
  END IF;
END $$;