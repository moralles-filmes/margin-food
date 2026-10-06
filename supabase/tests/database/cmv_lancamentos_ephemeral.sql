\set ON_ERROR_STOP on

-- CMV Financeiro com despesas de Lançamentos e da Conciliação: teste de integração
-- em PostgreSQL real e DESCARTÁVEL. Aplica as migrations do CMV sobre um schema
-- mínimo. São simulados apenas: auth.uid(), assert_tenant() (lê test.company_id),
-- has_permission/has_any_permission (leem test.permissions), strip_html,
-- immutable_unaccent (sem a extensão unaccent), fin_get_limite_aprovacao e
-- fin_validate_recorrencia_config. Os gatilhos de soma do rateio e de edição de
-- lançamento realizado têm o corpo de produção (2026-10-05).
-- Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql

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
CREATE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT $1 $$;
CREATE FUNCTION public.fin_get_limite_aprovacao(p_company_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 2500::numeric $$;
CREATE FUNCTION public.fin_validate_recorrencia_config(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT p $$;

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
CREATE TABLE public.fin_centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL
);
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
CREATE TABLE public.fin_contas_receber (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), valor numeric NOT NULL DEFAULT 0, company_id uuid NOT NULL);
-- Colunas de produção (information_schema, 2026-10-05), sem as que nenhuma função toca.
CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'DESPESA',
  valor numeric NOT NULL DEFAULT 0 CHECK (valor > 0),
  data_competencia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  data_pagamento date, data_vencimento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, conta_destino_id uuid,
  forma_pagamento text DEFAULT 'pix', status text NOT NULL DEFAULT 'PREVISTO',
  descricao text DEFAULT '', observacoes text DEFAULT '', justificativa_edicao text DEFAULT '',
  recorrente boolean NOT NULL DEFAULT false, recorrencia_config jsonb DEFAULT '{}'::jsonb,
  parcela_atual integer, parcela_total integer, lancamento_pai_id uuid,
  referencia_modulo text DEFAULT '', referencia_id text DEFAULT '',
  conciliado boolean DEFAULT false, conciliado_em timestamptz, conciliado_por uuid,
  origem text NOT NULL DEFAULT 'manual', idempotency_key text,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false,
  created_by uuid, company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fin_lancamentos_company_idempotency ON public.fin_lancamentos (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid, centro_custo_id uuid,
  valor numeric NOT NULL DEFAULT 0, percentual numeric, observacao text,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_conciliacao_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, conta_id uuid NOT NULL,
  external_id text NOT NULL, tipo text NOT NULL, lancamento_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE TABLE public.financeiro_fechamento_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data date NOT NULL, faturamento_bruto numeric NOT NULL DEFAULT 0,
  taxas numeric DEFAULT 0, descontos numeric DEFAULT 0, company_id uuid NOT NULL
);
CREATE UNIQUE INDEX idx_fechamento_caixa_company_data ON public.financeiro_fechamento_caixa (company_id, data);

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER trg_updated_at_fin_contas_pagar BEFORE UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_updated_at_fin_lancamentos BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Corpo de produção (2026-10-05): edição de lançamento REALIZADO exige justificativa.
CREATE FUNCTION public.trg_validate_fin_lancamento_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF OLD.status = 'REALIZADO' THEN
    IF (
      NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
      OR NEW.conta_id IS DISTINCT FROM OLD.conta_id
      OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
      OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
    ) THEN
      IF NEW.justificativa_edicao IS NULL OR TRIM(NEW.justificativa_edicao) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória ao editar lançamento realizado (campos: valor, categoria, conta, data, centro de custo)'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_fin_lancamento_update BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_fin_lancamento_update();

-- Corpo de produção (2026-10-05): o pai do rateio pode ser lançamento, boleto ou conta a receber.
CREATE FUNCTION public.trg_validate_rateio_sum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_lancamento_id uuid; v_company_id uuid; v_lancamento_valor numeric; v_soma_rateios numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN v_lancamento_id := OLD.lancamento_id; v_company_id := OLD.company_id;
  ELSE v_lancamento_id := NEW.lancamento_id; v_company_id := NEW.company_id; END IF;
  SELECT ABS(valor) INTO v_lancamento_valor FROM fin_lancamentos WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_pagar WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  END IF;
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

-- Representa o trg_saldo_cache_lancamento de produção, que roda refresh_saldo_cache a CADA UPDATE de
-- fin_lancamentos: aqui só registra o UPDATE, para provar quantos refreshes uma classificação custa.
CREATE TABLE public.cmv_update_log (lancamento_id uuid NOT NULL);
CREATE FUNCTION public.cmv_log_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public.cmv_update_log VALUES (NEW.id); RETURN NULL; END; $$;
CREATE TRIGGER trg_cmv_log_update AFTER UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.cmv_log_update();

-- Versões anteriores das RPCs (assinatura de produção), para as migrations dropparem e recriarem.
CREATE FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_upsert_lancamento(uuid,text,text,numeric,uuid,uuid,uuid,date,date,date,text,text,text,text,boolean,jsonb,jsonb,timestamptz,text,text)
RETURNS TABLE(id uuid, updated_at timestamptz, idempotente boolean) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::timestamptz, false $$;
CREATE FUNCTION public._guarded_update_reconciled_classification(uuid,uuid,uuid,text,jsonb,timestamptz,text)
RETURNS TABLE(id uuid, updated_at timestamptz) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::timestamptz $$;

\ir ../../migrations/20261003140000_cmv_financeiro.sql
\ir ../../migrations/20261003203219_cmv_financeiro_serie.sql
\ir ../../migrations/20261005120000_cmv_financeiro_lancamentos.sql
-- A migration é aplicada no SQL Editor e pode ser executada de novo: uma segunda aplicação, no mesmo
-- banco, precisa passar sem erro e sem mudar nada (CREATE OR REPLACE, IF EXISTS, comentários e grants).
\ir ../../migrations/20261005120000_cmv_financeiro_lancamentos.sql

-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.cmv_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF; END; $$;

