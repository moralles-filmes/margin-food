
-- 1) Create trigger function to block ponto during approved vacation/leave
CREATE OR REPLACE FUNCTION public.validate_ponto_ferias()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rh_ferias_afastamentos
    WHERE colaborador_id = NEW.colaborador_id
      AND status = 'APROVADO'
      AND NEW.data >= data_inicio
      AND NEW.data <= data_fim
  ) THEN
    RAISE EXCEPTION 'Colaborador está em férias/afastamento neste período. Não é possível registrar ponto.';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Create trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_validate_ponto_ferias ON rh_ponto_registros;
CREATE TRIGGER trg_validate_ponto_ferias
  BEFORE INSERT OR UPDATE ON rh_ponto_registros
  FOR EACH ROW
  EXECUTE FUNCTION validate_ponto_ferias();
