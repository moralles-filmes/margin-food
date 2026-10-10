-- Financeiro: editar uma parcela de série e aplicar a alteração às próximas.
--
-- Aditiva: três funções internas e duas RPCs novas, com a MESMA assinatura de
-- `_guarded_update_conta_pagar`/`_guarded_update_conta_receber` (o cliente só
-- troca o nome da RPC). Nenhuma função existente muda.
--
-- Série = títulos gerados juntos por "Repetir lançamento": nascem na mesma
-- transação (mesmo `created_at`, mesmo autor, mesmo `parcela_total`). O pai
-- (`lancamento_pai_id`) não basta: excluir a 1ª parcela zera o vínculo das
-- demais. Ao contrário de `_fin_cmv_serie`, o fornecedor NÃO entra na chave:
-- esta edição pode trocá-lo nas próximas, e a parcela continua na série.
--
-- Regras da edição em série:
-- * a parcela editada e cada próxima passam por `_guarded_update_conta_*`
--   (permissão, lock otimista, rateio, CMV, status de aprovação e log `editar`);
-- * só os campos alterados nesta edição vão para as próximas; o que não mudou
--   fica como está em cada parcela (ajuste individual não é desfeito);
-- * parcelas pagas/recebidas ou canceladas não mudam;
-- * datas acompanham a nova data, passo a passo da frequência da série;
-- * classificação (categoria, centro, rateio, CMV) vai inteira quando muda, com
--   o rateio escalado para o valor de cada parcela;
-- * o código de pagamento de cada boleto nunca é copiado;
-- * o log `editar_serie` guarda o retrato de cada parcela antes da edição
--   (sem o código de pagamento), para conferir ou desfazer um lote errado.
--
-- Reversão (só funções novas; edições já feitas e logs ficam):
--   DROP FUNCTION public._guarded_update_conta_pagar_serie(uuid, text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, jsonb, jsonb);
--   DROP FUNCTION public._guarded_update_conta_receber_serie(uuid, text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, timestamptz);
--   DROP FUNCTION public._fin_serie_retrato(uuid, jsonb);
--   DROP FUNCTION public._fin_serie_rateios(uuid, uuid, uuid, numeric);
--   DROP FUNCTION public._fin_serie_classificacao(uuid, uuid, uuid, uuid, boolean, numeric);
--   DROP FUNCTION public._fin_serie_data(date, integer, text, date, integer);

-- Data da parcela que está `p_passos` depois da editada.
CREATE OR REPLACE FUNCTION public._fin_serie_data(
  p_nova date,
  p_passos integer,
  p_frequencia text,
  p_atual date,
  p_delta integer
)
RETURNS date
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_nova IS NULL THEN NULL
    -- Igual à criação da série: o mês curto cai no último dia.
    WHEN p_frequencia = 'mensal' THEN (p_nova + make_interval(months => p_passos))::date
    WHEN p_frequencia = 'semanal' THEN p_nova + p_passos * 7
    WHEN p_frequencia = 'quinzenal' THEN p_nova + p_passos * 15
    -- Frequência desconhecida: desloca a data da própria parcela pelos mesmos dias
    -- (sem a data anterior da editada não há deslocamento: a parcela fica como está).
    ELSE COALESCE(p_atual + p_delta, p_atual)
  END;
$$;

-- Retrato da classificação de um título, para saber se a edição a mudou.
-- O rateio entra por proporção: mudar só o valor do título não é reclassificar.
CREATE OR REPLACE FUNCTION public._fin_serie_classificacao(
  p_company_id uuid,
  p_titulo_id uuid,
  p_categoria_id uuid,
  p_centro_custo_id uuid,
  p_cmv_incluir boolean,
  p_valor numeric
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'categoria_id', p_categoria_id,
    'centro_custo_id', p_centro_custo_id,
    'cmv_incluir', p_cmv_incluir,
    'rateios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'categoria_id', r.categoria_id,
          'centro_custo_id', r.centro_custo_id,
          'cmv_incluir', r.cmv_incluir,
          'proporcao', CASE WHEN p_valor > 0 THEN round(r.valor / p_valor, 4) END
        ) ORDER BY r.categoria_id, r.centro_custo_id, r.valor, r.id)
      FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = p_titulo_id AND r.company_id = p_company_id
    ), '[]'::jsonb)
  );
