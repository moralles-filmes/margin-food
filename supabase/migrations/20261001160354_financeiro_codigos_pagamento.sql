-- Campos opcionais na própria CP; nenhuma cópia de título ou alteração de saldo.
SET lock_timeout = '5s';
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN tipo_codigo_pagamento text,
  ADD COLUMN codigo_pagamento text,
  ADD COLUMN codigo_pagamento_unaccent text GENERATED ALWAYS AS (lower(public.immutable_unaccent(codigo_pagamento))) STORED;

CREATE INDEX idx_fin_cp_codigo_vencimento ON public.fin_contas_pagar
  (company_id, data_vencimento DESC, id DESC)
  WHERE codigo_pagamento IS NOT NULL AND status <> 'CANCELADO';
CREATE INDEX idx_fin_cp_codigo_unaccent ON public.fin_contas_pagar
  USING gin (codigo_pagamento_unaccent gin_trgm_ops) WHERE codigo_pagamento IS NOT NULL;

-- Categorias ainda não tinham coluna normalizada; busca sem acentos segue o padrão do projeto.
ALTER TABLE public.fin_categorias ADD COLUMN nome_unaccent text
  GENERATED ALWAYS AS (lower(public.immutable_unaccent(nome))) STORED;
CREATE INDEX idx_fin_categorias_nome_unaccent ON public.fin_categorias USING gin (nome_unaccent gin_trgm_ops);

-- Trigger fornece erro sem incluir o código/linha no DETAIL de um CHECK.
-- Protege também DML direto: permissão de aprovar não autoriza trocar o destino.
CREATE FUNCTION public.fin_validar_codigo_pagamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tipo_codigo_pagamento IS NOT DISTINCT FROM OLD.tipo_codigo_pagamento
    AND NEW.codigo_pagamento IS NOT DISTINCT FROM OLD.codigo_pagamento THEN RETURN NEW; END IF;
  IF (NEW.tipo_codigo_pagamento IS NULL) <> (NEW.codigo_pagamento IS NULL)
    OR (NEW.tipo_codigo_pagamento IS NOT NULL AND NEW.tipo_codigo_pagamento NOT IN ('boleto','pix_chave','pix_copia_cola','outro'))
    OR (NEW.codigo_pagamento IS NOT NULL AND (NEW.codigo_pagamento !~ '[^[:space:]]' OR length(NEW.codigo_pagamento) > 8192)) THEN
    RAISE EXCEPTION 'CODIGO_PAGAMENTO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.codigo_pagamento IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_any_permission(auth.uid(), ARRAY[
    CASE WHEN TG_OP = 'INSERT' THEN 'financeiro:pagar:create' ELSE 'financeiro:pagar:edit' END,
    'finance:manage', 'system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: CODIGO_PAGAMENTO' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('PAGO','CANCELADO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: CODIGO_PAGAMENTO';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fin_validar_codigo_pagamento() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_fin_validar_codigo_pagamento BEFORE INSERT OR UPDATE ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.fin_validar_codigo_pagamento();

-- Default NULL mantém compatibilidade com clientes antigos na edição.
-- Objeto {tipo:null,codigo:null} remove os dados explicitamente.
-- Uma recorrência recebe código apenas no título inicial; parcelas têm boletos próprios.
DROP FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text);
DROP FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz);

