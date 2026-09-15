\set ON_ERROR_STOP on

-- Borderô: teste de integração em banco PostgreSQL real e descartável.
-- Usa as definições reais de get_current_company_id/assert_tenant/is_company_member
-- (cadeia de tenant de produção); só auth.uid() e has_any_permission são simulados.

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

CREATE TABLE public.companies (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  company_id uuid
);

CREATE TABLE public.company_memberships (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  codigo text,
  tipo text NOT NULL,
  parent_id uuid,
  ordem integer,
  ativo boolean NOT NULL DEFAULT true,
  excluir_dos_totais boolean NOT NULL DEFAULT false,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY,
  descricao text NOT NULL DEFAULT '',
  fornecedor text DEFAULT '',
  valor numeric NOT NULL,
  valor_pago numeric DEFAULT 0,
  data_competencia date,
  data_vencimento date NOT NULL,
  data_pagamento date,
  categoria_id uuid,
  status text NOT NULL,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY,
  lancamento_id uuid NOT NULL,
  categoria_id uuid,
  valor numeric NOT NULL,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY,
  tipo text NOT NULL,
  valor numeric NOT NULL,
  data_competencia date,
  data_pagamento date,
  categoria_id uuid,
  status text NOT NULL,
  descricao text,
  referencia_modulo text,
  referencia_id text,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_em timestamptz,
  origem text,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'corrente',
  banco text,
  ativo boolean NOT NULL DEFAULT true,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas_saldo_cache (
  conta_id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  saldo numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Definições idênticas às de produção (pg_get_functiondef em 2026-09-15).
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

-- Regra de caixa do DFC, idêntica à de produção (pg_get_functiondef em 2026-09-15).
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
    COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS effective_date,
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
    AND (
      p_start IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
    )
    AND (
      p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) <= p_end_inclusive
    )

  UNION ALL

  SELECT
    ledger.id AS allocation_id,
    'entry'::text AS allocation_source,
    ledger.id AS lancamento_id,
    ledger.categoria_id,
    ledger.valor,
    ledger.tipo,
    COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS effective_date,
    COALESCE(NULLIF(pg_catalog.btrim(ledger.descricao), ''), 'Lançamento sem descrição') AS descricao,
    ledger.status,
    ledger.origem,
    ledger.excluir_dos_relatorios AS entry_excluded_from_reports
  FROM public.fin_lancamentos AS ledger
  WHERE ledger.company_id = p_company_id
    AND ledger.status IN ('REALIZADO', 'CONCILIADO')
    AND ledger.tipo <> 'TRANSFERENCIA'
    AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    AND (
      p_start IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
    )
    AND (
      p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) <= p_end_inclusive
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios AS allocation
      WHERE allocation.lancamento_id = ledger.id
        AND allocation.company_id = p_company_id
    );
$function$;

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid, text[]) TO authenticated, service_role;

\ir ../../migrations/20260915190000_fin_bordero.sql
\ir ../../migrations/20260915210000_fin_bordero_despesa_completa.sql
\ir ../../migrations/20260915220000_fin_bordero_pagas_por_pagamento.sql

-- ── Unidades e usuários ──────────────────────────────────────────────────────
-- A = Loja A (principal), B = Loja B, C/D/E = cenários de saldo final.
INSERT INTO public.companies (id, nome, ativo) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Barbados Villagio', true),
  ('22222222-2222-4222-8222-222222222222', 'Barbados Matriz', true),
  ('33333333-3333-4333-8333-333333333333', 'Loja Saldo Positivo', true),
  ('44444444-4444-4444-8444-444444444444', 'Loja Saldo Negativo', true),
  ('55555555-5555-4555-8555-555555555555', 'Loja Sem Contas', true);

-- U1: só Loja A. U2: Loja A e B. U3: C, D, E. U4: membership inativo na Loja A.
INSERT INTO public.profiles (id, company_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '33333333-3333-4333-8333-333333333333'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.company_memberships (user_id, company_id, status) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '33333333-3333-4333-8333-333333333333', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '44444444-4444-4444-8444-444444444444', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '55555555-5555-4555-8555-555555555555', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '11111111-1111-4111-8111-111111111111', 'inactive');

