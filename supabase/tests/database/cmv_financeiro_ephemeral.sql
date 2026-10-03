\set ON_ERROR_STOP on

-- CMV Financeiro: teste de integração em banco PostgreSQL real e DESCARTÁVEL.
-- Aplica a migration real sobre um schema mínimo. São simulados apenas:
-- auth.uid(), assert_tenant() (lê test.company_id), has_permission/has_any_permission
-- (leem test.permissions), strip_html, fin_get_limite_aprovacao e
-- fin_validate_recorrencia_config. O gatilho de soma do rateio é o de produção.
-- Uso: psql -v ON_ERROR_STOP=1 -d <banco_vazio> -f supabase/tests/database/cmv_financeiro_ephemeral.sql

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
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER trg_updated_at_fin_contas_pagar BEFORE UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid, centro_custo_id uuid,
  valor numeric NOT NULL DEFAULT 0, percentual numeric, observacao text,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
-- Mesmo corpo do gatilho de produção (só os pais existentes neste schema).
CREATE FUNCTION public.trg_validate_rateio_sum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_lancamento_id uuid; v_company_id uuid; v_lancamento_valor numeric; v_soma_rateios numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN v_lancamento_id := OLD.lancamento_id; v_company_id := OLD.company_id;
  ELSE v_lancamento_id := NEW.lancamento_id; v_company_id := NEW.company_id; END IF;
  SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_pagar WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
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

-- Versões anteriores das RPCs (assinatura de produção), para a migration dropar e recriar.
CREATE FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

\ir ../../migrations/20261003140000_cmv_financeiro.sql

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
CREATE FUNCTION public.cmv_fat(p jsonb, p_ini date, p_fim date) RETURNS bigint LANGUAGE sql AS $$
  SELECT sum((x->>'centavos')::bigint)::bigint FROM jsonb_array_elements(p->'faturamento') x
  WHERE (x->>'data')::date BETWEEN p_ini AND p_fim
$$;

CREATE FUNCTION public.run_cmv_financeiro_ephemeral_tests() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
  U constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  c_merc constant uuid := 'c0000000-0000-4000-8000-000000000001';
  c_peixes constant uuid := 'c0000000-0000-4000-8000-000000000002';
  c_escr constant uuid := 'c0000000-0000-4000-8000-000000000003';
  c_beb constant uuid := 'c0000000-0000-4000-8000-000000000004';
  c_b constant uuid := 'c0000000-0000-4000-8000-00000000000b';
  TUDO constant text := 'financeiro:cmv:view,financeiro:cmv:manage,financeiro:pagar:create,financeiro:pagar:edit';
  r jsonb; p jsonb; l jsonb;
  v_id uuid; v_rateado uuid; v_legado uuid; v_pago uuid; v_serie uuid; v_semcomp uuid; v_b uuid;
  v_upd timestamptz; v_ids uuid[]; v_ids2 uuid[]; v_created timestamptz; v_n int;