$$;

-- Linhas de rateio do título de origem, escaladas para `p_valor`, no formato de
-- `p_rateios`. A linha do destino com a mesma categoria mantém o id (a decisão do
-- CMV é por linha e o servidor preserva o identificador).
CREATE OR REPLACE FUNCTION public._fin_serie_rateios(
  p_company_id uuid,
  p_origem_id uuid,
  p_destino_id uuid,
  p_valor numeric
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_total numeric;
  v_n integer;
  v_i integer := 0;
  v_acumulado numeric := 0;
  v_valor numeric;
  v_id uuid;
  v_usados uuid[] := ARRAY[]::uuid[];
  v_saida jsonb := '[]'::jsonb;
  r record;
BEGIN
  SELECT COALESCE(sum(valor), 0), count(*) INTO v_total, v_n
  FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_origem_id AND company_id = p_company_id;

  IF v_n = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR r IN
    SELECT categoria_id, centro_custo_id, valor, percentual, cmv_incluir
    FROM public.fin_lancamento_rateios
    WHERE lancamento_id = p_origem_id AND company_id = p_company_id
    ORDER BY created_at, id
  LOOP
    v_i := v_i + 1;
    -- A última linha fica com a diferença de centavos: o rateio sempre fecha.
    v_valor := CASE
      WHEN round(v_total, 2) = round(p_valor, 2) THEN r.valor
      WHEN v_i = v_n THEN round(p_valor, 2) - v_acumulado
      WHEN v_total = 0 THEN 0
      ELSE round(r.valor * p_valor / v_total, 2)
    END;
    v_acumulado := v_acumulado + v_valor;

    SELECT d.id INTO v_id
    FROM public.fin_lancamento_rateios d
    WHERE d.lancamento_id = p_destino_id
      AND d.company_id = p_company_id
      AND d.categoria_id IS NOT DISTINCT FROM r.categoria_id
      AND NOT (d.id = ANY(v_usados))
    ORDER BY d.created_at, d.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      v_usados := v_usados || v_id;
    END IF;

    v_saida := v_saida || jsonb_build_object(
      'id', v_id,
      'categoria_id', r.categoria_id,
      'centro_custo_id', r.centro_custo_id,
      'valor', v_valor,
      'percentual', r.percentual,
      'cmv_incluir', r.cmv_incluir
    );
  END LOOP;

  RETURN v_saida;
END;
$$;

-- Retrato de um título antes da edição em série, para o log `editar_serie`.
-- O código de pagamento fica de fora (o log da edição avulsa também só diz se havia).
CREATE OR REPLACE FUNCTION public._fin_serie_retrato(p_company_id uuid, p_titulo jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT (p_titulo - ARRAY['codigo_pagamento', 'codigo_pagamento_unaccent', 'descricao_unaccent', 'fornecedor_unaccent'])
    || jsonb_build_object(
      'possui_codigo_pagamento', (p_titulo->>'codigo_pagamento') IS NOT NULL,
      'rateios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'categoria_id', r.categoria_id, 'centro_custo_id', r.centro_custo_id,
            'valor', r.valor, 'percentual', r.percentual, 'cmv_incluir', r.cmv_incluir
          ) ORDER BY r.created_at, r.id)
        FROM public.fin_lancamento_rateios r
        WHERE r.lancamento_id = (p_titulo->>'id')::uuid AND r.company_id = p_company_id
      ), '[]'::jsonb)
    );
$$;

