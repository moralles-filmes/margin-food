\set ON_ERROR_STOP on

-- Edição em série de Contas a Pagar/Receber: teste de integração em PostgreSQL
-- real e DESCARTÁVEL. Aplica as migrations do CMV (que trazem os corpos atuais de
-- `_guarded_create/update_conta_pagar`) e a migration da edição em série sobre um
-- schema mínimo. As RPCs de Contas a Receber, `fin_validate_recorrencia_config` e
-- os gatilhos de soma do rateio e de recorrência materializada têm o corpo de
-- produção (2026-10-10). São simulados apenas: auth.uid(), assert_tenant() (lê
-- test.company_id), has_permission/has_any_permission (leem test.permissions),
-- strip_html e fin_get_limite_aprovacao.
-- Uso: psql -v ON_ERROR_STOP=1 -d <banco_vazio> -f supabase/tests/database/financeiro_edicao_serie_ephemeral.sql
--  (ou powershell -File supabase/tests/database/run_ephemeral.ps1 <este arquivo>)

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('test.user_id', true), '')::uuid $$;

CREATE FUNCTION public.assert_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid := NULLIF(current_setting('test.company_id', true), '')::uuid;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'COMPANY_ACCESS_DENIED'; END IF;
  RETURN v;
END; $$;

CREATE FUNCTION public.has_any_permission(_user_id uuid, _permissions text[]) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT _user_id IS NOT NULL AND string_to_array(COALESCE(current_setting('test.permissions', true), ''), ',') && _permissions $$;
CREATE FUNCTION public.has_permission(_permission text) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT public.has_any_permission(auth.uid(), ARRAY[_permission]) $$;
CREATE FUNCTION public.strip_html(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT p $$;
CREATE FUNCTION public.fin_get_limite_aprovacao(p_company_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 2500::numeric $$;

-- Corpo de produção.
CREATE FUNCTION public.fin_validate_recorrencia_config(p_config jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE v_frequency text; v_count_text text; v_count integer; v_limit integer;
BEGIN
  IF p_config IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'RECORRENCIA_CONFIG_INVALIDA: informe frequência e quantidade' USING ERRCODE = '22023';
  END IF;
  v_frequency := lower(btrim(p_config->>'frequencia'));
  v_limit := CASE v_frequency WHEN 'mensal' THEN 36 WHEN 'semanal' THEN 144 WHEN 'quinzenal' THEN 72 ELSE NULL END;
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'RECORRENCIA_FREQUENCIA_INVALIDA: use mensal, semanal ou quinzenal' USING ERRCODE = '22023';
  END IF;
  v_count_text := btrim(p_config->>'parcelas');
  IF v_count_text IS NULL OR v_count_text !~ '^[0-9]+$' OR length(v_count_text) > 3 THEN
    RAISE EXCEPTION 'RECORRENCIA_QUANTIDADE_INVALIDA: informe uma quantidade inteira' USING ERRCODE = '22023';
  END IF;
  v_count := v_count_text::integer;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'RECORRENCIA_QUANTIDADE_INVALIDA: informe pelo menos 2 lançamentos' USING ERRCODE = '22023';
  END IF;
  IF v_count > v_limit THEN
    RAISE EXCEPTION 'RECORRENCIA_LIMITE_EXCEDIDO: % permite no máximo % lançamentos', initcap(v_frequency), v_limit USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('frequencia', v_frequency, 'parcelas', v_count, 'parcelas_geradas', v_count, 'materializada', true);
END; $$;

CREATE TABLE public.companies (id uuid PRIMARY KEY, nome text NOT NULL);
CREATE TABLE public.permissions (key text PRIMARY KEY, description text, module text, submodule text, action text);
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role text NOT NULL, permission_key text NOT NULL);
CREATE TABLE public.fin_config (
  company_id uuid NOT NULL, key text NOT NULL, value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid, PRIMARY KEY (company_id, key)
);
CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entidade text NOT NULL, entidade_id uuid, acao text NOT NULL,
  antes jsonb, depois jsonb, justificativa text DEFAULT '', user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL DEFAULT 'despesa', grupo text DEFAULT '',
  parent_id uuid, codigo text DEFAULT '', ordem integer DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_contas (id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL);
CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), descricao text NOT NULL DEFAULT '', valor numeric NOT NULL DEFAULT 0,
  valor_pago numeric DEFAULT 0, fornecedor text DEFAULT '', supplier_id uuid,
  data_vencimento date NOT NULL, data_competencia date, data_pagamento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, forma_pagamento text DEFAULT 'boleto', observacoes text DEFAULT '',
  status text NOT NULL DEFAULT 'RASCUNHO', created_by uuid, company_id uuid NOT NULL,
  recorrente boolean NOT NULL DEFAULT false, recorrencia_config jsonb DEFAULT '{}'::jsonb,
  parcela_atual integer, parcela_total integer, lancamento_pai_id uuid, lancamento_id uuid,
  idempotency_key text, tipo_codigo_pagamento text, codigo_pagamento text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fin_contas_pagar_idempotency ON public.fin_contas_pagar (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Colunas de produção (information_schema, 2026-10-10), sem as que nenhuma função toca.
CREATE TABLE public.fin_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), descricao text NOT NULL DEFAULT '', valor numeric NOT NULL DEFAULT 0,
  valor_recebido numeric DEFAULT 0, data_vencimento date NOT NULL, data_recebimento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, cliente text DEFAULT '', forma_pagamento text DEFAULT 'pix',
  status text NOT NULL DEFAULT 'A_RECEBER', recorrente boolean NOT NULL DEFAULT false, recorrencia_config jsonb DEFAULT '{}'::jsonb,
  parcela_atual integer, parcela_total integer, lancamento_pai_id uuid, observacoes text DEFAULT '', lancamento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  company_id uuid NOT NULL, data_competencia date, supplier_id uuid, idempotency_key text
);
CREATE UNIQUE INDEX uq_fin_contas_receber_idempotency ON public.fin_contas_receber (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER trg_updated_at_fin_contas_pagar BEFORE UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_updated_at_fin_contas_receber BEFORE UPDATE ON public.fin_contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Corpo de produção.
CREATE FUNCTION public.fin_preserve_materialized_recurrence() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF OLD.recorrente
     AND COALESCE((OLD.recorrencia_config->>'materializada')::boolean, false)
     AND NEW.recorrente THEN
    IF lower(NEW.recorrencia_config->>'frequencia') IS DISTINCT FROM lower(OLD.recorrencia_config->>'frequencia')
       OR (NEW.recorrencia_config->>'parcelas')::integer IS DISTINCT FROM (OLD.recorrencia_config->>'parcelas')::integer THEN
      RAISE EXCEPTION 'RECORRENCIA_SERIE_IMUTAVEL: desative esta recorrência e crie uma nova série' USING ERRCODE = '22023';
    END IF;
    NEW.recorrencia_config := OLD.recorrencia_config;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fin_cp_preserve_materialized_recurrence BEFORE UPDATE OF recorrente, recorrencia_config ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.fin_preserve_materialized_recurrence();
CREATE TRIGGER trg_fin_cr_preserve_materialized_recurrence BEFORE UPDATE OF recorrente, recorrencia_config ON public.fin_contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.fin_preserve_materialized_recurrence();

CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid, centro_custo_id uuid,
  valor numeric NOT NULL DEFAULT 0, percentual numeric, observacao text,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
-- Corpo do gatilho de produção (só os pais existentes neste schema).
CREATE FUNCTION public.trg_validate_rateio_sum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_lancamento_id uuid; v_company_id uuid; v_lancamento_valor numeric; v_soma_rateios numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN v_lancamento_id := OLD.lancamento_id; v_company_id := OLD.company_id;
  ELSE v_lancamento_id := NEW.lancamento_id; v_company_id := NEW.company_id; END IF;
  SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_pagar WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_receber WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  END IF;
  IF v_lancamento_valor IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado: %', v_lancamento_id USING ERRCODE = 'P0002'; END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_soma_rateios := v_soma_rateios + ABS(NEW.valor);
  END IF;
  IF v_soma_rateios > v_lancamento_valor + 0.01 THEN
    RAISE EXCEPTION 'Soma dos rateios (%) excede o valor do lançamento (%)', v_soma_rateios, v_lancamento_valor USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_rateio_sum BEFORE INSERT OR DELETE OR UPDATE ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_rateio_sum();

CREATE TABLE public.financeiro_fechamento_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data date NOT NULL, faturamento_bruto numeric NOT NULL DEFAULT 0,
  taxas numeric DEFAULT 0, descontos numeric DEFAULT 0, company_id uuid NOT NULL
);
CREATE UNIQUE INDEX idx_fechamento_caixa_company_data ON public.financeiro_fechamento_caixa (company_id, data);

