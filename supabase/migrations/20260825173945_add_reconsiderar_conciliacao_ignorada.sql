-- Permite devolver uma entrada ignorada para a fila de análise da conciliação.
-- A remoção é feita pelo id da marcação (e não por conteúdo) para preservar
-- ocorrências legítimas idênticas no mesmo extrato.
CREATE OR REPLACE FUNCTION public.reconcile_reconsiderar_ignorada(
  p_ignorada_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_deleted_id uuid;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  DELETE FROM public.fin_conciliacao_ignoradas
  WHERE id = p_ignorada_id
    AND company_id = v_company_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'id', v_deleted_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_reconsiderar_ignorada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_reconsiderar_ignorada(uuid) TO authenticated;

-- PL/pgSQL só valida referências internas na primeira execução; ao menos força
-- a resolução da assinatura durante a aplicação da migration.
DO $$
BEGIN
  IF to_regprocedure('public.reconcile_reconsiderar_ignorada(uuid)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_reconsiderar_ignorada: assinatura esperada não encontrada após CREATE';
  END IF;
END $$;
