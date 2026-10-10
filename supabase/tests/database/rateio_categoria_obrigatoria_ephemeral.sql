\set ON_ERROR_STOP on

-- Financeiro › Rateio: teste de integração em PostgreSQL real e DESCARTÁVEL.
-- Instala a definição de produção anterior (docs/rateio-categoria-obrigatoria/reversao.sql),
-- mostra o defeito (linha de rateio sem categoria é aceita), aplica a migration
-- 20261010210000 duas vezes e confere o comportamento novo. Depois reverte e aplica de novo.
-- O trigger trg_fin_rateio_valida_empresa tem a definição de produção (2026-10-10).
-- Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/rateio_categoria_obrigatoria_ephemeral.sql

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

-- Como no Supabase: função nova em public nasce executável por anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.fin_categorias (id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL);
CREATE TABLE public.fin_centros_custo (id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL);
CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL,
  categoria_id uuid REFERENCES public.fin_categorias(id), centro_custo_id uuid REFERENCES public.fin_centros_custo(id),
  valor numeric NOT NULL, percentual numeric, company_id uuid NOT NULL, cmv_incluir boolean
);
-- Quem grava pelo PostgREST não enxerga o cadastro: só o rateio.
GRANT SELECT, INSERT, UPDATE ON public.fin_lancamento_rateios TO authenticated;

INSERT INTO public.fin_categorias (id, nome, company_id) VALUES
  ('c0000000-0000-4000-8000-00000000000a', 'Peixes', '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-00000000000b', 'Bebidas da outra', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.fin_centros_custo (id, nome, company_id) VALUES
  ('cc000000-0000-4000-8000-00000000000a', 'Cozinha', '11111111-1111-4111-8111-111111111111'),
  ('cc000000-0000-4000-8000-00000000000b', 'Salão da outra', '22222222-2222-4222-8222-222222222222');

\ir ../../../docs/rateio-categoria-obrigatoria/reversao.sql

-- Definição de produção (2026-10-10).
CREATE TRIGGER trg_fin_rateio_valida_empresa
  BEFORE INSERT OR UPDATE OF categoria_id, centro_custo_id, company_id
  ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public.fin_rateio_valida_empresa();

CREATE FUNCTION public.rat_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF; END; $$;

CREATE FUNCTION public.rat_expect_error(p_sql text, p_like text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % — erro inesperado: %', p_msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % — era esperado erro %', p_msg, p_like;
END; $$;

-- Título legado com uma linha sem categoria (como o boleto de R$ 707,60) e um com rateio completo.
CREATE FUNCTION public.rat_seed() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.fin_lancamento_rateios;
  ALTER TABLE public.fin_lancamento_rateios DISABLE TRIGGER trg_fin_rateio_valida_empresa;
  INSERT INTO public.fin_lancamento_rateios (id, lancamento_id, categoria_id, valor, company_id) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 400, '11111111-1111-4111-8111-111111111111'),
    ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', NULL, 307.60, '11111111-1111-4111-8111-111111111111'),
    ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000a', 100, '11111111-1111-4111-8111-111111111111');
  ALTER TABLE public.fin_lancamento_rateios ENABLE TRIGGER trg_fin_rateio_valida_empresa;
END; $$;

CREATE FUNCTION public.rat_antes() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.rat_seed();
  -- O defeito: linha sem categoria entra (e a cópia da baixa leva a linha nula junto).
  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id)
    VALUES ('b0000000-0000-4000-8000-000000000003', NULL, 100, '11111111-1111-4111-8111-111111111111');
  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
    SELECT 'b0000000-0000-4000-8000-000000000004', categoria_id, centro_custo_id, valor, percentual, company_id
    FROM public.fin_lancamento_rateios WHERE lancamento_id = 'b0000000-0000-4000-8000-000000000001';
  PERFORM public.rat_assert((SELECT count(*) FROM public.fin_lancamento_rateios WHERE categoria_id IS NULL) = 3,
    'antes: linha nova sem categoria e a cópia da baixa são aceitas');
  RETURN 'antes: defeito reproduzido';
END; $$;

