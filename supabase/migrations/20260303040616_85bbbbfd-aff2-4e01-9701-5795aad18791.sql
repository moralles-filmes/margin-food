
-- H1: FORCE RLS ON em todas as tabelas CMV-core
ALTER TABLE public.cmv_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE public.metas_cmv FORCE ROW LEVEL SECURITY;
ALTER TABLE public.canais_venda FORCE ROW LEVEL SECURITY;
ALTER TABLE public.config_precificacao FORCE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_periodos_legacy FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_componentes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_componente_itens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cenarios_simulacao FORCE ROW LEVEL SECURITY;

-- W1: Add updated_at trigger to metas_cmv
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_metas_cmv'
  ) THEN
    CREATE TRIGGER trg_set_updated_at_metas_cmv
      BEFORE UPDATE ON public.metas_cmv
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_set_updated_at();
  END IF;
END $$;
