\set ON_ERROR_STOP on

-- Centro de custo no DRE, DFC e Dashboard: teste de integração em banco PostgreSQL real e descartável.
-- Usa as definições reais de get_current_company_id/assert_tenant/is_company_member e da regra de
-- caixa do DFC; só auth.uid() e has_any_permission são simulados.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA auth;

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('test.user_id', true), '')::uuid $$;

CREATE TABLE public.companies (id uuid PRIMARY KEY, nome text NOT NULL, ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, company_id uuid);
CREATE TABLE public.company_memberships (user_id uuid NOT NULL, company_id uuid NOT NULL, status text NOT NULL DEFAULT 'active');

CREATE TABLE public.fin_centros_custo (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  codigo text,
  tipo text NOT NULL,
  parent_id uuid,
  ordem integer,
  ativo boolean NOT NULL DEFAULT true,
  grupo text,
  centro_custo_padrao_id uuid,
  system_key text,
  excluir_dos_totais boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY,
  tipo text NOT NULL,
  valor numeric NOT NULL,
  data_competencia date,
  data_pagamento date,
  categoria_id uuid,
  centro_custo_id uuid,
  status text NOT NULL,
  descricao text,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_em timestamptz,
  origem text,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY,
  lancamento_id uuid NOT NULL,
  categoria_id uuid,
  centro_custo_id uuid,
  valor numeric NOT NULL,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY,
  valor numeric NOT NULL,
  data_competencia date,
  data_vencimento date NOT NULL,
  categoria_id uuid,
  centro_custo_id uuid,
  status text NOT NULL,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas_receber (
  id uuid PRIMARY KEY,
  valor numeric NOT NULL,
  data_competencia date,
  data_vencimento date NOT NULL,
  categoria_id uuid,
  centro_custo_id uuid,
  status text NOT NULL,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  company_id uuid NOT NULL
);

-- Definições idênticas às de produção (pg_get_functiondef em 2026-10-06).
CREATE FUNCTION public.is_company_member(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.company_memberships m JOIN public.companies c ON c.id=m.company_id
   WHERE m.user_id=p_user_id AND m.company_id=p_company_id AND m.status='active' AND c.ativo);
$function$;

CREATE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_company uuid; v_requested text;
BEGIN
 IF v_user IS NULL THEN RETURN NULL; END IF;
 v_requested := NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
 IF v_requested IS NOT NULL THEN
   BEGIN v_company := v_requested::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END;
 ELSE
   SELECT company_id INTO v_company FROM public.profiles WHERE id=v_user;
 END IF;
 IF NOT public.is_company_member(v_user,v_company) THEN
   IF v_requested IS NULL THEN RETURN NULL; END IF;
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED';
 END IF;
 RETURN v_company;
END;
$function$;

CREATE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_company uuid := public.get_current_company_id();
BEGIN
 IF v_company IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END IF;
 RETURN v_company;
END;
$function$;

-- Permissões efetivas simuladas: lista separada por vírgula em test.permissions.
CREATE FUNCTION public.has_any_permission(p_user_id uuid, p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_user_id IS NOT NULL
    AND p_user_id = auth.uid()
    AND p_keys && pg_catalog.string_to_array(COALESCE(current_setting('test.permissions', true), ''), ',')
$$;

-- Regra de caixa do DFC, idêntica à de produção (pg_get_functiondef em 2026-10-06).
CREATE FUNCTION public._fin_dfc_effective_allocations(p_company_id uuid, p_start date, p_end_inclusive date)
 RETURNS TABLE(allocation_id uuid, allocation_source text, lancamento_id uuid, categoria_id uuid, valor numeric, tipo text, effective_date date, descricao text, status text, origem text, entry_excluded_from_reports boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    allocation.id AS allocation_id,
    'allocation'::text AS allocation_source,
    ledger.id AS lancamento_id,
    allocation.categoria_id,
    allocation.valor,
    ledger.tipo,
    COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) AS effective_date,
    COALESCE(NULLIF(pg_catalog.btrim(ledger.descricao), ''), 'Lançamento sem descrição') AS descricao,
    ledger.status,
    ledger.origem,
    ledger.excluir_dos_relatorios AS entry_excluded_from_reports
  FROM public.fin_lancamento_rateios AS allocation
  JOIN public.fin_lancamentos AS ledger
    ON ledger.id = allocation.lancamento_id
   AND ledger.company_id = p_company_id
  WHERE allocation.company_id = p_company_id
    AND ledger.status IN ('REALIZADO', 'CONCILIADO')
    AND ledger.tipo <> 'TRANSFERENCIA'
    AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    AND (p_start IS NULL
      OR COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) >= p_start)
    AND (p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) <= p_end_inclusive)

  UNION ALL

  SELECT
    ledger.id AS allocation_id,
    'entry'::text AS allocation_source,
    ledger.id AS lancamento_id,
    ledger.categoria_id,
    ledger.valor,
    ledger.tipo,
    COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) AS effective_date,
    COALESCE(NULLIF(pg_catalog.btrim(ledger.descricao), ''), 'Lançamento sem descrição') AS descricao,
    ledger.status,
    ledger.origem,
    ledger.excluir_dos_relatorios AS entry_excluded_from_reports
  FROM public.fin_lancamentos AS ledger
  WHERE ledger.company_id = p_company_id
    AND ledger.status IN ('REALIZADO', 'CONCILIADO')
    AND ledger.tipo <> 'TRANSFERENCIA'
    AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    AND (p_start IS NULL
      OR COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) >= p_start)
    AND (p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, ledger.data_competencia) <= p_end_inclusive)
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios AS allocation
      WHERE allocation.lancamento_id = ledger.id AND allocation.company_id = p_company_id
    );