CREATE OR REPLACE FUNCTION public._guarded_create_conta_pagar(p_descricao text, p_valor numeric, p_fornecedor text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid, p_data_vencimento date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date, p_data_competencia date DEFAULT NULL::date, p_categoria_id uuid DEFAULT NULL::uuid, p_centro_custo_id uuid DEFAULT NULL::uuid, p_conta_id uuid DEFAULT NULL::uuid, p_forma_pagamento text DEFAULT 'boleto'::text, p_observacoes text DEFAULT NULL::text, p_rateios jsonb DEFAULT '[]'::jsonb, p_recorrencia jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_dados_pagamento jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing record;
  v_replay boolean := false;
  v_constraint text;
BEGIN
  IF p_dados_pagamento IS NOT NULL AND (jsonb_typeof(p_dados_pagamento) <> 'object'
    OR (p_dados_pagamento->'tipo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'tipo') NOT IN ('string','null'))
    OR (p_dados_pagamento->'codigo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'codigo') NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'CODIGO_PAGAMENTO_INVALIDO';
  END IF;
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:pagar:create', 'finance:manage', 'system:global:manage'
  ]) THEN
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

  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
    END IF;
    SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
           cp.descricao, cp.categoria_id, cp.supplier_id, cp.tipo_codigo_pagamento, cp.codigo_pagamento
      INTO v_existing
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
    v_replay := FOUND;
  END IF;

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);
  v_status := CASE WHEN p_valor > v_threshold THEN 'AGUARDANDO_APROVACAO' ELSE 'APROVADO' END;

  IF NOT v_replay THEN
    BEGIN
      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, idempotency_key, tipo_codigo_pagamento, codigo_pagamento
      ) VALUES (
        v_desc, p_valor, v_forn, p_supplier_id,
        p_data_vencimento, p_data_competencia,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
        CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
        CASE WHEN v_recorrencia IS NOT NULL THEN v_total END,
        v_request_key, p_dados_pagamento->>'tipo', p_dados_pagamento->>'codigo'
      )
      RETURNING id, created_at INTO v_id, v_created_at;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_request_key IS NULL OR v_constraint IS DISTINCT FROM 'uq_fin_contas_pagar_idempotency' THEN
        RAISE;
      END IF;
      SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
             cp.descricao, cp.categoria_id, cp.supplier_id, cp.tipo_codigo_pagamento, cp.codigo_pagamento
        INTO v_existing
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_replay := true;
    END;
  END IF;

  IF v_replay THEN
    -- Só é reenvio se descrever a MESMA operação.
    IF round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
       OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
       OR coalesce(v_existing.parcela_total, 1) IS DISTINCT FROM v_total
       OR v_existing.descricao IS DISTINCT FROM v_desc
       OR v_existing.categoria_id IS DISTINCT FROM p_categoria_id
       OR v_existing.supplier_id IS DISTINCT FROM p_supplier_id
       OR (p_dados_pagamento IS NOT NULL AND (
         v_existing.tipo_codigo_pagamento IS DISTINCT FROM (p_dados_pagamento->>'tipo')
         OR v_existing.codigo_pagamento IS DISTINCT FROM (p_dados_pagamento->>'codigo')
       )) THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'created_at', v_existing.created_at,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', (
        SELECT count(*) FROM public.fin_contas_pagar cp
        WHERE cp.company_id = v_company_id
          AND (cp.id = v_existing.id OR cp.lancamento_pai_id = v_existing.id)
      ),
      'idempotente', true
    );
  END IF;

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
      'lancamentos_criados', v_total,
      'tipo_codigo_pagamento', p_dados_pagamento->>'tipo',
      'possui_codigo_pagamento', (p_dados_pagamento->>'codigo') IS NOT NULL
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', v_status,
    'created_at', v_created_at,
    'limite_aprovacao', v_threshold,
    'lancamentos_criados', v_total,
    'idempotente', false
  );
END;
$function$
;