BEGIN
  PERFORM set_config('test.user_id', U::text, false);
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM set_config('test.permissions', TUDO, false);

  INSERT INTO companies VALUES (A, 'Unidade A'), (B, 'Unidade B');
  INSERT INTO fin_categorias (id, nome, parent_id, company_id, created_at) VALUES
    (c_merc, 'Mercadorias', NULL, A, '2026-01-01'), (c_peixes, 'Peixes', c_merc, A, '2026-01-02'),
    (c_escr, 'Material de escritório', NULL, A, '2026-01-03'), (c_beb, 'Bebidas', c_merc, A, '2026-01-04'),
    (c_b, 'Categoria da B', NULL, B, '2026-01-01');
  INSERT INTO financeiro_fechamento_caixa (data, faturamento_bruto, taxas, descontos, company_id) VALUES
    ('2026-09-08', 4000, 100, 50, A), ('2026-09-09', 6000, 0, 0, A), ('2026-09-10', 0, 0, 0, A),
    ('2026-09-01', 5000, 0, 0, A), ('2026-09-08', 99999, 0, 0, B);

  -- 1. RBAC: chaves e papéis
  PERFORM cmv_assert((SELECT count(*) = 3 FROM permissions WHERE key LIKE 'financeiro:cmv:%'), 'três chaves do CMV em permissions');
  PERFORM cmv_assert((SELECT count(*) = 9 FROM role_permissions WHERE permission_key LIKE 'financeiro:cmv:%'), 'chaves concedidas a admin/diretor/gerente_geral');

  -- 2. Privilégios: helpers internos fechados, RPCs abertas só a authenticated
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_payload(uuid,date,date,date,date)', 'EXECUTE'), 'helper de payload não é executável por authenticated');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_linhas(uuid)', 'EXECUTE'), 'helper de linhas não é executável por authenticated');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_lista(uuid,date,date,text,uuid,integer,integer,boolean)', 'EXECUTE'), 'helper de lista não é executável por authenticated');
  PERFORM cmv_assert(has_function_privilege('authenticated', 'public.get_fin_cmv_financeiro(date,date,date,date)', 'EXECUTE'), 'RPC do relatório executável por authenticated');
  PERFORM cmv_assert(NOT has_function_privilege('anon', 'public.get_fin_cmv_financeiro(date,date,date,date)', 'EXECUTE'), 'anon não executa o relatório');
  PERFORM cmv_assert(NOT has_function_privilege('anon', 'public.fin_cmv_classificar(jsonb,text)', 'EXECUTE'), 'anon não classifica');
  PERFORM cmv_assert(NOT has_function_privilege('anon', 'public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,jsonb)', 'EXECUTE'), 'anon não cria boleto');

  -- 3. Boleto de uma categoria, Sim. Competência ≠ vencimento.
  r := _guarded_create_conta_pagar(p_descricao => 'Peixe da semana', p_valor => 1000, p_data_vencimento => '2026-10-20',
    p_data_competencia => '2026-09-08', p_categoria_id => c_peixes, p_cmv => '{"incluir": true}');
  v_id := (r->>'id')::uuid;
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_id), 'boleto simples grava a decisão no título');

  -- 4. Exemplo obrigatório: R$ 2.150,00 → R$ 1.800,00 no CMV, R$ 350,00 fora
  r := _guarded_create_conta_pagar(p_descricao => 'NF rateada', p_valor => 2150, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-09', p_cmv => '{"incluir": null}',
    p_rateios => jsonb_build_array(
      jsonb_build_object('categoria_id', c_peixes, 'valor', 1200, 'percentual', 55.8, 'cmv_incluir', true),
      jsonb_build_object('categoria_id', c_escr, 'valor', 350, 'percentual', 16.3, 'cmv_incluir', false),
      jsonb_build_object('categoria_id', c_beb, 'valor', 600, 'percentual', 27.9, 'cmv_incluir', true)));
  v_rateado := (r->>'id')::uuid;
  PERFORM cmv_assert((SELECT valor = 2150 AND cmv_incluir IS NULL FROM fin_contas_pagar WHERE id = v_rateado), 'boleto rateado continua valendo 2.150 e a decisão fica nas linhas');

  p := get_fin_cmv_financeiro('2026-09-07', '2026-09-13', '2026-08-31', '2026-09-06');
  PERFORM cmv_assert(p->>'contrato' = 'cmv-financeiro/v1' AND p->>'empresa' = 'Unidade A', 'contrato e empresa do payload');
  PERFORM cmv_assert(cmv_total(p, '2026-09-07', '2026-09-13') = 280000, 'CMV da semana = 1.000 + 1.800');
  PERFORM cmv_assert(cmv_total(p, '2026-09-09', '2026-09-09') = 180000, 'exemplo: 1.800 entram na competência do boleto');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) = 2 FROM jsonb_array_elements(p->'boletos') x), 'boleto com 3 linhas conta como 1 boleto (2 no total)');
  PERFORM cmv_assert((SELECT (x->>'centavos')::bigint = 35000 AND (x->>'titulos')::int = 1 FROM jsonb_array_elements(p->'qualidade') x WHERE x->>'situacao' = 'fora'), '350 ficam fora do CMV');
  -- vencimento em outubro não leva o boleto para outubro
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-10-19', '2026-10-25'), '2026-10-19', '2026-10-25') = 0, 'vencimento não desloca a competência');

  -- 5. Faturamento: só o bruto do Fechamento de Caixa da própria unidade
  PERFORM cmv_assert(cmv_fat(p, '2026-09-07', '2026-09-13') = 1000000, 'faturamento = bruto (4.000 + 6.000 + 0), sem taxas/descontos e sem a unidade B');
  PERFORM cmv_assert(cmv_fat(p, '2026-08-31', '2026-09-06') = 500000, 'faturamento do período anterior');
  PERFORM cmv_assert((SELECT count(*) = 3 FROM jsonb_array_elements(p->'faturamento') x WHERE (x->>'data')::date >= '2026-09-07'), 'dia sem fechamento não vira linha; dia com zero confirmado vira');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(p->'faturamento') x WHERE x->>'data' = '2026-09-10' AND (x->>'centavos')::bigint = 0), 'zero confirmado é devolvido como zero');
  PERFORM cmv_assert((SELECT count(*) = 3 FROM jsonb_array_elements(p->'categorias')), 'categorias usadas + ancestrais (Mercadorias, Peixes, Bebidas)');
  PERFORM cmv_assert((SELECT (x->>'indice')::int = 1 FROM jsonb_array_elements(p->'categorias') x WHERE x->>'id' = c_peixes::text), 'índice estável da categoria pela ordem de criação');

  -- 6. Pagamento, pagamento parcial e estorno não mudam valor nem período
  UPDATE fin_contas_pagar SET status = 'PAGO', data_pagamento = '2026-11-05', valor_pago = 400 WHERE id = v_id;
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-08', '2026-09-08') = 100000, 'boleto pago (parcial) conta pelo valor inteiro na competência');
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-11-01', '2026-11-30'), '2026-11-01', '2026-11-30') = 0, 'data de pagamento não cria CMV em novembro');
  UPDATE fin_contas_pagar SET status = 'APROVADO', data_pagamento = NULL, valor_pago = NULL WHERE id = v_id;
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-08', '2026-09-08') = 100000, 'estorno da baixa não tira a despesa do CMV');
  UPDATE fin_contas_pagar SET status = 'CANCELADO' WHERE id = v_id;
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-08', '2026-09-08') = 0, 'despesa cancelada sai do CMV');
  UPDATE fin_contas_pagar SET status = 'RASCUNHO' WHERE id = v_id;
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-08', '2026-09-08') = 0, 'rascunho não entra');
  UPDATE fin_contas_pagar SET status = 'APROVADO' WHERE id = v_id;
  -- mudar a competência move o valor
  UPDATE fin_contas_pagar SET data_competencia = '2026-09-02' WHERE id = v_id;
  p := get_fin_cmv_financeiro('2026-09-07', '2026-09-13', '2026-08-31', '2026-09-06');
  PERFORM cmv_assert(cmv_total(p, '2026-09-07', '2026-09-13') = 180000 AND cmv_total(p, '2026-08-31', '2026-09-06') = 100000, 'alterar a competência move o valor de período');
  UPDATE fin_contas_pagar SET data_competencia = '2026-09-08' WHERE id = v_id;

  -- 7. Cliente antigo (sem p_cmv): cria pendente, mesmo com a classificação ativa
  PERFORM fin_cmv_set_ativo(true);
  PERFORM cmv_assert((get_fin_cmv_config()->>'classificacao_ativa')::boolean, 'classificação ativada na empresa');
  r := _guarded_create_conta_pagar(p_descricao => 'Legado', p_valor => 500, p_data_vencimento => '2026-09-12',
    p_data_competencia => '2026-09-12', p_categoria_id => c_beb);
  v_legado := (r->>'id')::uuid;
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_contas_pagar WHERE id = v_legado), 'cliente antigo cria boleto pendente, sem erro');
  p := get_fin_cmv_financeiro('2026-09-07', '2026-09-13');
  PERFORM cmv_assert((SELECT (x->>'centavos')::bigint = 50000 FROM jsonb_array_elements(p->'qualidade') x WHERE x->>'situacao' = 'pendente'), 'pendência aparece na qualidade do período');
  PERFORM cmv_assert((p->'pendentes_geral'->>'titulos')::int = 1, 'pendentes no histórico');
  -- cliente novo, empresa ativa, sem decisão: recusado
  PERFORM cmv_expect_error($q$SELECT public._guarded_create_conta_pagar(p_descricao => 'x', p_valor => 10, p_data_vencimento => '2026-09-12', p_data_competencia => '2026-09-12', p_cmv => '{"incluir": null}')$q$, 'CMV_DECISAO_OBRIGATORIA%', 'boleto novo sem decisão');
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_create_conta_pagar(p_descricao => 'x', p_valor => 100, p_data_vencimento => '2026-09-12', p_data_competencia => '2026-09-12', p_cmv => '{}', p_rateios => '[{"categoria_id":"%s","valor":60,"cmv_incluir":true},{"categoria_id":"%s","valor":40}]')$q$, c_peixes, c_beb), 'CMV_DECISAO_OBRIGATORIA%', 'linha de rateio sem decisão');
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_create_conta_pagar(p_descricao => 'x', p_valor => 100, p_data_vencimento => '2026-09-12', p_data_competencia => '2026-09-12', p_cmv => '{}', p_rateios => '[{"categoria_id":"%s","valor":60,"cmv_incluir":true}]')$q$, c_peixes), 'RATEIO_NAO_FECHA%', 'rateio que não fecha');
  PERFORM cmv_expect_error($q$SELECT public._guarded_create_conta_pagar(p_descricao => 'x', p_valor => 10, p_data_vencimento => '2026-09-12', p_cmv => '"sim"')$q$, 'CMV_INVALIDO%', 'p_cmv malformado');
  -- categoria de outra empresa no rateio continua barrada pelo que já existia? (aqui: categoria inexistente não quebra o relatório)

  -- 8. Idempotência: reenvio igual devolve o mesmo; reenvio com outra decisão é recusado
  r := _guarded_create_conta_pagar(p_descricao => 'Idem', p_valor => 300, p_data_vencimento => '2026-09-11', p_data_competencia => '2026-09-11',
    p_categoria_id => c_beb, p_cmv => '{"incluir": true}', p_idempotency_key => 'k1');
  PERFORM cmv_assert((_guarded_create_conta_pagar(p_descricao => 'Idem', p_valor => 300, p_data_vencimento => '2026-09-11', p_data_competencia => '2026-09-11',
    p_categoria_id => c_beb, p_cmv => '{"incluir": true}', p_idempotency_key => 'k1')->>'idempotente')::boolean, 'reenvio idêntico é reconhecido');
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_create_conta_pagar(p_descricao => 'Idem', p_valor => 300, p_data_vencimento => '2026-09-11', p_data_competencia => '2026-09-11', p_categoria_id => '%s', p_cmv => '{"incluir": false}', p_idempotency_key => 'k1')$q$, c_beb), 'REQUEST_ID_REUTILIZADO%', 'reenvio com outra decisão');
  PERFORM cmv_assert((SELECT count(*) = 1 FROM fin_contas_pagar WHERE idempotency_key = 'k1'), 'reenvio não duplica o boleto');
  DELETE FROM fin_contas_pagar WHERE idempotency_key = 'k1';

  -- 9. Edição: id e created_at do rateio preservados; decisão gravada com o valor
  SELECT array_agg(id ORDER BY valor DESC), min(created_at) INTO v_ids, v_created FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado;
  SELECT updated_at INTO v_upd FROM fin_contas_pagar WHERE id = v_rateado;
  PERFORM _guarded_update_conta_pagar(p_id => v_rateado, p_descricao => 'NF rateada', p_valor => 2150, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-09', p_expected_updated_at => v_upd, p_cmv => '{}',
    p_rateios => jsonb_build_array(
      jsonb_build_object('id', v_ids[1], 'categoria_id', c_peixes, 'valor', 1000, 'cmv_incluir', true),
      jsonb_build_object('id', v_ids[3], 'categoria_id', c_escr, 'valor', 550, 'cmv_incluir', false),
      jsonb_build_object('id', v_ids[2], 'categoria_id', c_beb, 'valor', 600, 'cmv_incluir', false)));
  SELECT array_agg(id ORDER BY id) INTO v_ids2 FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado;
  PERFORM cmv_assert(v_ids2 = (SELECT array_agg(x ORDER BY x) FROM unnest(v_ids) x), 'ids das linhas de rateio preservados na edição');
  PERFORM cmv_assert((SELECT min(created_at) = v_created FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado), 'created_at das linhas preservado');
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-09', '2026-09-09') = 100000, 'correção de rateio reflete sem duplicar (1.000 incluídos)');
  -- conflito de edição concorrente
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_update_conta_pagar(p_id => '%s', p_descricao => 'x', p_valor => 2150, p_data_vencimento => '2026-09-30', p_expected_updated_at => '%s', p_cmv => '{}')$q$, v_rateado, v_upd), '%alterado por outro usuário%', 'lock otimista da edição');

  -- 10. Edição pelo cliente antigo: mesma categoria herda a decisão; categoria trocada volta a pendente
  PERFORM _guarded_update_conta_pagar(p_id => v_rateado, p_descricao => 'NF rateada', p_valor => 2150, p_data_vencimento => '2026-09-30', p_data_competencia => '2026-09-09',
    p_rateios => jsonb_build_array(
      jsonb_build_object('categoria_id', c_peixes, 'valor', 1550),
      jsonb_build_object('categoria_id', c_merc, 'valor', 600)));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado AND categoria_id = c_peixes), 'cliente antigo: mesma categoria mantém "Sim"');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado AND categoria_id = c_merc), 'cliente antigo: categoria nova fica pendente');
  PERFORM _guarded_update_conta_pagar(p_id => v_id, p_descricao => 'Peixe da semana', p_valor => 1000, p_data_vencimento => '2026-10-20', p_data_competencia => '2026-09-08', p_categoria_id => c_peixes);
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_id), 'cliente antigo: boleto simples mantém a decisão na mesma categoria');
  PERFORM _guarded_update_conta_pagar(p_id => v_id, p_descricao => 'Peixe da semana', p_valor => 1000, p_data_vencimento => '2026-10-20', p_data_competencia => '2026-09-08', p_categoria_id => c_beb);
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_contas_pagar WHERE id = v_id), 'cliente antigo: trocar a categoria volta para pendente');
  PERFORM cmv_assert((SELECT antes ? 'cmv' AND depois ? 'cmv' FROM fin_audit_logs WHERE entidade_id = v_id AND acao = 'editar' ORDER BY created_at DESC LIMIT 1), 'edição audita o antes/depois do CMV');

  -- 11. Classificação de boleto PAGO (a edição comum recusa), com lock e auditoria
  UPDATE fin_contas_pagar SET status = 'PAGO' WHERE id = v_id;
  SELECT updated_at INTO v_upd FROM fin_contas_pagar WHERE id = v_id;
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_update_conta_pagar(p_id => '%s', p_descricao => 'x', p_valor => 1000, p_data_vencimento => '2026-10-20', p_cmv => '{"incluir":true}')$q$, v_id), '%status PAGO%', 'edição comum de boleto pago');
  PERFORM set_config('test.permissions', 'financeiro:pagar:edit', false);
  PERFORM fin_cmv_classificar(jsonb_build_array(jsonb_build_object('conta_pagar_id', v_id, 'rateio_id', NULL, 'incluir', true, 'expected_updated_at', v_upd)));
  PERFORM cmv_assert((SELECT cmv_incluir AND status = 'PAGO' AND valor = 1000 AND updated_at > v_upd FROM fin_contas_pagar WHERE id = v_id), 'classifica boleto pago mudando só a decisão e a versão');
  PERFORM cmv_assert((SELECT (antes->>'pendentes')::int = 1 AND (depois->>'incluido')::numeric = 1000 FROM fin_audit_logs WHERE entidade_id = v_id AND acao = 'cmv_classificar'), 'auditoria antes/depois da classificação');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"}]')$q$, v_id, v_upd), 'OPTIMISTIC_LOCK_CONFLICT%', 'versão antiga na classificação');
  -- lote exige gerenciar o CMV
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"},{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"}]')$q$, v_id, v_legado), 'PERMISSION_DENIED: financeiro:cmv:manage%', 'lote sem cmv:manage');
  PERFORM set_config('test.permissions', TUDO, false);
  -- boleto rateado: alvo é a linha
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$, v_rateado, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_rateado)), 'CMV_ALVO_INVALIDO%', 'título rateado classificado pelo cabeçalho');
  -- lote: tudo ou nada
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"},{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2020-01-01T00:00:00Z"}]')$q$, v_legado, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_legado), v_id), 'OPTIMISTIC_LOCK_CONFLICT%', 'lote com um item desatualizado');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_contas_pagar WHERE id = v_legado), 'lote que falha não grava nada');
  r := fin_cmv_classificar(jsonb_build_array(
    jsonb_build_object('conta_pagar_id', v_legado, 'rateio_id', NULL, 'incluir', false, 'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_legado)),
    jsonb_build_object('conta_pagar_id', v_rateado, 'rateio_id', (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_rateado AND categoria_id = c_merc), 'incluir', true, 'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_rateado))
  ), 'revisão do histórico');
  PERFORM cmv_assert((r->>'titulos')::int = 2 AND (r->>'itens')::int = 2, 'lote aplicado em 2 boletos');
  PERFORM cmv_assert((SELECT count(*) = 2 FROM fin_audit_logs WHERE acao = 'cmv_classificar' AND justificativa = 'revisão do histórico'), 'lote audita cada boleto com a justificativa');
  PERFORM cmv_assert(((get_fin_cmv_financeiro('2026-09-07', '2026-09-13'))->'pendentes_geral'->>'titulos')::int = 0, 'sem pendências depois da revisão');
  UPDATE fin_contas_pagar SET status = 'CANCELADO' WHERE id = v_legado;
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$, v_legado, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_legado)), 'STATUS_INVALIDO%', 'classificar boleto cancelado');

  -- 12. Parcelas: cada título uma vez, na própria competência, herdando a decisão
  r := _guarded_create_conta_pagar(p_descricao => 'Série', p_valor => 900, p_data_vencimento => '2026-11-10', p_data_competencia => '2026-11-10',
    p_cmv => '{}', p_recorrencia => '{"frequencia":"mensal","parcelas":3}',
    p_rateios => jsonb_build_array(
      jsonb_build_object('categoria_id', c_peixes, 'valor', 600, 'cmv_incluir', true),
      jsonb_build_object('categoria_id', c_escr, 'valor', 300, 'cmv_incluir', false)));
  v_serie := (r->>'id')::uuid;
  PERFORM cmv_assert((r->>'lancamentos_criados')::int = 3, 'três parcelas criadas');
  PERFORM cmv_assert((SELECT count(*) = 3 FROM fin_lancamento_rateios x JOIN fin_contas_pagar c ON c.id = x.lancamento_id WHERE (c.id = v_serie OR c.lancamento_pai_id = v_serie) AND x.cmv_incluir IS TRUE), 'cada parcela herda a decisão das linhas');
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-11-01', '2026-11-30'), '2026-11-01', '2026-11-30') = 60000, 'novembro reconhece só a parcela de novembro');
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-11-01', '2027-01-31'), '2026-11-01', '2027-01-31') = 180000, 'três competências, 600 cada: sem pai + filhos em dobro');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) = 3 FROM jsonb_array_elements(get_fin_cmv_financeiro('2026-11-01', '2027-01-31')->'boletos') x), 'três títulos distintos');

  -- 13. Boleto sem competência: fora de qualquer período, contado à parte
  INSERT INTO fin_contas_pagar (descricao, valor, data_vencimento, data_competencia, categoria_id, status, company_id, cmv_incluir)
  VALUES ('Sem competência', 700, '2026-09-09', NULL, c_peixes, 'APROVADO', A, true) RETURNING id INTO v_semcomp;
  p := get_fin_cmv_financeiro('2026-01-01', '2026-12-31');
  PERFORM cmv_assert((p->'sem_competencia'->>'titulos')::int = 1 AND (p->'sem_competencia'->>'centavos')::bigint = 70000, 'sem competência contado separado');
  PERFORM cmv_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'cmv') x WHERE (x->>'centavos')::bigint = 70000), 'sem competência não é encaixado pelo vencimento');

  -- 14. Lista (drill-down): filtros, ramo de categoria, sem categoria, paginação
  l := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'incluido', c_merc);
  -- Peixes 1.550 + direto em Mercadorias 600 + boleto simples (agora em Bebidas) 1.000
  PERFORM cmv_assert((l->>'total_centavos')::bigint = 155000 + 60000 + 100000, 'ramo Mercadorias inclui descendentes e o lançamento direto');
  l := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'incluido', c_merc, 50, 0, true);
  PERFORM cmv_assert((l->>'total_centavos')::bigint = 60000, 'só o lançado direto em Mercadorias, sem os descendentes');
  l := list_fin_cmv_linhas(NULL, NULL, 'sem_competencia');
  PERFORM cmv_assert((l->>'total_linhas')::int = 1 AND l->'itens'->0->>'descricao' = 'Sem competência', 'lista de sem competência');
  l := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'todos');
  PERFORM cmv_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l->'itens') x WHERE x->>'data_competencia' IS NULL), 'período informado nunca traz boleto sem competência');
  INSERT INTO fin_contas_pagar (descricao, valor, data_vencimento, data_competencia, categoria_id, status, company_id, cmv_incluir)
  VALUES ('Sem categoria', 80, '2026-09-10', '2026-09-10', NULL, 'APROVADO', A, true);
  l := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'incluido', '00000000-0000-0000-0000-000000000000');
  PERFORM cmv_assert((l->>'total_linhas')::int = 1 AND (l->>'total_centavos')::bigint = 8000, 'filtro de linhas sem categoria');
  l := list_fin_cmv_linhas('2026-01-01', '2027-12-31', 'todos', NULL, 2, 1);
  PERFORM cmv_assert(jsonb_array_length(l->'itens') = 2 AND (l->>'total_linhas')::int > 2, 'paginação devolve a página e o total do recorte');
  PERFORM cmv_expect_error($q$SELECT public.list_fin_cmv_linhas(NULL, NULL, 'qualquer')$q$, 'CMV_SITUACAO_INVALIDA%', 'situação inválida');

  -- 15. Padrão por categoria: não altera boletos, audita
  SELECT count(*) INTO v_n FROM fin_lancamento_rateios WHERE cmv_incluir IS TRUE;
  PERFORM fin_cmv_set_categoria_padrao(c_escr, false);
  PERFORM fin_cmv_set_categoria_padrao(c_peixes, false);
  PERFORM cmv_assert((SELECT count(*) = v_n FROM fin_lancamento_rateios WHERE cmv_incluir IS TRUE), 'mudar o padrão da categoria não toca em boleto cadastrado');
  PERFORM cmv_assert(cmv_total(get_fin_cmv_financeiro('2026-09-07', '2026-09-13'), '2026-09-08', '2026-09-08') = 100000, 'histórico não é recalculado pelo padrão atual');
  PERFORM cmv_assert((SELECT (x->>'cmv_sugerir')::boolean = false FROM jsonb_array_elements(get_fin_cmv_config()->'categorias') x WHERE x->>'id' = c_peixes::text), 'padrão devolvido na configuração');
  PERFORM cmv_assert((SELECT count(*) = 2 FROM fin_audit_logs WHERE acao = 'cmv_padrao'), 'padrão auditado');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_set_categoria_padrao('%s', true)$q$, c_b), 'NOT_FOUND%', 'categoria de outra unidade');

  -- 16. Validação de período
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2026-09-13', '2026-09-07')$q$, 'CMV_PERIODO_INVALIDO%', 'fim antes do início');
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2025-01-01', '2026-09-07')$q$, 'CMV_PERIODO_LONGO%', 'mais de 12 meses');
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2026-09-07', '2026-09-13', '2026-09-01', '2026-09-08')$q$, 'CMV_COMPARACAO_INVALIDA%', 'comparação sobreposta');
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro(NULL, '2026-09-13')$q$, 'CMV_PERIODO_OBRIGATORIO%', 'período ausente');

  -- 17. Permissões
  PERFORM set_config('test.permissions', 'finance:read,financeiro:pagar:view', false);
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2026-09-07', '2026-09-13')$q$, 'PERMISSION_DENIED%', 'relatório sem financeiro:cmv:view (legado não libera)');
  PERFORM cmv_expect_error($q$SELECT public.list_fin_cmv_linhas()$q$, 'PERMISSION_DENIED%', 'lista sem financeiro:cmv:view');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_set_ativo(false)$q$, 'PERMISSION_DENIED%', 'ativação sem cmv:manage');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_set_categoria_padrao('%s', true)$q$, c_beb), 'PERMISSION_DENIED%', 'padrão sem cmv:manage');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"}]')$q$, v_id), 'PERMISSION_DENIED%', 'classificar sem permissão de edição');
  PERFORM cmv_assert(get_fin_cmv_config() ? 'categorias', 'quem lança boleto lê os padrões sugeridos');
  PERFORM set_config('test.user_id', '', false);
  PERFORM set_config('test.permissions', TUDO, false);
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2026-09-07', '2026-09-13')$q$, 'PERMISSION_DENIED%', 'sem usuário autenticado');
  PERFORM set_config('test.user_id', U::text, false);

  -- 18. Isolamento entre unidades
  PERFORM set_config('test.company_id', B::text, false);
  p := get_fin_cmv_financeiro('2026-09-07', '2026-09-13', '2026-08-31', '2026-09-06');
  PERFORM cmv_assert(p->>'empresa' = 'Unidade B' AND jsonb_array_length(p->'cmv') = 0 AND jsonb_array_length(p->'categorias') = 0, 'unidade B não vê CMV nem categorias da A');
  PERFORM cmv_assert(cmv_fat(p, '2026-09-07', '2026-09-13') = 9999900, 'unidade B vê só o próprio fechamento');
  PERFORM cmv_assert((p->'sem_competencia'->>'titulos')::int = 0 AND (p->'pendentes_geral'->>'titulos')::int = 0, 'contadores da B não incluem a A');
  PERFORM cmv_assert((list_fin_cmv_linhas(NULL, NULL, 'todos')->>'total_linhas')::int = 0, 'drill-down da B não lista boleto da A');
  PERFORM cmv_assert((list_fin_cmv_linhas(NULL, NULL, 'todos', c_peixes)->>'total_linhas')::int = 0, 'categoria da A enviada pela B não vaza linha');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"}]')$q$, v_id, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_id)), 'NOT_FOUND%', 'B tenta classificar boleto da A');
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_update_conta_pagar(p_id => '%s', p_descricao => 'x', p_valor => 1, p_data_vencimento => '2026-09-01', p_cmv => '{"incluir":false}')$q$, v_semcomp), 'Registro não encontrado%', 'B tenta editar boleto da A');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_id), 'boleto da A intacto');
  PERFORM cmv_assert(NOT (get_fin_cmv_config()->>'classificacao_ativa')::boolean, 'ativação é por unidade: B continua desligada');
  PERFORM set_config('test.company_id', '', false);
  PERFORM cmv_expect_error($q$SELECT public.get_fin_cmv_financeiro('2026-09-07', '2026-09-13')$q$, 'COMPANY_ACCESS_DENIED%', 'sem unidade resolvida');

  -- 19. Com a classificação ativa, a edição não devolve decisão tomada para pendente
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM cmv_assert((get_fin_cmv_config()->>'classificacao_ativa')::boolean, 'unidade A está com a classificação ativa');
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto com decisão', p_valor => 500, p_data_vencimento => '2027-03-20',
    p_data_competencia => '2027-03-01', p_categoria_id => c_peixes, p_cmv => '{"incluir": true}');
  v_serie := (r->>'id')::uuid;
  PERFORM cmv_expect_error(format($q$SELECT public._guarded_update_conta_pagar(p_id => '%s', p_descricao => 'Boleto com decisão', p_valor => 500, p_data_vencimento => '2027-03-20', p_data_competencia => '2027-03-01', p_categoria_id => '%s', p_expected_updated_at => '%s', p_cmv => '{"incluir":null}')$q$, v_serie, c_escr, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_serie)), 'CMV_DECISAO_OBRIGATORIA%', 'edição não apaga a decisão do título');
  PERFORM cmv_assert((SELECT cmv_incluir AND categoria_id = c_peixes FROM fin_contas_pagar WHERE id = v_serie), 'decisão e categoria preservadas após a recusa');
  PERFORM _guarded_update_conta_pagar(p_id => v_serie, p_descricao => 'Boleto com decisão', p_valor => 500, p_data_vencimento => '2027-03-20', p_data_competencia => '2027-03-01', p_categoria_id => c_escr, p_expected_updated_at => (SELECT updated_at FROM fin_contas_pagar WHERE id = v_serie), p_cmv => '{"incluir":false}');
  PERFORM cmv_assert((SELECT cmv_incluir IS FALSE FROM fin_contas_pagar WHERE id = v_serie), 'edição com resposta explícita troca a decisão');

  -- 20. Escrita direta (PostgREST, papel authenticated) não altera decisão nem ativação
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.fin_contas_pagar SET cmv_incluir = false WHERE id = v_id;
    RAISE EXCEPTION 'CMV TEST FAILED: UPDATE direto da decisão do título passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.fin_lancamento_rateios SET cmv_incluir = NOT COALESCE(cmv_incluir, false)
    WHERE id = (SELECT id FROM public.fin_lancamento_rateios WHERE company_id = A LIMIT 1);
    IF FOUND THEN RAISE EXCEPTION 'CMV TEST FAILED: UPDATE direto da decisão do rateio passou'; END IF;
    RAISE EXCEPTION 'CMV TEST FAILED: nenhum rateio da unidade A para o teste';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.fin_config SET value = 'false' WHERE company_id = A AND key = 'cmv_financeiro_ativo';
    RAISE EXCEPTION 'CMV TEST FAILED: UPDATE direto da ativação passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.fin_config WHERE company_id = A AND key = 'cmv_financeiro_ativo';
    RAISE EXCEPTION 'CMV TEST FAILED: DELETE direto da ativação passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.fin_config (company_id, key, value) VALUES (B, 'cmv_financeiro_ativo', 'true');
    RAISE EXCEPTION 'CMV TEST FAILED: INSERT direto da ativação passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Outras chaves de configuração continuam graváveis como antes.
  INSERT INTO public.fin_config (company_id, key, value) VALUES (A, 'cmv_teste_outra_chave', '1');
  RESET ROLE;
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_id), 'decisão intacta após as tentativas diretas');
  PERFORM cmv_assert((SELECT value = 'true' FROM fin_config WHERE company_id = A AND key = 'cmv_financeiro_ativo'), 'ativação intacta após as tentativas diretas');
  PERFORM set_config('test.company_id', '', false);

  RETURN 'cmv_financeiro_ephemeral: OK';
END;
$$;

SELECT public.run_cmv_financeiro_ephemeral_tests();