CREATE FUNCTION public.cmv_expect_error(p_sql text, p_like text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % — erro inesperado: %', p_msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % — era esperado erro %', p_msg, p_like;
END; $$;

-- Soma do CMV (centavos) do payload num intervalo.
CREATE FUNCTION public.cmv_total(p jsonb, p_ini date, p_fim date) RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE(sum((x->>'centavos')::bigint), 0)::bigint FROM jsonb_array_elements(p->'cmv') x
  WHERE (x->>'data')::date BETWEEN p_ini AND p_fim
$$;

CREATE FUNCTION public.run_cmv_lancamentos_ephemeral_tests() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
  U constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  c_peixes constant uuid := 'c0000000-0000-4000-8000-000000000001'; -- padrão Sim
  c_escr constant uuid := 'c0000000-0000-4000-8000-000000000002';   -- padrão Não
  c_sem constant uuid := 'c0000000-0000-4000-8000-000000000003';    -- sem padrão
  c_rec constant uuid := 'c0000000-0000-4000-8000-000000000004';    -- receita
  c_b constant uuid := 'c0000000-0000-4000-8000-0000000000b1';      -- unidade B
  k_a constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  k_b constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  TUDO constant text := 'financeiro:cmv:view,financeiro:cmv:manage,financeiro:pagar:create,financeiro:pagar:edit,financeiro:lancamentos:create,financeiro:lancamentos:edit,financeiro:conciliacao:reconcile';
  r jsonb;
  v_manual uuid; v_prev uuid; v_conc uuid; v_rat uuid; v_pend uuid; v_cancel uuid; v_desconc uuid;
  v_espelho uuid; v_ajuste uuid; v_receita uuid; v_bol uuid;
  v_imp uuid; v_rid uuid; v_lr uuid; v_lr2 uuid; v_lr3 uuid; v_sem_pag uuid;
  v_p_peixes uuid; v_p_escr uuid; v_p_sem uuid; v_p_antigo uuid; v_p_decidido uuid; v_p_rat uuid; v_bol_pend uuid;
  v_ids uuid[]; v_criados timestamptz[]; v_n bigint;
  v_valido uuid; v_baixa_legada uuid; v_cp_legado uuid; v_so_origem uuid; v_so_referencia uuid;
  v_bol2 uuid; v_bol_rat uuid; v_p_baixa uuid;
  v_bad text;
BEGIN
  INSERT INTO companies VALUES (A, 'Unidade A'), (B, 'Unidade B');
  INSERT INTO fin_categorias (id, nome, tipo, company_id, cmv_sugerir) VALUES
    (c_peixes, 'Peixes', 'despesa', A, true),
    (c_escr, 'Escritório', 'despesa', A, false),
    (c_sem, 'Sem padrão', 'despesa', A, NULL),
    (c_rec, 'Vendas', 'receita', A, NULL),
    (c_b, 'Peixes B', 'despesa', B, true);
  INSERT INTO fin_contas (id, nome, company_id) VALUES (k_a, 'Banco A', A), (k_b, 'Banco B', B);
  PERFORM set_config('test.user_id', U::text, false);
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM set_config('test.permissions', TUDO, false);

  -- 1. Helpers novos fechados para clientes; config aberta
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_linhas_lancamentos(uuid)', 'EXECUTE'), 'helper de lançamentos fechado');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_linhas_fontes(uuid)', 'EXECUTE'), 'helper de fontes fechado');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_retrato_lancamento(uuid,uuid)', 'EXECUTE'), 'retrato de lançamento fechado');
  PERFORM cmv_assert(has_function_privilege('authenticated', 'public.get_fin_cmv_config()', 'EXECUTE'), 'config aberta a authenticated');

  -- 2. Regra de apuração (semana 07–13/09/2026)
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao, conta_id)
  VALUES ('DESPESA', 100, '2026-09-08', '2026-09-08', 'REALIZADO', 'manual', A, c_peixes, true, 'PIX mercado', k_a) RETURNING id INTO v_manual;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 20, '2026-09-09', 'PREVISTO', 'manual', A, c_peixes, true, 'Compra prevista') RETURNING id INTO v_prev;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, data_vencimento, status, origem, conciliado, company_id, descricao, conta_id)
  VALUES ('DESPESA', 40, '2026-09-10', '2026-09-10', '2026-09-10', 'REALIZADO', 'conciliacao', true, A, 'PIX conciliado', k_a) RETURNING id INTO v_conc;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id, cmv_incluir)
  VALUES (v_conc, c_peixes, 30, A, true), (v_conc, c_escr, 10, A, false);
  -- fora: cancelado, desconciliado, espelho de baixa, encargo da baixa, receita
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 1000, '2026-09-08', '2026-09-08', 'CANCELADO', 'manual', A, c_peixes, true, 'Cancelado') RETURNING id INTO v_cancel;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 2000, '2026-09-08', '2026-09-08', 'REALIZADO', 'conciliacao', false, A, c_peixes, true, 'Desconciliado') RETURNING id INTO v_desconc;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 4000, '2026-09-08', '2026-09-08', 'REALIZADO', 'espelho_cp', 'contas_pagar', A, c_peixes, true, 'Espelho de baixa') RETURNING id INTO v_espelho;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 8000, '2026-09-08', '2026-09-08', 'REALIZADO', 'ajuste_pagamento', 'contas_pagar', A, c_peixes, true, 'Juros da baixa') RETURNING id INTO v_ajuste;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('RECEITA', 16000, '2026-09-08', '2026-09-08', 'REALIZADO', 'manual', A, c_rec, true, 'Venda') RETURNING id INTO v_receita;
  -- rateio manda: cabeçalho Sim, linhas 60 Sim + 40 Não
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 100, '2026-09-11', '2026-09-11', 'REALIZADO', 'manual', A, c_peixes, true, 'Feira rateada') RETURNING id INTO v_rat;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id, cmv_incluir)
  VALUES (v_rat, c_peixes, 60, A, true), (v_rat, c_escr, 40, A, false);
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 7, '2026-09-12', '2026-09-12', 'REALIZADO', 'manual', A, c_sem, 'Pendente') RETURNING id INTO v_pend;
  -- o boleto continua contando como antes
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto peixe', p_valor => 50, p_data_vencimento => '2026-09-20',
    p_data_competencia => '2026-09-09', p_categoria_id => c_peixes, p_cmv => '{"incluir": true}');
  v_bol := (r->>'id')::uuid;

  r := get_fin_cmv_financeiro('2026-09-07', '2026-09-13');
  -- 100 (manual) + 20 (previsto) + 30 (conciliação, só a linha Sim) + 60 (rateio Sim) + 50 (boleto) = R$ 260,00
  PERFORM cmv_assert(cmv_total(r, '2026-09-07', '2026-09-13') = 26000, 'CMV soma boletos e despesas de lançamentos pela regra');
  PERFORM cmv_assert(r->>'contrato' = 'cmv-financeiro/v1', 'contrato continua v1');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'boletos') x) = 1, '"boletos" conta só boletos');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'lancamentos') x) = 4, 'lançamentos com linha Sim: manual, previsto, conciliação, rateado');
  PERFORM cmv_assert((SELECT sum((x->>'centavos')::bigint) FROM jsonb_array_elements(r->'qualidade') x WHERE x->>'situacao' = 'fora') = 5000, 'linhas Não entram na qualidade (10 + 40)');
  PERFORM cmv_assert((r->'pendentes_geral_por_fonte'->'lancamento'->>'titulos')::int = 1
    AND (r->'pendentes_geral_por_fonte'->'lancamento'->>'centavos')::bigint = 700, 'pendência por fonte: lançamento');
  PERFORM cmv_assert((r->'pendentes_geral_por_fonte'->'boleto'->>'titulos')::int = 0, 'nenhum boleto pendente');
  PERFORM cmv_assert((r->'pendentes_geral'->>'titulos')::int = 1, 'pendentes gerais somam as fontes');

  -- 3. Lista de origem
  r := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'incluido');
  PERFORM cmv_assert((r->>'total_titulos')::int = 5, 'lista: 1 boleto + 4 lançamentos');
  PERFORM cmv_assert((r->>'total_centavos')::bigint = 26000, 'lista fecha com o CMV');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'lancamento' AND x->>'lancamento_id' = v_conc::text AND x->>'documento_id' = v_conc::text
      AND x->>'origem' = 'conciliacao' AND x->>'conta_nome' = 'Banco A' AND x->'conta_pagar_id' = 'null'::jsonb
      AND (x->>'serie_boletos')::int = 1
  ), 'item de lançamento identifica fonte, origem e conta');
  -- Spec §8: fornecedor e vencimento não existem para lançamento (nulos, mesmo com vencimento gravado).
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'lancamento' AND x->>'lancamento_id' = v_conc::text
      AND x->'fornecedor' = 'null'::jsonb AND x->'data_vencimento' = 'null'::jsonb
  ), 'item de lançamento devolve fornecedor e data_vencimento nulos');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'boleto' AND x->>'conta_pagar_id' = v_bol::text AND x->'lancamento_id' = 'null'::jsonb
  ), 'item de boleto mantém conta_pagar_id');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'boleto' AND x->>'conta_pagar_id' = v_bol::text
      AND x->>'data_vencimento' = '2026-09-20'
  ), 'item de boleto mantém data_vencimento');
  r := list_fin_cmv_linhas(NULL, NULL, 'pendente');
  PERFORM cmv_assert((r->>'total_titulos')::int = 1 AND (r->'itens'->0->>'lancamento_id')::uuid = v_pend, 'pendência de lançamento aparece na revisão');

  -- 3b. A baixa de um boleto não é despesa à parte, e cada filtro de elegibilidade vale sozinho.
  -- Semana 14–20/09/2026, separada da anterior para não mexer nos totais acima.
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 10, '2026-09-15', '2026-09-15', 'REALIZADO', 'manual', A, c_peixes, true, 'Despesa válida da semana') RETURNING id INTO v_valido;
  -- Fluxo antigo: o título ficou PAGO apontando para o lançamento da conciliação, mas o
  -- carimbo (referencia_modulo/origem) se perdeu. O lançamento fica origem='conciliacao',
  -- conciliado=true, referencia_modulo='' (default) e só o vínculo do título o denuncia.
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, company_id, categoria_id, cmv_incluir, descricao, conta_id)
  VALUES ('DESPESA', 25, '2026-09-16', '2026-09-16', 'REALIZADO', 'conciliacao', true, A, c_peixes, true, 'Baixa de boleto sem carimbo', k_a) RETURNING id INTO v_baixa_legada;
  INSERT INTO fin_contas_pagar (descricao, valor, valor_pago, data_vencimento, data_competencia, data_pagamento, status, company_id, categoria_id, cmv_incluir, lancamento_id)
  VALUES ('Boleto pago do fluxo antigo', 25, 25, '2026-09-16', '2026-09-16', '2026-09-16', 'PAGO', A, c_peixes, true, v_baixa_legada) RETURNING id INTO v_cp_legado;
  -- Cada filtro sozinho: origem de título com referencia_modulo vazio; referência a título com origem comum.
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 400, '2026-09-17', '2026-09-17', 'REALIZADO', 'espelho_cp', '', A, c_peixes, true, 'Espelho sem referência') RETURNING id INTO v_so_origem;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 800, '2026-09-17', '2026-09-17', 'REALIZADO', 'conciliacao', true, 'contas_pagar', A, c_peixes, true, 'Conciliado com referência de título') RETURNING id INTO v_so_referencia;

  r := get_fin_cmv_financeiro('2026-09-14', '2026-09-20');
  -- 10 (despesa válida) + 25 (o boleto, uma só vez) = R$ 35,00; a baixa do boleto, o espelho e o conciliado-com-referência ficam fora
  PERFORM cmv_assert(cmv_total(r, '2026-09-14', '2026-09-20') = 3500, 'boleto e a própria baixa não contam em dobro; cada filtro de elegibilidade exclui sozinho');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'boletos') x) = 1, 'o boleto da baixa antiga continua contando como boleto');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'lancamentos') x) = 1, 'só a despesa válida conta como lançamento');
  PERFORM cmv_assert(NOT EXISTS (
    SELECT 1 FROM public._fin_cmv_linhas_lancamentos(A) l WHERE l.lancamento_id IN (v_baixa_legada, v_so_origem, v_so_referencia)
  ), 'linhas de lançamento excluem a baixa de boleto, o espelho sem referência e o conciliado com referência');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM public._fin_cmv_linhas_lancamentos(A) l WHERE l.lancamento_id = v_valido), 'controle: a despesa válida está nas linhas de lançamento');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM public._fin_cmv_linhas(A) b WHERE b.conta_pagar_id = v_cp_legado), 'o boleto continua nas linhas de boleto');
  r := list_fin_cmv_linhas('2026-09-14', '2026-09-20', 'todos');
  PERFORM cmv_assert((r->>'total_titulos')::int = 2 AND (r->>'total_centavos')::bigint = 3500, 'lista da semana: despesa válida + boleto');
  PERFORM cmv_assert(NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'lancamento_id' IN (v_baixa_legada::text, v_so_origem::text, v_so_referencia::text)
  ), 'lista não traz a baixa de boleto nem os lançamentos de título');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x WHERE x->>'fonte' = 'boleto' AND x->>'conta_pagar_id' = v_cp_legado::text
  ), 'lista traz o boleto da baixa antiga');
  PERFORM cmv_assert((list_fin_cmv_linhas(NULL, NULL, 'pendente')->>'total_titulos')::int = 1, 'nada novo ficou pendente (continua só a pendência de lançamento da seção 2)');

  -- 4. Isolamento entre unidades
  PERFORM set_config('test.company_id', B::text, false);
  r := get_fin_cmv_financeiro('2026-09-07', '2026-09-13');
  PERFORM cmv_assert(cmv_total(r, '2026-09-07', '2026-09-13') = 0, 'B não vê despesas da A');
  PERFORM cmv_assert((list_fin_cmv_linhas(NULL, NULL, 'todos')->>'total_linhas')::int = 0, 'lista de B vazia');
  PERFORM set_config('test.company_id', A::text, false);

  -- 5. Configuração informa o recurso a quem lança e a quem concilia
  PERFORM set_config('test.permissions', 'financeiro:lancamentos:create', false);
  PERFORM cmv_assert((get_fin_cmv_config()->'recursos'->>'lancamentos')::boolean, 'config para quem lança');
  PERFORM set_config('test.permissions', 'financeiro:conciliacao:reconcile', false);
  PERFORM cmv_assert((get_fin_cmv_config()->'recursos'->>'lancamentos')::boolean, 'config para quem concilia');
  PERFORM set_config('test.permissions', TUDO, false);

  -- 6. Escrita direta (PostgREST, papel authenticated) não altera a decisão do lançamento
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.fin_lancamentos SET cmv_incluir = false WHERE id = v_manual;
    RAISE EXCEPTION 'CMV TEST FAILED: UPDATE direto da decisão do lançamento passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.fin_lancamentos (tipo, valor, data_competencia, status, company_id, cmv_incluir)
    VALUES ('DESPESA', 1, '2026-09-08', 'PREVISTO', A, true);
    RAISE EXCEPTION 'CMV TEST FAILED: INSERT direto com decisão passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Escrita que não toca a decisão continua permitida (as telas atuais fazem isso).
  UPDATE public.fin_lancamentos SET observacoes = 'nota' WHERE id = v_manual;
  RESET ROLE;
  PERFORM cmv_assert((SELECT cmv_incluir AND observacoes = 'nota' FROM fin_lancamentos WHERE id = v_manual), 'escrita direta sem a decisão continua permitida');

  -- 7. Conciliação: competência própria e decisão por linha
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100,"cmv_incluir":true}]', c_peixes)::jsonb,
    p_data_competencia => '2026-09-03');
  PERFORM cmv_assert(r->>'status' = 'ok', 'importação ok');
  v_imp := (r->>'lancamento_id')::uuid;
  PERFORM cmv_assert((SELECT data_pagamento = '2026-09-10' AND data_competencia = '2026-09-03' AND origem = 'conciliacao' AND conciliado
    FROM fin_lancamentos WHERE id = v_imp), 'data do banco fica no pagamento; a competência, só na competência');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_imp), 'decisão da linha gravada no rateio');
  r := get_fin_cmv_financeiro('2026-08-31', '2026-09-06');
  PERFORM cmv_assert(cmv_total(r, '2026-08-31', '2026-09-06') = 5500, 'o PIX entra na semana da competência');
  -- reenviar a mesma linha (sem FITID) com outra competência: mesma chave (data do banco)
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100}]', c_peixes)::jsonb,
    p_data_competencia => '2026-09-05');
  PERFORM cmv_assert(r->>'status' = 'duplicate' AND (r->>'lancamento_id')::uuid = v_imp, 'reenvio reconhecido pela data do banco, não pela competência');
  -- mesmo conteúdo com FITID novo e espaçamento diferente: a 2ª camada compara a data do banco
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX  ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100}]', c_peixes)::jsonb,
    p_external_id => 'FIT-NOVO', p_data_competencia => '2026-09-01');
  PERFORM cmv_assert(r->>'status' = 'possible_duplicate', 'possível duplicata pela data do banco');
  -- receita: a decisão enviada é ignorada
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'VENDA', p_valor => 80, p_tipo => 'RECEITA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":80,"percentual":100,"cmv_incluir":true}]', c_rec)::jsonb);
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = (r->>'lancamento_id')::uuid), 'receita nunca recebe decisão do CMV');
  -- cliente antigo (posicional, sem competência nem decisão)
  r := reconcile_import_lancamento('2026-09-11', 'PIX ANTIGO', 12, 'DESPESA', k_a, U,
    format('[{"categoria_id":"%s","valor":12,"percentual":100}]', c_peixes)::jsonb);
  PERFORM cmv_assert((SELECT data_competencia = '2026-09-11' AND data_pagamento = '2026-09-11' FROM fin_lancamentos WHERE id = (r->>'lancamento_id')::uuid),
    'sem competência informada vale a data do banco');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = (r->>'lancamento_id')::uuid), 'cliente antigo deixa pendente');
  PERFORM cmv_expect_error(format($q$SELECT public.reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'T', p_valor => 5, p_tipo => 'TRANSFERENCIA', p_conta_id => '%s', p_user_id => '%s', p_data_competencia => '2026-09-01')$q$, k_a, U),
    'COMPETENCIA_INVALIDA%', 'transferência não aceita competência própria');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = 'reconcile_import_lancamento') = 1, 'uma única assinatura de reconcile_import_lancamento');

  -- 8. Livro Razão: criação e edição com a decisão
  SELECT u.id INTO v_lr FROM _guarded_upsert_lancamento(p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_peixes, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado',
    p_cmv => '{"incluir": true}') u;
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_lr), 'despesa sem rateio guarda a decisão no lançamento');
  SELECT u.id INTO v_lr2 FROM _guarded_upsert_lancamento(p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 100,
    p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Feira', p_cmv => '{}',
    p_rateios => format('[{"categoria_id":"%s","valor":70,"cmv_incluir":true},{"categoria_id":"%s","valor":30,"cmv_incluir":false}]', c_peixes, c_escr)::jsonb) u;
  PERFORM cmv_assert((SELECT count(*) FILTER (WHERE cmv_incluir) = 1 AND count(*) FILTER (WHERE NOT cmv_incluir) = 1
    FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2), 'decisão por linha de rateio');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr2), 'lançamento rateado não tem decisão própria');
  -- receita: nem o cabeçalho nem as linhas recebem decisão (formulário que virou receita)
  SELECT u.id INTO v_lr3 FROM _guarded_upsert_lancamento(p_tipo => 'RECEITA', p_valor => 10, p_descricao => 'Receita',
    p_cmv => '{"incluir": true}',
    p_rateios => format('[{"categoria_id":"%s","valor":10,"cmv_incluir":true}]', c_rec)::jsonb) u;
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr3)
    AND (SELECT bool_and(cmv_incluir IS NULL) FROM fin_lancamento_rateios WHERE lancamento_id = v_lr3), 'receita sem decisão');
  PERFORM cmv_expect_error($q$SELECT * FROM public._guarded_upsert_lancamento(p_descricao => 'x', p_valor => 1, p_cmv => '"sim"')$q$,
    'CMV_INVALIDO%', 'p_cmv malformado');
  -- edição preservando id e created_at das linhas, com nova decisão
  SELECT array_agg(id ORDER BY valor DESC), array_agg(created_at ORDER BY valor DESC) INTO v_ids, v_criados
  FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2;
  PERFORM _guarded_upsert_lancamento(p_id => v_lr2, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 100,
    p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Feira',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr2), p_cmv => '{}',
    p_rateios => format('[{"id":"%s","categoria_id":"%s","valor":70,"cmv_incluir":false},{"id":"%s","categoria_id":"%s","valor":30,"cmv_incluir":false}]',
      v_ids[1], c_peixes, v_ids[2], c_escr)::jsonb);
  PERFORM cmv_assert((SELECT array_agg(id ORDER BY valor DESC) = v_ids AND array_agg(created_at ORDER BY valor DESC) = v_criados
    AND bool_and(cmv_incluir IS FALSE) FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2), 'edição preserva id/created_at e grava a nova decisão');
  -- cliente antigo (sem p_cmv): mesma categoria herda; categoria trocada volta para pendente
  PERFORM _guarded_upsert_lancamento(p_id => v_lr, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_peixes, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado editado',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_lr), 'cliente antigo herda a decisão da mesma categoria');
  PERFORM _guarded_upsert_lancamento(p_id => v_lr, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_escr, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado editado',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr), p_justificativa_edicao => 'troca de categoria');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr), 'categoria trocada sem resposta volta para pendente');
  PERFORM cmv_expect_error(format($q$SELECT * FROM public._guarded_upsert_lancamento(p_id => '%s', p_tipo => 'DESPESA', p_valor => 90, p_descricao => 'x', p_updated_at => '2020-01-01T00:00:00Z', p_cmv => '{}')$q$, v_lr),
    'CONFLICT%', 'lock otimista da edição');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = '_guarded_upsert_lancamento') = 1, 'uma única assinatura do upsert');

  -- 9. Reclassificação de lançamento conciliado: decisão e competência
  v_rid := (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_imp);
  PERFORM _guarded_update_reconciled_classification(p_id => v_imp,
    p_rateios => format('[{"id":"%s","categoria_id":"%s","valor":55,"cmv_incluir":false}]', v_rid, c_peixes)::jsonb,
    p_expected_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_imp),
    p_justificativa_edicao => 'compra da semana anterior', p_cmv => '{}', p_data_competencia => '2026-08-31');
  PERFORM cmv_assert((SELECT data_competencia = '2026-08-31' AND data_pagamento = '2026-09-10' AND conciliado
    FROM fin_lancamentos WHERE id = v_imp), 'reclassificação muda só a competência e mantém a conciliação');
  PERFORM cmv_assert((SELECT id = v_rid AND cmv_incluir IS FALSE FROM fin_lancamento_rateios WHERE lancamento_id = v_imp), 'linha preservada com a nova decisão');
  -- conciliado sem data_pagamento: a competência antiga vira a data do banco
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, conciliado, descricao)
  VALUES ('DESPESA', 33, '2026-09-05', NULL, 'REALIZADO', 'manual', A, c_peixes, true, 'Manual conciliado') RETURNING id INTO v_sem_pag;
  PERFORM _guarded_update_reconciled_classification(p_id => v_sem_pag, p_categoria_id => c_peixes,
    p_expected_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_sem_pag),
    p_justificativa_edicao => 'competência', p_cmv => '{"incluir": true}', p_data_competencia => '2026-09-01');
  PERFORM cmv_assert((SELECT data_competencia = '2026-09-01' AND data_pagamento = '2026-09-05' AND cmv_incluir
    FROM fin_lancamentos WHERE id = v_sem_pag), 'sem data do banco, a competência antiga vira data de pagamento');
  -- cliente antigo (7 parâmetros) preserva decisão e competência
  PERFORM _guarded_update_reconciled_classification(v_sem_pag, c_peixes, NULL, 'obs', '[]'::jsonb,
    (SELECT updated_at FROM fin_lancamentos WHERE id = v_sem_pag), 'só observação');
  PERFORM cmv_assert((SELECT cmv_incluir AND data_competencia = '2026-09-01' FROM fin_lancamentos WHERE id = v_sem_pag),
    'cliente antigo preserva decisão e competência');
  PERFORM cmv_expect_error(format($q$SELECT * FROM public._guarded_update_reconciled_classification(p_id => '%s', p_categoria_id => '%s', p_justificativa_edicao => ' ')$q$, v_sem_pag, c_peixes),
    'JUSTIFICATIVA_OBRIGATORIA%', 'reclassificação exige justificativa');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = '_guarded_update_reconciled_classification') = 1, 'uma única assinatura da reclassificação');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_heranca(jsonb,uuid)', 'EXECUTE'), 'helper de herança fechado');

  -- 10. O que o corpo anterior já fazia continua valendo; auditoria guarda o retrato do CMV
  -- p_rateios que não é array era erro (jsonb_array_length) e não pode virar "sem rateio" e apagar as linhas.
  BEGIN
    PERFORM public._guarded_upsert_lancamento(p_descricao => 'x', p_valor => 1, p_rateios => '{}'::jsonb);
    RAISE EXCEPTION 'FALHOU: p_rateios que não é array virou "sem rateio"';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM cmv_assert((SELECT (antes->'cmv'->>'incluido')::numeric = 70 AND (depois->'cmv'->>'fora')::numeric = 100
      AND (depois->'cmv'->>'incluido')::numeric = 0
    FROM fin_audit_logs WHERE entidade_id = v_lr2 AND acao = 'editar'), 'auditoria do Livro Razão guarda o retrato do CMV antes e depois');
  PERFORM cmv_assert((SELECT antes->>'data_competencia' = '2026-09-03' AND depois->>'data_competencia' = '2026-08-31'
      AND depois->>'data_pagamento' = '2026-09-10' AND (antes->'cmv'->>'incluido')::numeric = 55 AND (depois->'cmv'->>'fora')::numeric = 55
    FROM fin_audit_logs WHERE entidade_id = v_imp AND acao = 'editar_classificacao_conciliado'),
    'auditoria da reclassificação guarda competência e decisão antes e depois');
  PERFORM cmv_assert((SELECT depois->>'data_competencia' = '2026-09-03' AND (depois->>'data')::date = '2026-09-10'
    FROM fin_audit_logs WHERE entidade_id = v_imp AND acao = 'reconcile_import'), 'auditoria da importação guarda a competência e a data do banco');

  -- 11. Classificação depois (revisão do CMV): lançamentos
  -- Fixtures do caminho do boleto (competência de 02/09, fora das semanas e das datas das seções seguintes).
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto da revisão', p_valor => 30, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-02', p_categoria_id => c_peixes);
  v_bol2 := (r->>'id')::uuid;
  UPDATE fin_contas_pagar SET status = 'PAGO' WHERE id = v_bol2;
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto rateado da revisão', p_valor => 40, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-02',
    p_rateios => jsonb_build_array(jsonb_build_object('categoria_id', c_peixes, 'valor', 25), jsonb_build_object('categoria_id', c_escr, 'valor', 15)));
  v_bol_rat := (r->>'id')::uuid;

  PERFORM set_config('test.permissions', 'financeiro:lancamentos:edit', false);
  DELETE FROM cmv_update_log;
  r := fin_cmv_classificar(jsonb_build_array(jsonb_build_object('lancamento_id', v_pend, 'rateio_id', NULL, 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend))));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_pend), 'lançamento classificado por quem edita lançamentos');
  PERFORM cmv_assert((r->'atualizados'->0->>'lancamento_id')::uuid = v_pend AND (r->>'titulos')::int = 1, 'retorno identifica o lançamento');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM fin_audit_logs WHERE entidade = 'lancamentos' AND entidade_id = v_pend AND acao = 'cmv_classificar'), 'auditoria do lançamento');
  -- decisão e versão do lançamento sem rateio vão num UPDATE só: cada UPDATE custa um refresh do cache de saldo
  PERFORM cmv_assert((SELECT count(*) FROM cmv_update_log WHERE lancamento_id = v_pend) = 1, 'lançamento sem rateio: um UPDATE só (um refresh de saldo)');
  PERFORM cmv_assert((r->'atualizados'->0->>'updated_at')::timestamptz = (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend), 'o retorno devolve a versão nova do lançamento');
  -- conciliado e REALIZADO sem justificativa de edição: classificar não esbarra no gatilho de edição
  DELETE FROM cmv_update_log;
  PERFORM fin_cmv_classificar(jsonb_build_array(jsonb_build_object('lancamento_id', v_conc,
    'rateio_id', (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_conc AND categoria_id = c_escr), 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_conc))));
  PERFORM cmv_assert((SELECT bool_and(cmv_incluir) FROM fin_lancamento_rateios WHERE lancamento_id = v_conc), 'linha de rateio da conciliação classificada');
  PERFORM cmv_assert((SELECT count(*) FROM cmv_update_log WHERE lancamento_id = v_conc) = 1, 'lançamento com rateio: um UPDATE só, o da versão');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_rat, (SELECT updated_at FROM fin_lancamentos WHERE id = v_rat)), 'CMV_ALVO_INVALIDO%', 'lançamento rateado classificado pelo cabeçalho');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":"%s","incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_conc, (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_rat LIMIT 1), (SELECT updated_at FROM fin_lancamentos WHERE id = v_conc)),
    'NOT_FOUND: linha de rateio%', 'linha de rateio de outro lançamento');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_espelho, (SELECT updated_at FROM fin_lancamentos WHERE id = v_espelho)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'espelho de baixa não é classificável');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_receita, (SELECT updated_at FROM fin_lancamentos WHERE id = v_receita)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'receita não é classificável');
  -- mesma regra da apuração: a baixa de um boleto (título aponta para o lançamento, sem carimbo de referência) e a
  -- linha da conciliação desconciliada não são despesas do CMV
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_baixa_legada, (SELECT updated_at FROM fin_lancamentos WHERE id = v_baixa_legada)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'baixa legada de boleto (referenciada por fin_contas_pagar.lancamento_id)');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_desconc, (SELECT updated_at FROM fin_lancamentos WHERE id = v_desconc)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'conciliação desconciliada');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_baixa_legada), 'a baixa legada recusada ficou como estava');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_cancel, (SELECT updated_at FROM fin_lancamentos WHERE id = v_cancel)), 'STATUS_INVALIDO%', 'lançamento cancelado');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"}]')$q$,
    v_pend, v_bol), 'CMV_INVALIDO%', 'item com dois documentos');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_classificar('[{"rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"}]')$q$,
    'CMV_INVALIDO%', 'item sem documento');
  -- Id que não é texto nunca vale como documento. Sem isso, quem só edita lançamentos classificaria um BOLETO:
  -- {"conta_pagar_id":"<boleto>","lancamento_id":0} passava na validação, contava 1 lançamento (e passava pelo gate
  -- de lançamentos) e o laço dos boletos o processava mesmo assim. Aqui o usuário só tem financeiro:lancamentos:edit.
  FOREACH v_bad IN ARRAY ARRAY['0', 'true', '{}', '[]', '1.5'] LOOP
    PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","lancamento_id":%s,"rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
      v_bol2, v_bad, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol2)), 'CMV_INVALIDO%', 'boleto com lancamento_id ' || v_bad);
    PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":%s,"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
      v_bad, v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)), 'CMV_INVALIDO%', 'lançamento com conta_pagar_id ' || v_bad);
    PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":%s,"incluir":true,"expected_updated_at":"%s"}]')$q$,
      v_conc, v_bad, (SELECT updated_at FROM fin_lancamentos WHERE id = v_conc)), 'CMV_INVALIDO%', 'rateio_id ' || v_bad);
  END LOOP;
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_contas_pagar WHERE id = v_bol2), 'o boleto do payload forjado continua pendente');
  -- a decisão do próprio lançamento não mudou com os payloads recusados
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_pend), 'o lançamento dos payloads recusados continua como estava');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"2020-01-01T00:00:00Z"}]')$q$,
    v_pend), 'OPTIMISTIC_LOCK_CONFLICT%', 'versão antiga do lançamento');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"},{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"}]')$q$,
    v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend), v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)),
    'CMV_ITEM_DUPLICADO%', 'o mesmo lançamento duas vezes');
  -- lote misturando boleto e lançamento exige gerenciar o CMV
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"},{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"}]')$q$,
    v_bol, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol), v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)),
    'PERMISSION_DENIED: financeiro:cmv:manage%', 'lote sem cmv:manage');
  -- cada fonte tem o seu gate de edição individual
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_bol2, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol2)), 'PERMISSION_DENIED: financeiro:pagar:edit%', 'quem só edita lançamentos não classifica boleto');
  PERFORM set_config('test.permissions', 'financeiro:pagar:edit', false);
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)), 'PERMISSION_DENIED: financeiro:lancamentos:edit%', 'quem só edita Contas a Pagar não classifica lançamento');
  -- caminho do boleto como antes: PAGO (a edição comum recusa) muda só a decisão e a versão, com auditoria antes/depois
  r := fin_cmv_classificar(jsonb_build_array(jsonb_build_object('conta_pagar_id', v_bol2, 'rateio_id', NULL, 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol2))));
  PERFORM cmv_assert((SELECT cmv_incluir AND status = 'PAGO' AND valor = 30 FROM fin_contas_pagar WHERE id = v_bol2), 'boleto PAGO classificado só na decisão');
  PERFORM cmv_assert((r->'atualizados'->0->>'conta_pagar_id')::uuid = v_bol2 AND NOT (r->'atualizados'->0 ? 'lancamento_id'), 'retorno do boleto continua só com conta_pagar_id');
  PERFORM cmv_assert((SELECT (antes->>'pendentes')::int = 1 AND (depois->>'incluido')::numeric = 30
    FROM fin_audit_logs WHERE entidade = 'contas_pagar' AND entidade_id = v_bol2 AND acao = 'cmv_classificar'), 'auditoria do boleto antes/depois');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_bol_rat, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol_rat)), 'CMV_ALVO_INVALIDO: boleto rateado%', 'boleto rateado classificado pelo cabeçalho');
  PERFORM fin_cmv_classificar(jsonb_build_array(jsonb_build_object('conta_pagar_id', v_bol_rat,
    'rateio_id', (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_bol_rat AND categoria_id = c_peixes), 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol_rat))));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_bol_rat AND categoria_id = c_peixes)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = v_bol_rat AND categoria_id = c_escr), 'boleto rateado classifica só a linha pedida');
  UPDATE fin_contas_pagar SET status = 'CANCELADO' WHERE id = v_bol_rat;
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_bol_rat, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol_rat)), 'STATUS_INVALIDO%', 'boleto cancelado');
  PERFORM set_config('test.permissions', TUDO, false);
  -- lote misto com um item desatualizado: tudo ou nada
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"},{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"2020-01-01T00:00:00Z"}]')$q$,
    v_bol, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol), v_pend), 'OPTIMISTIC_LOCK_CONFLICT%', 'lote misto com versão antiga');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_bol), 'o boleto do lote recusado ficou como estava');
  r := fin_cmv_classificar(jsonb_build_array(
    jsonb_build_object('conta_pagar_id', v_bol, 'rateio_id', NULL, 'incluir', false, 'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol)),
    jsonb_build_object('lancamento_id', v_pend, 'rateio_id', NULL, 'incluir', false, 'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend))));
  PERFORM cmv_assert((r->>'titulos')::int = 2 AND (SELECT cmv_incluir IS FALSE FROM fin_contas_pagar WHERE id = v_bol)
    AND (SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_pend), 'lote com as duas fontes');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM fin_audit_logs WHERE entidade = 'contas_pagar' AND entidade_id = v_bol AND acao = 'cmv_classificar')
    AND (SELECT count(*) FROM fin_audit_logs WHERE entidade = 'lancamentos' AND entidade_id = v_pend AND acao = 'cmv_classificar') = 2, 'o lote audita cada documento na própria entidade');
  PERFORM set_config('test.company_id', B::text, false);
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)), 'NOT_FOUND%', 'B não classifica lançamento da A');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_bol, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol)), 'NOT_FOUND%', 'B não classifica boleto da A');
  PERFORM set_config('test.company_id', A::text, false);

  -- 12. Aplicar padrões às pendentes (histórico)
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 11, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_peixes, 'Pendente peixe') RETURNING id INTO v_p_peixes;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 12, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_escr, 'Pendente escritório') RETURNING id INTO v_p_escr;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 13, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_sem, 'Pendente sem padrão') RETURNING id INTO v_p_sem;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 14, '2026-08-01', '2026-08-01', 'REALIZADO', 'manual', A, c_peixes, 'Pendente antigo') RETURNING id INTO v_p_antigo;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 15, '2026-09-15', '2026-09-15', 'REALIZADO', 'manual', A, c_peixes, false, 'Já decidido') RETURNING id INTO v_p_decidido;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, descricao)
  VALUES ('DESPESA', 15, '2026-09-16', '2026-09-16', 'REALIZADO', 'manual', A, 'Pendente rateado') RETURNING id INTO v_p_rat;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES (v_p_rat, c_peixes, 10, A), (v_p_rat, c_sem, 5, A);
  -- baixa legada de boleto ainda pendente: fora da apuração, então nem a prévia nem a gravação a alcançam
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, company_id, categoria_id, descricao, conta_id)
  VALUES ('DESPESA', 17, '2026-09-14', '2026-09-14', 'REALIZADO', 'conciliacao', true, A, c_peixes, 'Baixa legada pendente', k_a) RETURNING id INTO v_p_baixa;
  INSERT INTO fin_contas_pagar (descricao, valor, valor_pago, data_vencimento, data_competencia, data_pagamento, status, company_id, categoria_id, cmv_incluir, lancamento_id)
  VALUES ('Boleto da baixa legada pendente', 17, 17, '2026-09-14', '2026-09-14', '2026-09-14', 'PAGO', A, c_peixes, false, v_p_baixa);
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto pendente', p_valor => 16, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-15', p_categoria_id => c_peixes);
  v_bol_pend := (r->>'id')::uuid;

  PERFORM set_config('test.permissions', 'financeiro:cmv:view,financeiro:lancamentos:edit', false);
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes('2026-09-14')$q$, 'PERMISSION_DENIED%', 'aplicar padrões exige gerenciar o CMV, até na prévia');
  PERFORM set_config('test.permissions', TUDO, false);

  v_n := (SELECT count(*) FROM fin_lancamentos WHERE cmv_incluir IS NULL);
  r := fin_cmv_aplicar_padroes('2026-09-14', true);
  PERFORM cmv_assert((r->>'simulado')::boolean, 'prévia marcada como simulação');
  PERFORM cmv_assert((r->'lancamento'->>'documentos')::int = 3 AND (r->'lancamento'->>'linhas_sim')::int = 2
    AND (r->'lancamento'->>'centavos_sim')::bigint = 2100 AND (r->'lancamento'->>'linhas_nao')::int = 1
    AND (r->'lancamento'->>'linhas_sem_padrao')::int = 2 AND (r->'lancamento'->>'centavos_sem_padrao')::bigint = 1800,
    'prévia por fonte: lançamentos');
  PERFORM cmv_assert((r->'boleto'->>'documentos')::int = 1 AND (r->'boleto'->>'linhas_sim')::int = 1
    AND (r->'boleto'->>'centavos_sim')::bigint = 1600, 'prévia por fonte: boletos');
  PERFORM cmv_assert((SELECT count(*) FROM fin_lancamentos WHERE cmv_incluir IS NULL) = v_n, 'a prévia não grava nada');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes('2026-09-14', false)$q$, 'JUSTIFICATIVA_OBRIGATORIA%', 'gravar exige justificativa');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes(NULL, true)$q$, 'CMV_PERIODO_OBRIGATORIO%', 'data inicial obrigatória');

  DELETE FROM cmv_update_log;
  r := fin_cmv_aplicar_padroes('2026-09-14', false, 'aplicação inicial');
  PERFORM cmv_assert((r->>'documentos')::int = 4 AND (r->>'linhas')::int = 4
    AND (r->>'centavos_sim')::bigint = 3700 AND (r->>'centavos_nao')::bigint = 1200, 'três lançamentos e um boleto classificados');
  -- um UPDATE por lançamento (cada um custa um refresh do cache de saldo): decisão e versão juntas no sem rateio,
  -- só a versão no rateado; a baixa legada, o já decidido, o sem padrão e o antigo nem são tocados
  PERFORM cmv_assert((SELECT count(*) FROM cmv_update_log WHERE lancamento_id = v_p_peixes) = 1
    AND (SELECT count(*) FROM cmv_update_log WHERE lancamento_id = v_p_escr) = 1
    AND (SELECT count(*) FROM cmv_update_log WHERE lancamento_id = v_p_rat) = 1
    AND (SELECT count(*) FROM cmv_update_log WHERE lancamento_id IN (v_p_sem, v_p_antigo, v_p_decidido, v_p_baixa)) = 0,
    'aplicar padrões: um UPDATE por lançamento alterado e nenhum nos demais');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_p_peixes)
    AND (SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_p_escr)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_sem)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_antigo), 'só pendentes com padrão e a partir da data');
  PERFORM cmv_assert((SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_p_decidido), 'decisão já tomada não é trocada');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_p_rat AND categoria_id = c_peixes)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = v_p_rat AND categoria_id = c_sem)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_rat), 'rateio: só a linha com padrão; cabeçalho intocado');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_bol_pend), 'boleto pendente recebe o padrão');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_baixa), 'a baixa legada de boleto herda a exclusão da apuração e continua intocada');
  PERFORM cmv_assert((SELECT count(*) FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes') = 4, 'auditoria por documento');
  PERFORM cmv_assert((SELECT count(*) FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes' AND entidade = 'lancamentos') = 3
    AND (SELECT count(*) FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes' AND entidade = 'contas_pagar' AND entidade_id = v_bol_pend) = 1
    AND (SELECT bool_and(justificativa = 'aplicação inicial') FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes'), 'auditoria na entidade de cada fonte, com a justificativa');
  PERFORM cmv_assert((SELECT (antes->>'pendentes')::int = 1 AND (depois->>'incluido')::numeric = 11
    FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes' AND entidade = 'lancamentos' AND entidade_id = v_p_peixes), 'auditoria guarda o antes e o depois do lançamento');
  -- repetir não troca nem recria nada: o que já foi decidido deixou de ser pendente
  r := fin_cmv_aplicar_padroes('2026-09-14', false, 'repetição');
  PERFORM cmv_assert((r->>'documentos')::int = 0 AND (r->>'linhas')::int = 0, 'aplicar de novo não altera nada');
  PERFORM set_config('test.company_id', B::text, false);
  PERFORM cmv_assert((fin_cmv_aplicar_padroes('2020-01-01', false, 'x')->>'documentos')::int = 0, 'B não alcança a A');
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM cmv_assert(has_function_privilege('authenticated', 'public.fin_cmv_aplicar_padroes(date,boolean,text)', 'EXECUTE'), 'authenticated executa aplicar padrões');
  PERFORM cmv_assert(NOT has_function_privilege('anon', 'public.fin_cmv_aplicar_padroes(date,boolean,text)', 'EXECUTE'), 'anon não aplica padrões');

  RETURN 'cmv_lancamentos_ephemeral: OK';
END;
$$;

SELECT public.run_cmv_lancamentos_ephemeral_tests();