CREATE FUNCTION public.rat_depois() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant text := '''11111111-1111-4111-8111-111111111111''';
BEGIN
  PERFORM public.rat_seed();

  -- Função de trigger: SECURITY DEFINER, search_path vazio e fora do alcance do cliente.
  PERFORM public.rat_assert((SELECT prosecdef FROM pg_proc WHERE oid = 'public.fin_rateio_valida_empresa()'::regprocedure),
    'continua SECURITY DEFINER');
  PERFORM public.rat_assert((SELECT proconfig FROM pg_proc WHERE oid = 'public.fin_rateio_valida_empresa()'::regprocedure) = ARRAY['search_path=""'],
    'continua com search_path vazio');
  PERFORM public.rat_assert(NOT has_function_privilege('authenticated', 'public.fin_rateio_valida_empresa()', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.fin_rateio_valida_empresa()', 'EXECUTE'),
    'anon/authenticated não executam a função');

  -- Linha nova sem categoria: recusada, com o código no começo da mensagem.
  PERFORM public.rat_expect_error(
    'INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES (''b0000000-0000-4000-8000-000000000003'', NULL, 100, ' || A || ')',
    'RATEIO_SEM_CATEGORIA:%', 'INSERT sem categoria');
  -- Cópia da baixa de um título legado com linha nula: recusada inteira.
  PERFORM public.rat_expect_error(
    'INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
       SELECT ''b0000000-0000-4000-8000-000000000004'', categoria_id, centro_custo_id, valor, percentual, company_id
       FROM public.fin_lancamento_rateios WHERE lancamento_id = ''b0000000-0000-4000-8000-000000000001''',
    'RATEIO_SEM_CATEGORIA:%', 'cópia da baixa com linha sem categoria');
  PERFORM public.rat_assert(NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateios WHERE lancamento_id = 'b0000000-0000-4000-8000-000000000004'),
    'a cópia recusada não deixou linha nenhuma');
  -- Apagar a categoria de uma linha válida: recusado.
  PERFORM public.rat_expect_error(
    'UPDATE public.fin_lancamento_rateios SET categoria_id = NULL WHERE id = ''a0000000-0000-4000-8000-000000000003''',
    'RATEIO_SEM_CATEGORIA:%', 'UPDATE que apaga a categoria');

  -- As conferências de empresa continuam.
  PERFORM public.rat_expect_error(
    'INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES (''b0000000-0000-4000-8000-000000000003'', ''c0000000-0000-4000-8000-00000000000b'', 100, ' || A || ')',
    'NOT_FOUND: categoria do rateio não pertence à empresa', 'categoria de outra empresa');
  PERFORM public.rat_expect_error(
    'INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, company_id) VALUES (''b0000000-0000-4000-8000-000000000003'', ''c0000000-0000-4000-8000-00000000000a'', ''cc000000-0000-4000-8000-00000000000b'', 100, ' || A || ')',
    'NOT_FOUND: centro de custo do rateio não pertence à empresa', 'centro de custo de outra empresa');

  -- Linha com categoria da empresa: aceita.
  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, company_id)
    VALUES ('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-00000000000a', 'cc000000-0000-4000-8000-00000000000a', 100, '11111111-1111-4111-8111-111111111111');

  -- Linha legada sem categoria: a decisão do CMV ainda é gravada (UPDATE só de cmv_incluir não dispara o trigger)…
  UPDATE public.fin_lancamento_rateios SET cmv_incluir = false WHERE id = 'a0000000-0000-4000-8000-000000000002';
  PERFORM public.rat_assert((SELECT cmv_incluir FROM public.fin_lancamento_rateios WHERE id = 'a0000000-0000-4000-8000-000000000002') = false,
    'linha legada nula aceita a decisão do CMV');
  -- …e escolher a categoria corrige a linha.
  UPDATE public.fin_lancamento_rateios SET categoria_id = 'c0000000-0000-4000-8000-00000000000a' WHERE id = 'a0000000-0000-4000-8000-000000000002';
  PERFORM public.rat_assert((SELECT count(*) FROM public.fin_lancamento_rateios WHERE categoria_id IS NULL) = 0,
    'linha legada corrigida com a categoria');

  RETURN 'depois: OK';
END; $$;

SELECT public.rat_antes();

\ir ../../migrations/20261010210000_fin_rateio_categoria_obrigatoria.sql
\ir ../../migrations/20261010210000_fin_rateio_categoria_obrigatoria.sql
SELECT public.rat_depois();

-- Quem grava pelo PostgREST (authenticated, sem SELECT no cadastro) com categoria da empresa: aceito.
SET ROLE authenticated;
INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id)
  VALUES ('b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-00000000000a', 50, '11111111-1111-4111-8111-111111111111');
SELECT public.rat_expect_error(
  'INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES (''b0000000-0000-4000-8000-000000000005'', NULL, 50, ''11111111-1111-4111-8111-111111111111'')',
  'RATEIO_SEM_CATEGORIA:%', 'INSERT direto (authenticated) sem categoria');
RESET ROLE;

-- ─── Reversão e nova aplicação ──────────────────────────────────────────────
\ir ../../../docs/rateio-categoria-obrigatoria/reversao.sql
SELECT public.rat_antes();
\ir ../../migrations/20261010210000_fin_rateio_categoria_obrigatoria.sql
SELECT public.rat_depois();

SELECT 'rateio_categoria_obrigatoria_ephemeral: OK' AS resultado;
