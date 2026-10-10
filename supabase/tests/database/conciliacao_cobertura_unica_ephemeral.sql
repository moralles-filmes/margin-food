\set ON_ERROR_STOP on

-- Conciliação — uma linha do extrato por lançamento: teste de integração em
-- PostgreSQL real e DESCARTÁVEL. Aplica 20261010150000 (vínculo automático de
-- transferência pelo par mútuo) e 20261010160000 (um vínculo por lançamento;
-- legado pela ocorrência) sobre um schema mínimo, duas vezes. São simulados
-- apenas auth.uid(), assert_tenant() (lê test.company_id), has_any_permission
-- (lê test.permissions) e immutable_unaccent (sem a extensão unaccent).
-- Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/conciliacao_cobertura_unica_ephemeral.sql

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
CREATE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT $1 $$;

CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entidade text NOT NULL, entidade_id uuid, acao text NOT NULL,
  antes jsonb, depois jsonb, justificativa text DEFAULT '', user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL DEFAULT 'despesa',
  ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL
);
CREATE TABLE public.fin_contas (id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL);
-- Colunas de produção que as funções testadas tocam.
CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'DESPESA',
  valor numeric NOT NULL DEFAULT 0 CHECK (valor > 0),
  data_competencia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  data_pagamento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, conta_destino_id uuid,
  forma_pagamento text DEFAULT 'pix', status text NOT NULL DEFAULT 'PREVISTO',
  descricao text DEFAULT '',
  conciliado boolean DEFAULT false, conciliado_em timestamptz, conciliado_por uuid,
  origem text NOT NULL DEFAULT 'manual', idempotency_key text,
  created_by uuid, company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX idx_fin_lancamentos_company_idempotency ON public.fin_lancamentos (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid, centro_custo_id uuid,
  valor numeric NOT NULL DEFAULT 0, percentual numeric, observacao text, cmv_incluir boolean,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
-- Como em 20260812193534.
CREATE TABLE public.fin_conciliacao_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, conta_id uuid NOT NULL,
  external_id text NOT NULL, tipo text NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
  lancamento_id uuid NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  CONSTRAINT fin_conciliacao_vinculos_external_unique UNIQUE (company_id, conta_id, external_id, tipo)
);
CREATE INDEX idx_fin_conciliacao_vinculos_lancamento ON public.fin_conciliacao_vinculos (company_id, lancamento_id);

-- As duas migrations, duas vezes: CREATE OR REPLACE, REVOKE/GRANT e o DO final são reaplicáveis.
\ir ../../migrations/20261010150000_conciliacao_auto_bind_transferencia_mutua.sql
\ir ../../migrations/20261010160000_conciliacao_vinculo_unico_por_lancamento.sql
\ir ../../migrations/20261010150000_conciliacao_auto_bind_transferencia_mutua.sql
\ir ../../migrations/20261010160000_conciliacao_vinculo_unico_por_lancamento.sql

-- Empresa A (contas origem/destino) e empresa B (mesmo valor de transferência).
INSERT INTO public.fin_contas (id, nome, company_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'A origem', 'a0000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-0000-0000-00000000000b', 'A destino', 'a0000000-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-00000000000a', 'B origem', 'b0000000-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-00000000000b', 'B destino', 'b0000000-0000-0000-0000-000000000000');
INSERT INTO public.fin_categorias (id, nome, tipo, company_id) VALUES
  ('a0000000-0000-0000-0000-0000000000ca', 'Despesa A', 'despesa', 'a0000000-0000-0000-0000-000000000000');

CREATE FUNCTION pg_temp.contexto(p_company uuid, p_permissoes text DEFAULT 'financeiro:conciliacao:reconcile') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('test.company_id', p_company::text, false),
         set_config('test.user_id', 'a0000000-0000-0000-0000-0000000000ee', false),
         set_config('test.permissions', p_permissoes, false);
$$;