-- ── Categorias ───────────────────────────────────────────────────────────────
INSERT INTO public.fin_categorias (id, nome, codigo, tipo, parent_id, ordem, ativo, excluir_dos_totais, company_id) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Despesas operacionais', '3', 'despesa', NULL, 30, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000002', 'Pessoal', '3.01', 'despesa', 'c0000000-0000-4000-8000-000000000001', 10, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000003', 'Marketing', '3.02', 'despesa', 'c0000000-0000-4000-8000-000000000001', 20, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000004', 'CMV', '2', 'despesa', NULL, 10, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000005', 'Peixes', '2.01', 'despesa', 'c0000000-0000-4000-8000-000000000004', 10, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000006', 'Investimentos', '5', 'despesa', NULL, 50, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000007', 'Categoria antiga', '3.99', 'despesa', 'c0000000-0000-4000-8000-000000000001', 99, false, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000008', 'Receitas', '1', 'receita', NULL, 1, true, false, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000009', 'DESPESAS NÃO OPERACIONAIS', 'NO-D', 'despesa', NULL, 9991, true, true, '11111111-1111-4111-8111-111111111111'),
  ('c0000000-0000-4000-8000-000000000010', 'Inativa sem uso', '9', 'despesa', NULL, 90, false, false, '11111111-1111-4111-8111-111111111111'),
  ('d0000000-0000-4000-8000-000000000001', 'Categoria secreta da Loja B', 'B', 'despesa', NULL, 10, true, false, '22222222-2222-4222-8222-222222222222');