-- Versões anteriores das RPCs de Contas a Pagar (assinatura de produção), para a migration do CMV dropar e recriar.
CREATE FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

\ir ../../migrations/20261003140000_cmv_financeiro.sql
\ir ../../migrations/20261003203219_cmv_financeiro_serie.sql

-- Contas a Receber: corpos de produção (2026-10-10).
CREATE FUNCTION public._guarded_create_conta_receber(p_descricao text, p_cliente text DEFAULT NULL::text, p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date, p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid, p_centro_custo_id uuid DEFAULT NULL::uuid, p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'pix'::text, p_observacoes text DEFAULT NULL::text, p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb, p_supplier_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_company_id uuid; v_user_id uuid; v_id uuid; v_child_id uuid; v_created_at timestamptz;
  v_desc text; v_cliente text; v_obs text; v_rateios jsonb; v_recorrencia jsonb; v_frequency text;
  v_total integer := 1; v_index integer; v_due_date date; v_competence_date date; r record;
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), ''); v_existing record;
  v_replay boolean := false; v_constraint text;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_user_id, ARRAY['financeiro:receber:create', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:create';
  END IF;
  v_desc := public.strip_html(p_descricao); v_cliente := public.strip_html(p_cliente); v_obs := public.strip_html(p_observacoes);
  IF length(btrim(v_desc)) = 0 THEN RAISE EXCEPTION 'Descrição é obrigatória'; END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_conta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;
  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia'; v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;
  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA'; END IF;
    SELECT cr.id, cr.created_at, cr.valor, cr.data_vencimento, cr.parcela_total, cr.descricao, cr.categoria_id, cr.cliente
      INTO v_existing FROM public.fin_contas_receber cr WHERE cr.company_id = v_company_id AND cr.idempotency_key = v_request_key;
    v_replay := FOUND;
  END IF;
  IF NOT v_replay THEN
    BEGIN
      INSERT INTO public.fin_contas_receber (
        descricao, cliente, valor, data_vencimento, data_competencia, categoria_id, centro_custo_id, conta_id, supplier_id,
        forma_pagamento, observacoes, status, created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, idempotency_key
      ) VALUES (
        v_desc, v_cliente, p_valor, p_data_vencimento, p_data_competencia, p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
        p_forma_pagamento, v_obs, 'A_RECEBER', v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
        CASE WHEN v_recorrencia IS NOT NULL THEN 1 END, CASE WHEN v_recorrencia IS NOT NULL THEN v_total END, v_request_key
      ) RETURNING id, created_at INTO v_id, v_created_at;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_request_key IS NULL OR v_constraint IS DISTINCT FROM 'uq_fin_contas_receber_idempotency' THEN RAISE; END IF;
      SELECT cr.id, cr.created_at, cr.valor, cr.data_vencimento, cr.parcela_total, cr.descricao, cr.categoria_id, cr.cliente
        INTO v_existing FROM public.fin_contas_receber cr WHERE cr.company_id = v_company_id AND cr.idempotency_key = v_request_key;
      IF NOT FOUND THEN RAISE; END IF;
      v_replay := true;
    END;
  END IF;
  IF v_replay THEN
    IF round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2) OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
       OR coalesce(v_existing.parcela_total, 1) IS DISTINCT FROM v_total OR v_existing.descricao IS DISTINCT FROM v_desc
       OR v_existing.categoria_id IS DISTINCT FROM p_categoria_id OR v_existing.cliente IS DISTINCT FROM v_cliente THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'created_at', v_existing.created_at,
      'lancamentos_criados', (SELECT count(*) FROM public.fin_contas_receber cr WHERE cr.company_id = v_company_id
        AND (cr.id = v_existing.id OR cr.lancamento_pai_id = v_existing.id)), 'idempotente', true);
  END IF;
  v_rateios := CASE WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios ELSE '[]'::jsonb END;
  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric) LOOP
      INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
      VALUES (v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id);
    END LOOP;
  END IF;
  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15) END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15) END;
      INSERT INTO public.fin_contas_receber (
        descricao, cliente, valor, data_vencimento, data_competencia, categoria_id, centro_custo_id, conta_id, supplier_id,
        forma_pagamento, observacoes, status, created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')', v_cliente, p_valor, v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id, p_forma_pagamento, v_obs, 'A_RECEBER',
        v_user_id, v_company_id, false, NULL, v_index, v_total, v_id
      ) RETURNING id INTO v_child_id;
      INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id)
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id
      FROM public.fin_lancamento_rateios WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES ('contas_receber', v_id, 'criar', jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'cliente', v_cliente,
    'lancamentos_criados', v_total), v_user_id, v_company_id);
  RETURN jsonb_build_object('id', v_id, 'created_at', v_created_at, 'lancamentos_criados', v_total, 'idempotente', false);
