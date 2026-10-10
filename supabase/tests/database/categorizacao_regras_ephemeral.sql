\set ON_ERROR_STOP on

-- Financeiro › Categorização: teste de integração em PostgreSQL real e DESCARTÁVEL.
-- Instala as definições de produção anteriores (docs/categorizacao-regras/reversao.sql),
-- mostra os dois defeitos (Aplicar Regras falha no gatilho de justificativa e a
-- contagem inclui transferência), aplica a migration 20261010190000 e confere o
-- comportamento novo. Depois reaplica a migration, reverte e aplica de novo.
-- Simulados: auth.uid(), assert_tenant() (lê test.company_id) e has_any_permission
-- (lê test.permissions). O gatilho trg_validate_fin_lancamento_update tem o corpo de
-- produção (2026-10-10) e immutable_unaccent usa a extensão unaccent, como lá.
-- Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/categorizacao_regras_ephemeral.sql

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

-- Como no Supabase: função nova em public nasce executável por anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

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

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1); $$;

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL, parent_id uuid,
  ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL
);
CREATE TABLE public.fin_centros_custo (
  id uuid PRIMARY KEY, nome text NOT NULL, ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL
);
CREATE TABLE public.fin_regras_categorizacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), padrao text NOT NULL, tipo_match text NOT NULL DEFAULT 'contem',
  categoria_id uuid NOT NULL, centro_custo_id uuid, prioridade integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.fin_contas_saldo_cache (conta_id uuid PRIMARY KEY, saldo numeric NOT NULL DEFAULT 0);
CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tipo text NOT NULL, valor numeric NOT NULL CHECK (valor > 0),
  descricao text, status text NOT NULL DEFAULT 'REALIZADO', categoria_id uuid, centro_custo_id uuid,
  company_id uuid NOT NULL, justificativa_edicao text,
  data_competencia date NOT NULL DEFAULT '2026-09-01', data_vencimento date, data_pagamento date,
  conta_id uuid, conta_destino_id uuid, conciliado boolean DEFAULT false, conciliado_em timestamptz,
  origem text DEFAULT 'manual', forma_pagamento text, recorrente boolean DEFAULT false, observacoes text,
  lancamento_pai_id uuid, referencia_modulo text, referencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid,
  valor numeric NOT NULL DEFAULT 0, company_id uuid NOT NULL
);
CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), descricao text, valor numeric, data_vencimento date, status text,
  company_id uuid NOT NULL, recorrente boolean DEFAULT false, lancamento_pai_id uuid
);
CREATE TABLE public.fin_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), descricao text, valor numeric, data_vencimento date, status text,
  cliente text, company_id uuid NOT NULL, recorrente boolean DEFAULT false, lancamento_pai_id uuid
);

-- Corpo de produção (2026-10-10).
CREATE OR REPLACE FUNCTION public.trg_validate_fin_lancamento_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only enforce when status is REALIZADO
  IF OLD.status = 'REALIZADO' THEN
    -- Check if critical fields changed
    IF (
      NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
      OR NEW.conta_id IS DISTINCT FROM OLD.conta_id
      OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
      OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
    ) THEN
      -- Require justificativa_edicao
      IF NEW.justificativa_edicao IS NULL OR TRIM(NEW.justificativa_edicao) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória ao editar lançamento realizado (campos: valor, categoria, conta, data, centro de custo)'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_validate_fin_lancamento_update BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_fin_lancamento_update();

CREATE FUNCTION public.cat_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF; END; $$;

CREATE FUNCTION public.cat_expect_error(p_sql text, p_like text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % — erro inesperado: %', p_msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % — era esperado erro %', p_msg, p_like;
END; $$;

-- Ids das prévias, em ordem, para comparar.
CREATE FUNCTION public.cat_ids(p json) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(x->>'descricao', ' | ' ORDER BY x->>'descricao'), '') FROM json_array_elements(p) x
$$;

