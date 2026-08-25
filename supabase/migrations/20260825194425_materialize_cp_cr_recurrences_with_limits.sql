-- Materializa toda a série de Contas a Pagar/Receber no mesmo RPC de criação.
-- A quantidade informada inclui o lançamento atual e não pode ser infinita.

CREATE OR REPLACE FUNCTION public.fin_recorrencia_config_valida(p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_frequency text;
  v_count_text text;
  v_count integer;
  v_limit integer;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN false;
  END IF;

  v_frequency := lower(btrim(p_config->>'frequencia'));
  v_count_text := btrim(p_config->>'parcelas');

  v_limit := CASE v_frequency
    WHEN 'mensal' THEN 36
    WHEN 'semanal' THEN 144
    WHEN 'quinzenal' THEN 72
    ELSE NULL
  END;

  IF v_limit IS NULL
     OR v_count_text IS NULL
     OR v_count_text !~ '^[0-9]+$'
     OR length(v_count_text) > 3 THEN
    RETURN false;
  END IF;

  v_count := v_count_text::integer;
  RETURN v_count BETWEEN 2 AND v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_validate_recorrencia_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_frequency text;
  v_count_text text;
  v_count integer;
  v_limit integer;
BEGIN
  IF p_config IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'RECORRENCIA_CONFIG_INVALIDA: informe frequência e quantidade'
      USING ERRCODE = '22023';
  END IF;

  v_frequency := lower(btrim(p_config->>'frequencia'));
  v_limit := CASE v_frequency
    WHEN 'mensal' THEN 36
    WHEN 'semanal' THEN 144
    WHEN 'quinzenal' THEN 72
    ELSE NULL
  END;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'RECORRENCIA_FREQUENCIA_INVALIDA: use mensal, semanal ou quinzenal'
      USING ERRCODE = '22023';
  END IF;

  v_count_text := btrim(p_config->>'parcelas');
  IF v_count_text IS NULL
     OR v_count_text !~ '^[0-9]+$'
     OR length(v_count_text) > 3 THEN
    RAISE EXCEPTION 'RECORRENCIA_QUANTIDADE_INVALIDA: informe uma quantidade inteira'
      USING ERRCODE = '22023';
  END IF;

  v_count := v_count_text::integer;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'RECORRENCIA_QUANTIDADE_INVALIDA: informe pelo menos 2 lançamentos'
      USING ERRCODE = '22023';
  END IF;
  IF v_count > v_limit THEN
    RAISE EXCEPTION 'RECORRENCIA_LIMITE_EXCEDIDO: % permite no máximo % lançamentos',
      initcap(v_frequency), v_limit
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'frequencia', v_frequency,
    'parcelas', v_count,
    'parcelas_geradas', v_count,
    'materializada', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_recorrencia_config_valida(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_recorrencia_config_valida(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_validate_recorrencia_config(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_validate_recorrencia_config(jsonb) TO authenticated, service_role;

-- NOT VALID preserva as três recorrências legadas já salvas acima do novo limite,
-- mas impede qualquer INSERT/UPDATE novo fora da regra.
ALTER TABLE public.fin_contas_pagar
  ADD CONSTRAINT fin_contas_pagar_recorrencia_config_valida
  CHECK (NOT recorrente OR public.fin_recorrencia_config_valida(recorrencia_config))
  NOT VALID;

ALTER TABLE public.fin_contas_receber
  ADD CONSTRAINT fin_contas_receber_recorrencia_config_valida
  CHECK (NOT recorrente OR public.fin_recorrencia_config_valida(recorrencia_config))
  NOT VALID;

-- Uma edição comum do pai não pode zerar parcelas_geradas e reativar a geração
-- antiga durante a baixa. Mudanças de frequência/quantidade exigem nova série.
CREATE OR REPLACE FUNCTION public.fin_preserve_materialized_recurrence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.recorrente
     AND COALESCE((OLD.recorrencia_config->>'materializada')::boolean, false)
     AND NEW.recorrente THEN
    IF lower(NEW.recorrencia_config->>'frequencia') IS DISTINCT FROM lower(OLD.recorrencia_config->>'frequencia')
       OR (NEW.recorrencia_config->>'parcelas')::integer IS DISTINCT FROM (OLD.recorrencia_config->>'parcelas')::integer THEN
      RAISE EXCEPTION 'RECORRENCIA_SERIE_IMUTAVEL: desative esta recorrência e crie uma nova série'
        USING ERRCODE = '22023';
    END IF;
    NEW.recorrencia_config := OLD.recorrencia_config;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fin_cp_preserve_materialized_recurrence ON public.fin_contas_pagar;
CREATE TRIGGER trg_fin_cp_preserve_materialized_recurrence
BEFORE UPDATE OF recorrente, recorrencia_config ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.fin_preserve_materialized_recurrence();

DROP TRIGGER IF EXISTS trg_fin_cr_preserve_materialized_recurrence ON public.fin_contas_receber;
CREATE TRIGGER trg_fin_cr_preserve_materialized_recurrence
BEFORE UPDATE OF recorrente, recorrencia_config ON public.fin_contas_receber
FOR EACH ROW EXECUTE FUNCTION public.fin_preserve_materialized_recurrence();

CREATE OR REPLACE FUNCTION public._guarded_create_conta_pagar(
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT CURRENT_DATE,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'boleto'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_status text;
  v_threshold numeric;
  v_id uuid;
  v_child_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_forn text;
  v_obs text;
  v_rateios jsonb;
  v_recorrencia jsonb;
  v_frequency text;
  v_total integer := 1;
  v_index integer;
  v_due_date date;
  v_competence_date date;
  r record;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_permission(v_user_id, 'financeiro:pagar:create') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:create';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_forn := public.strip_html(p_fornecedor);
  v_obs := public.strip_html(p_observacoes);

  IF length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas
    WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia';
    v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);
  v_status := CASE WHEN p_valor > v_threshold THEN 'AGUARDANDO_APROVACAO' ELSE 'APROVADO' END;

  INSERT INTO public.fin_contas_pagar (
    descricao, valor, fornecedor, supplier_id,
    data_vencimento, data_competencia,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, observacoes, status,
    created_by, company_id, recorrente, recorrencia_config,
    parcela_atual, parcela_total
  ) VALUES (
    v_desc, p_valor, v_forn, p_supplier_id,
    p_data_vencimento, p_data_competencia,
    p_categoria_id, p_centro_custo_id, p_conta_id,
    p_forma_pagamento, v_obs, v_status,
    v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
    CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
    CASE WHEN v_recorrencia IS NOT NULL THEN v_total END
  )
  RETURNING id, created_at INTO v_id, v_created_at;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15)
      END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15)
      END;

      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')',
        p_valor, v_forn, p_supplier_id,
        v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, false, NULL,
        v_index, v_total, v_id
      ) RETURNING id INTO v_child_id;

      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id
      FROM public.fin_lancamento_rateios
      WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES (
    'contas_pagar', v_id, 'criar',
    jsonb_build_object(
      'descricao', v_desc,
      'valor', p_valor,
      'status', v_status,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', v_total
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', v_status,
    'created_at', v_created_at,
    'limite_aprovacao', v_threshold,
    'lancamentos_criados', v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_create_conta_receber(
  p_descricao text,
  p_cliente text DEFAULT NULL::text,
  p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT CURRENT_DATE,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'pix'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_supplier_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_id uuid;
  v_child_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_cliente text;
  v_obs text;
  v_rateios jsonb;
  v_recorrencia jsonb;
  v_frequency text;
  v_total integer := 1;
  v_index integer;
  v_due_date date;
  v_competence_date date;
  r record;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_permission(v_user_id, 'financeiro:receber:create') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:create';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_cliente := public.strip_html(p_cliente);
  v_obs := public.strip_html(p_observacoes);

  IF length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas
    WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia';
    v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;

  INSERT INTO public.fin_contas_receber (
    descricao, cliente, valor, data_vencimento, data_competencia,
    categoria_id, centro_custo_id, conta_id, supplier_id,
    forma_pagamento, observacoes, status,
    created_by, company_id, recorrente, recorrencia_config,
    parcela_atual, parcela_total
  ) VALUES (
    v_desc, v_cliente, p_valor, p_data_vencimento, p_data_competencia,
    p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
    p_forma_pagamento, v_obs, 'A_RECEBER',
    v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
    CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
    CASE WHEN v_recorrencia IS NOT NULL THEN v_total END
  )
  RETURNING id, created_at INTO v_id, v_created_at;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15)
      END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15)
      END;

      INSERT INTO public.fin_contas_receber (
        descricao, cliente, valor, data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id, supplier_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')',
        v_cliente, p_valor, v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
        p_forma_pagamento, v_obs, 'A_RECEBER',
        v_user_id, v_company_id, false, NULL,
        v_index, v_total, v_id
      ) RETURNING id INTO v_child_id;

      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id
      FROM public.fin_lancamento_rateios
      WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES (
    'contas_receber', v_id, 'criar',
    jsonb_build_object(
      'descricao', v_desc,
      'valor', p_valor,
      'cliente', v_cliente,
      'lancamentos_criados', v_total
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'created_at', v_created_at,
    'lancamentos_criados', v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_create_conta_pagar(
  text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_conta_pagar(
  text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._guarded_create_conta_receber(
  text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_conta_receber(
  text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid
) TO authenticated, service_role;

-- Força resolução de assinaturas e colunas no deploy (PL/pgSQL é lazy).
DO $validation$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF to_regprocedure('public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public._guarded_create_conta_receber(text,text,numeric,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Assinaturas das RPCs de recorrência não foram resolvidas';
  END IF;

  PERFORM cp.id, cp.company_id, cp.recorrente, cp.recorrencia_config,
    cp.parcela_atual, cp.parcela_total, cp.lancamento_pai_id
  FROM public.fin_contas_pagar cp
  WHERE cp.id = v_sentinel;

  PERFORM cr.id, cr.company_id, cr.recorrente, cr.recorrencia_config,
    cr.parcela_atual, cr.parcela_total, cr.lancamento_pai_id
  FROM public.fin_contas_receber cr
  WHERE cr.id = v_sentinel;

  IF public.fin_validate_recorrencia_config('{"frequencia":"mensal","parcelas":36}'::jsonb)
       ->> 'parcelas_geradas' <> '36' THEN
    RAISE EXCEPTION 'Normalização da recorrência mensal falhou';
  END IF;
END;
$validation$;