$function$;

-- Em produção as três RPCs já existem com o EXECUTE de PUBLIC revogado/concedido; aqui nascem da migration.
\ir ../../migrations/20261006162551_fin_relatorios_centro_custo.sql

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

-- ── Dados ────────────────────────────────────────────────────────────────────────────────────────
-- Empresa A (o usuário é membro) e empresa B (não é). Setembro/2026 é o período testado.
INSERT INTO public.companies (id, nome) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'Empresa A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Empresa B');
INSERT INTO public.profiles (id, company_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-00000000000a');
INSERT INTO public.company_memberships (user_id, company_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-00000000000a');

INSERT INTO public.fin_centros_custo (id, nome, company_id) VALUES
  ('cc000000-0000-0000-0000-0000000000c1', 'Cozinha', 'a0000000-0000-0000-0000-00000000000a'),
  ('cc000000-0000-0000-0000-0000000000c2', 'Salão', 'a0000000-0000-0000-0000-00000000000a'),
  ('cc000000-0000-0000-0000-0000000000b1', 'Centro da B', 'b0000000-0000-0000-0000-00000000000b');

INSERT INTO public.fin_categorias (id, nome, codigo, tipo, ordem, company_id) VALUES
  ('ca000000-0000-0000-0000-0000000000a1', 'Vendas', '1', 'receita', 10, 'a0000000-0000-0000-0000-00000000000a'),
  ('ca000000-0000-0000-0000-0000000000a2', 'Insumos', '2', 'despesa', 20, 'a0000000-0000-0000-0000-00000000000a'),
  ('ca000000-0000-0000-0000-0000000000a3', 'Aluguel', '3', 'despesa', 30, 'a0000000-0000-0000-0000-00000000000a'),
  ('ca000000-0000-0000-0000-0000000000b1', 'Despesa da B', '1', 'despesa', 10, 'b0000000-0000-0000-0000-00000000000b');

INSERT INTO public.fin_contas (id, saldo_inicial, company_id) VALUES
  ('c0000000-0000-0000-0000-0000000000a1', 1000, 'a0000000-0000-0000-0000-00000000000a');

-- Lançamentos da empresa A (receita = RECEITA; demais DESPESA).
INSERT INTO public.fin_lancamentos (id, tipo, valor, data_competencia, data_pagamento, categoria_id, centro_custo_id, status, origem, conciliado, company_id) VALUES
  -- L1: receita sem rateio, Salão
  ('1a000000-0000-0000-0000-000000000001', 'RECEITA', 1000, '2026-09-05', '2026-09-05', 'ca000000-0000-0000-0000-0000000000a1', 'cc000000-0000-0000-0000-0000000000c2', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L2: despesa sem rateio, Cozinha
  ('1a000000-0000-0000-0000-000000000002', 'DESPESA', 300, '2026-09-06', '2026-09-06', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L3: despesa com rateio; cabeçalho Salão (escondido na tela com o rateio ligado)
  ('1a000000-0000-0000-0000-000000000003', 'DESPESA', 500, '2026-09-07', '2026-09-07', NULL, 'cc000000-0000-0000-0000-0000000000c2', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L4: despesa apontando para centro de OUTRA empresa
  ('1a000000-0000-0000-0000-000000000004', 'DESPESA', 80, '2026-09-08', '2026-09-08', 'ca000000-0000-0000-0000-0000000000a3', 'cc000000-0000-0000-0000-0000000000b1', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L5: despesa sem centro
  ('1a000000-0000-0000-0000-000000000005', 'DESPESA', 50, '2026-09-09', '2026-09-09', 'ca000000-0000-0000-0000-0000000000a3', NULL, 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L6: transferência — fora dos relatórios
  ('1a000000-0000-0000-0000-000000000006', 'TRANSFERENCIA', 999, '2026-09-10', '2026-09-10', NULL, 'cc000000-0000-0000-0000-0000000000c1', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L7: conciliação ainda não conciliada — fora dos relatórios
  ('1a000000-0000-0000-0000-000000000007', 'DESPESA', 70, '2026-09-11', '2026-09-11', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 'REALIZADO', 'conciliacao', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L8: agosto — fora do período (entra no saldo inicial do DFC)
  ('1a000000-0000-0000-0000-000000000008', 'DESPESA', 40, '2026-08-20', '2026-08-20', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a'),
  -- L9: julho, sem centro — período sem nenhum centro de custo
  ('1a000000-0000-0000-0000-000000000009', 'DESPESA', 25, '2026-07-15', '2026-07-15', 'ca000000-0000-0000-0000-0000000000a2', NULL, 'REALIZADO', 'manual', false, 'a0000000-0000-0000-0000-00000000000a');

INSERT INTO public.fin_lancamento_rateios (id, lancamento_id, categoria_id, centro_custo_id, valor, company_id) VALUES
  -- L3: linha com centro (Cozinha) e linha SEM centro — não herda o Salão do cabeçalho
  ('2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 200, 'a0000000-0000-0000-0000-00000000000a'),
  ('2a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-0000000000a3', NULL, 300, 'a0000000-0000-0000-0000-00000000000a'),
  -- CP2 (em aberto, com rateio): Salão + sem centro; cabeçalho Cozinha
  ('2a000000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c2', 60, 'a0000000-0000-0000-0000-00000000000a'),
  ('2a000000-0000-0000-0000-000000000004', '3a000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-0000000000a3', NULL, 40, 'a0000000-0000-0000-0000-00000000000a');

INSERT INTO public.fin_contas_pagar (id, valor, data_competencia, data_vencimento, categoria_id, centro_custo_id, status, company_id) VALUES
  ('3a000000-0000-0000-0000-000000000001', 120, '2026-09-10', '2026-09-20', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 'APROVADO', 'a0000000-0000-0000-0000-00000000000a'),
  ('3a000000-0000-0000-0000-000000000002', 100, '2026-09-12', '2026-09-22', NULL, 'cc000000-0000-0000-0000-0000000000c1', 'APROVADO', 'a0000000-0000-0000-0000-00000000000a'),
  -- paga: o DRE só soma CP em aberto
  ('3a000000-0000-0000-0000-000000000003', 777, '2026-09-12', '2026-09-22', 'ca000000-0000-0000-0000-0000000000a2', 'cc000000-0000-0000-0000-0000000000c1', 'PAGO', 'a0000000-0000-0000-0000-00000000000a');

INSERT INTO public.fin_contas_receber (id, valor, data_competencia, data_vencimento, categoria_id, centro_custo_id, status, company_id) VALUES
  ('4a000000-0000-0000-0000-000000000001', 150, '2026-09-15', '2026-09-25', 'ca000000-0000-0000-0000-0000000000a1', 'cc000000-0000-0000-0000-0000000000c2', 'A_RECEBER', 'a0000000-0000-0000-0000-00000000000a');

-- Empresa B: nunca pode aparecer para o usuário da A.
INSERT INTO public.fin_lancamentos (id, tipo, valor, data_competencia, data_pagamento, categoria_id, centro_custo_id, status, origem, conciliado, company_id) VALUES
  ('1b000000-0000-0000-0000-000000000001', 'DESPESA', 9999, '2026-09-05', '2026-09-05', 'ca000000-0000-0000-0000-0000000000b1', 'cc000000-0000-0000-0000-0000000000b1', 'REALIZADO', 'manual', false, 'b0000000-0000-0000-0000-00000000000b');

-- ── Cenários ─────────────────────────────────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('test.user_id', '11111111-1111-1111-1111-111111111111', false);
SELECT set_config('test.permissions', 'financeiro:dre:view,financeiro:fluxo:view,financeiro:dashboard:view', false);
SELECT set_config('request.headers', '{"x-company-id":"a0000000-0000-0000-0000-00000000000a"}', false);

DO $t$
DECLARE
  rec  constant text := 'ca000000-0000-0000-0000-0000000000a1';
  ins  constant text := 'ca000000-0000-0000-0000-0000000000a2';
  alu  constant text := 'ca000000-0000-0000-0000-0000000000a3';
  coz  constant text := 'cc000000-0000-0000-0000-0000000000c1';
  sal  constant text := 'cc000000-0000-0000-0000-0000000000c2';
  dre jsonb; dfc jsonb; dash jsonb; vazio jsonb; erro text;
  invariante boolean;
BEGIN
  -- DRE (competência: lançamentos + CP/CR em aberto)
  dre := public.get_fin_dre_summary('2026-09-01', '2026-09-30');
  IF (dre->'valores_por_categoria'->>rec)::numeric <> 1150
     OR (dre->'valores_por_categoria'->>ins)::numeric <> 680
     OR (dre->'valores_por_categoria'->>alu)::numeric <> 470 THEN
    RAISE EXCEPTION 'DRE: totais por categoria errados: %', dre->'valores_por_categoria';
  END IF;
  IF dre->'valores_por_centro_custo' <> jsonb_build_object(
       sal, jsonb_build_object(rec, 1150, ins, 60),
       coz, jsonb_build_object(ins, 620),
       'sem_centro', jsonb_build_object(alu, 470)) THEN
    RAISE EXCEPTION 'DRE: quebra por centro errada (rateio sem centro não pode herdar o cabeçalho): %', dre->'valores_por_centro_custo';
  END IF;
  IF dre->'centros_custo' <> jsonb_build_array(
       jsonb_build_object('id', coz, 'nome', 'Cozinha'),
       jsonb_build_object('id', sal, 'nome', 'Salão')) THEN
    RAISE EXCEPTION 'DRE: lista de centros errada: %', dre->'centros_custo';
  END IF;
  IF dre::text LIKE '%Centro da B%' OR dre::text LIKE '%cc000000-0000-0000-0000-0000000000b1%' OR dre::text LIKE '%9999%' THEN
    RAISE EXCEPTION 'DRE: vazou dado da empresa B: %', dre;
  END IF;
  IF dre::text LIKE '%linha_dre%' THEN RAISE EXCEPTION 'DRE: ainda devolve linha_dre'; END IF;

  -- DFC (caixa: só razão realizado)
  dfc := public.get_fin_dfc_summary('2026-09-01', '2026-09-30');
  IF dfc->'valores_por_categoria' <> jsonb_build_object(rec, 1000, ins, 500, alu, 430) THEN
    RAISE EXCEPTION 'DFC: totais por categoria errados: %', dfc->'valores_por_categoria';
  END IF;
  IF dfc->'valores_por_centro_custo' <> jsonb_build_object(
       sal, jsonb_build_object(rec, 1000),
       coz, jsonb_build_object(ins, 500),
       'sem_centro', jsonb_build_object(alu, 430)) THEN
    RAISE EXCEPTION 'DFC: quebra por centro errada: %', dfc->'valores_por_centro_custo';
  END IF;
  -- 1000 da conta − 40 (agosto) − 25 (julho).
  IF (dfc->>'saldo_inicial')::numeric <> 935 THEN
    RAISE EXCEPTION 'DFC: saldo inicial mudou: %', dfc->>'saldo_inicial';
  END IF;
  IF dfc::text LIKE '%Centro da B%' OR dfc::text LIKE '%linha_dre%' THEN
    RAISE EXCEPTION 'DFC: vazou empresa B ou ainda devolve linha_dre: %', dfc;
  END IF;

  -- Invariante: para cada categoria, a soma dos centros é o total da categoria.
  FOREACH vazio IN ARRAY ARRAY[dre, dfc] LOOP
    SELECT bool_and(t.total::numeric = (
             SELECT COALESCE(SUM((g.valores->>t.cat)::numeric), 0)
             FROM jsonb_each(vazio->'valores_por_centro_custo') g(chave, valores)))
      INTO invariante
      FROM jsonb_each_text(vazio->'valores_por_categoria') t(cat, total);
    IF NOT invariante THEN RAISE EXCEPTION 'Invariante soma-por-centro quebrada: %', vazio; END IF;
  END LOOP;

  -- Dashboard (caixa: despesas realizadas do período)
  dash := public.get_fin_dashboard_charts('2026-09-01', '2026-09-30')::jsonb;
  IF dash->'despesas_por_centro_custo' <> jsonb_build_array(
       jsonb_build_object('centro_custo_id', coz, 'nome', 'Cozinha', 'valor', 500),
       jsonb_build_object('centro_custo_id', NULL, 'nome', 'Sem centro de custo', 'valor', 430)) THEN
    RAISE EXCEPTION 'Dashboard: quebra por centro errada: %', dash->'despesas_por_centro_custo';
  END IF;
  IF (dash->'evolucao_mensal'->0->>'despesas')::numeric <> 930 THEN
    RAISE EXCEPTION 'Dashboard: soma dos centros não fecha com a despesa realizada: %', dash->'evolucao_mensal';
  END IF;

  -- Período sem nenhum valor com centro (julho): chaves novas vazias, total intacto.
  vazio := public.get_fin_dre_summary('2026-07-01', '2026-07-31');
  IF vazio->'centros_custo' <> '[]'::jsonb OR vazio->'valores_por_centro_custo' <> '{}'::jsonb
     OR (vazio->'valores_por_categoria'->>ins)::numeric <> 25 THEN
    RAISE EXCEPTION 'DRE julho: esperava chaves novas vazias: %', vazio;
  END IF;
  vazio := public.get_fin_dfc_summary('2026-07-01', '2026-07-31');
  IF vazio->'centros_custo' <> '[]'::jsonb OR vazio->'valores_por_centro_custo' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'DFC julho: esperava chaves novas vazias: %', vazio;
  END IF;
  vazio := public.get_fin_dashboard_charts('2026-07-01', '2026-07-31')::jsonb;
  IF vazio->'despesas_por_centro_custo' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Dashboard julho: esperava lista vazia: %', vazio;
  END IF;

  -- Outra empresa pelo header: recusado antes de qualquer leitura.
  PERFORM set_config('request.headers', '{"x-company-id":"b0000000-0000-0000-0000-00000000000b"}', true);
  BEGIN
    PERFORM public.get_fin_dre_summary('2026-09-01', '2026-09-30');
    RAISE EXCEPTION 'DRE: aceitou empresa sem vínculo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.headers', '{"x-company-id":"a0000000-0000-0000-0000-00000000000a"}', true);

  -- Sem a permissão da tela: recusado.
  PERFORM set_config('test.permissions', 'financeiro:fluxo:view', true);
  BEGIN
    PERFORM public.get_fin_dre_summary('2026-09-01', '2026-09-30');
    RAISE EXCEPTION 'DRE: aceitou usuário sem financeiro:dre:view';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    IF erro <> 'PERMISSION_DENIED' THEN RAISE; END IF;
  END;
END;
$t$;

RESET ROLE;

-- O DRE deixa de ser executável por PUBLIC/anon (DFC e Dashboard já não eram em produção).
DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.get_fin_dre_summary(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon ainda executa get_fin_dre_summary';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_fin_dre_summary(date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_fin_dre_summary';
  END IF;
END;
$acl$;

\echo centro_custo_relatorios_ephemeral: OK
