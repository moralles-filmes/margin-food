CREATE OR REPLACE FUNCTION public.update_transfer(
  p_lancamento_id uuid, p_valor numeric, p_data_competencia date,
  p_descricao text, p_conta_origem_id uuid, p_conta_destino_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_pai_id uuid;
  v_filho_id uuid;
  v_nome_origem text;
  v_nome_destino text;
  v_before jsonb;
BEGIN
  IF NOT has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para executar esta operação.';
  END IF;

  SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = p_lancamento_id AND tipo = 'TRANSFERENCIA' LIMIT 1;

  IF v_filho_id IS NOT NULL THEN
    v_pai_id := p_lancamento_id;
  ELSE
    SELECT lancamento_pai_id INTO v_pai_id FROM fin_lancamentos WHERE id = p_lancamento_id AND tipo = 'TRANSFERENCIA' AND lancamento_pai_id IS NOT NULL;
    IF v_pai_id IS NULL THEN
      RAISE EXCEPTION 'Lançamento não é uma transferência válida';
    END IF;
    SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = v_pai_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  END IF;

  -- Capture before state
  SELECT jsonb_build_object('valor', valor, 'data', data_competencia, 'conta_id', conta_id, 'conta_destino_id', conta_destino_id)
    INTO v_before FROM fin_lancamentos WHERE id = v_pai_id;

  SELECT nome INTO v_nome_origem FROM fin_contas WHERE id = p_conta_origem_id;
  SELECT nome INTO v_nome_destino FROM fin_contas WHERE id = p_conta_destino_id;

  UPDATE fin_lancamentos SET
    valor = p_valor, data_competencia = p_data_competencia, data_pagamento = p_data_competencia,
    descricao = 'Transferência para ' || COALESCE(v_nome_destino, ''),
    conta_id = p_conta_origem_id, conta_destino_id = p_conta_destino_id, updated_at = now()
  WHERE id = v_pai_id;

  UPDATE fin_lancamentos SET
    valor = p_valor, data_competencia = p_data_competencia, data_pagamento = p_data_competencia,
    descricao = 'Transferência de ' || COALESCE(v_nome_origem, ''),
    conta_id = p_conta_destino_id, conta_destino_id = p_conta_origem_id, updated_at = now()
  WHERE id = v_filho_id;

  -- AUDIT LOG
  INSERT INTO audit_logs (
    actor_user_id, source, module, entity, entity_id, action,
    before, after, metadata, success
  ) VALUES (
    auth.uid(), 'rpc', 'finance', 'transfer', v_pai_id,
    'update',
    v_before,
    jsonb_build_object('valor', p_valor, 'data', p_data_competencia,
      'conta_origem_id', p_conta_origem_id, 'conta_destino_id', p_conta_destino_id),
    jsonb_build_object('pai_id', v_pai_id, 'filho_id', v_filho_id),
    true
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO audit_logs (
    actor_user_id, source, module, entity, entity_id, action, metadata, success
  ) VALUES (
    auth.uid(), 'rpc', 'finance', 'transfer', p_lancamento_id,
    'update',
    jsonb_build_object('error', SQLERRM),
    false
  );
  RAISE;
END;
$function$;

-- ================ 2) PROFILES HARDENING ================

-- Drop permissive policy
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;

-- Own profile read
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admin/system can read all
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'system:admin'));

-- RPC for listing minimal profiles (for selects, mentions, etc.)