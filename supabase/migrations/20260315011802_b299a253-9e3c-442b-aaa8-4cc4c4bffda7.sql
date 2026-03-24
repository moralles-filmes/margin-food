
CREATE OR REPLACE FUNCTION public._guarded_upsert_lancamento(
  p_id uuid DEFAULT NULL,
  p_tipo text DEFAULT 'DESPESA',
  p_status text DEFAULT 'PREVISTO',
  p_valor numeric DEFAULT 0,
  p_conta_id uuid DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_data_competencia date DEFAULT CURRENT_DATE,
  p_data_vencimento date DEFAULT NULL,
  p_data_pagamento date DEFAULT NULL,
  p_descricao text DEFAULT '',
  p_observacoes text DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'pix',
  p_origem text DEFAULT 'manual',
  p_recorrente boolean DEFAULT false,
  p_recorrencia_config jsonb DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_updated_at timestamptz DEFAULT NULL,
  p_justificativa_edicao text DEFAULT NULL
)
RETURNS TABLE(id uuid, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _v_id uuid;
  _v_updated_at timestamptz;
  _existing record;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.assert_tenant();

  -- Permission check
  IF p_id IS NULL THEN
    IF NOT public.has_permission(_user_id, 'financeiro:lancamentos:create') THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:create';
    END IF;
  ELSE
    IF NOT public.has_permission(_user_id, 'financeiro:lancamentos:edit') THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:edit';
    END IF;

    -- Fetch existing for optimistic locking
    SELECT fl.* INTO _existing
    FROM public.fin_lancamentos fl
    WHERE fl.id = p_id AND fl.company_id = _company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lancamento not found';
    END IF;

    -- Block editing conciliados
    IF _existing.conciliado = true THEN
      RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';
    END IF;

    -- Optimistic locking
    IF p_updated_at IS NOT NULL AND _existing.updated_at != p_updated_at THEN
      RAISE EXCEPTION 'CONFLICT: Registro alterado por outro usuário';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    -- INSERT
    INSERT INTO public.fin_lancamentos (
      tipo, status, valor, conta_id, categoria_id, centro_custo_id,
      data_competencia, data_vencimento, data_pagamento,
      descricao, observacoes, forma_pagamento, origem,
      recorrente, recorrencia_config,
      created_by, company_id
    ) VALUES (
      p_tipo, p_status, p_valor, p_conta_id, p_categoria_id, p_centro_custo_id,
      p_data_competencia, p_data_vencimento, p_data_pagamento,
      p_descricao, p_observacoes, p_forma_pagamento, p_origem,
      p_recorrente, p_recorrencia_config,
      _user_id, _company_id
    )
    RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
    INTO _v_id, _v_updated_at;
  ELSE
    -- UPDATE
    UPDATE public.fin_lancamentos SET
      tipo = p_tipo,
      status = p_status,
      valor = p_valor,
      conta_id = p_conta_id,
      categoria_id = p_categoria_id,
      centro_custo_id = p_centro_custo_id,
      data_competencia = p_data_competencia,
      data_vencimento = p_data_vencimento,
      data_pagamento = p_data_pagamento,
      descricao = p_descricao,
      observacoes = p_observacoes,
      forma_pagamento = p_forma_pagamento,
      recorrente = p_recorrente,
      recorrencia_config = p_recorrencia_config,
      justificativa_edicao = p_justificativa_edicao,
      updated_at = now()
    WHERE fin_lancamentos.id = p_id AND company_id = _company_id
    RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
    INTO _v_id, _v_updated_at;
  END IF;

  -- Handle rateios atomically
  IF _v_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = _v_id;

    IF p_rateios IS NOT NULL AND jsonb_array_length(p_rateios) > 0 THEN
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT
        _v_id,
        (r->>'categoria_id')::uuid,
        NULLIF(r->>'centro_custo_id', '')::uuid,
        (r->>'valor')::numeric,
        (r->>'percentual')::numeric,
        NULLIF(r->>'observacao', ''),
        _company_id
      FROM jsonb_array_elements(p_rateios) AS r;
    END IF;
  END IF;

  RETURN QUERY SELECT _v_id, _v_updated_at;
END;
$$;