END;
$function$;

CREATE FUNCTION public._guarded_update_conta_receber(p_id uuid, p_descricao text, p_cliente text DEFAULT NULL::text,
  p_valor numeric DEFAULT 0, p_data_vencimento date DEFAULT NULL::date, p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid, p_centro_custo_id uuid DEFAULT NULL::uuid, p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb, p_supplier_id uuid DEFAULT NULL::uuid,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_company_id uuid; v_user_id uuid; v_old_data jsonb; v_status text; v_desc text; v_cli text; v_obs text;
  v_updated_at timestamptz; v_rateios jsonb; r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT has_permission('financeiro:receber:edit') THEN RAISE EXCEPTION 'Permission denied: financeiro:receber:edit'; END IF;
  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status), status, updated_at
  INTO v_old_data, v_status, v_updated_at FROM fin_contas_receber WHERE id = p_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF v_status IN ('RECEBIDO', 'CANCELADO') THEN RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;
  v_desc := strip_html(p_descricao); v_cli := strip_html(p_cliente); v_obs := strip_html(p_observacoes);
  UPDATE fin_contas_receber SET
    descricao = v_desc, cliente = v_cli, valor = p_valor, data_vencimento = p_data_vencimento,
    data_competencia = p_data_competencia, categoria_id = p_categoria_id, centro_custo_id = p_centro_custo_id,
    conta_id = p_conta_id, supplier_id = p_supplier_id, forma_pagamento = p_forma_pagamento, observacoes = v_obs,
    recorrente = COALESCE((p_recorrencia IS NOT NULL), false), recorrencia_config = p_recorrencia, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;
  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  v_rateios := CASE WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios ELSE '[]'::jsonb END;
  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric) LOOP
      INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
      VALUES (p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id);
    END LOOP;
  END IF;
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_receber', p_id, 'editar', v_old_data, jsonb_build_object('descricao', v_desc, 'valor', p_valor), v_user_id, v_company_id);
  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$function$;

\ir ../../migrations/20261010170000_financeiro_edicao_serie.sql

-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.serie_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF; END; $$;

