-- Fix: RPCs de delete financeiro com bug p_id::text em fin_audit_logs (entidade_id uuid)
-- Causa: cast explícito ::text bloqueia assignment cast do Postgres → erro 42804
-- Também: adiciona optimistic lock em _guarded_delete_conta_pagar/receber,
--         valida FK em fin_lancamentos, e cria _guarded_delete_lancamento.
-- Referência: migration 20260331160100 corrigiu updates mas esqueceu os deletes.

-- Dropar overloads antigos (assinatura apenas p_id uuid) que tinham o bug p_id::text
DROP FUNCTION IF EXISTS public._guarded_delete_conta_pagar(uuid);
DROP FUNCTION IF EXISTS public._guarded_delete_conta_receber(uuid);
DROP FUNCTION IF EXISTS public._guarded_delete_lancamento(uuid);

-- 1. _guarded_delete_conta_pagar
CREATE OR REPLACE FUNCTION public._guarded_delete_conta_pagar(
  p_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_status     text;
  v_updated_at timestamptz;
  v_old_data   jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_permission('financeiro:pagar:delete') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:pagar:delete';
  END IF;

  SELECT status, updated_at, jsonb_build_object('descricao', descricao, 'valor', valor)
  INTO v_status, v_updated_at, v_old_data
  FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  -- Defensivo: não deve existir lançamento ativo vinculado a conta não-PAGO, mas bloqueia se houver
  IF EXISTS (
    SELECT 1 FROM fin_lancamentos
    WHERE referencia_modulo = 'contas_pagar'
      AND referencia_id = p_id::text
      AND status != 'CANCELADO'
      AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_VINCULADO';
  END IF;

  DELETE FROM fin_contas_pagar WHERE id = p_id AND company_id = v_company_id;

  -- Fix: p_id (uuid) sem ::text — entidade_id é uuid
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_delete_conta_pagar(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_delete_conta_pagar(uuid, timestamptz) TO authenticated;


-- 2. _guarded_delete_conta_receber
CREATE OR REPLACE FUNCTION public._guarded_delete_conta_receber(
  p_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_status     text;
  v_updated_at timestamptz;
  v_old_data   jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_permission('financeiro:receber:delete') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:receber:delete';
  END IF;

  SELECT status, updated_at, jsonb_build_object('descricao', descricao, 'valor', valor)
  INTO v_status, v_updated_at, v_old_data
  FROM fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_status IN ('RECEBIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM fin_lancamentos
    WHERE referencia_modulo = 'contas_receber'
      AND referencia_id = p_id::text
      AND status != 'CANCELADO'
      AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_VINCULADO';
  END IF;

  DELETE FROM fin_contas_receber WHERE id = p_id AND company_id = v_company_id;

  -- Fix: p_id (uuid) sem ::text
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_receber', p_id, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_delete_conta_receber(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_delete_conta_receber(uuid, timestamptz) TO authenticated;


-- 3. _guarded_delete_orcamento: só remove ::text no audit log (lock já existia)
CREATE OR REPLACE FUNCTION public._guarded_delete_orcamento(
  p_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_deleted    int;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:delete',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM fin_orcamentos
  WHERE id = p_id
    AND company_id = v_company_id
    AND updated_at = p_expected_updated_at;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  -- Fix: p_id (uuid) sem ::text
  INSERT INTO fin_audit_logs (acao, entidade, entidade_id, user_id, company_id)
  VALUES ('DELETE', 'fin_orcamentos', p_id, auth.uid(), v_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_delete_orcamento(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_delete_orcamento(uuid, timestamptz) TO authenticated;


-- 4. Nova RPC: _guarded_delete_lancamento (substitui DELETE direto em LivroRazaoSection)
CREATE OR REPLACE FUNCTION public._guarded_delete_lancamento(
  p_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_tipo       text;
  v_updated_at timestamptz;
  v_old_data   jsonb;
  v_deleted    int;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_permission('financeiro:lancamentos:delete') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:delete';
  END IF;

  SELECT tipo, updated_at, jsonb_build_object('descricao', descricao, 'valor', valor, 'tipo', tipo)
  INTO v_tipo, v_updated_at, v_old_data
  FROM fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Transferências têm fluxo dedicado (delete_transfer); bloquear aqui
  IF v_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'Use a ação "Excluir Transferência" para este lançamento.';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  -- Remover rateios vinculados
  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;

  DELETE FROM fin_lancamentos WHERE id = p_id AND company_id = v_company_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('lancamentos', p_id, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_delete_lancamento(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_delete_lancamento(uuid, timestamptz) TO authenticated;

-- DO-block de validação de schema (força resolução de colunas no deploy)
DO $$
DECLARE
  _cnt int;
BEGIN
  SELECT COUNT(*) INTO _cnt
  FROM fin_audit_logs
  WHERE entidade_id = '00000000-0000-0000-0000-000000000001'::uuid
  LIMIT 0;
END;
$$;
