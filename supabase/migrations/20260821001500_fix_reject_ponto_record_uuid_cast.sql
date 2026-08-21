-- Bug: reject_ponto_record gravava o audit com `p_id::text` em
-- rh_audit_log.entidade_id, que é uuid — cast explícito para text bloqueia o
-- assignment cast do Postgres (42804) e derruba a transação inteira do reject.
-- Mesmo padrão já documentado no CLAUDE.md para fin_audit_logs. A migration
-- 20260820224500 criou as colunas de status que faltavam, mas o reject ainda
-- quebrava neste INSERT. Correção: uuid nativo, sem cast.

CREATE OR REPLACE FUNCTION public.reject_ponto_record(p_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record rh_ponto_registros%ROWTYPE;
  v_caller uuid;
  v_company uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION '401: Não autenticado';
  END IF;

  -- Tenant resolution
  SELECT company_id INTO v_company FROM profiles WHERE id = v_caller;
  IF v_company IS NULL OR v_company = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '403: Tenant não resolvido';
  END IF;

  -- Permission check
  IF NOT has_permission(v_caller, 'rh:ponto:manage') THEN
    RAISE EXCEPTION '403: Sem permissão rh:ponto:manage';
  END IF;

  -- Lock the record
  SELECT * INTO v_record
  FROM rh_ponto_registros
  WHERE id = p_id AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Registro não encontrado';
  END IF;

  -- Idempotency: already rejected
  IF v_record.status = 'REJEITADO' THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Já rejeitado');
  END IF;

  -- Reject
  UPDATE rh_ponto_registros SET
    status = 'REJEITADO',
    rejeitado_por = v_caller,
    rejeitado_em = now(),
    motivo_rejeicao = COALESCE(NULLIF(p_reason, ''), 'Rejeitado pelo gestor'),
    updated_at = now()
  WHERE id = p_id;

  -- Audit (entidade_id é uuid — nunca ::text)
  INSERT INTO rh_audit_log (acao, entidade, entidade_id, company_id, user_id, antes, depois)
  VALUES (
    'rejeitar_ponto',
    'rh_ponto_registros',
    p_id,
    v_company,
    v_caller,
    jsonb_build_object('status', v_record.status, 'aprovado', v_record.aprovado),
    jsonb_build_object('status', 'REJEITADO', 'motivo', p_reason)
  );

  RETURN jsonb_build_object('status', 'ok', 'message', 'Ponto rejeitado');
END;
$$;