CREATE FUNCTION public.cat_seed() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  INSERT INTO fin_categorias (id, nome, tipo, ativo, company_id) VALUES
    ('c0000000-0000-4000-8000-000000000001', 'Manutenção', 'despesa', true, A),
    ('c0000000-0000-4000-8000-000000000002', 'Equipamentos', 'despesa', true, A),
    ('c0000000-0000-4000-8000-000000000003', 'Receitas diversas', 'receita', true, A),
    ('c0000000-0000-4000-8000-000000000004', 'Inativa', 'despesa', false, A),
    ('c0000000-0000-4000-8000-000000000005', 'Descontos', 'despesa', true, A),
    ('c0000000-0000-4000-8000-000000000006', 'Energia', 'despesa', true, A),
    ('c0000000-0000-4000-8000-0000000000b1', 'Despesa B', 'despesa', true, B);
  INSERT INTO fin_centros_custo (id, nome, company_id) VALUES
    ('cc000000-0000-4000-8000-00000000000a', 'Cozinha A', A),
    ('cc000000-0000-4000-8000-0000000000a2', 'Salão A', A),
    ('cc000000-0000-4000-8000-00000000000b', 'Cozinha B', B);
  INSERT INTO fin_contas (id, nome, company_id) VALUES
    ('d0000000-0000-4000-8000-00000000000a', 'Banco A', A),
    ('d0000000-0000-4000-8000-00000000000c', 'Caixa A', A);

  INSERT INTO fin_lancamentos (id, tipo, valor, descricao, status, company_id, centro_custo_id, conta_id, conta_destino_id, origem, conciliado) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'DESPESA', 100, 'MANUTENÇÃO DO FREEZER', 'REALIZADO', A, NULL, 'd0000000-0000-4000-8000-00000000000a', NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000002', 'RECEITA', 50, 'Reembolso manutenção', 'REALIZADO', A, NULL, 'd0000000-0000-4000-8000-00000000000a', NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000003', 'TRANSFERENCIA', 700, 'Transferência manutenção', 'REALIZADO', A, NULL, 'd0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000c', 'manual', false),
    ('a0000000-0000-4000-8000-000000000004', 'DESPESA', 10, 'Desconto 100% aplicado', 'REALIZADO', A, 'cc000000-0000-4000-8000-0000000000a2', NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000005', 'DESPESA', 11, 'Desconto 1000 aplicado', 'REALIZADO', A, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000006', 'DESPESA', 300, 'Aluguel loja', 'REALIZADO', A, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000007', 'DESPESA', 300, 'Aluguel sala', 'CANCELADO', A, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000008', 'DESPESA', 40, 'Frete', 'REALIZADO', A, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000009', 'DESPESA', 60, 'Gás', 'REALIZADO', A, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000010', 'DESPESA', 200, 'Energia elétrica', 'REALIZADO', A, 'cc000000-0000-4000-8000-00000000000a', NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-0000000000b1', 'DESPESA', 90, 'Manutenção B', 'REALIZADO', B, NULL, NULL, NULL, 'manual', false),
    ('a0000000-0000-4000-8000-000000000011', 'DESPESA', 70, 'Manutenção extrato pendente', 'REALIZADO', A, NULL, 'd0000000-0000-4000-8000-00000000000a', NULL, 'conciliacao', false),
    ('a0000000-0000-4000-8000-000000000012', 'DESPESA', 25, 'Manutenção boleto', 'REALIZADO', A, NULL, 'd0000000-0000-4000-8000-00000000000a', NULL, 'espelho_cp', false);
  -- Rateio com a linha sem categoria: a categoria do cabeçalho seria ignorada nos relatórios.
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES
    ('a0000000-0000-4000-8000-000000000006', NULL, 300, A);

  INSERT INTO fin_regras_categorizacao (padrao, tipo_match, categoria_id, centro_custo_id, prioridade, company_id, created_at) VALUES
    ('manutencao', 'contem', 'c0000000-0000-4000-8000-000000000001', NULL, 0, A, '2026-10-01'),
    ('freezer', 'contem', 'c0000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-00000000000a', 10, A, '2026-10-02'),
    ('100%', 'contem', 'c0000000-0000-4000-8000-000000000005', 'cc000000-0000-4000-8000-00000000000a', 0, A, '2026-10-03'),
    ('aluguel', 'contem', 'c0000000-0000-4000-8000-000000000001', NULL, 0, A, '2026-10-04'),
    ('frete', 'contem', 'c0000000-0000-4000-8000-0000000000b1', NULL, 0, A, '2026-10-05'),
    ('gas', 'contem', 'c0000000-0000-4000-8000-000000000004', NULL, 0, A, '2026-10-06'),
    ('energia eletrica', 'exato', 'c0000000-0000-4000-8000-000000000006', 'cc000000-0000-4000-8000-00000000000b', 0, A, '2026-10-07'),
    ('manutencao', 'contem', 'c0000000-0000-4000-8000-0000000000b1', NULL, 0, B, '2026-10-08'),
    -- Padrão vazio casaria tudo; regex aceita pelo JS e recusada pelo Postgres.
    ('', 'contem', 'c0000000-0000-4000-8000-000000000001', NULL, 50, A, '2026-10-09'),
    ('   ', 'contem', 'c0000000-0000-4000-8000-000000000001', NULL, 50, A, '2026-10-09'),
    ('(?<nome>freezer)', 'regex', 'c0000000-0000-4000-8000-000000000001', NULL, -1, A, '2026-10-09');
END; $$;

CREATE FUNCTION public.cat_reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE fin_regras_categorizacao, fin_lancamento_rateios, fin_lancamentos, fin_contas, fin_centros_custo, fin_categorias;
  PERFORM cat_seed();
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.permissions', 'financeiro:categorizacao:view,financeiro:categorizacao:manage,financeiro:lancamentos:view,financeiro:alertas:view', false);
END; $$;

-- ─── Antes: definições de produção ──────────────────────────────────────────
\ir ../../../docs/categorizacao-regras/reversao.sql

CREATE FUNCTION public.run_categorizacao_antes() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM cat_reset();
  PERFORM cat_assert(public.contar_lancamentos_sem_categoria() = 11, 'antes: a contagem inclui a transferência e a linha pendente do extrato (11)');
  PERFORM cat_expect_error('SELECT public.aplicar_regras_categorizacao()', 'Justificativa obrigatória%',
    'antes: Aplicar Regras falha no gatilho de lançamento realizado');
  PERFORM cat_assert((SELECT count(*) FROM fin_lancamentos WHERE categoria_id IS NOT NULL) = 0, 'antes: a falha desfaz tudo');
  RETURN 'antes: defeitos reproduzidos';
END; $$;
SELECT public.run_categorizacao_antes();

-- ─── Depois: migration (duas vezes: precisa ser reaplicável) ────────────────
\ir ../../migrations/20261010190000_fix_categorizacao_regras.sql
\ir ../../migrations/20261010190000_fix_categorizacao_regras.sql

CREATE FUNCTION public.run_categorizacao_depois() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
  r json;
  v_l record;
BEGIN
  PERFORM cat_reset();

  -- Grants e assinatura da prévia
  PERFORM cat_assert(to_regprocedure('public.preview_regra_categorizacao(text,text)') IS NULL, 'prévia de 2 argumentos removida');
  PERFORM cat_assert(has_function_privilege('authenticated', 'public.preview_regra_categorizacao(text,text,uuid)', 'EXECUTE'), 'prévia executável por authenticated');
  PERFORM cat_assert(NOT has_function_privilege('anon', 'public.preview_regra_categorizacao(text,text,uuid)', 'EXECUTE'), 'prévia fechada para anon');
  PERFORM cat_assert((SELECT bool_and(p.proconfig = ARRAY['search_path=""'])
      FROM pg_proc p WHERE p.proname IN ('contar_lancamentos_sem_categoria', 'aplicar_regras_categorizacao', 'preview_regra_categorizacao')),
    'as 3 funções da categorização com search_path vazio');

  -- Contagem: transferência e cancelado fora; rateio sem categoria conta
  PERFORM cat_assert(public.contar_lancamentos_sem_categoria() = 9, 'contagem sem transferência nem linha pendente do extrato (9; espelho de boleto conta)');

  -- Prévia: sem acento, sem transferência, tipo da categoria, % literal, rateio e cancelado fora
  r := public.preview_regra_categorizacao('manutencao', 'contem');
  PERFORM cat_assert(cat_ids(r) = 'MANUTENÇÃO DO FREEZER | Reembolso manutenção', 'prévia sem categoria: despesa e receita, sem transferência, sem acento — veio ' || cat_ids(r));
  r := public.preview_regra_categorizacao('manutencao', 'contem', 'c0000000-0000-4000-8000-000000000001');
  PERFORM cat_assert(cat_ids(r) = 'MANUTENÇÃO DO FREEZER', 'prévia com categoria de despesa só traz despesa — veio ' || cat_ids(r));
  r := public.preview_regra_categorizacao('manutencao', 'contem', 'c0000000-0000-4000-8000-000000000003');
  PERFORM cat_assert(cat_ids(r) = 'Reembolso manutenção', 'prévia com categoria de receita só traz receita — veio ' || cat_ids(r));
  r := public.preview_regra_categorizacao('manutencao', 'contem', 'c0000000-0000-4000-8000-0000000000b1');
  PERFORM cat_assert(json_array_length(r) = 0, 'prévia com categoria de outra empresa: nada');
  r := public.preview_regra_categorizacao('gas', 'contem', 'c0000000-0000-4000-8000-000000000004');
  PERFORM cat_assert(json_array_length(r) = 0, 'prévia com categoria inativa: nada');
  r := public.preview_regra_categorizacao('100%', 'contem');
  PERFORM cat_assert(cat_ids(r) = 'Desconto 100% aplicado', '% do padrão é texto, não curinga — veio ' || cat_ids(r));
  r := public.preview_regra_categorizacao('aluguel', 'contem');
  PERFORM cat_assert(json_array_length(r) = 0, 'prévia ignora lançamento com rateio e cancelado');
  r := public.preview_regra_categorizacao('a', 'contem');
  PERFORM cat_assert(json_array_length(r) = 6 AND (r->0->>'total')::int = 6,
    'prévia traz o total; espelho, extrato pendente, rateio e transferência fora — veio ' || cat_ids(r));
  PERFORM cat_assert(json_array_length(public.preview_regra_categorizacao('', 'contem')) = 0
    AND json_array_length(public.preview_regra_categorizacao('   ', 'contem')) = 0, 'padrão vazio não casa nada');
  PERFORM cat_expect_error($q$SELECT public.preview_regra_categorizacao('(?<nome>x)', 'regex')$q$, 'invalid regular expression%',
    'regex recusada pelo Postgres falha já no teste, mesmo sem candidato');
  r := public.preview_regra_categorizacao('ENERGIA ELETRICA', 'exato');
  PERFORM cat_assert(cat_ids(r) = 'Energia elétrica', 'exato sem acento e sem caixa — veio ' || cat_ids(r));
  r := public.preview_regra_categorizacao('^manut', 'regex');
  PERFORM cat_assert(cat_ids(r) = 'MANUTENÇÃO DO FREEZER', 'regex continua igual (com acento, sem caixa) — veio ' || cat_ids(r));

  -- Permissão e tenant
  PERFORM set_config('test.permissions', 'financeiro:categorizacao:view', false);
  PERFORM cat_expect_error('SELECT public.aplicar_regras_categorizacao()', 'PERMISSION_DENIED', 'aplicar exige manage');
  -- Chave legada, como nas policies de fin_regras_categorizacao.
  PERFORM set_config('test.permissions', 'finance:read', false);
  PERFORM cat_assert(public.contar_lancamentos_sem_categoria() = 9
    AND json_array_length(public.preview_regra_categorizacao('manutencao', 'contem')) = 2, 'finance:read conta e testa');
  PERFORM cat_expect_error('SELECT public.aplicar_regras_categorizacao()', 'PERMISSION_DENIED', 'finance:read não aplica');
  PERFORM set_config('test.permissions', 'financeiro:categorizacao:view,financeiro:categorizacao:manage,financeiro:lancamentos:view,financeiro:alertas:view', false);

  -- Aplicar: não falha no gatilho, grava justificativa, respeita prioridade, tipo, empresa e rateio
  r := public.aplicar_regras_categorizacao();
  PERFORM cat_assert((r->>'total')::int = 9 AND (r->>'categorizados')::int = 3
      AND (r->'regras_com_erro')::text = '["(?<nome>freezer)"]',
    'aplicar: 3 de 9 e a regex recusada volta em regras_com_erro sem derrubar as outras — veio ' || r::text);

  SELECT categoria_id, centro_custo_id, justificativa_edicao INTO v_l FROM fin_lancamentos WHERE id = 'a0000000-0000-4000-8000-000000000001';
  PERFORM cat_assert(v_l.categoria_id = 'c0000000-0000-4000-8000-000000000002'
    AND v_l.centro_custo_id = 'cc000000-0000-4000-8000-00000000000a'
    AND v_l.justificativa_edicao = 'Categorização automática pela regra "freezer"',
    'prioridade maior classifica primeiro, com centro e justificativa');
  SELECT categoria_id, centro_custo_id INTO v_l FROM fin_lancamentos WHERE id = 'a0000000-0000-4000-8000-000000000004';
  PERFORM cat_assert(v_l.categoria_id = 'c0000000-0000-4000-8000-000000000005' AND v_l.centro_custo_id = 'cc000000-0000-4000-8000-0000000000a2',
    'desconto 100% categorizado; o centro que o lançamento já tinha prevalece sobre o da regra');
  SELECT categoria_id, centro_custo_id INTO v_l FROM fin_lancamentos WHERE id = 'a0000000-0000-4000-8000-000000000010';
  PERFORM cat_assert(v_l.categoria_id = 'c0000000-0000-4000-8000-000000000006' AND v_l.centro_custo_id = 'cc000000-0000-4000-8000-00000000000a',
    'exato categoriza e o centro de outra empresa é ignorado (mantém o atual)');
  PERFORM cat_assert((SELECT count(*) FROM fin_lancamentos WHERE categoria_id IS NULL AND id IN (
      'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005',
      'a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000008',
      'a0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000012',
      'a0000000-0000-4000-8000-0000000000b1')) = 10,
    'intactos: receita, transferência, 1000, rateio, cancelado, categoria de outra empresa, categoria inativa, extrato pendente, espelho de boleto, outra empresa');
  PERFORM cat_assert((SELECT count(*) FROM fin_lancamentos WHERE justificativa_edicao IS NOT NULL) = 3, 'justificativa só nos categorizados');
  PERFORM cat_assert(public.contar_lancamentos_sem_categoria() = 6, 'contagem cai para 6');

  -- Reaplicar não muda nada
  PERFORM set_config('test.permissions', 'finance:manage', false);
  r := public.aplicar_regras_categorizacao();
  PERFORM cat_assert((r->>'total')::int = 6 AND (r->>'categorizados')::int = 0, 'segunda aplicação (chave legada finance:manage): 0 de 6 — veio ' || r::text);
  PERFORM set_config('test.permissions', 'financeiro:categorizacao:view,financeiro:categorizacao:manage,financeiro:lancamentos:view,financeiro:alertas:view', false);

  -- Alerta do Dashboard e Livro Razão "Sem categoria" sem transferência
  PERFORM cat_assert((public.get_fin_alertas()->>'lancamentos_sem_categoria')::int = 6, 'alerta do Dashboard igual à contagem (6)');
  r := public.list_fin_lancamentos_cursor(p_sem_categoria => true);
  PERFORM cat_assert(json_array_length(r->'items') = 6
      AND NOT EXISTS (SELECT 1 FROM json_array_elements(r->'items') x WHERE x->>'tipo' = 'TRANSFERENCIA'),
    'Livro Razão "Sem categoria" sem transferência — veio ' || json_array_length(r->'items'));
  r := public.get_fin_lancamentos_totais(p_sem_categoria => true);
  PERFORM cat_assert((r->>'total_transferencia')::numeric = 0 AND (r->>'total_despesa')::numeric = 436 AND (r->>'total_receita')::numeric = 50,
    'totais do "Sem categoria" sem transferência — veio ' || r::text);
  r := public.list_fin_lancamentos_cursor();
  PERFORM cat_assert(json_array_length(r->'items') = 10, 'Livro Razão sem filtro continua trazendo tudo, transferência inclusive');
  r := public.get_fin_lancamentos_totais();
  PERFORM cat_assert((r->>'total_transferencia')::numeric = 700, 'totais sem filtro continuam com a transferência');

  -- Outra empresa: só os dados dela
  PERFORM set_config('test.company_id', B::text, false);
  PERFORM cat_assert(public.contar_lancamentos_sem_categoria() = 1, 'unidade B vê só o dela');
  r := public.aplicar_regras_categorizacao();
  PERFORM cat_assert((r->>'categorizados')::int = 1
    AND (SELECT categoria_id FROM fin_lancamentos WHERE id = 'a0000000-0000-4000-8000-0000000000b1') = 'c0000000-0000-4000-8000-0000000000b1',
    'unidade B aplica a própria regra');
  PERFORM cat_assert((SELECT count(*) FROM fin_lancamentos WHERE company_id = A AND categoria_id IS NOT NULL) = 3, 'unidade A intacta');
  PERFORM set_config('test.company_id', A::text, false);

  RETURN 'depois: OK';
END; $$;
SELECT public.run_categorizacao_depois();

-- ─── Reversão e nova aplicação ──────────────────────────────────────────────
\ir ../../../docs/categorizacao-regras/reversao.sql
SELECT public.run_categorizacao_antes();
\ir ../../migrations/20261010190000_fix_categorizacao_regras.sql
SELECT public.run_categorizacao_depois();

SELECT 'categorizacao_regras_ephemeral: OK' AS resultado;