CREATE FUNCTION pg_temp.confere(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHA: %', p_msg; END IF;
  RAISE NOTICE 'ok: %', p_msg;
END $$;

-- Transferência REALIZADA origem → destino, vinculada na origem (como fica depois
-- de importar o extrato da origem).
CREATE FUNCTION pg_temp.transf(p_company uuid, p_origem uuid, p_destino uuid, p_valor numeric, p_data date,
  p_rotulo text, p_vinculo_origem boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, conta_destino_id,
    data_competencia, data_pagamento, descricao, origem, conciliado)
  VALUES (p_company, 'TRANSFERENCIA', 'REALIZADO', p_valor, p_origem, p_destino, p_data, p_data, p_rotulo, 'transferencia', true)
  RETURNING id INTO v_id;
  IF p_vinculo_origem THEN
    INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id)
    VALUES (p_company, p_origem, 'ORIGEM-' || p_rotulo, 'DESPESA', v_id);
  END IF;
  RETURN v_id;
END $$;

-- Roda o vínculo automático na conta e devolve "FITID>transferência" em ordem; limpa
-- os vínculos da conta para o próximo cenário.
CREATE FUNCTION pg_temp.rodar(p_conta uuid, p_lines jsonb, p_limpar boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM public.reconcile_auto_bind_transfer_counterparts(p_conta, p_lines);
  SELECT COALESCE(string_agg(v.external_id || '>' || l.descricao, ',' ORDER BY v.external_id), '-') INTO v
  FROM public.fin_conciliacao_vinculos v JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
  WHERE v.conta_id = p_conta AND v.external_id LIKE 'L-%';
  IF p_limpar THEN DELETE FROM public.fin_conciliacao_vinculos WHERE conta_id = p_conta AND external_id LIKE 'L-%'; END IF;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.linha(p_fitid text, p_tipo text, p_data date, p_valor numeric) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('external_id', p_fitid, 'tipo', p_tipo, 'data', p_data, 'valor', p_valor) $$;

-- ───────── reconcile_auto_bind_transfer_counterparts ─────────
DO $$
DECLARE
  ca uuid := 'a0000000-0000-0000-0000-000000000000';
  cb uuid := 'b0000000-0000-0000-0000-000000000000';
  orig uuid := 'a0000000-0000-0000-0000-00000000000a';
  dest uuid := 'a0000000-0000-0000-0000-00000000000b';
  d0 date := '2026-10-10';
  v_ret jsonb;
  v_t0 timestamptz;
  v_ms numeric;
  v_qtd int;
BEGIN
  PERFORM pg_temp.contexto(ca);
  PERFORM pg_temp.transf(ca, orig, dest, 111.11, d0, 'TA');
  PERFORM pg_temp.transf(ca, orig, dest, 222.22, d0, 'TB');
  PERFORM pg_temp.transf(ca, orig, dest, 333.33, d0, 'TC1');
  PERFORM pg_temp.transf(ca, orig, dest, 333.33, d0 + 3, 'TC2');
  PERFORM pg_temp.transf(ca, orig, dest, 444.44, d0 - 1, 'TD1');
  PERFORM pg_temp.transf(ca, orig, dest, 444.44, d0 + 1, 'TD2');
  PERFORM pg_temp.transf(ca, orig, dest, 555.55, d0, 'TF');
  PERFORM pg_temp.transf(ca, orig, dest, 666.66, d0, 'TH', false);
  PERFORM pg_temp.transf(ca, orig, dest, 777.77, d0, 'TI');
  PERFORM pg_temp.transf(ca, orig, dest, 999.99, d0, 'TV');
  PERFORM pg_temp.transf(cb, 'b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 888.88, d0, 'TB-OUTRA');

  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-A-OUTRA', 'RECEITA', d0 + 2, 111.11), pg_temp.linha('L-A-REAL', 'RECEITA', d0, 111.11))) = 'L-A-REAL>TA',
    'A: a linha de mesmo valor que vem antes no arquivo não leva a transferência');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-A-REAL', 'RECEITA', d0, 111.11), pg_temp.linha('L-A-OUTRA', 'RECEITA', d0 + 2, 111.11))) = 'L-A-REAL>TA',
    'A: resultado igual com o lote na ordem inversa');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-B-1', 'RECEITA', d0 - 1, 222.22), pg_temp.linha('L-B-2', 'RECEITA', d0 + 1, 222.22))) = '-',
    'B: duas linhas à mesma distância: nenhuma vinculada');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-C-2', 'RECEITA', d0 + 3, 333.33), pg_temp.linha('L-C-1', 'RECEITA', d0, 333.33))) = 'L-C-1>TC1,L-C-2>TC2',
    'C: dois pares mútuos, cada linha com a sua');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-D-ANTES', 'RECEITA', d0 - 1, 1.00), pg_temp.linha('L-D', 'RECEITA', d0, 444.44),
      pg_temp.linha('L-D-DEPOIS', 'RECEITA', d0 + 1, 1.00))) = '-',
    'D: linha equidistante de duas transferências: não vincula');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(pg_temp.linha('L-E', 'DESPESA', d0, 111.11))) = '-',
    'E: saída (DESPESA) no destino não é contrapartida');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-F', 'RECEITA', d0, 555.55), pg_temp.linha('L-F', 'RECEITA', d0, 555.55))) = 'L-F>TF',
    'F: FITID repetido no lote: um vínculo, sem erro');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(pg_temp.linha('L-H', 'RECEITA', d0, 666.66))) = '-',
    'H: transferência sem vínculo na origem não é candidata');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(pg_temp.linha('L-I', 'RECEITA', d0 + 1, 777.77))) = '-',
    'I: transferência antes do período do lote: não vincula');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-I0', 'RECEITA', d0 + 1, 1.00), pg_temp.linha('L-I', 'RECEITA', d0 + 1, 777.77),
      pg_temp.linha('L-I-ANTES', 'RECEITA', d0 - 2, 1.00))) = 'L-I>TI',
    'I: com o período cobrindo a transferência (linha já vinculada ou não), vincula');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      jsonb_build_object('external_id', 'L-V-DATA', 'tipo', 'RECEITA', 'data', 'abc', 'valor', 999.99),
      jsonb_build_object('external_id', 'L-V-MES', 'tipo', 'RECEITA', 'data', '2026-13-45', 'valor', 999.99),
      jsonb_build_object('external_id', 'L-V-INFINITO', 'tipo', 'RECEITA', 'data', 'infinity', 'valor', 999.99),
      jsonb_build_object('external_id', 'L-V-TEXTO', 'tipo', 'RECEITA', 'data', d0, 'valor', 'abc'),
      jsonb_build_object('external_id', 'L-V-NAN', 'tipo', 'RECEITA', 'data', d0, 'valor', 'NaN'),
      jsonb_build_object('external_id', 'L-V-INF', 'tipo', 'RECEITA', 'data', d0, 'valor', 'Infinity'),
      jsonb_build_object('external_id', 'L-V-ENORME', 'tipo', 'RECEITA', 'data', d0, 'valor', '1e200000'),
      jsonb_build_object('external_id', 'L-V-ZERO', 'tipo', 'RECEITA', 'data', d0, 'valor', 0),
      jsonb_build_object('external_id', 'L-V-TIPO', 'tipo', NULL, 'data', d0, 'valor', 999.99),
      jsonb_build_object('external_id', 'L-' || repeat('X', 600), 'tipo', 'RECEITA', 'data', d0, 'valor', 999.99),
      pg_temp.linha('L-V-OK', 'RECEITA', d0, 999.99))) = 'L-V-OK>TV',
    'V: linhas inválidas são puladas sem derrubar o lote');
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(pg_temp.linha('L-X', 'RECEITA', d0, 888.88))) = '-',
    'tenant: transferência de outra empresa com o mesmo valor nunca é candidata');

  -- Linha já vinculada nesta conta fica fora da disputa e só volta no retorno.
  INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id)
  SELECT ca, dest, 'L-J-VINC', 'RECEITA', id FROM public.fin_lancamentos WHERE descricao = 'TH';
  v_ret := public.reconcile_auto_bind_transfer_counterparts(dest, jsonb_build_array(
    pg_temp.linha('L-J-VINC', 'RECEITA', d0, 111.11), pg_temp.linha('L-J-LIVRE', 'RECEITA', d0 + 2, 111.11)));
  PERFORM pg_temp.confere(v_ret->'matched_external_ids' = '["L-J-VINC", "L-J-LIVRE"]'::jsonb
      AND pg_temp.rodar(dest, '[]'::jsonb) = 'L-J-LIVRE>TA,L-J-VINC>TH',
    'J: linha já vinculada não disputa; a livre fica com a transferência');

  -- Reenvio: idempotente e monotônico (a 2ª opção de quem perdeu sai no reenvio).
  PERFORM pg_temp.transf(ca, orig, dest, 123.45, d0, 'TL1');
  PERFORM pg_temp.transf(ca, orig, dest, 123.45, d0 + 3, 'TL2');
  -- (L-L-FIM só estende o período do lote até a data de TL2.)
  PERFORM pg_temp.confere(pg_temp.rodar(dest, jsonb_build_array(
      pg_temp.linha('L-L-1', 'RECEITA', d0, 123.45), pg_temp.linha('L-L-2', 'RECEITA', d0 + 1, 123.45),
      pg_temp.linha('L-L-FIM', 'RECEITA', d0 + 3, 1.00)), false) = 'L-L-1>TL1',
    'R: 1º envio vincula só o par mútuo');
  v_ret := public.reconcile_auto_bind_transfer_counterparts(dest, jsonb_build_array(
    pg_temp.linha('L-L-1', 'RECEITA', d0, 123.45), pg_temp.linha('L-L-2', 'RECEITA', d0 + 1, 123.45),
    pg_temp.linha('L-L-FIM', 'RECEITA', d0 + 3, 1.00)));
  PERFORM pg_temp.confere(pg_temp.rodar(dest, '[]'::jsonb) = 'L-L-1>TL1,L-L-2>TL2'
      AND v_ret->'matched_external_ids' = '["L-L-1", "L-L-2"]'::jsonb,
    'R: reenvio mantém o 1º vínculo e vincula a linha que tinha perdido');

  -- Recusas.
  BEGIN
    PERFORM public.reconcile_auto_bind_transfer_counterparts('b0000000-0000-0000-0000-00000000000b', '[]'::jsonb);
    RAISE EXCEPTION 'FALHA: conta de outra empresa deveria ser recusada';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'NOT_FOUND%', 'tenant: conta de outra empresa recusada (' || SQLERRM || ')');
  END;
  PERFORM pg_temp.contexto(ca, 'financeiro:lancamentos:view');
  BEGIN
    PERFORM public.reconcile_auto_bind_transfer_counterparts(dest, '[]'::jsonb);
    RAISE EXCEPTION 'FALHA: sem permissão deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'PERMISSION_DENIED%', 'P: sem permissão de conciliar, recusa');
  END;
  PERFORM pg_temp.contexto(ca);

  -- Desempenho: 5000 linhas (o limite), 100 delas contrapartidas de transferências.
  FOR v_qtd IN 1 .. 100 LOOP
    PERFORM pg_temp.transf(ca, orig, dest, 10000 + v_qtd, d0 - 20 + (v_qtd % 30), 'TP' || v_qtd);
  END LOOP;
  v_t0 := clock_timestamp();
  v_ret := public.reconcile_auto_bind_transfer_counterparts(dest, (
    SELECT jsonb_agg(pg_temp.linha('L-P-' || g, 'RECEITA', d0 - 20 + (g % 30),
      CASE WHEN g <= 100 THEN 10000 + g ELSE 20000 + g END))
    FROM generate_series(1, 5000) g));
  v_ms := extract(epoch FROM clock_timestamp() - v_t0) * 1000;
  SELECT count(*) INTO v_qtd FROM public.fin_conciliacao_vinculos WHERE conta_id = dest AND external_id LIKE 'L-P-%';
  PERFORM pg_temp.confere(v_qtd = 100 AND (v_ret->>'matched_count')::int = 100,
    format('desempenho: 5000 linhas, 100 vínculos em %s ms', round(v_ms)));
  PERFORM pg_temp.confere(v_ms < 3000, 'desempenho: bem abaixo do statement_timeout de 8 s');
