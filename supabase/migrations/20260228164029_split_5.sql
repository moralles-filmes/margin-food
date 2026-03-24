CREATE OR REPLACE FUNCTION public.aprovar_ferias(p_registro_id uuid, p_aprovado_por uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_registro RECORD;
  v_saldo RECORD;
  v_new_gozados int;
  v_new_restantes int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'rh:manage') AND NOT public.has_permission(auth.uid(), 'rh:admin') THEN
    RAISE EXCEPTION 'Sem permissão para aprovar férias.';
  END IF;

  SELECT * INTO v_registro FROM rh_ferias_afastamentos WHERE id = p_registro_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF v_registro.status != 'SOLICITADO' THEN RAISE EXCEPTION 'Solicitação já processada (status: %)', v_registro.status; END IF;

  IF v_registro.tipo = 'ferias' THEN
    SELECT * INTO v_saldo FROM rh_ferias_saldo WHERE colaborador_id = v_registro.colaborador_id FOR UPDATE;
    IF FOUND AND v_saldo.dias_restantes < v_registro.dias_uteis THEN
      RAISE EXCEPTION 'Saldo insuficiente! Disponível: % dias. Solicitado: % dias.', v_saldo.dias_restantes, v_registro.dias_uteis;
    END IF;
  END IF;

  UPDATE rh_ferias_afastamentos SET status = 'APROVADO', aprovado_por = p_aprovado_por, aprovado_em = now(), updated_at = now() WHERE id = p_registro_id;

  IF v_registro.tipo = 'ferias' AND v_saldo.id IS NOT NULL THEN
    v_new_gozados := v_saldo.dias_gozados + v_registro.dias_uteis;
    v_new_restantes := GREATEST(0, v_saldo.dias_direito - v_new_gozados - v_saldo.dias_vendidos);
    UPDATE rh_ferias_saldo SET dias_gozados = v_new_gozados, dias_restantes = v_new_restantes, updated_at = now() WHERE id = v_saldo.id;
  END IF;

  PERFORM public.log_audit('rpc', 'rh', 'rh_ferias_afastamentos', p_registro_id, 'FERIAS_APPROVE',
    jsonb_build_object('status_anterior', 'SOLICITADO', 'colaborador_id', v_registro.colaborador_id),
    jsonb_build_object('status', 'APROVADO', 'aprovado_por', p_aprovado_por));
END;
$$;

-- Update mirror_salmon_to_stock to log