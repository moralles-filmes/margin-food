-- Datas de negócio no fuso America/Sao_Paulo.
--
-- O banco roda em UTC. CURRENT_DATE, now()::date e timestamptz::date devolvem o dia
-- UTC, que depois das 21h (BRT) já é o dia seguinte: um recebimento de compra às 22h
-- entrava no estoque com a data de amanhã; um lançamento conciliado às 22h caía no
-- dia seguinte do razão.
--
-- A migration reescreve as definições VIVAS (pg_get_functiondef) trocando só essas
-- expressões, com contagem exata por função. Se o banco não estiver no estado
-- inventariado em 2026-09-28, aborta sem alterar nada.
--
-- Fica de fora de propósito:
-- - get_fin_presentation_expenses: o único `conciliado_em::date` é o rótulo de contrato
--   'COALESCE(data_pagamento, conciliado_em::date, data_competencia)', que o frontend
--   compara literalmente (expensesPresentationAdapter.ts) — o rótulo é preservado em
--   todas as funções.
-- - mv_giro_estoque: materialized view sem nenhum leitor no app.

DO $migration$
DECLARE
  c_tz          constant text := 'America/Sao_Paulo';
  c_hoje        constant text := format('(now() AT TIME ZONE %L)::date', 'America/Sao_Paulo');
  c_rotulo      constant text := '''COALESCE(data_pagamento, conciliado_em::date, data_competencia)''';
  c_marcador    constant text := '__ROTULO_CONTRATO_DATA_EFETIVA__';
  c_re_hoje     constant text := '\mcurrent_date\M';
  c_re_ts       constant text := '\m(created_at|received_at|conciliado_em)::date';
  c_re_ts_repl  constant text := '\m((?:[a-z_]+\.)?)(created_at|received_at|conciliado_em)::date';
  c_re_now      constant text := '\(\(now\(\) - ''30 days''::interval\)\)::date|\(now\(\)\)::date|to_char\(now\(\), ''YYYY''\)';
  r      record;
  v_def  text;
  v_new  text;
  v_n    int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- sig, nº de CURRENT_DATE, nº de <timestamptz>::date, nº de now() convertido em data
  FOR r IN
    SELECT * FROM (VALUES
      ('public._fin_dfc_effective_allocations(uuid,date,date)', 0, 6, 0),
      ('public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb)', 1, 0, 0),
      ('public._guarded_create_conta_receber(text,text,numeric,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid)', 1, 0, 0),
      ('public._guarded_upsert_lancamento(uuid,text,text,numeric,uuid,uuid,uuid,date,date,date,text,text,text,text,boolean,jsonb,jsonb,timestamp with time zone,text)', 1, 0, 0),
      ('public._stabilization_stock_consumption_history_inner(date,date,text,uuid,text)', 0, 3, 0),
      ('public._stabilization_stock_predictive_analysis_inner(text,uuid,integer,integer,boolean)', 2, 0, 0),
      ('public.admin_checkup_suite()', 2, 0, 0),
      ('public.attend_requisicao_item_atomic(uuid,uuid,numeric)', 1, 0, 0),
      ('public.cancel_salmon_entry_atomic(uuid,text)', 1, 0, 0),
      ('public.cancel_salmon_manipulation_atomic(uuid,text)', 1, 0, 0),
      ('public.generate_requisition_code()', 0, 0, 1),
      ('public.get_consumo_por_produto(uuid,date,text[],uuid[])', 2, 0, 0),
      ('public.get_fin_cashflow(date,date)', 0, 5, 0),
      ('public.get_fin_counts_by_status(date,date)', 2, 0, 0),
      ('public.get_fin_dashboard_charts(date,date)', 0, 7, 0),
      ('public.get_fin_dashboard_summary(date,date)', 0, 9, 0),
      ('public.get_fin_dfc_summary(date,date)', 0, 1, 0),
      ('public.get_fin_lancamentos_totais(date,date,text,uuid,text,uuid,boolean)', 0, 2, 0),
      ('public.get_fin_presentation_detail_rows(date,date,text,text,uuid,text,integer,integer)', 0, 3, 0),
      ('public.get_fin_presentation_detail_series(date,date,text,text,uuid,text)', 0, 3, 0),
      ('public.get_fin_presentation_revenue(text,integer[])', 0, 7, 0),
      ('public.get_fin_presentation_socios(date,date,date,date,date,date,text,integer)', 0, 4, 0),
      ('public.get_fin_saldo_atual(uuid,date)', 0, 2, 0),
      ('public.get_fin_saldo_conta_em(uuid,date)', 0, 1, 0),
      ('public.get_relatorios_compras(date,date)', 0, 4, 0),
      ('public.get_relatorios_kpis(date,date)', 1, 0, 0),
      ('public.get_relatorios_score(date,date)', 2, 0, 0),
      ('public.get_salmon_dashboard_summary(date,date)', 4, 0, 0),
      ('public.get_stock_losses_report(date,date,text,uuid,text,text,text)', 0, 3, 2),
      ('public.get_stock_predictive_analysis_v2(text,uuid,integer,boolean,boolean)', 5, 0, 0),
      ('public.get_stock_top_consumed(date,date,text,integer,text)', 0, 2, 0),
      ('public.list_fin_contas_pagar_abertas(text,numeric,date,integer)', 1, 0, 0),
      ('public.list_fin_contas_pagar_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean)', 1, 0, 0),
      ('public.list_fin_contas_receber_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean)', 1, 0, 0),
      ('public.list_fin_lancamentos_cursor(date,date,text,text,uuid,text,integer,date,uuid,text,uuid,boolean)', 0, 7, 0),
      ('public.list_solic_compra_mercado_cursor(integer,timestamp with time zone,uuid,text,text,uuid,text,date,date)', 0, 2, 0),
      ('public.list_stock_transfers(date,date,uuid,text,integer,integer)', 0, 0, 2),
      ('public.op_registrar_movimentacao(uuid,uuid,text,numeric,text,text)', 1, 0, 0),
      ('public.recalc_product_costs(uuid)', 1, 0, 0),
      ('public.receive_market_order_atomic(uuid,jsonb,text)', 2, 0, 0),
      ('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)', 2, 0, 0),
      ('public.simulate_relatorios_score(date,date,jsonb)', 1, 0, 0),
      ('public.stock_insert_movement_atomic(uuid,numeric,text,text,text,text,text,text,text,jsonb)', 1, 0, 0),
      ('public.storno_purchase_order_stock(uuid)', 1, 0, 0)
    ) AS t(sig, n_hoje, n_ts, n_now)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    v_new := replace(v_def, c_rotulo, c_marcador);

    SELECT count(*) INTO v_n FROM regexp_matches(v_new, c_re_hoje, 'gi');
    IF v_n <> r.n_hoje THEN
      RAISE EXCEPTION '%: esperado % CURRENT_DATE, encontrado %', r.sig, r.n_hoje, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(v_new, c_re_ts, 'g');
    IF v_n <> r.n_ts THEN
      RAISE EXCEPTION '%: esperado % timestamptz::date, encontrado %', r.sig, r.n_ts, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(v_new, c_re_now, 'g');
    IF v_n <> r.n_now THEN
      RAISE EXCEPTION '%: esperado % now()::date, encontrado %', r.sig, r.n_now, v_n;
    END IF;

    v_new := regexp_replace(v_new, c_re_hoje, c_hoje, 'gi');
    v_new := regexp_replace(v_new, c_re_ts_repl,
      format('(\1\2 AT TIME ZONE %L)::date', c_tz), 'g');
    v_new := replace(v_new, '((now() - ''30 days''::interval))::date',
      format('((now() AT TIME ZONE %L) - ''30 days''::interval)::date', c_tz));
    v_new := replace(v_new, '(now())::date', c_hoje);
    v_new := replace(v_new, 'to_char(now(), ''YYYY'')',
      format('to_char(now() AT TIME ZONE %L, ''YYYY'')', c_tz));
    v_new := replace(v_new, c_marcador, c_rotulo);

    IF v_new = v_def THEN
      RAISE EXCEPTION '%: nenhuma alteração gerada', r.sig;
    END IF;

    EXECUTE v_new;

    v_def := replace(pg_get_functiondef(r.sig::regprocedure), c_rotulo, '');
    IF v_def ~* c_re_hoje OR v_def ~ c_re_ts OR v_def ~ c_re_now THEN
      RAISE EXCEPTION '%: ainda contém data em UTC após a reescrita', r.sig;
    END IF;
  END LOOP;

  -- Defaults de coluna: INSERT que omite a data grava o dia de negócio.
  FOR r IN
    SELECT * FROM (VALUES
      ('fin_contas', 'data_saldo_inicial'),
      ('fin_contas_pagar', 'data_vencimento'),
      ('fin_contas_receber', 'data_vencimento'),
      ('fin_lancamentos', 'data_competencia'),
      ('inventarios', 'data'),
      ('movimentacoes_estoque', 'data'),
      ('rh_beneficios', 'data_inicio'),
      ('rh_colaboradores', 'data_admissao'),
      ('rh_epis', 'data_entrega'),
      ('rh_incidentes', 'data_ocorrencia'),
      ('rh_ocorrencias_disciplinares', 'data_ocorrencia'),
      ('rh_ponto_registros', 'data'),
      ('salmon_entries', 'entry_date'),
      ('salmon_manipulations', 'manipulation_date')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s', r.tbl, r.col, c_hoje);
  END LOOP;

  -- purchase_requisitions.data é text (yyyy-MM-dd).
  EXECUTE format('ALTER TABLE public.purchase_requisitions ALTER COLUMN data SET DEFAULT to_char(now() AT TIME ZONE %L, %L)',
    c_tz, 'YYYY-MM-DD');

  -- Rede final: nenhuma função do schema public (fora de extensões) e nenhum default
  -- de coluna de tabela pode continuar usando o dia UTC.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND pg_get_functiondef(p.oid) ~* c_re_hoje;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Ainda há % função(ões) com CURRENT_DATE', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.column_default ~* 'current_date|to_char\(now\(\),';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Ainda há % default(s) de coluna com data UTC', v_n;
  END IF;
END
$migration$;