END $$;

-- ───────── reconcile_bind_extrato ─────────
DO $$
DECLARE
  ca uuid := 'a0000000-0000-0000-0000-000000000000';
  conta uuid := 'a0000000-0000-0000-0000-00000000000b';
  outra uuid := 'a0000000-0000-0000-0000-00000000000a';
  v_l uuid;
  v_l2 uuid;
  v_t uuid;
  v_ret jsonb;
BEGIN
  PERFORM pg_temp.contexto(ca);
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, descricao, origem, conciliado)
  VALUES (ca, 'DESPESA', 'REALIZADO', 50, conta, '2026-10-05', 'Espelho boleto', 'espelho_cp', true) RETURNING id INTO v_l;
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, descricao, origem, conciliado)
  VALUES (ca, 'DESPESA', 'REALIZADO', 60, conta, '2026-10-05', 'Outro', 'conciliacao', true) RETURNING id INTO v_l2;
  v_t := pg_temp.transf(ca, outra, conta, 70, '2026-10-05', 'TBIND');

  v_ret := public.reconcile_bind_extrato(conta, 'F1', 'DESPESA', v_l);
  PERFORM pg_temp.confere(v_ret->>'status' = 'ok', 'B: 1º FITID no lançamento sem vínculo');
  v_ret := public.reconcile_bind_extrato(conta, 'F1', 'DESPESA', v_l);
  PERFORM pg_temp.confere(v_ret->>'status' = 'ok'
      AND (SELECT count(*) FROM public.fin_conciliacao_vinculos WHERE lancamento_id = v_l) = 1,
    'B2: reenvio do mesmo FITID é idempotente');
  BEGIN
    PERFORM public.reconcile_bind_extrato(conta, 'F2', 'DESPESA', v_l);
    RAISE EXCEPTION 'FALHA: 2º FITID deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'LANCAMENTO_JA_VINCULADO%', 'B1: 2º FITID no lançamento já vinculado é recusado');
  END;
  BEGIN
    PERFORM public.reconcile_bind_extrato(conta, 'F1', 'DESPESA', v_l2);
    RAISE EXCEPTION 'FALHA: FITID de outro lançamento deveria ser recusado';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'EXTERNAL_ID_CONFLICT%', 'B3: FITID já vinculado a outro lançamento é recusado');
  END;
  PERFORM pg_temp.confere((SELECT lancamento_id FROM public.fin_conciliacao_vinculos WHERE external_id = 'F1') = v_l,
    'B3: o vínculo existente não é repontado');
  v_ret := public.reconcile_bind_extrato(conta, 'F3', 'RECEITA', v_t);
  PERFORM pg_temp.confere(v_ret->>'status' = 'ok', 'B4: perna de destino da transferência vinculada só na origem');
  BEGIN
    PERFORM public.reconcile_bind_extrato(conta, 'F4', 'RECEITA', v_t);
    RAISE EXCEPTION 'FALHA: 2ª linha na mesma perna deveria ser recusada';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'LANCAMENTO_JA_VINCULADO%', 'B4: 2ª linha na mesma perna da transferência é recusada');
  END;
  PERFORM pg_temp.contexto('b0000000-0000-0000-0000-000000000000');
  BEGIN
    PERFORM public.reconcile_bind_extrato(conta, 'F9', 'DESPESA', v_l2);
    RAISE EXCEPTION 'FALHA: outra empresa deveria ser recusada';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.confere(SQLERRM LIKE 'NOT_FOUND%', 'tenant: bind com conta de outra empresa recusado');
  END;
  PERFORM pg_temp.contexto(ca);
