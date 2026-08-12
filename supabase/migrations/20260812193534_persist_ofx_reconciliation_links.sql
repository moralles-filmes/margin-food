-- Persiste a identidade da linha bancária separadamente do lançamento.
-- Um vínculo próprio é necessário porque uma linha OFX pode conciliar um
-- lançamento já existente, um espelho de CP/CR ou uma transferência. Nesses
-- casos o idempotency_key do lançamento não representa necessariamente o FITID.

CREATE TABLE public.fin_conciliacao_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conta_id uuid NOT NULL REFERENCES public.fin_contas(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
  lancamento_id uuid NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT fin_conciliacao_vinculos_external_id_not_blank
    CHECK (length(btrim(external_id)) BETWEEN 1 AND 512),
  CONSTRAINT fin_conciliacao_vinculos_external_unique
    UNIQUE (company_id, conta_id, external_id, tipo)
);

CREATE INDEX idx_fin_conciliacao_vinculos_lancamento
  ON public.fin_conciliacao_vinculos (company_id, lancamento_id);

ALTER TABLE public.fin_conciliacao_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_conciliacao_vinculos FORCE ROW LEVEL SECURITY;

CREATE POLICY fin_conciliacao_vinculos_tenant_select
  ON public.fin_conciliacao_vinculos
  FOR SELECT
  TO authenticated
  USING (company_id = public.get_current_company_id());

REVOKE ALL ON TABLE public.fin_conciliacao_vinculos FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.fin_conciliacao_vinculos TO authenticated;
GRANT ALL ON TABLE public.fin_conciliacao_vinculos TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_bind_extrato(
  p_conta_id uuid,
  p_external_id text,
  p_tipo text,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_external_id text;
  v_existing_lancamento_id uuid;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION 'INVALID_TYPE';
  END IF;

  PERFORM 1
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta bancária'; END IF;

  PERFORM 1
  FROM public.fin_lancamentos l
  WHERE l.id = p_lancamento_id
    AND l.company_id = v_company
    AND (
      (l.tipo = 'TRANSFERENCIA' AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id))
      OR (l.tipo <> 'TRANSFERENCIA' AND l.conta_id = p_conta_id)
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento não pertence à conta'; END IF;

  SELECT v.lancamento_id INTO v_existing_lancamento_id
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_company
    AND v.conta_id = p_conta_id
    AND v.external_id = v_external_id
    AND v.tipo = p_tipo
  FOR UPDATE;

  IF v_existing_lancamento_id IS NOT NULL AND v_existing_lancamento_id <> p_lancamento_id THEN
    RAISE EXCEPTION 'EXTERNAL_ID_CONFLICT: linha bancária já vinculada a outro lançamento';
  END IF;

  INSERT INTO public.fin_conciliacao_vinculos (
    company_id, conta_id, external_id, tipo, lancamento_id, created_by
  ) VALUES (
    v_company, p_conta_id, v_external_id, p_tipo, p_lancamento_id, v_uid
  )
  ON CONFLICT (company_id, conta_id, external_id, tipo)
  DO UPDATE SET lancamento_id = EXCLUDED.lancamento_id;

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', p_lancamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) TO authenticated, service_role;

-- Resolve colunas e assinatura durante o db push, antes do primeiro uso real.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
  v_signature regprocedure;
BEGIN
  v_signature := 'public.reconcile_bind_extrato(uuid,text,text,uuid)'::regprocedure;
  IF v_signature IS NULL THEN RAISE EXCEPTION 'reconcile_bind_extrato signature not resolved'; END IF;

  PERFORM v.id, v.company_id, v.conta_id, v.external_id, v.tipo, v.lancamento_id
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_sentinel;
END $$;