CREATE OR REPLACE FUNCTION public._guarded_update_conta_pagar_serie(
  p_id uuid,
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_data_vencimento date DEFAULT NULL,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_dados_pagamento jsonb DEFAULT NULL,
  p_cmv jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_ref public.fin_contas_pagar%ROWTYPE;
  v_pos public.fin_contas_pagar%ROWTYPE;
  v_parcela public.fin_contas_pagar%ROWTYPE;
  v_seguintes uuid[];
  v_resultado jsonb;
  v_desc text;
  v_sufixo text;
  v_base text;
  v_frequencia text;
  v_passos integer;
  v_valor numeric;
  v_classif_antes jsonb;
  v_mudou_desc boolean;
  v_mudou_valor boolean;
  v_mudou_fornecedor boolean;
  v_mudou_vencimento boolean;
  v_mudou_competencia boolean;
  v_mudou_conta boolean;
  v_mudou_forma boolean;
  v_mudou_obs boolean;
  v_mudou_classif boolean;
  v_campos text[];
  v_ids uuid[] := ARRAY[]::uuid[];
  v_ignoradas integer := 0;
  v_antes jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Gate no padrão do projeto; o efetivo é o da edição avulsa chamada abaixo
  -- (has_permission('financeiro:pagar:edit'), sem chave legada nem super admin).
  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:pagar:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:edit';
  END IF;

  SELECT * INTO v_ref
  FROM public.fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  IF COALESCE(v_ref.parcela_total, 1) <= 1 OR v_ref.parcela_atual IS NULL
     OR v_ref.parcela_atual >= v_ref.parcela_total THEN
    RAISE EXCEPTION 'SERIE_INVALIDA: a conta não tem parcelas seguintes';
  END IF;

  v_desc := public.strip_html(p_descricao);
  IF length(btrim(COALESCE(v_desc, ''))) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;

  -- Próximas parcelas da mesma série, travadas na ordem da série.
  SELECT COALESCE(array_agg(x.id ORDER BY x.parcela_atual), ARRAY[]::uuid[])
    INTO v_seguintes
  FROM (
    SELECT cp.id, cp.parcela_atual
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.id <> v_ref.id
      AND cp.parcela_total = v_ref.parcela_total
      AND cp.parcela_atual > v_ref.parcela_atual
      AND ((cp.created_at = v_ref.created_at AND cp.created_by = v_ref.created_by)
        OR cp.lancamento_pai_id = COALESCE(v_ref.lancamento_pai_id, v_ref.id))
    ORDER BY cp.parcela_atual
    FOR UPDATE
  ) x;

  IF (SELECT count(*) <> count(DISTINCT cp.parcela_atual)
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id AND cp.id = ANY(v_seguintes)) THEN
    RAISE EXCEPTION 'SERIE_AMBIGUA: há parcelas repetidas na série; edite uma de cada vez';
  END IF;

  -- Frequência: a da 1ª parcela; sem ela, deduzida do intervalo até a próxima.
  SELECT lower(p.recorrencia_config->>'frequencia') INTO v_frequencia
  FROM public.fin_contas_pagar p
  WHERE p.company_id = v_company_id
    AND p.recorrencia_config IS NOT NULL
    AND (p.id = COALESCE(v_ref.lancamento_pai_id, v_ref.id)
      OR (p.parcela_total = v_ref.parcela_total AND p.parcela_atual = 1
        AND p.created_at = v_ref.created_at AND p.created_by = v_ref.created_by))
  LIMIT 1;

  IF v_frequencia IS NULL OR v_frequencia NOT IN ('mensal', 'semanal', 'quinzenal') THEN
    SELECT CASE
        WHEN q.dias BETWEEN 28 AND 31 THEN 'mensal'
        WHEN q.dias = 7 THEN 'semanal'
        WHEN q.dias = 15 THEN 'quinzenal'
      END
      INTO v_frequencia
    FROM (
      SELECT (cp.data_vencimento - v_ref.data_vencimento)::numeric / (cp.parcela_atual - v_ref.parcela_atual) AS dias
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id AND cp.id = ANY(v_seguintes)
      ORDER BY cp.parcela_atual
      LIMIT 1
    ) q;
  END IF;

  -- O que esta edição mudou (comparado com a parcela antes de salvar).
  v_sufixo := ' (' || v_ref.parcela_atual || '/' || v_ref.parcela_total || ')';
  v_base := CASE WHEN right(v_desc, length(v_sufixo)) = v_sufixo
    THEN left(v_desc, length(v_desc) - length(v_sufixo)) ELSE v_desc END;
  v_mudou_desc := v_desc IS DISTINCT FROM v_ref.descricao;
  v_mudou_valor := round(p_valor, 2) IS DISTINCT FROM round(v_ref.valor, 2);
  v_mudou_fornecedor := p_supplier_id IS DISTINCT FROM v_ref.supplier_id
    OR public.strip_html(p_fornecedor) IS DISTINCT FROM v_ref.fornecedor;
  v_mudou_vencimento := p_data_vencimento IS DISTINCT FROM v_ref.data_vencimento;
  -- Competência vazia que o formulário preencheu com o vencimento não é alteração.
  v_mudou_competencia := p_data_competencia IS DISTINCT FROM v_ref.data_competencia
    AND NOT (v_ref.data_competencia IS NULL AND p_data_competencia IS NOT DISTINCT FROM p_data_vencimento);
  v_mudou_conta := p_conta_id IS DISTINCT FROM v_ref.conta_id;
  -- Forma vazia que o formulário abriu como 'boleto' não é alteração: viraria
  -- mudança em todas as próximas (e nova aprovação) sem o usuário mexer no campo.
  v_mudou_forma := p_forma_pagamento IS DISTINCT FROM v_ref.forma_pagamento
    AND NOT (v_ref.forma_pagamento IS NULL AND p_forma_pagamento = 'boleto');
  v_mudou_obs := NULLIF(btrim(COALESCE(public.strip_html(p_observacoes), '')), '')
    IS DISTINCT FROM NULLIF(btrim(COALESCE(v_ref.observacoes, '')), '');
  v_classif_antes := public._fin_serie_classificacao(
    v_company_id, v_ref.id, v_ref.categoria_id, v_ref.centro_custo_id, v_ref.cmv_incluir, v_ref.valor);
  v_antes := jsonb_build_array(public._fin_serie_retrato(v_company_id, to_jsonb(v_ref)));

  -- A parcela editada, exatamente como na edição avulsa (lock otimista do cliente).
  v_resultado := public._guarded_update_conta_pagar(
    p_id => p_id,
    p_descricao => p_descricao,
    p_valor => p_valor,
    p_fornecedor => p_fornecedor,
    p_supplier_id => p_supplier_id,
    p_data_vencimento => p_data_vencimento,
    p_data_competencia => p_data_competencia,
    p_categoria_id => p_categoria_id,
    p_centro_custo_id => p_centro_custo_id,
    p_conta_id => p_conta_id,
    p_forma_pagamento => p_forma_pagamento,
    p_observacoes => p_observacoes,
    p_rateios => p_rateios,
    p_recorrencia => p_recorrencia,
    p_expected_updated_at => p_expected_updated_at,
    p_dados_pagamento => p_dados_pagamento,
    p_cmv => p_cmv
  );

  SELECT * INTO v_pos
  FROM public.fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id;

  v_mudou_classif := v_classif_antes IS DISTINCT FROM public._fin_serie_classificacao(
    v_company_id, v_pos.id, v_pos.categoria_id, v_pos.centro_custo_id, v_pos.cmv_incluir, v_pos.valor);

  v_campos := array_remove(ARRAY[
    CASE WHEN v_mudou_desc THEN 'descricao' END,
    CASE WHEN v_mudou_valor THEN 'valor' END,
    CASE WHEN v_mudou_fornecedor THEN 'fornecedor' END,
    CASE WHEN v_mudou_vencimento THEN 'data_vencimento' END,
    CASE WHEN v_mudou_competencia THEN 'data_competencia' END,
    CASE WHEN v_mudou_conta THEN 'conta_id' END,
    CASE WHEN v_mudou_forma THEN 'forma_pagamento' END,
    CASE WHEN v_mudou_obs THEN 'observacoes' END,
    CASE WHEN v_mudou_classif THEN 'classificacao' END
  ], NULL);

  IF cardinality(v_campos) > 0 THEN
    FOR v_parcela IN
      SELECT * FROM public.fin_contas_pagar
      WHERE company_id = v_company_id AND id = ANY(v_seguintes)
      ORDER BY parcela_atual
    LOOP
      IF v_parcela.status IN ('PAGO', 'CANCELADO') THEN
        v_ignoradas := v_ignoradas + 1;
        CONTINUE;
      END IF;

      v_passos := v_parcela.parcela_atual - v_ref.parcela_atual;
      v_valor := CASE WHEN v_mudou_valor THEN v_pos.valor ELSE v_parcela.valor END;
      v_antes := v_antes || public._fin_serie_retrato(v_company_id, to_jsonb(v_parcela));

      PERFORM public._guarded_update_conta_pagar(
        p_id => v_parcela.id,
        p_descricao => CASE WHEN v_mudou_desc
          THEN v_base || ' (' || v_parcela.parcela_atual || '/' || v_parcela.parcela_total || ')'
          ELSE v_parcela.descricao END,
        p_valor => v_valor,
        p_fornecedor => CASE WHEN v_mudou_fornecedor THEN v_pos.fornecedor ELSE v_parcela.fornecedor END,
        p_supplier_id => CASE WHEN v_mudou_fornecedor THEN v_pos.supplier_id ELSE v_parcela.supplier_id END,
        p_data_vencimento => CASE WHEN v_mudou_vencimento
          THEN public._fin_serie_data(v_pos.data_vencimento, v_passos, v_frequencia,
            v_parcela.data_vencimento, v_pos.data_vencimento - v_ref.data_vencimento)
          ELSE v_parcela.data_vencimento END,
        p_data_competencia => CASE WHEN v_mudou_competencia
          THEN public._fin_serie_data(v_pos.data_competencia, v_passos, v_frequencia,
            v_parcela.data_competencia, v_pos.data_competencia - v_ref.data_competencia)
          ELSE v_parcela.data_competencia END,
        p_categoria_id => CASE WHEN v_mudou_classif THEN v_pos.categoria_id ELSE v_parcela.categoria_id END,
        p_centro_custo_id => CASE WHEN v_mudou_classif THEN v_pos.centro_custo_id ELSE v_parcela.centro_custo_id END,
        p_conta_id => CASE WHEN v_mudou_conta THEN v_pos.conta_id ELSE v_parcela.conta_id END,
        p_forma_pagamento => CASE WHEN v_mudou_forma THEN v_pos.forma_pagamento ELSE v_parcela.forma_pagamento END,
        p_observacoes => CASE WHEN v_mudou_obs THEN v_pos.observacoes ELSE v_parcela.observacoes END,
        p_rateios => public._fin_serie_rateios(
          v_company_id, CASE WHEN v_mudou_classif THEN v_pos.id ELSE v_parcela.id END, v_parcela.id, v_valor),
        p_recorrencia => v_parcela.recorrencia_config,
        p_expected_updated_at => v_parcela.updated_at,
        -- O código de pagamento é de cada boleto: nunca é copiado.
        p_dados_pagamento => NULL,
        -- Decisão do CMV explícita: a da editada se a classificação mudou, senão a da própria parcela.
        p_cmv => jsonb_build_object('incluir',
          CASE WHEN v_mudou_classif THEN v_pos.cmv_incluir ELSE v_parcela.cmv_incluir END)
      );
      v_ids := v_ids || v_parcela.id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'editar_serie',
    jsonb_build_object('parcelas', v_antes),
    jsonb_build_object(
      'campos', to_jsonb(v_campos),
      'parcelas_atualizadas', to_jsonb(v_ids),
      'parcelas_ignoradas', v_ignoradas
    ),
    v_user_id, v_company_id);

  RETURN v_resultado || jsonb_build_object(
    'parcelas_atualizadas', cardinality(v_ids),
    'parcelas_ignoradas', v_ignoradas,
    'campos', to_jsonb(v_campos)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_update_conta_receber_serie(
  p_id uuid,
  p_descricao text,
  p_cliente text DEFAULT NULL,
  p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT NULL,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_ref public.fin_contas_receber%ROWTYPE;
  v_pos public.fin_contas_receber%ROWTYPE;
  v_parcela public.fin_contas_receber%ROWTYPE;
  v_seguintes uuid[];
  v_resultado jsonb;
  v_desc text;
  v_sufixo text;
  v_base text;
  v_frequencia text;
  v_passos integer;
  v_valor numeric;
  v_classif_antes jsonb;
  v_mudou_desc boolean;
  v_mudou_valor boolean;
  v_mudou_cliente boolean;
  v_mudou_vencimento boolean;
  v_mudou_competencia boolean;
  v_mudou_conta boolean;
  v_mudou_forma boolean;
  v_mudou_obs boolean;
  v_mudou_classif boolean;
  v_campos text[];
  v_ids uuid[] := ARRAY[]::uuid[];
  v_ignoradas integer := 0;
  v_antes jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Gate no padrão do projeto; o efetivo é o da edição avulsa chamada abaixo
  -- (has_permission('financeiro:receber:edit'), sem chave legada nem super admin).
  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:receber:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:edit';
  END IF;

  SELECT * INTO v_ref
  FROM public.fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado';
  END IF;

  IF COALESCE(v_ref.parcela_total, 1) <= 1 OR v_ref.parcela_atual IS NULL
     OR v_ref.parcela_atual >= v_ref.parcela_total THEN
    RAISE EXCEPTION 'SERIE_INVALIDA: a conta não tem parcelas seguintes';
  END IF;

  v_desc := public.strip_html(p_descricao);
  IF length(btrim(COALESCE(v_desc, ''))) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;

  SELECT COALESCE(array_agg(x.id ORDER BY x.parcela_atual), ARRAY[]::uuid[])
    INTO v_seguintes
  FROM (
    SELECT cr.id, cr.parcela_atual
    FROM public.fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.id <> v_ref.id
      AND cr.parcela_total = v_ref.parcela_total
      AND cr.parcela_atual > v_ref.parcela_atual
      AND ((cr.created_at = v_ref.created_at AND cr.created_by = v_ref.created_by)
        OR cr.lancamento_pai_id = COALESCE(v_ref.lancamento_pai_id, v_ref.id))
    ORDER BY cr.parcela_atual
    FOR UPDATE
  ) x;

  IF (SELECT count(*) <> count(DISTINCT cr.parcela_atual)
      FROM public.fin_contas_receber cr
      WHERE cr.company_id = v_company_id AND cr.id = ANY(v_seguintes)) THEN
    RAISE EXCEPTION 'SERIE_AMBIGUA: há parcelas repetidas na série; edite uma de cada vez';
  END IF;

  SELECT lower(p.recorrencia_config->>'frequencia') INTO v_frequencia
  FROM public.fin_contas_receber p
  WHERE p.company_id = v_company_id
    AND p.recorrencia_config IS NOT NULL
    AND (p.id = COALESCE(v_ref.lancamento_pai_id, v_ref.id)
      OR (p.parcela_total = v_ref.parcela_total AND p.parcela_atual = 1
        AND p.created_at = v_ref.created_at AND p.created_by = v_ref.created_by))
  LIMIT 1;

  IF v_frequencia IS NULL OR v_frequencia NOT IN ('mensal', 'semanal', 'quinzenal') THEN
    SELECT CASE
        WHEN q.dias BETWEEN 28 AND 31 THEN 'mensal'
        WHEN q.dias = 7 THEN 'semanal'
        WHEN q.dias = 15 THEN 'quinzenal'
      END
      INTO v_frequencia
    FROM (
      SELECT (cr.data_vencimento - v_ref.data_vencimento)::numeric / (cr.parcela_atual - v_ref.parcela_atual) AS dias
      FROM public.fin_contas_receber cr
      WHERE cr.company_id = v_company_id AND cr.id = ANY(v_seguintes)
      ORDER BY cr.parcela_atual
      LIMIT 1
    ) q;
  END IF;

  v_sufixo := ' (' || v_ref.parcela_atual || '/' || v_ref.parcela_total || ')';
  v_base := CASE WHEN right(v_desc, length(v_sufixo)) = v_sufixo
    THEN left(v_desc, length(v_desc) - length(v_sufixo)) ELSE v_desc END;
  v_mudou_desc := v_desc IS DISTINCT FROM v_ref.descricao;
  v_mudou_valor := round(p_valor, 2) IS DISTINCT FROM round(v_ref.valor, 2);
  v_mudou_cliente := p_supplier_id IS DISTINCT FROM v_ref.supplier_id
    OR public.strip_html(p_cliente) IS DISTINCT FROM v_ref.cliente;
  v_mudou_vencimento := p_data_vencimento IS DISTINCT FROM v_ref.data_vencimento;
  v_mudou_competencia := p_data_competencia IS DISTINCT FROM v_ref.data_competencia
    AND NOT (v_ref.data_competencia IS NULL AND p_data_competencia IS NOT DISTINCT FROM p_data_vencimento);
  v_mudou_conta := p_conta_id IS DISTINCT FROM v_ref.conta_id;
  -- Forma vazia que o formulário abriu como 'pix' não é alteração.
  v_mudou_forma := p_forma_pagamento IS DISTINCT FROM v_ref.forma_pagamento
    AND NOT (v_ref.forma_pagamento IS NULL AND p_forma_pagamento = 'pix');
  v_mudou_obs := NULLIF(btrim(COALESCE(public.strip_html(p_observacoes), '')), '')
    IS DISTINCT FROM NULLIF(btrim(COALESCE(v_ref.observacoes, '')), '');
  v_classif_antes := public._fin_serie_classificacao(
    v_company_id, v_ref.id, v_ref.categoria_id, v_ref.centro_custo_id, NULL, v_ref.valor);
  v_antes := jsonb_build_array(public._fin_serie_retrato(v_company_id, to_jsonb(v_ref)));

  v_resultado := public._guarded_update_conta_receber(
    p_id => p_id,
    p_descricao => p_descricao,
    p_cliente => p_cliente,
    p_valor => p_valor,
    p_data_vencimento => p_data_vencimento,
    p_data_competencia => p_data_competencia,
    p_categoria_id => p_categoria_id,
    p_centro_custo_id => p_centro_custo_id,
    p_conta_id => p_conta_id,
    p_forma_pagamento => p_forma_pagamento,
    p_observacoes => p_observacoes,
    p_rateios => p_rateios,
    p_recorrencia => p_recorrencia,
    p_supplier_id => p_supplier_id,
    p_expected_updated_at => p_expected_updated_at
  );

  SELECT * INTO v_pos
  FROM public.fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id;

  v_mudou_classif := v_classif_antes IS DISTINCT FROM public._fin_serie_classificacao(
    v_company_id, v_pos.id, v_pos.categoria_id, v_pos.centro_custo_id, NULL, v_pos.valor);

  v_campos := array_remove(ARRAY[
    CASE WHEN v_mudou_desc THEN 'descricao' END,
    CASE WHEN v_mudou_valor THEN 'valor' END,
    CASE WHEN v_mudou_cliente THEN 'cliente' END,
    CASE WHEN v_mudou_vencimento THEN 'data_vencimento' END,
    CASE WHEN v_mudou_competencia THEN 'data_competencia' END,
    CASE WHEN v_mudou_conta THEN 'conta_id' END,
    CASE WHEN v_mudou_forma THEN 'forma_pagamento' END,
    CASE WHEN v_mudou_obs THEN 'observacoes' END,
    CASE WHEN v_mudou_classif THEN 'classificacao' END
  ], NULL);

  IF cardinality(v_campos) > 0 THEN
    FOR v_parcela IN
      SELECT * FROM public.fin_contas_receber
      WHERE company_id = v_company_id AND id = ANY(v_seguintes)
      ORDER BY parcela_atual
    LOOP
      IF v_parcela.status IN ('RECEBIDO', 'CANCELADO') THEN
        v_ignoradas := v_ignoradas + 1;
        CONTINUE;
      END IF;

      v_passos := v_parcela.parcela_atual - v_ref.parcela_atual;
      v_valor := CASE WHEN v_mudou_valor THEN v_pos.valor ELSE v_parcela.valor END;
      v_antes := v_antes || public._fin_serie_retrato(v_company_id, to_jsonb(v_parcela));

      PERFORM public._guarded_update_conta_receber(
        p_id => v_parcela.id,
        p_descricao => CASE WHEN v_mudou_desc
          THEN v_base || ' (' || v_parcela.parcela_atual || '/' || v_parcela.parcela_total || ')'
          ELSE v_parcela.descricao END,
        p_cliente => CASE WHEN v_mudou_cliente THEN v_pos.cliente ELSE v_parcela.cliente END,
        p_valor => v_valor,
        p_data_vencimento => CASE WHEN v_mudou_vencimento
          THEN public._fin_serie_data(v_pos.data_vencimento, v_passos, v_frequencia,
            v_parcela.data_vencimento, v_pos.data_vencimento - v_ref.data_vencimento)
          ELSE v_parcela.data_vencimento END,
        p_data_competencia => CASE WHEN v_mudou_competencia
          THEN public._fin_serie_data(v_pos.data_competencia, v_passos, v_frequencia,
            v_parcela.data_competencia, v_pos.data_competencia - v_ref.data_competencia)
          ELSE v_parcela.data_competencia END,
        p_categoria_id => CASE WHEN v_mudou_classif THEN v_pos.categoria_id ELSE v_parcela.categoria_id END,
        p_centro_custo_id => CASE WHEN v_mudou_classif THEN v_pos.centro_custo_id ELSE v_parcela.centro_custo_id END,
        p_conta_id => CASE WHEN v_mudou_conta THEN v_pos.conta_id ELSE v_parcela.conta_id END,
        p_forma_pagamento => CASE WHEN v_mudou_forma THEN v_pos.forma_pagamento ELSE v_parcela.forma_pagamento END,
        p_observacoes => CASE WHEN v_mudou_obs THEN v_pos.observacoes ELSE v_parcela.observacoes END,
        p_rateios => public._fin_serie_rateios(
          v_company_id, CASE WHEN v_mudou_classif THEN v_pos.id ELSE v_parcela.id END, v_parcela.id, v_valor),
        p_recorrencia => v_parcela.recorrencia_config,
        p_supplier_id => CASE WHEN v_mudou_cliente THEN v_pos.supplier_id ELSE v_parcela.supplier_id END,
        p_expected_updated_at => v_parcela.updated_at
      );
      v_ids := v_ids || v_parcela.id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_receber', p_id, 'editar_serie',
    jsonb_build_object('parcelas', v_antes),
    jsonb_build_object(
      'campos', to_jsonb(v_campos),
      'parcelas_atualizadas', to_jsonb(v_ids),
      'parcelas_ignoradas', v_ignoradas
    ),
    v_user_id, v_company_id);

  RETURN v_resultado || jsonb_build_object(
    'parcelas_atualizadas', cardinality(v_ids),
    'parcelas_ignoradas', v_ignoradas,
    'campos', to_jsonb(v_campos)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._fin_serie_data(date, integer, text, date, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._fin_serie_classificacao(uuid, uuid, uuid, uuid, boolean, numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._fin_serie_rateios(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._fin_serie_retrato(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public._guarded_update_conta_pagar_serie(
  uuid, text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_conta_pagar_serie(
  uuid, text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, jsonb, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._guarded_update_conta_receber_serie(
  uuid, text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_conta_receber_serie(
  uuid, text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, timestamptz
) TO authenticated, service_role;
