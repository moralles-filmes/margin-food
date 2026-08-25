-- Permite corrigir somente a classificacao contabil de um lancamento ja
-- conciliado sem romper o vinculo com a linha do extrato. Valor, datas, conta,
-- tipo, status e descricao bancaria nao fazem parte da assinatura e, portanto,
-- permanecem imutaveis por esta operacao.

CREATE OR REPLACE FUNCTION public._guarded_update_reconciled_classification(
  p_id uuid,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_justificativa_edicao text DEFAULT NULL
)
RETURNS TABLE(id uuid, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_lanc public.fin_lancamentos%ROWTYPE;
  v_rateios jsonb;
  v_rateio_count integer;
  v_rateio_sum numeric;
  v_invalid_count integer;
  v_header_categoria_id uuid;
  v_header_centro_custo_id uuid;
  v_updated_at timestamptz;
  v_antes jsonb;
  v_depois jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario nao autenticado';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:lancamentos:edit',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:edit necessario';
  END IF;

  SELECT l.*
  INTO v_lanc
  FROM public.fin_lancamentos l
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lancamento nao encontrado';
  END IF;

  IF v_lanc.conciliado IS NOT TRUE THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lancamento nao esta conciliado';
  END IF;

  IF v_lanc.tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: transferencia nao possui classificacao contabil';
  END IF;

  IF v_lanc.origem IN ('espelho_cp', 'espelho_cr') THEN
    RAISE EXCEPTION 'ORIGEM_INVALIDA: edite a conta a pagar/receber de origem';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_lanc.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  IF NULLIF(btrim(p_justificativa_edicao), '') IS NULL THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  IF p_rateios IS NULL OR jsonb_typeof(p_rateios) <> 'array' THEN
    RAISE EXCEPTION 'RATEIO_INVALIDO: rateios deve ser um array';
  END IF;

  v_rateios := p_rateios;
  v_rateio_count := jsonb_array_length(v_rateios);

  IF v_rateio_count = 0 THEN
    IF p_categoria_id IS NULL THEN
      RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA';
    END IF;

    PERFORM 1
    FROM public.fin_categorias c
    WHERE c.id = p_categoria_id
      AND c.company_id = v_company_id
      AND c.ativo = true
      AND c.tipo = lower(v_lanc.tipo);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATEGORIA_INVALIDA: categoria inativa, de outro tipo ou empresa';
    END IF;

    IF p_centro_custo_id IS NOT NULL THEN
      PERFORM 1
      FROM public.fin_centros_custo cc
      WHERE cc.id = p_centro_custo_id
        AND cc.company_id = v_company_id
        AND cc.ativo = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'CENTRO_CUSTO_INVALIDO';
      END IF;
    END IF;

    v_header_categoria_id := p_categoria_id;
    v_header_centro_custo_id := p_centro_custo_id;
  ELSE
    SELECT
      count(*) FILTER (
        WHERE r.categoria_id IS NULL
           OR r.valor IS NULL
           OR r.valor <= 0
           OR c.id IS NULL
           OR (r.centro_custo_id IS NOT NULL AND cc.id IS NULL)
      ),
      COALESCE(sum(r.valor), 0)
    INTO v_invalid_count, v_rateio_sum
    FROM jsonb_to_recordset(v_rateios) AS r(
      categoria_id uuid,
      centro_custo_id uuid,
      valor numeric,
      percentual numeric,
      observacao text
    )
    LEFT JOIN public.fin_categorias c
      ON c.id = r.categoria_id
     AND c.company_id = v_company_id
     AND c.ativo = true
     AND c.tipo = lower(v_lanc.tipo)
    LEFT JOIN public.fin_centros_custo cc
      ON cc.id = r.centro_custo_id
     AND cc.company_id = v_company_id
     AND cc.ativo = true;

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'RATEIO_INVALIDO: categoria, centro de custo ou valor invalido';
    END IF;

    IF abs(v_rateio_sum - v_lanc.valor) >= 0.01 THEN
      RAISE EXCEPTION 'RATEIO_INCOMPLETO: total (%) difere do lancamento (%)',
        v_rateio_sum, v_lanc.valor;
    END IF;

    IF v_rateio_count = 1 THEN
      SELECT r.categoria_id, r.centro_custo_id
      INTO v_header_categoria_id, v_header_centro_custo_id
      FROM jsonb_to_record(v_rateios->0) AS r(
        categoria_id uuid,
        centro_custo_id uuid
      );
    ELSE
      v_header_categoria_id := NULL;
      v_header_centro_custo_id := NULL;
    END IF;
  END IF;

  v_antes := jsonb_build_object(
    'categoria_id', v_lanc.categoria_id,
    'centro_custo_id', v_lanc.centro_custo_id,
    'observacoes', v_lanc.observacoes,
    'rateios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'categoria_id', r.categoria_id,
        'centro_custo_id', r.centro_custo_id,
        'valor', r.valor,
        'percentual', r.percentual,
        'observacao', r.observacao
      ) ORDER BY r.created_at, r.id)
      FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = p_id
        AND r.company_id = v_company_id
    ), '[]'::jsonb)
  );

  UPDATE public.fin_lancamentos l
  SET categoria_id = v_header_categoria_id,
      centro_custo_id = v_header_centro_custo_id,
      observacoes = public.strip_html(p_observacoes),
      justificativa_edicao = btrim(p_justificativa_edicao),
      updated_at = now()
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  RETURNING l.updated_at INTO v_updated_at;

  DELETE FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = p_id
    AND r.company_id = v_company_id;

  IF v_rateio_count > 0 THEN
    INSERT INTO public.fin_lancamento_rateios (
      lancamento_id,
      categoria_id,
      centro_custo_id,
      valor,
      percentual,
      observacao,
      company_id
    )
    SELECT
      p_id,
      r.categoria_id,
      r.centro_custo_id,
      r.valor,
      round((r.valor / v_lanc.valor) * 100, 4),
      public.strip_html(r.observacao),
      v_company_id
    FROM jsonb_to_recordset(v_rateios) AS r(
      categoria_id uuid,
      centro_custo_id uuid,
      valor numeric,
      percentual numeric,
      observacao text
    );
  END IF;

  v_depois := jsonb_build_object(
    'categoria_id', v_header_categoria_id,
    'centro_custo_id', v_header_centro_custo_id,
    'observacoes', public.strip_html(p_observacoes),
    'rateios', v_rateios,
    'conciliado_preservado', true,
    'justificativa', btrim(p_justificativa_edicao)
  );

  INSERT INTO public.fin_audit_logs (
    entidade,
    entidade_id,
    acao,
    user_id,
    company_id,
    antes,
    depois
  ) VALUES (
    'lancamentos',
    p_id,
    'editar_classificacao_conciliado',
    v_user_id,
    v_company_id,
    v_antes,
    v_depois
  );

  RETURN QUERY SELECT p_id, v_updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_update_reconciled_classification(
  uuid, uuid, uuid, text, jsonb, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_reconciled_classification(
  uuid, uuid, uuid, text, jsonb, timestamptz, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public._guarded_update_reconciled_classification(
  uuid, uuid, uuid, text, jsonb, timestamptz, text
) IS 'Atualiza somente categoria, centro de custo, rateios e observacoes de lancamento conciliado, preservando sua identidade e vinculos bancarios.';

-- Forca a resolucao da assinatura e das colunas referenciadas durante a migration.
DO $validation$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
  v_signature regprocedure;
BEGIN
  v_signature := 'public._guarded_update_reconciled_classification(uuid,uuid,uuid,text,jsonb,timestamptz,text)'::regprocedure;
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Assinatura de _guarded_update_reconciled_classification nao resolvida';
  END IF;

  PERFORM l.id, l.company_id, l.tipo, l.valor, l.categoria_id,
    l.centro_custo_id, l.observacoes, l.conciliado, l.origem, l.updated_at
  FROM public.fin_lancamentos l
  WHERE l.id = v_sentinel;

  PERFORM r.lancamento_id, r.categoria_id, r.centro_custo_id, r.valor,
    r.percentual, r.observacao, r.company_id
  FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = v_sentinel;
END;
$validation$;