END $$;

-- ───────── reconcile_import_lancamento: legado pela ocorrência ─────────
DO $$
DECLARE
  ca uuid := 'a0000000-0000-0000-0000-000000000000';
  conta uuid := 'a0000000-0000-0000-0000-00000000000b';
  cat uuid := 'a0000000-0000-0000-0000-0000000000ca';
  d date := '2026-10-06';
  v_z uuid;
  v_ret jsonb;
  v_rateio jsonb;
BEGIN
  PERFORM pg_temp.contexto(ca);
  v_rateio := jsonb_build_array(jsonb_build_object('categoria_id', cat, 'valor', 80, 'percentual', 100));
  -- Z: venda gravada antes do FITID, com a chave legada (conteúdo da 1ª ocorrência).
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, idempotency_key)
  VALUES (ca, 'DESPESA', 'REALIZADO', 80.00, conta, d, d, 'Pix enviado - Fornecedor', 'conciliacao', true, cat,
    md5(ca::text || d::text || 'Pix enviado - Fornecedor' || (80.00)::numeric::text || 'DESPESA' || conta::text))
  RETURNING id INTO v_z;

  -- 2ª linha igual (ocorrência 1), com FITID: não pode promover Z.
  v_ret := public.reconcile_import_lancamento(d, 'Pix enviado - Fornecedor', 80.00, 'DESPESA', conta,
    'a0000000-0000-0000-0000-0000000000ee', v_rateio, 'FITID-2', false, 1, NULL);
  PERFORM pg_temp.confere(v_ret->>'status' = 'ok' AND (v_ret->>'lancamento_id')::uuid <> v_z,
    'I1: 2ª linha igual cria o próprio lançamento (' || (v_ret->>'status') || ')');
  -- 1ª linha (ocorrência 0), com FITID: promove Z, como antes.
  v_ret := public.reconcile_import_lancamento(d, 'Pix enviado - Fornecedor', 80.00, 'DESPESA', conta,
    'a0000000-0000-0000-0000-0000000000ee', v_rateio, 'FITID-1', false, 0, NULL);
  PERFORM pg_temp.confere(v_ret->>'status' = 'duplicate' AND (v_ret->>'lancamento_id')::uuid = v_z,
    'I2: 1ª linha com FITID promove o lançamento legado');
  -- Reenvio de cada uma: idempotente pelo FITID.
  v_ret := public.reconcile_import_lancamento(d, 'Pix enviado - Fornecedor', 80.00, 'DESPESA', conta,
    'a0000000-0000-0000-0000-0000000000ee', v_rateio, 'FITID-1', false, 0, NULL);
  PERFORM pg_temp.confere(v_ret->>'status' = 'duplicate' AND (v_ret->>'lancamento_id')::uuid = v_z, 'I2: reenvio idempotente');
  PERFORM pg_temp.confere((SELECT count(*) FROM public.fin_lancamentos WHERE descricao = 'Pix enviado - Fornecedor') = 2,
    'I: duas linhas iguais, dois lançamentos');

  -- CSV (sem FITID), 2ª ocorrência gravada antes; a linha com FITID na ocorrência 1 a promove.
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, idempotency_key)
  VALUES (ca, 'DESPESA', 'REALIZADO', 90.00, conta, d, d, 'Tarifa', 'conciliacao', true, cat,
    md5(concat_ws('|', md5(ca::text || d::text || 'Tarifa' || (90.00)::numeric::text || 'DESPESA' || conta::text), 'ocorrencia', '1')))
  RETURNING id INTO v_z;
  v_ret := public.reconcile_import_lancamento(d, 'Tarifa', 90.00, 'DESPESA', conta,
    'a0000000-0000-0000-0000-0000000000ee', v_rateio, 'FITID-T2', false, 1, NULL);
  PERFORM pg_temp.confere(v_ret->>'status' = 'duplicate' AND (v_ret->>'lancamento_id')::uuid = v_z,
    'I3: linha com FITID promove o lançamento CSV da mesma ocorrência');
END $$;

-- ───────── grants ─────────
DO $$
BEGIN
  PERFORM pg_temp.confere(
    NOT has_function_privilege('anon', 'public.reconcile_auto_bind_transfer_counterparts(uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.reconcile_bind_extrato(uuid,text,text,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer,date)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reconcile_auto_bind_transfer_counterparts(uuid,jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reconcile_bind_extrato(uuid,text,text,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer,date)', 'EXECUTE'),
    'grants: anon sem EXECUTE, authenticated com EXECUTE');
END $$;

\echo 'conciliacao_cobertura_unica_ephemeral: TUDO OK'
