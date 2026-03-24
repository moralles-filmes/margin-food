CREATE OR REPLACE FUNCTION public.validate_ponto_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab_user_id UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Get the user_id of the collaborator who owns this ponto
  SELECT user_id INTO v_colab_user_id
  FROM rh_colaboradores
  WHERE id = NEW.colaborador_id;
  
  -- If caller is the owner and trying to set aprovado=true, block it
  IF v_caller_id = v_colab_user_id AND NEW.aprovado = true AND (OLD.aprovado IS NULL OR OLD.aprovado = false) THEN
    RAISE EXCEPTION 'Não é permitido aprovar o próprio ponto';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ponto_update
  BEFORE UPDATE ON public.rh_ponto_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ponto_update();