CREATE OR REPLACE FUNCTION public._guarded_update_conta_pagar(p_id uuid, p_descricao text, p_valor numeric, p_fornecedor text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid, p_data_vencimento date DEFAULT NULL::date, p_data_competencia date DEFAULT NULL::date, p_categoria_id uuid DEFAULT NULL::uuid, p_centro_custo_id uuid DEFAULT NULL::uuid, p_conta_id uuid DEFAULT NULL::uuid, p_forma_pagamento text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_rateios jsonb DEFAULT '[]'::jsonb, p_recorrencia jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_dados_pagamento jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_status text;
  v_threshold numeric;
  v_desc text;
  v_forn text;
  v_obs text;
  v_updated_at timestamptz;
  v_rateios jsonb;
  r record;
BEGIN
  IF p_dados_pagamento IS NOT NULL AND (jsonb_typeof(p_dados_pagamento) <> 'object'
    OR (p_dados_pagamento->'tipo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'tipo') NOT IN ('string','null'))
    OR (p_dados_pagamento->'codigo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'codigo') NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'CODIGO_PAGAMENTO_INVALIDO';
  END IF;
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT has_permission('financeiro:pagar:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:edit';
  END IF;

  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status,
    'tipo_codigo_pagamento', tipo_codigo_pagamento, 'possui_codigo_pagamento', codigo_pagamento IS NOT NULL), status, updated_at
  INTO v_old_data, v_status, v_updated_at
  FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;

  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM fin_contas WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  UPDATE fin_contas_pagar SET
    descricao = v_desc,
    valor = p_valor,
    fornecedor = v_forn,
    supplier_id = p_supplier_id,
    data_vencimento = p_data_vencimento,
    data_competencia = p_data_competencia,
    categoria_id = p_categoria_id,
    centro_custo_id = p_centro_custo_id,
    conta_id = p_conta_id,
    forma_pagamento = p_forma_pagamento,
    tipo_codigo_pagamento = CASE WHEN p_dados_pagamento IS NULL THEN tipo_codigo_pagamento ELSE p_dados_pagamento->>'tipo' END,
    codigo_pagamento = CASE WHEN p_dados_pagamento IS NULL THEN codigo_pagamento ELSE p_dados_pagamento->>'codigo' END,
    observacoes = v_obs,
    status = v_status,
    recorrente = COALESCE((p_recorrencia IS NOT NULL), false),
    recorrencia_config = p_recorrencia,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'editar', v_old_data,
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status,
      'dados_pagamento_informados', p_dados_pagamento IS NOT NULL),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'updated_at', now(),
    'limite_aprovacao', v_threshold);
END;
$function$
;


-- Não replicar códigos financeiros completos nos logs genéricos.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE before_row jsonb; after_row jsonb; company uuid; resource_id uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
 company:=(COALESCE(after_row,before_row)->>'company_id')::uuid;
 resource_id:=(COALESCE(after_row,before_row)->>'id')::uuid;
 IF TG_OP='UPDATE' AND (before_row->>'company_id') IS DISTINCT FROM (after_row->>'company_id') THEN RAISE EXCEPTION 'LOG_RESOURCE_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(company_id,actor_user_id,source,module,entity,entity_id,action,before,after,scope_reason)
 VALUES(company,auth.uid(),'db',TG_ARGV[0],TG_TABLE_NAME,resource_id,CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END,
 before_row-ARRAY['cpf','senha','password','token','card_number','secret','codigo_pagamento','codigo_pagamento_unaccent'],after_row-ARRAY['cpf','senha','password','token','card_number','secret','codigo_pagamento','codigo_pagamento_unaccent'],'db_trigger');
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $function$
;

REVOKE ALL ON FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb) TO authenticated, service_role;

-- O mesmo gate de leitura da CP; joins sempre limitados à empresa autorizada.
CREATE FUNCTION public.list_fin_codigos_pagamento(
  p_status text DEFAULT NULL, p_tipo text DEFAULT NULL, p_search text DEFAULT NULL,
  p_data_de date DEFAULT NULL, p_data_ate date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL, p_sem_categoria boolean DEFAULT false,
  p_limit integer DEFAULT 50, p_cursor_date date DEFAULT NULL, p_cursor_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid := public.assert_tenant();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_search text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:pagar:view', 'finance:read', 'system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  IF p_data_de > p_data_ate THEN RAISE EXCEPTION 'PERIODO_INVALIDO' USING ERRCODE = '22023'; END IF;
  IF (p_cursor_date IS NULL) <> (p_cursor_id IS NULL) THEN RAISE EXCEPTION 'CURSOR_INVALIDO' USING ERRCODE = '22023'; END IF;
  v_search := nullif(lower(public.immutable_unaccent(btrim(p_search))), '');
  -- Busca literal: %, _ e barra no código não se tornam curingas SQL.
  v_search := '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  WITH page_rows AS MATERIALIZED (
    SELECT c.id, c.descricao, c.fornecedor, c.valor, c.data_vencimento, c.status,
      c.categoria_id, c.tipo_codigo_pagamento, c.codigo_pagamento,
      CASE WHEN c.status <> 'PAGO' AND c.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        THEN 'VENCIDO' ELSE c.status END AS status_exibicao,
      cat.nome AS categoria_nome
    FROM public.fin_contas_pagar c
    LEFT JOIN public.fin_categorias cat ON cat.id = c.categoria_id AND cat.company_id = v_company
    WHERE c.company_id = v_company AND c.status <> 'CANCELADO' AND c.codigo_pagamento IS NOT NULL
      AND (p_status IS NULL OR (p_status = 'VENCIDO' AND c.status <> 'PAGO'
        AND c.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date)
        OR (p_status <> 'VENCIDO' AND c.status = p_status))
      AND (p_tipo IS NULL OR c.tipo_codigo_pagamento = p_tipo)
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND ((NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios r WHERE r.company_id = v_company
            AND r.lancamento_id = c.id AND r.categoria_id IS NOT NULL))
        OR (p_categoria_id IS NOT NULL AND (c.categoria_id = p_categoria_id OR EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios r WHERE r.company_id = v_company
            AND r.lancamento_id = c.id AND r.categoria_id = p_categoria_id))))
      AND (v_search IS NULL OR c.descricao_unaccent LIKE v_search OR c.fornecedor_unaccent LIKE v_search
        OR c.codigo_pagamento_unaccent LIKE v_search OR cat.nome_unaccent LIKE v_search
        OR EXISTS (SELECT 1 FROM public.fin_lancamento_rateios r
          JOIN public.fin_categorias rc ON rc.id = r.categoria_id AND rc.company_id = v_company
          WHERE r.company_id = v_company AND r.lancamento_id = c.id AND rc.nome_unaccent LIKE v_search))
      AND (p_cursor_date IS NULL OR (c.data_vencimento, c.id) < (p_cursor_date, p_cursor_id))
    ORDER BY c.data_vencimento DESC, c.id DESC LIMIT v_limit + 1
  ), visible_rows AS (
    SELECT p.* FROM page_rows p ORDER BY p.data_vencimento DESC, p.id DESC LIMIT v_limit
  ), enriched AS (
    SELECT v.*, COALESCE(r.nomes, v.categoria_nome, 'Sem categoria') AS categorias
    FROM visible_rows v
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT cat.nome, ', ' ORDER BY cat.nome) AS nomes
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_categorias cat ON cat.id = r.categoria_id AND cat.company_id = v_company
      WHERE r.company_id = v_company AND r.lancamento_id = v.id
    ) r ON true
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.data_vencimento DESC, e.id DESC) FROM enriched e), '[]'::jsonb),
    'has_more', (SELECT count(*) > v_limit FROM page_rows),
    'categorias', CASE WHEN p_cursor_id IS NULL THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'codigo', codigo, 'parent_id', parent_id) ORDER BY nome)
      FROM public.fin_categorias WHERE company_id = v_company AND tipo = 'despesa'
    ), '[]'::jsonb) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.list_fin_codigos_pagamento(text,text,text,date,date,uuid,boolean,integer,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fin_codigos_pagamento(text,text,text,date,date,uuid,boolean,integer,date,uuid) TO authenticated, service_role;

-- Força resolução de colunas sem ler dados nem contornar o guard da RPC.
DO $$ BEGIN
  PERFORM c.tipo_codigo_pagamento, c.codigo_pagamento, c.codigo_pagamento_unaccent,
    c.descricao_unaccent, c.fornecedor_unaccent, cat.nome_unaccent, r.categoria_id
  FROM public.fin_contas_pagar c
  LEFT JOIN public.fin_categorias cat ON cat.id = c.categoria_id AND cat.company_id = c.company_id
  LEFT JOIN public.fin_lancamento_rateios r ON r.lancamento_id = c.id AND r.company_id = c.company_id
  WHERE false;
END $$;
NOTIFY pgrst, 'reload schema';