CREATE FUNCTION public.serie_expect_error(p_sql text, p_like text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % — erro inesperado: %', p_msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % — era esperado erro %', p_msg, p_like;
END; $$;

-- Parcela n da série de Contas a Pagar criada com `p_pai`.
CREATE FUNCTION public.serie_cp(p_pai uuid, p_n integer) RETURNS public.fin_contas_pagar LANGUAGE sql AS $$
  SELECT cp.* FROM public.fin_contas_pagar cp
  WHERE (cp.id = p_pai OR cp.lancamento_pai_id = p_pai) AND cp.parcela_atual = p_n
$$;

-- Rateio de um título como texto estável: "categoria:valor:cmv;…".
CREATE FUNCTION public.serie_rateio(p_titulo uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(c.nome || ':' || r.valor::text || ':' || COALESCE(r.cmv_incluir::text, 'null'), ';' ORDER BY c.nome), '')
  FROM public.fin_lancamento_rateios r JOIN public.fin_categorias c ON c.id = r.categoria_id
  WHERE r.lancamento_id = p_titulo
$$;

CREATE FUNCTION public.run_financeiro_edicao_serie_ephemeral_tests() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
  U constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  c_aluguel constant uuid := 'c0000000-0000-4000-8000-000000000001';
  c_agua constant uuid := 'c0000000-0000-4000-8000-000000000002';
  c_luz constant uuid := 'c0000000-0000-4000-8000-000000000003';
  c_receita constant uuid := 'c0000000-0000-4000-8000-000000000004';
  c_b constant uuid := 'c0000000-0000-4000-8000-000000000005';
  k_a constant uuid := 'd0000000-0000-4000-8000-000000000001';
  k_a2 constant uuid := 'd0000000-0000-4000-8000-000000000002';
  v_pai uuid; v_pai_b uuid; v_pai_sem uuid; v_pai_cr uuid; v_avulso uuid;
  v_p1 public.fin_contas_pagar; v_p2 public.fin_contas_pagar; v_p3 public.fin_contas_pagar;
  v_p4 public.fin_contas_pagar; v_p5 public.fin_contas_pagar;
  v_r1 public.fin_contas_receber; v_r2 public.fin_contas_receber; v_r3 public.fin_contas_receber;
  v_res jsonb; v_criado timestamptz; v_stale timestamptz; v_logs integer;
  v_cfg constant jsonb := '{"frequencia":"mensal","parcelas":5,"parcelas_geradas":0}';
BEGIN
  INSERT INTO public.companies VALUES (A, 'Empresa A'), (B, 'Empresa B');
  INSERT INTO public.fin_categorias (id, nome, tipo, company_id) VALUES
    (c_aluguel, 'Aluguel', 'despesa', A), (c_agua, 'Agua', 'despesa', A), (c_luz, 'Luz', 'despesa', A),
    (c_receita, 'Mensalidade', 'receita', A), (c_b, 'Aluguel B', 'despesa', B);
  INSERT INTO public.fin_contas VALUES (k_a, 'Banco A', A), (k_a2, 'Caixa A', A);
  -- A exige a decisão do CMV nos boletos (caminho mais estrito das RPCs).
  INSERT INTO public.fin_config (company_id, key, value) VALUES (A, 'cmv_financeiro_ativo', 'true');

  PERFORM set_config('test.user_id', U::text, true);
  PERFORM set_config('test.permissions',
    'financeiro:pagar:create,financeiro:pagar:edit,financeiro:receber:create,financeiro:receber:edit', true);

  -- ── Fixtures ──────────────────────────────────────────────────────────────
  -- Série de A: 5 parcelas mensais a partir de 31/01 (fevereiro cai no dia 28).
  PERFORM set_config('test.company_id', A::text, true);
  v_pai := (public._guarded_create_conta_pagar('Aluguel', 100, p_fornecedor => 'Imobiliária',
    p_data_vencimento => '2031-01-31', p_data_competencia => '2031-01-31', p_categoria_id => c_aluguel,
    p_conta_id => k_a, p_recorrencia => v_cfg, p_cmv => '{"incluir": false}')->>'id')::uuid;
  v_criado := (SELECT created_at FROM public.fin_contas_pagar WHERE id = v_pai);

  -- Série de B com o MESMO created_at, autor e tamanho: o filtro de empresa é o que a separa.
  PERFORM set_config('test.company_id', B::text, true);
  v_pai_b := (public._guarded_create_conta_pagar('Aluguel B', 100, p_data_vencimento => '2031-01-31',
    p_data_competencia => '2031-01-31', p_categoria_id => c_b, p_recorrencia => v_cfg)->>'id')::uuid;
  PERFORM set_config('test.company_id', A::text, true);

  -- Série órfã (1ª parcela excluída, vínculo zerado, como em produção), semanal, outro created_at.
  v_pai_sem := (public._guarded_create_conta_pagar('Internet', 50, p_data_vencimento => '2031-01-06',
    p_data_competencia => '2031-01-06', p_categoria_id => c_luz,
    p_recorrencia => '{"frequencia":"semanal","parcelas":4,"parcelas_geradas":0}', p_cmv => '{"incluir": false}')->>'id')::uuid;
  UPDATE public.fin_contas_pagar SET created_at = v_criado - interval '1 hour'
  WHERE id = v_pai_sem OR lancamento_pai_id = v_pai_sem;

  -- Avulso (sem série).
  v_avulso := (public._guarded_create_conta_pagar('Avulso', 10, p_data_vencimento => '2031-01-10',
    p_categoria_id => c_aluguel, p_cmv => '{"incluir": false}')->>'id')::uuid;
  UPDATE public.fin_contas_pagar SET created_at = v_criado - interval '2 hours' WHERE id = v_avulso;

  -- Parcela 3 já paga, parcela 4 com código de pagamento, parcela 5 com valor ajustado individualmente.
  UPDATE public.fin_contas_pagar SET status = 'PAGO', data_pagamento = '2031-03-31' WHERE id = (public.serie_cp(v_pai, 3)).id;
  UPDATE public.fin_contas_pagar SET tipo_codigo_pagamento = 'pix_chave', codigo_pagamento = 'chave-p4'
  WHERE id = (public.serie_cp(v_pai, 4)).id;
  UPDATE public.fin_contas_pagar SET valor = 120 WHERE id = (public.serie_cp(v_pai, 5)).id;

  PERFORM public.serie_assert((SELECT count(*) FROM public.fin_contas_pagar WHERE created_at = v_criado) = 10,
    'fixture: as séries de A e B nasceram com o mesmo created_at');

  -- ── 1. Parcela 2: descrição, vencimento e rateio novo com CMV → próximas em aberto ──
  v_p2 := public.serie_cp(v_pai, 2);
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p2.id, p_descricao => 'Aluguel sala (2/5)', p_valor => 100, p_fornecedor => 'Imobiliária',
    p_data_vencimento => '2031-03-05', p_data_competencia => v_p2.data_competencia, p_categoria_id => c_aluguel,
    p_conta_id => k_a, p_forma_pagamento => 'boleto', p_observacoes => NULL,
    p_rateios => jsonb_build_array(
      jsonb_build_object('id', NULL, 'categoria_id', c_agua, 'centro_custo_id', NULL, 'valor', 60, 'percentual', 60, 'cmv_incluir', true),
      jsonb_build_object('id', NULL, 'categoria_id', c_luz, 'centro_custo_id', NULL, 'valor', 40, 'percentual', 40, 'cmv_incluir', false)),
    p_recorrencia => NULL, p_expected_updated_at => v_p2.updated_at,
    p_dados_pagamento => '{"tipo": null, "codigo": null}', p_cmv => '{"incluir": null}');

  PERFORM public.serie_assert((v_res->>'parcelas_atualizadas')::int = 2 AND (v_res->>'parcelas_ignoradas')::int = 1,
    format('1: 2 atualizadas (4 e 5) e 1 ignorada (3, paga) — veio %s', v_res));
  PERFORM public.serie_assert(v_res->'campos' @> '["descricao","data_vencimento","classificacao"]'
    AND NOT v_res->'campos' @> '["valor"]' AND NOT v_res->'campos' @> '["data_competencia"]',
    format('1: campos alterados — veio %s', v_res->'campos'));

  v_p1 := public.serie_cp(v_pai, 1); v_p2 := public.serie_cp(v_pai, 2); v_p3 := public.serie_cp(v_pai, 3);
  v_p4 := public.serie_cp(v_pai, 4); v_p5 := public.serie_cp(v_pai, 5);
  PERFORM public.serie_assert(v_p1.descricao = 'Aluguel' AND v_p1.data_vencimento = '2031-01-31'
    AND public.serie_rateio(v_p1.id) = '' AND v_p1.cmv_incluir IS FALSE, '1: parcela anterior não muda');
  PERFORM public.serie_assert(v_p3.descricao = 'Aluguel (3/5)' AND v_p3.data_vencimento = '2031-03-31'
    AND public.serie_rateio(v_p3.id) = '' AND v_p3.status = 'PAGO', '1: parcela paga não muda');
  PERFORM public.serie_assert(v_p4.descricao = 'Aluguel sala (4/5)', format('1: sufixo da parcela 4 — veio %s', v_p4.descricao));
  PERFORM public.serie_assert(v_p5.descricao = 'Aluguel sala (5/5)', '1: sufixo da parcela 5');
  PERFORM public.serie_assert(v_p4.data_vencimento = '2031-05-05' AND v_p5.data_vencimento = '2031-06-05',
    format('1: vencimentos mês a mês a partir de 05/03 — vieram %s e %s', v_p4.data_vencimento, v_p5.data_vencimento));
  PERFORM public.serie_assert(v_p4.data_competencia = '2031-04-30' AND v_p5.data_competencia = '2031-05-31',
    '1: competência não alterada fica como estava em cada parcela');
  PERFORM public.serie_assert(v_p4.valor = 100 AND v_p5.valor = 120, '1: valor não alterado preserva o ajuste individual');
  PERFORM public.serie_assert(public.serie_rateio(v_p4.id) = 'Agua:60:true;Luz:40:false',
    format('1: rateio copiado na parcela 4 — veio %s', public.serie_rateio(v_p4.id)));
  PERFORM public.serie_assert(public.serie_rateio(v_p5.id) = 'Agua:72.00:true;Luz:48.00:false',
    format('1: rateio escalado para o valor da parcela 5 — veio %s', public.serie_rateio(v_p5.id)));
  PERFORM public.serie_assert(v_p4.cmv_incluir IS NULL AND v_p5.cmv_incluir IS NULL, '1: com rateio a decisão é das linhas');
  PERFORM public.serie_assert(v_p4.tipo_codigo_pagamento = 'pix_chave' AND v_p4.codigo_pagamento = 'chave-p4',
    '1: código de pagamento da parcela 4 preservado');
  PERFORM public.serie_assert(v_p4.status = 'APROVADO' AND v_p5.status = 'APROVADO', '1: status de aprovação recalculado como na edição avulsa');
  PERFORM public.serie_assert((SELECT count(*) FROM public.fin_contas_pagar
      WHERE company_id = B AND (descricao LIKE 'Aluguel sala%' OR data_vencimento = '2031-05-05')) = 0,
    '1: série de outra empresa com o mesmo created_at não é tocada');
  SELECT count(*) INTO v_logs FROM public.fin_audit_logs
  WHERE acao = 'editar' AND entidade = 'contas_pagar' AND entidade_id IN (v_p2.id, v_p4.id, v_p5.id);
  PERFORM public.serie_assert(v_logs = 3, format('1: log "editar" em cada parcela alterada — %s', v_logs));
  PERFORM public.serie_assert(EXISTS (SELECT 1 FROM public.fin_audit_logs WHERE acao = 'editar_serie'
      AND entidade_id = v_p2.id AND (depois->>'parcelas_ignoradas')::int = 1
      AND depois->'parcelas_atualizadas' @> to_jsonb(ARRAY[v_p4.id, v_p5.id])), '1: log resumo "editar_serie"');
  -- O "antes" de cada parcela alterada fica no log, sem o código de pagamento: dá para desfazer o lote.
  PERFORM public.serie_assert((SELECT jsonb_array_length(antes->'parcelas') FROM public.fin_audit_logs
      WHERE acao = 'editar_serie' AND entidade_id = v_p2.id) = 3, '1: retrato da editada e das 2 próximas');
  PERFORM public.serie_assert(EXISTS (SELECT 1 FROM public.fin_audit_logs l, jsonb_array_elements(l.antes->'parcelas') x
      WHERE l.acao = 'editar_serie' AND l.entidade_id = v_p2.id AND x->>'id' = v_p4.id::text
        AND x->>'data_vencimento' = '2031-04-30' AND x->>'descricao' = 'Aluguel (4/5)'
        AND (x->>'possui_codigo_pagamento')::boolean AND NOT x ? 'codigo_pagamento'
        AND x->'rateios' = '[]'::jsonb), '1: retrato da parcela 4 com os dados antigos e sem o código');
  PERFORM public.serie_assert(EXISTS (SELECT 1 FROM public.fin_audit_logs l, jsonb_array_elements(l.antes->'parcelas') x
      WHERE l.acao = 'editar_serie' AND l.entidade_id = v_p2.id AND x->>'id' = v_p2.id::text
        AND x->>'data_vencimento' = '2031-02-28'), '1: retrato da própria parcela editada');

  -- ── 2. Parcela 1 (a com a recorrência): só o valor → próximas ganham o valor, o resto fica ──
  v_p1 := public.serie_cp(v_pai, 1);
  v_stale := (public.serie_cp(v_pai, 2)).updated_at;
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p1.id, p_descricao => 'Aluguel', p_valor => 110, p_fornecedor => 'Imobiliária',
    p_data_vencimento => '2031-01-31', p_data_competencia => '2031-01-31', p_categoria_id => c_aluguel,
    p_conta_id => k_a, p_forma_pagamento => 'boleto', p_observacoes => NULL, p_rateios => '[]',
    p_recorrencia => v_cfg, p_expected_updated_at => v_p1.updated_at,
    p_dados_pagamento => '{"tipo": null, "codigo": null}', p_cmv => '{"incluir": false}');
  PERFORM public.serie_assert(v_res->'campos' = '["valor"]' AND (v_res->>'parcelas_atualizadas')::int = 3,
    format('2: só o valor, 3 parcelas (2, 4 e 5) — veio %s', v_res));
  v_p1 := public.serie_cp(v_pai, 1); v_p2 := public.serie_cp(v_pai, 2); v_p4 := public.serie_cp(v_pai, 4); v_p5 := public.serie_cp(v_pai, 5);
  PERFORM public.serie_assert(v_p1.recorrente AND (v_p1.recorrencia_config->>'materializada')::boolean,
    '2: a 1ª parcela continua com a recorrência materializada');
  PERFORM public.serie_assert(v_p2.valor = 110 AND v_p4.valor = 110 AND v_p5.valor = 110, '2: valor novo nas próximas');
  PERFORM public.serie_assert(public.serie_rateio(v_p2.id) = 'Agua:66.00:true;Luz:44.00:false'
    AND public.serie_rateio(v_p5.id) = 'Agua:66.00:true;Luz:44.00:false',
    format('2: rateio próprio escalado, não substituído pelo da 1ª — veio %s', public.serie_rateio(v_p2.id)));
  PERFORM public.serie_assert(v_p2.descricao = 'Aluguel sala (2/5)' AND v_p2.data_vencimento = '2031-03-05'
    AND v_p5.data_vencimento = '2031-06-05', '2: descrição e vencimento não alterados ficam como estavam');
  PERFORM public.serie_assert((public.serie_cp(v_pai, 3)).valor = 100, '2: parcela paga continua com o valor antigo');

  -- ── 3. Lock otimista: versão velha da parcela 2 é recusada e nada muda ──
  PERFORM public.serie_expect_error(format(
    $q$SELECT public._guarded_update_conta_pagar_serie(p_id => %L, p_descricao => 'X (2/5)', p_valor => 999,
       p_data_vencimento => '2031-02-28', p_expected_updated_at => %L, p_cmv => '{"incluir": false}')$q$,
    v_p2.id, v_stale), '%alterado por outro usuário%', '3: lock otimista');
  PERFORM public.serie_assert((public.serie_cp(v_pai, 4)).valor = 110, '3: erro desfaz a série inteira');

  -- ── 4. Sem nada alterado: só a editada é regravada ──
  v_p4 := public.serie_cp(v_pai, 4);
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p4.id, p_descricao => v_p4.descricao, p_valor => v_p4.valor, p_fornecedor => v_p4.fornecedor,
    p_data_vencimento => v_p4.data_vencimento, p_data_competencia => v_p4.data_competencia,
    p_categoria_id => v_p4.categoria_id, p_conta_id => v_p4.conta_id, p_forma_pagamento => v_p4.forma_pagamento,
    p_observacoes => NULL,
    p_rateios => public._fin_serie_rateios(A, v_p4.id, v_p4.id, v_p4.valor),
    p_expected_updated_at => v_p4.updated_at, p_cmv => '{"incluir": null}');
  PERFORM public.serie_assert(v_res->'campos' = '[]' AND (v_res->>'parcelas_atualizadas')::int = 0,
    format('4: nada mudou, nenhuma próxima regravada — veio %s', v_res));
  PERFORM public.serie_assert((public.serie_cp(v_pai, 4)).codigo_pagamento = 'chave-p4', '4: código preservado com p_dados_pagamento nulo');

  -- ── 4b. Forma vazia que o formulário abre como 'boleto' não vai para as próximas; troca de verdade vai ──
  UPDATE public.fin_contas_pagar SET forma_pagamento = NULL
  WHERE id IN ((public.serie_cp(v_pai, 4)).id, (public.serie_cp(v_pai, 5)).id);
  v_p4 := public.serie_cp(v_pai, 4);
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p4.id, p_descricao => v_p4.descricao, p_valor => v_p4.valor, p_fornecedor => v_p4.fornecedor,
    p_data_vencimento => v_p4.data_vencimento, p_data_competencia => v_p4.data_competencia,
    p_categoria_id => v_p4.categoria_id, p_conta_id => v_p4.conta_id, p_forma_pagamento => 'boleto',
    p_observacoes => NULL,
    p_rateios => public._fin_serie_rateios(A, v_p4.id, v_p4.id, v_p4.valor),
    p_expected_updated_at => v_p4.updated_at, p_cmv => '{"incluir": null}');
  PERFORM public.serie_assert(v_res->'campos' = '[]' AND (v_res->>'parcelas_atualizadas')::int = 0
    AND (public.serie_cp(v_pai, 5)).forma_pagamento IS NULL,
    format('4b: forma padrão do formulário não é alteração — veio %s', v_res));
  v_p4 := public.serie_cp(v_pai, 4);
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p4.id, p_descricao => v_p4.descricao, p_valor => v_p4.valor, p_fornecedor => v_p4.fornecedor,
    p_data_vencimento => v_p4.data_vencimento, p_data_competencia => v_p4.data_competencia,
    p_categoria_id => v_p4.categoria_id, p_conta_id => v_p4.conta_id, p_forma_pagamento => 'pix',
    p_observacoes => NULL,
    p_rateios => public._fin_serie_rateios(A, v_p4.id, v_p4.id, v_p4.valor),
    p_expected_updated_at => v_p4.updated_at, p_cmv => '{"incluir": null}');
  PERFORM public.serie_assert(v_res->'campos' = '["forma_pagamento"]' AND (v_res->>'parcelas_atualizadas')::int = 1
    AND (public.serie_cp(v_pai, 5)).forma_pagamento = 'pix',
    format('4b: forma trocada de verdade vai para as próximas — veio %s', v_res));

  -- ── 5. Série órfã semanal: frequência deduzida das datas ──
  DELETE FROM public.fin_contas_pagar WHERE id = v_pai_sem;
  DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = v_pai_sem;
  UPDATE public.fin_contas_pagar SET lancamento_pai_id = NULL WHERE lancamento_pai_id = v_pai_sem;
  SELECT * INTO v_p2 FROM public.fin_contas_pagar WHERE descricao = 'Internet (2/4)';
  v_res := public._guarded_update_conta_pagar_serie(
    p_id => v_p2.id, p_descricao => v_p2.descricao, p_valor => 50, p_data_vencimento => '2031-01-14',
    p_data_competencia => v_p2.data_competencia, p_categoria_id => c_luz, p_conta_id => NULL,
    p_forma_pagamento => v_p2.forma_pagamento, p_expected_updated_at => v_p2.updated_at, p_cmv => '{"incluir": false}');
  PERFORM public.serie_assert((v_res->>'parcelas_atualizadas')::int = 2, format('5: série órfã achada pelo created_at — veio %s', v_res));
  PERFORM public.serie_assert(
    (SELECT data_vencimento FROM public.fin_contas_pagar WHERE descricao = 'Internet (3/4)') = '2031-01-21'
    AND (SELECT data_vencimento FROM public.fin_contas_pagar WHERE descricao = 'Internet (4/4)') = '2031-01-28',
    '5: semanal deduzida: +7 dias por parcela a partir da nova data');

  -- ── 6. Recusas ──
  PERFORM public.serie_expect_error(format(
    $q$SELECT public._guarded_update_conta_pagar_serie(p_id => %L, p_descricao => 'Aluguel sala (5/5)', p_valor => 110,
       p_data_vencimento => '2031-06-05', p_cmv => '{"incluir": false}')$q$, (public.serie_cp(v_pai, 5)).id),
    'SERIE_INVALIDA%', '6: última parcela não tem próximas');
  PERFORM public.serie_expect_error(format(
    $q$SELECT public._guarded_update_conta_pagar_serie(p_id => %L, p_descricao => 'Avulso', p_valor => 10,
       p_data_vencimento => '2031-01-10', p_cmv => '{"incluir": false}')$q$, v_avulso),
    'SERIE_INVALIDA%', '6: título avulso');
  PERFORM set_config('test.company_id', B::text, true);
  PERFORM public.serie_expect_error(format(
    $q$SELECT public._guarded_update_conta_pagar_serie(p_id => %L, p_descricao => 'Invasão (2/5)', p_valor => 1,
       p_data_vencimento => '2031-02-28')$q$, (public.serie_cp(v_pai, 2)).id),
    'Registro não encontrado%', '6: parcela de outra empresa');
  PERFORM set_config('test.company_id', A::text, true);
  PERFORM set_config('test.permissions', 'financeiro:pagar:view', true);
  PERFORM public.serie_expect_error(format(
    $q$SELECT public._guarded_update_conta_pagar_serie(p_id => %L, p_descricao => 'Aluguel sala (2/5)', p_valor => 1,
       p_data_vencimento => '2031-03-05')$q$, (public.serie_cp(v_pai, 2)).id),
    'Permission denied: financeiro:pagar:edit%', '6: sem permissão de editar');
  PERFORM set_config('test.permissions',
    'financeiro:pagar:create,financeiro:pagar:edit,financeiro:receber:create,financeiro:receber:edit', true);
  PERFORM public.serie_assert((SELECT count(*) FROM public.fin_contas_pagar WHERE company_id = B AND valor <> 100) = 0,
    '6: nada de B mudou');

  -- ── 7. Contas a Receber: parcela 1 muda valor, cliente e vencimento; a recebida fica ──
  v_pai_cr := (public._guarded_create_conta_receber('Mensalidade', 'Cliente X', 200,
    p_data_vencimento => '2031-01-10', p_data_competencia => '2031-01-10', p_categoria_id => c_receita,
    p_recorrencia => '{"frequencia":"mensal","parcelas":3,"parcelas_geradas":0}')->>'id')::uuid;
  UPDATE public.fin_contas_receber SET created_at = v_criado - interval '3 hours'
  WHERE id = v_pai_cr OR lancamento_pai_id = v_pai_cr;
  UPDATE public.fin_contas_receber SET status = 'RECEBIDO' WHERE lancamento_pai_id = v_pai_cr AND parcela_atual = 2;
  SELECT * INTO v_r1 FROM public.fin_contas_receber WHERE id = v_pai_cr;
  v_res := public._guarded_update_conta_receber_serie(
    p_id => v_r1.id, p_descricao => 'Mensalidade', p_cliente => 'Cliente Y', p_valor => 250,
    p_data_vencimento => '2031-01-15', p_data_competencia => '2031-01-10', p_categoria_id => c_receita,
    p_forma_pagamento => 'pix', p_rateios => '[]',
    p_recorrencia => '{"frequencia":"mensal","parcelas":3,"parcelas_geradas":0}', p_expected_updated_at => v_r1.updated_at);
  PERFORM public.serie_assert((v_res->>'parcelas_atualizadas')::int = 1 AND (v_res->>'parcelas_ignoradas')::int = 1,
    format('7: CR atualiza a 3 e ignora a 2 (recebida) — veio %s', v_res));
  SELECT * INTO v_r2 FROM public.fin_contas_receber WHERE lancamento_pai_id = v_pai_cr AND parcela_atual = 2;
  SELECT * INTO v_r3 FROM public.fin_contas_receber WHERE lancamento_pai_id = v_pai_cr AND parcela_atual = 3;
  PERFORM public.serie_assert(v_r2.valor = 200 AND v_r2.cliente = 'Cliente X' AND v_r2.data_vencimento = '2031-02-10',
    '7: parcela recebida não muda');
  PERFORM public.serie_assert(v_r3.valor = 250 AND v_r3.cliente = 'Cliente Y' AND v_r3.data_vencimento = '2031-03-15'
    AND v_r3.data_competencia = '2031-03-10' AND v_r3.descricao = 'Mensalidade (3/3)',
    format('7: parcela 3 com valor, cliente e vencimento novos — veio %s / %s', v_r3.valor, v_r3.data_vencimento));

  -- ── 8. Grants: só a RPC é chamável pelo cliente; os helpers não ──
  PERFORM public.serie_assert(has_function_privilege('authenticated',
    'public._guarded_update_conta_pagar_serie(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated',
    'public._guarded_update_conta_receber_serie(uuid,text,text,numeric,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,timestamptz)', 'EXECUTE'),
    '8: authenticated executa as RPCs');
  PERFORM public.serie_assert(NOT has_function_privilege('anon',
    'public._guarded_update_conta_pagar_serie(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb,jsonb)', 'EXECUTE'),
    '8: anon não executa');
  PERFORM public.serie_assert(NOT has_function_privilege('authenticated', 'public._fin_serie_rateios(uuid,uuid,uuid,numeric)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public._fin_serie_classificacao(uuid,uuid,uuid,uuid,boolean,numeric)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public._fin_serie_data(date,integer,text,date,integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public._fin_serie_retrato(uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public._fin_serie_retrato(uuid,jsonb)', 'EXECUTE'),
    '8: helpers internos fora do alcance do cliente');

  RETURN 'financeiro_edicao_serie_ephemeral: OK';
END;
$$;

SELECT public.run_financeiro_edicao_serie_ephemeral_tests();
