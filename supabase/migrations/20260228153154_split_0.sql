CREATE OR REPLACE FUNCTION public.validate_ponto_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last_tipo TEXT;
  v_colab_status TEXT;
BEGIN
  -- Check collaborator is active
  SELECT status INTO v_colab_status 
  FROM rh_colaboradores WHERE id = NEW.colaborador_id;
  
  IF v_colab_status IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;
  
  IF v_colab_status != 'ativo' THEN
    RAISE EXCEPTION 'Colaborador inativo não pode registrar ponto';
  END IF;

  -- Check for duplicate ENTRADA without SAIDA
  IF NEW.tipo = 'ENTRADA' THEN
    SELECT tipo INTO v_last_tipo
    FROM rh_ponto_registros
    WHERE colaborador_id = NEW.colaborador_id
      AND data = NEW.data
    ORDER BY hora DESC
    LIMIT 1;
    
    IF v_last_tipo = 'ENTRADA' OR v_last_tipo = 'FIM_INTERVALO' THEN
      RAISE EXCEPTION 'Já existe uma entrada sem saída para esta data. Registre a saída primeiro.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ponto_registro
  BEFORE INSERT ON public.rh_ponto_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ponto_registro();

-- 4) Prevent self-approval of ponto via RLS UPDATE restriction
-- Employees cannot update the 'aprovado' field on their own records