-- ── Contas a pagar da Loja A ─────────────────────────────────────────────────
-- Semana 31/08/2026 a 06/09/2026 deve somar exatamente R$ 10.000,00.
INSERT INTO public.fin_contas_pagar (id, descricao, fornecedor, valor, data_competencia, data_vencimento, categoria_id, status, company_id) VALUES
  -- TESTE 1: competência fora, vencimento dentro → aparece
  ('a0000000-0000-4000-8000-000000000001', 'Folha agosto', 'Equipe', 5000.00, '2026-08-01', '2026-09-02', 'c0000000-0000-4000-8000-000000000002', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- TESTE 2: competência dentro, vencimento fora → não aparece na semana
  ('a0000000-0000-4000-8000-000000000002', 'Competência dentro', 'Fornecedor X', 777.00, '2026-09-02', '2026-09-10', 'c0000000-0000-4000-8000-000000000005', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- TESTE 3: limite inicial → aparece
  ('a0000000-0000-4000-8000-000000000003', 'Salmão', 'Peixaria', 1250.10, '2026-08-31', '2026-08-31', 'c0000000-0000-4000-8000-000000000005', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- TESTE 4: limite final → aparece (aguardando aprovação continua obrigação)
  ('a0000000-0000-4000-8000-000000000004', 'Atum', 'Peixaria', 1300.00, '2026-09-01', '2026-09-06', 'c0000000-0000-4000-8000-000000000005', 'AGUARDANDO_APROVACAO', '11111111-1111-4111-8111-111111111111'),
  -- TESTE 5: fora do período → não aparece
  ('a0000000-0000-4000-8000-000000000005', 'Vence depois', 'Fornecedor Y', 888.00, '2026-09-01', '2026-09-07', 'c0000000-0000-4000-8000-000000000005', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- Status fora da obrigação em aberto
  ('a0000000-0000-4000-8000-000000000006', 'Já paga', 'Fornecedor Z', 9991.00, '2026-09-01', '2026-09-03', 'c0000000-0000-4000-8000-000000000005', 'PAGO', '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000007', 'Cancelada', 'Fornecedor Z', 9992.00, '2026-09-01', '2026-09-03', 'c0000000-0000-4000-8000-000000000005', 'CANCELADO', '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000008', 'Rascunho', 'Fornecedor Z', 9993.00, '2026-09-01', '2026-09-03', 'c0000000-0000-4000-8000-000000000005', 'RASCUNHO', '11111111-1111-4111-8111-111111111111'),
  -- Rateio prevalece: cabeçalho em Investimentos é ignorado (400,40 Pessoal + 599,60 sem categoria)
  ('a0000000-0000-4000-8000-000000000009', 'Conta rateada', 'Rateio SA', 1000.00, '2026-09-03', '2026-09-03', 'c0000000-0000-4000-8000-000000000006', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- Sem categoria
  ('a0000000-0000-4000-8000-000000000010', 'Sem categoria', '', 49.90, NULL, '2026-09-04', NULL, 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- Categoria de outra unidade não pode vazar nome → vai para sem categoria
  ('a0000000-0000-4000-8000-000000000011', 'Categoria cruzada', 'Fornecedor W', 200.00, NULL, '2026-09-04', 'd0000000-0000-4000-8000-000000000001', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- Categoria inativa referenciada ainda compõe a árvore
  ('a0000000-0000-4000-8000-000000000012', 'Categoria inativa', 'Fornecedor V', 700.00, NULL, '2026-09-05', 'c0000000-0000-4000-8000-000000000007', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  -- Status VENCIDO continua obrigação
  ('a0000000-0000-4000-8000-000000000013', 'Vencida', 'Fornecedor U', 500.00, NULL, '2026-09-01', 'c0000000-0000-4000-8000-000000000002', 'VENCIDO', '11111111-1111-4111-8111-111111111111'),
  -- Em aberto e vencida antes do período → só no aviso informativo
  ('a0000000-0000-4000-8000-000000000014', 'Atrasada', 'Fornecedor T', 70.00, NULL, '2026-08-20', 'c0000000-0000-4000-8000-000000000002', 'APROVADO', '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000015', 'Atrasada paga', 'Fornecedor T', 80.00, NULL, '2026-08-20', 'c0000000-0000-4000-8000-000000000002', 'PAGO', '11111111-1111-4111-8111-111111111111'),
  -- PAGO no período sem baixa no razão: não saiu do caixa → fora das pagas
  ('a0000000-0000-4000-8000-000000000016', 'Paga sem baixa', 'Fornecedor S', 4444.00, NULL, '2026-09-04', 'c0000000-0000-4000-8000-000000000002', 'PAGO', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.fin_lancamento_rateios (id, lancamento_id, categoria_id, valor, company_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000002', 400.40, '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', NULL, 599.60, '11111111-1111-4111-8111-111111111111'),
  -- Rateio de outra unidade apontando para a CP da Loja A: ignorado
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001', 123456.00, '22222222-2222-4222-8222-222222222222');

-- ── Razão da Loja A (despesas já pagas) ──────────────────────────────────────
-- Semana 31/08 a 06/09 (pela data do pagamento): pagas = 9.991,00 + 80,00 + 12,34 + 300,00 + 150,50 + 200,00 = 10.733,84.
INSERT INTO public.fin_lancamentos (id, tipo, valor, data_competencia, data_pagamento, categoria_id, status, descricao, referencia_modulo, referencia_id, conciliado, conciliado_em, origem, company_id) VALUES
  -- TESTE 14: baixa da CP "Já paga" → entra uma vez, identificada pela CP
  ('70000000-0000-4000-8000-000000000001', 'DESPESA', 9991.00, '2026-09-01', '2026-09-03', 'c0000000-0000-4000-8000-000000000005', 'REALIZADO', 'Espelho já paga', 'contas_pagar', 'a0000000-0000-4000-8000-000000000006', true, '2026-09-03 12:00+00', 'espelho_cp', '11111111-1111-4111-8111-111111111111'),
  -- TESTE 15: CP vencida 20/08 e paga 02/09 pela conciliação → entra na semana do pagamento
  ('70000000-0000-4000-8000-000000000002', 'DESPESA', 80.00, NULL, '2026-09-02', 'c0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Baixa via extrato', 'contas_pagar', 'a0000000-0000-4000-8000-000000000015', true, '2026-09-02 12:00+00', 'conciliacao', '11111111-1111-4111-8111-111111111111'),
  -- Juros da divergência boleto × extrato → entra (dinheiro fora do valor da CP)
  ('70000000-0000-4000-8000-000000000003', 'DESPESA', 12.34, NULL, '2026-09-03', 'c0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Juros boleto', 'contas_pagar', 'a0000000-0000-4000-8000-000000000006', true, '2026-09-03 12:00+00', 'ajuste_pagamento', '11111111-1111-4111-8111-111111111111'),
  -- Lançamento manual → entra
  ('70000000-0000-4000-8000-000000000004', 'DESPESA', 300.00, '2026-09-04', NULL, 'c0000000-0000-4000-8000-000000000003', 'REALIZADO', 'Panfletos', NULL, NULL, false, NULL, 'manual', '11111111-1111-4111-8111-111111111111'),
  -- Conciliação já conciliada → entra
  ('70000000-0000-4000-8000-000000000005', 'DESPESA', 150.50, '2026-08-20', '2026-09-05', NULL, 'REALIZADO', 'PIX ENVIADO GAS', '', NULL, true, '2026-09-05 12:00+00', 'conciliacao', '11111111-1111-4111-8111-111111111111'),
  -- Conciliação pendente → fora
  ('70000000-0000-4000-8000-000000000006', 'DESPESA', 999.00, '2026-09-02', '2026-09-02', NULL, 'REALIZADO', 'Pendente', NULL, NULL, false, NULL, 'conciliacao', '11111111-1111-4111-8111-111111111111'),
  -- Transferência, receita e cancelado → fora
  ('70000000-0000-4000-8000-000000000007', 'TRANSFERENCIA', 5000.00, '2026-09-02', '2026-09-02', NULL, 'REALIZADO', 'Transferência', NULL, NULL, true, '2026-09-02 12:00+00', 'transferencia', '11111111-1111-4111-8111-111111111111'),
  ('70000000-0000-4000-8000-000000000008', 'RECEITA', 800.00, '2026-09-02', '2026-09-02', NULL, 'REALIZADO', 'Venda', NULL, NULL, true, '2026-09-02 12:00+00', 'conciliacao', '11111111-1111-4111-8111-111111111111'),
  ('70000000-0000-4000-8000-000000000009', 'DESPESA', 700.00, '2026-09-02', '2026-09-02', NULL, 'CANCELADO', 'Cancelado', NULL, NULL, false, NULL, 'manual', '11111111-1111-4111-8111-111111111111'),
  -- Manual rateado (120 Marketing + 80 Peixes) → entra com rateio
  ('70000000-0000-4000-8000-000000000010', 'DESPESA', 200.00, '2026-09-01', '2026-09-01', 'c0000000-0000-4000-8000-000000000006', 'REALIZADO', 'Compra rateada', NULL, NULL, false, NULL, 'manual', '11111111-1111-4111-8111-111111111111'),
  -- Pago depois da semana → fora
  ('70000000-0000-4000-8000-000000000011', 'DESPESA', 450.00, '2026-09-01', '2026-09-07', NULL, 'REALIZADO', 'Pago dia 07', NULL, NULL, false, NULL, 'manual', '11111111-1111-4111-8111-111111111111'),
  -- Loja B → nunca aparece na A
  ('70000000-0000-4000-8000-000000000012', 'DESPESA', 6000.00, '2026-09-02', '2026-09-02', NULL, 'REALIZADO', 'Despesa Loja B', NULL, NULL, false, NULL, 'manual', '22222222-2222-4222-8222-222222222222');

INSERT INTO public.fin_lancamento_rateios (id, lancamento_id, categoria_id, valor, company_id) VALUES
  ('e0000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000003', 120.00, '11111111-1111-4111-8111-111111111111'),
  ('e0000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000005', 80.00, '11111111-1111-4111-8111-111111111111');

-- ── Contas a pagar das outras unidades ───────────────────────────────────────
INSERT INTO public.fin_contas_pagar (id, descricao, fornecedor, valor, data_vencimento, categoria_id, status, company_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Conta Loja B', 'Fornecedor B', 50000.00, '2026-09-02', 'd0000000-0000-4000-8000-000000000001', 'APROVADO', '22222222-2222-4222-8222-222222222222'),
  ('b0000000-0000-4000-8000-000000000002', 'Conta Loja C', 'Fornecedor C', 40000.00, '2026-09-02', NULL, 'APROVADO', '33333333-3333-4333-8333-333333333333'),
  ('b0000000-0000-4000-8000-000000000003', 'Conta Loja D', 'Fornecedor D', 50000.00, '2026-09-02', NULL, 'APROVADO', '44444444-4444-4444-8444-444444444444');

-- ── Contas bancárias e saldo oficial (cache) ─────────────────────────────────
INSERT INTO public.fin_contas (id, nome, tipo, banco, ativo, company_id) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'Santander', 'corrente', 'Santander', true, '11111111-1111-4111-8111-111111111111'),
  ('f0000000-0000-4000-8000-000000000002', 'Caixa loja', 'caixa', NULL, true, '11111111-1111-4111-8111-111111111111'),
  ('f0000000-0000-4000-8000-000000000003', 'Conta encerrada', 'corrente', 'Itaú', false, '11111111-1111-4111-8111-111111111111'),
  ('f0000000-0000-4000-8000-000000000004', 'Conta sem cache', 'corrente', 'Inter', true, '11111111-1111-4111-8111-111111111111'),
  ('f0000000-0000-4000-8000-000000000005', 'Banco Loja B', 'corrente', 'Bradesco', true, '22222222-2222-4222-8222-222222222222'),
  ('f0000000-0000-4000-8000-000000000006', 'Banco Loja C', 'corrente', 'BB', true, '33333333-3333-4333-8333-333333333333'),
  ('f0000000-0000-4000-8000-000000000007', 'Banco Loja D', 'corrente', 'BB', true, '44444444-4444-4444-8444-444444444444'),
  ('f0000000-0000-4000-8000-000000000008', 'Banco Loja E', 'corrente', 'BB', true, '55555555-5555-4555-8555-555555555555');

INSERT INTO public.fin_contas_saldo_cache (conta_id, company_id, saldo) VALUES
  ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 12000.00),
  ('f0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 3609.27),
  ('f0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 99999.00),
  ('f0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 70000.00),
  ('f0000000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', 100000.00),
  ('f0000000-0000-4000-8000-000000000007', '44444444-4444-4444-8444-444444444444', 20000.00),
  ('f0000000-0000-4000-8000-000000000008', '55555555-5555-4555-8555-555555555555', 20000.00);

DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.get_fin_bordero(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: anon can execute get_fin_bordero';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_fin_bordero(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated cannot execute get_fin_bordero';
  END IF;
  IF has_function_privilege('authenticated', 'public._fin_bordero_payload(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fin_bordero_payload(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public._fin_bordero_payload(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: internal bordero helper (accepts company_id) is executable by a Data API role';
  END IF;
END;
$privileges$;

CREATE FUNCTION public.run_bordero_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $test$
DECLARE
  v_payload jsonb;
  v_ids text[];
  v_sum bigint;
  v_names text[];
BEGIN
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
  PERFORM set_config('test.permissions', 'financeiro:relatorio-socios:view', false);
  PERFORM set_config('request.headers', '{"x-company-id":"11111111-1111-4111-8111-111111111111"}', false);

  v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');

  IF v_payload->>'contractVersion' <> '1.0'
     OR v_payload#>>'{period,start}' <> '2026-08-31'
     OR v_payload#>>'{period,end}' <> '2026-09-06'
     OR v_payload#>>'{store,id}' <> '11111111-1111-4111-8111-111111111111'
     OR v_payload#>>'{store,name}' <> 'Barbados Villagio'
     OR v_payload#>>'{rules,dateField}' <> 'fin_contas_pagar.data_vencimento'
     OR v_payload#>>'{rules,balanceSource}' <> 'fin_contas_saldo_cache' THEN
    RAISE EXCEPTION 'TEST_FAILED: contract, period or store name';
  END IF;

  SELECT array_agg(DISTINCT item->>'payableId' ORDER BY item->>'payableId')
  INTO v_ids
  FROM jsonb_array_elements(v_payload->'items') AS item;

  -- TESTES 1, 3, 4 (aparecem) e 2, 5 (não aparecem) + status + rateio
  IF v_ids IS DISTINCT FROM ARRAY[
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000009',
    'a0000000-0000-4000-8000-000000000010',
    'a0000000-0000-4000-8000-000000000011',
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000013'
  ] THEN
    RAISE EXCEPTION 'TEST_FAILED: due-date filter/status selection returned %', v_ids;
  END IF;

  -- TESTE 6 (Loja A): R$ 10.000,00 exatos, e soma dos itens = total
  SELECT sum((item->>'amountCents')::bigint) INTO v_sum
  FROM jsonb_array_elements(v_payload->'items') AS item;
  IF (v_payload->>'totalPayableCents')::bigint <> 1000000
     OR v_sum <> 1000000
     OR (v_payload->>'payableCount')::integer <> 8 THEN
    RAISE EXCEPTION 'TEST_FAILED: store A total % / items sum % / count %',
      v_payload->>'totalPayableCents', v_sum, v_payload->>'payableCount';
  END IF;

  -- Rateio prevalece sobre o cabeçalho e rateio de outro tenant é ignorado
  IF (SELECT count(*) FROM jsonb_array_elements(v_payload->'items') AS item
      WHERE item->>'payableId' = 'a0000000-0000-4000-8000-000000000009') <> 2
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item
      WHERE item->>'allocationId' = 'e0000000-0000-4000-8000-000000000001'
        AND item->>'categoryId' = 'c0000000-0000-4000-8000-000000000002'
        AND (item->>'amountCents')::bigint = 40040 AND (item->>'split')::boolean)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item
      WHERE item->>'allocationId' = 'e0000000-0000-4000-8000-000000000002'
        AND item->>'categoryId' = '00000000-0000-0000-0000-000000000102'
        AND (item->>'amountCents')::bigint = 59960)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item
      WHERE item->>'categoryId' = 'c0000000-0000-4000-8000-000000000006') THEN
    RAISE EXCEPTION 'TEST_FAILED: FIN-RATEIO precedence or cross-tenant allocation';
  END IF;

  -- Categoria de outra unidade vira "sem categoria" sem vazar o nome
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item
      WHERE item->>'payableId' = 'a0000000-0000-4000-8000-000000000011'
        AND item->>'categoryId' = '00000000-0000-0000-0000-000000000102')
     OR v_payload::text LIKE '%Categoria secreta da Loja B%' THEN
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant category leaked';
  END IF;

  -- Árvore: despesas ativas (inclusive sem movimento), inativa referenciada com
  -- ancestral, sintética uma vez; receita e inativa sem uso ficam fora.
  SELECT array_agg(category->>'name' ORDER BY ordinality)
  INTO v_names
  FROM jsonb_array_elements(v_payload->'categories') WITH ORDINALITY AS entry(category, ordinality);
  IF NOT v_names @> ARRAY['Despesas operacionais', 'Pessoal', 'Marketing', 'CMV', 'Peixes',
                          'Investimentos', 'Categoria antiga', 'DESPESAS NÃO OPERACIONAIS',
                          'Sem categoria — Despesas']
     OR v_names && ARRAY['Receitas', 'Inativa sem uso', 'Categoria secreta da Loja B']
     OR (SELECT count(*) FROM jsonb_array_elements(v_payload->'categories') AS category
         WHERE (category->>'synthetic')::boolean) <> 1
     OR v_names[1] NOT IN ('CMV', 'Peixes', 'Pessoal', 'Marketing', 'Categoria antiga') THEN
    RAISE EXCEPTION 'TEST_FAILED: category tree selection/order %', v_names;
  END IF;

  -- Saldo: só contas ativas da Loja A, pelo cache oficial
  IF (v_payload->>'totalAccountBalanceCents')::bigint <> 1560927
     OR jsonb_array_length(v_payload->'accounts') <> 3
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'accounts') AS account
        WHERE account->>'name' = 'Conta sem cache' AND NOT (account->>'balanceAvailable')::boolean
          AND (account->>'balanceCents')::bigint = 0)
     OR v_payload::text LIKE '%Conta encerrada%'
     OR v_payload::text LIKE '%Banco Loja B%' THEN
    RAISE EXCEPTION 'TEST_FAILED: account balances %', v_payload->'accounts';
  END IF;

  -- Saldo final = saldo das contas - contas a vencer (15.609,27 - 10.000,00)
  IF (v_payload->>'projectedFinalBalanceCents')::bigint <> 560927 THEN
    RAISE EXCEPTION 'TEST_FAILED: projected final balance %', v_payload->>'projectedFinalBalanceCents';
  END IF;

  -- TESTE 14/15: despesas já pagas = razão pela regra de caixa do DFC (data do pagamento),
  -- baixa de boleto uma única vez e enriquecida pela CP, ajuste de pagamento e rateio.
  SELECT array_agg(paid->>'allocationId' ORDER BY paid->>'allocationId')
  INTO v_ids
  FROM jsonb_array_elements(v_payload->'paidItems') AS paid;
  IF v_ids IS DISTINCT FROM ARRAY[
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000005',
    'e0000000-0000-4000-8000-000000000011',
    'e0000000-0000-4000-8000-000000000012'
  ] THEN
    RAISE EXCEPTION 'TEST_FAILED: paid items selection returned %', v_ids;
  END IF;

  SELECT sum((paid->>'amountCents')::bigint) INTO v_sum
  FROM jsonb_array_elements(v_payload->'paidItems') AS paid;
  IF (v_payload->>'totalPaidCents')::bigint <> 1073384
     OR v_sum <> 1073384
     OR (v_payload->>'paidCount')::integer <> 6
     OR (v_payload->>'totalExpenseCents')::bigint <> 1073384 + 1000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: paid total % / sum % / count % / expense %',
      v_payload->>'totalPaidCents', v_sum, v_payload->>'paidCount', v_payload->>'totalExpenseCents';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'paidItems') AS paid
      WHERE paid->>'allocationId' = '70000000-0000-4000-8000-000000000001'
        AND paid->>'sourceId' = 'a0000000-0000-4000-8000-000000000006'
        AND paid->>'source' = 'conta_pagar' AND paid->>'supplier' = 'Fornecedor Z'
        AND paid->>'dueDate' = '2026-09-03' AND paid->>'referenceDate' = '2026-09-03'
        AND (paid->>'amountCents')::bigint = 999100)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'paidItems') AS paid
      WHERE paid->>'allocationId' = '70000000-0000-4000-8000-000000000002'
        AND paid->>'sourceId' = 'a0000000-0000-4000-8000-000000000015'
        AND paid->>'source' = 'conta_pagar' AND paid->>'dueDate' = '2026-08-20'
        AND paid->>'paidDate' = '2026-09-02' AND paid->>'referenceDate' = '2026-09-02')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'paidItems') AS paid
      WHERE paid->>'allocationId' = '70000000-0000-4000-8000-000000000003'
        AND paid->>'source' = 'lancamento' AND paid->>'origin' = 'ajuste_pagamento'
        AND paid->'dueDate' = 'null'::jsonb)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'paidItems') AS paid
      WHERE paid->>'allocationId' = '70000000-0000-4000-8000-000000000005'
        AND paid->>'source' = 'lancamento' AND paid->>'origin' = 'conciliacao'
        AND paid->>'paidDate' = '2026-09-05' AND paid->'dueDate' = 'null'::jsonb
        AND paid->>'categoryId' = '00000000-0000-0000-0000-000000000102')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'paidItems') AS paid
      WHERE paid->>'allocationId' = 'e0000000-0000-4000-8000-000000000011'
        AND paid->>'sourceId' = '70000000-0000-4000-8000-000000000010'
        AND paid->>'categoryId' = 'c0000000-0000-4000-8000-000000000003'
        AND (paid->>'split')::boolean AND (paid->>'amountCents')::bigint = 12000)
     OR v_payload::text LIKE '%Despesa Loja B%'
     OR v_payload::text LIKE '%Paga sem baixa%' THEN
    RAISE EXCEPTION 'TEST_FAILED: paid item details %', v_payload->'paidItems';
  END IF;

  -- Contas já pagas = saídas do Livro Razão no mesmo período (get_fin_lancamentos_totais)
  IF (v_payload->>'totalPaidCents')::bigint <> (
    SELECT (sum(l.valor) * 100)::bigint FROM public.fin_lancamentos AS l
    WHERE l.company_id = '11111111-1111-4111-8111-111111111111'
      AND l.tipo = 'DESPESA' AND l.status <> 'CANCELADO'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN '2026-08-31' AND '2026-09-06'
  ) THEN
    RAISE EXCEPTION 'TEST_FAILED: paid total differs from ledger outflows';
  END IF;

  -- Vencidas antes do período: aviso informativo, fora dos totais
  IF (v_payload#>>'{overdueBeforePeriod,count}')::integer <> 1
     OR (v_payload#>>'{overdueBeforePeriod,amountCents}')::bigint <> 7000 THEN
    RAISE EXCEPTION 'TEST_FAILED: overdue before period %', v_payload->'overdueBeforePeriod';
  END IF;

  -- Mês: 01/09 a 30/09 inclui 02, 07 e 10/09 e exclui 31/08
  v_payload := public.get_fin_bordero('2026-09-01', '2026-09-30');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item WHERE item->>'payableId' = 'a0000000-0000-4000-8000-000000000002')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item WHERE item->>'payableId' = 'a0000000-0000-4000-8000-000000000005')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'items') AS item WHERE item->>'payableId' = 'a0000000-0000-4000-8000-000000000003')
     OR (v_payload->>'totalPayableCents')::bigint <> 1000000 - 125010 + 77700 + 88800 THEN
    RAISE EXCEPTION 'TEST_FAILED: month range total %', v_payload->>'totalPayableCents';
  END IF;

  -- Período personalizado de um único dia (inclusivo)
  v_payload := public.get_fin_bordero('2026-09-06', '2026-09-06');
  IF (v_payload->>'totalPayableCents')::bigint <> 130000 THEN
    RAISE EXCEPTION 'TEST_FAILED: single-day inclusive range';
  END IF;

  -- Validação de período no backend
  BEGIN
    PERFORM public.get_fin_bordero('2026-09-06', '2026-08-31');
    RAISE EXCEPTION 'TEST_FAILED: inverted period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_fin_bordero(NULL, '2026-08-31');
    RAISE EXCEPTION 'TEST_FAILED: null period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_fin_bordero('2025-01-01', '2026-12-31');
    RAISE EXCEPTION 'TEST_FAILED: multi-year period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- Sem header: usa a unidade de origem autorizada (Loja A)
  PERFORM set_config('request.headers', '', false);
  IF public.get_fin_bordero('2026-08-31', '2026-09-06')#>>'{store,id}' <> '11111111-1111-4111-8111-111111111111' THEN
    RAISE EXCEPTION 'TEST_FAILED: default company scope';
  END IF;

  -- TESTE 13: U1 manipula o header para a Loja B → acesso negado, nenhum dado
  PERFORM set_config('request.headers', '{"x-company-id":"22222222-2222-4222-8222-222222222222"}', false);
  BEGIN
    v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');
    RAISE EXCEPTION 'TEST_FAILED: foreign store accepted, payload %', v_payload;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.headers', '{"x-company-id":"nao-e-uuid"}', false);
  BEGIN
    PERFORM public.get_fin_bordero('2026-08-31', '2026-09-06');
    RAISE EXCEPTION 'TEST_FAILED: malformed company header accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Membership inativo não dá acesso
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', false);
  PERFORM set_config('request.headers', '{"x-company-id":"11111111-1111-4111-8111-111111111111"}', false);
  BEGIN
    PERFORM public.get_fin_bordero('2026-08-31', '2026-09-06');
    RAISE EXCEPTION 'TEST_FAILED: inactive membership accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Sem a chave da tela (só pagar:view) → PERMISSION_DENIED; legado e super-admin passam
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
  PERFORM set_config('test.permissions', 'financeiro:pagar:view', false);
  BEGIN
    PERFORM public.get_fin_bordero('2026-08-31', '2026-09-06');
    RAISE EXCEPTION 'TEST_FAILED: missing permission accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.permissions', 'finance:read', false);
  PERFORM public.get_fin_bordero('2026-08-31', '2026-09-06');
  PERFORM set_config('test.permissions', 'system:global:manage', false);
  PERFORM public.get_fin_bordero('2026-08-31', '2026-09-06');
  PERFORM set_config('test.permissions', 'financeiro:relatorio-socios:view', false);

  -- TESTE 6 (Loja B): U2 com acesso às duas vê R$ 50.000,00 na Loja B, nunca somado à A
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', false);
  PERFORM set_config('request.headers', '{"x-company-id":"22222222-2222-4222-8222-222222222222"}', false);
  v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');
  IF (v_payload->>'totalPayableCents')::bigint <> 5000000
     OR v_payload#>>'{store,name}' <> 'Barbados Matriz'
     OR (v_payload->>'totalAccountBalanceCents')::bigint <> 7000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: store B isolation %', v_payload;
  END IF;
  PERFORM set_config('request.headers', '{"x-company-id":"11111111-1111-4111-8111-111111111111"}', false);
  IF (public.get_fin_bordero('2026-08-31', '2026-09-06')->>'totalPayableCents')::bigint <> 1000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: store A mixed with store B for multi-store user';
  END IF;

  -- TESTE 7: saldo 100.000 - vencer 40.000 = 60.000
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', false);
  PERFORM set_config('request.headers', '{"x-company-id":"33333333-3333-4333-8333-333333333333"}', false);
  v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');
  IF (v_payload->>'totalAccountBalanceCents')::bigint <> 10000000
     OR (v_payload->>'totalPayableCents')::bigint <> 4000000
     OR (v_payload->>'projectedFinalBalanceCents')::bigint <> 6000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: positive final balance %', v_payload;
  END IF;

  -- TESTE 8: saldo 20.000 - vencer 50.000 = -30.000
  PERFORM set_config('request.headers', '{"x-company-id":"44444444-4444-4444-8444-444444444444"}', false);
  v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');
  IF (v_payload->>'projectedFinalBalanceCents')::bigint <> -3000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: negative final balance %', v_payload->>'projectedFinalBalanceCents';
  END IF;

  -- TESTE 9: nenhuma conta → vencer 0 e saldo final = saldo
  PERFORM set_config('request.headers', '{"x-company-id":"55555555-5555-4555-8555-555555555555"}', false);
  v_payload := public.get_fin_bordero('2026-08-31', '2026-09-06');
  IF (v_payload->>'totalPayableCents')::bigint <> 0
     OR (v_payload->>'payableCount')::integer <> 0
     OR jsonb_array_length(v_payload->'items') <> 0
     OR jsonb_array_length(v_payload->'paidItems') <> 0
     OR (v_payload->>'totalPaidCents')::bigint <> 0
     OR (v_payload->>'totalAccountBalanceCents')::bigint <> 2000000
     OR (v_payload->>'projectedFinalBalanceCents')::bigint <> 2000000 THEN
    RAISE EXCEPTION 'TEST_FAILED: empty period %', v_payload;
  END IF;

  RAISE NOTICE 'Borderô: todos os cenários de banco passaram.';
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_bordero_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_bordero_ephemeral_tests();
RESET ROLE;
