-- O realizado do comparativo de plano já é por caixa desde 20261002142926; aqui só o
-- rótulo do contrato acompanha. Ficou para depois do deploy porque o frontend anterior
-- rejeitava qualquer `rules.regime` diferente de 'competencia' (usePresentationPlan.ts).
-- Patch no corpo vivo: o trecho precisa existir exatamente uma vez.
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.get_fin_presentation_plan(date,date,text,text,text,uuid,integer,integer)'::regprocedure);
  v_needle constant text := E'      ''regime'', ''competencia'',';
  v_count integer;
BEGIN
  v_count := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_fin_presentation_plan: rótulo de regime encontrado % vez(es), esperado 1', v_count;
  END IF;
  EXECUTE replace(v_def, v_needle, E'      ''regime'', ''caixa'',');
END;
$patch$;
