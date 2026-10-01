-- Integração em PostgreSQL real com schema/RLS/RPCs da aplicação. Sempre reverte fixtures.
-- Aplicar a migration antes; executar com psql -v ON_ERROR_STOP=1.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO public.companies(id,nome) VALUES
 ('a1111111-1111-4111-8111-111111111111','Teste códigos A'),
 ('b2222222-2222-4222-8222-222222222222','Teste códigos B');
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES
 ('a1111111-1111-4111-8111-111111111112','payment-a@example.invalid','{"company_id":"a1111111-1111-4111-8111-111111111111"}'),
 ('b2222222-2222-4222-8222-222222222223','payment-b@example.invalid','{"company_id":"b2222222-2222-4222-8222-222222222222"}'),
 ('a1111111-1111-4111-8111-111111111113','payment-no-access@example.invalid','{"company_id":"a1111111-1111-4111-8111-111111111111"}'),
 ('a1111111-1111-4111-8111-111111111114','payment-read@example.invalid','{"company_id":"a1111111-1111-4111-8111-111111111111"}');
INSERT INTO public.company_memberships(user_id,company_id) SELECT id, (raw_app_meta_data->>'company_id')::uuid
 FROM auth.users WHERE email IN ('payment-a@example.invalid','payment-b@example.invalid','payment-no-access@example.invalid','payment-read@example.invalid');
INSERT INTO public.permissions(key,module,submodule,action)
 SELECT 'financeiro:pagar:'||a, 'financeiro','pagar',a FROM unnest(ARRAY['view','create','edit','delete','approve']) a ON CONFLICT DO NOTHING;
INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect)
 SELECT m.user_id,m.company_id,'financeiro:pagar:'||a,'ALLOW' FROM public.company_memberships m
 CROSS JOIN unnest(ARRAY['view','create','edit','delete','approve']) a
 WHERE m.user_id IN ('a1111111-1111-4111-8111-111111111112','b2222222-2222-4222-8222-222222222223');
INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect) VALUES
 ('a1111111-1111-4111-8111-111111111114','a1111111-1111-4111-8111-111111111111','financeiro:pagar:view','ALLOW'),
 ('a1111111-1111-4111-8111-111111111114','a1111111-1111-4111-8111-111111111111','financeiro:pagar:approve','ALLOW');
INSERT INTO public.fin_categorias(id,nome,tipo,company_id) VALUES
 ('a1111111-1111-4111-8111-111111111115','Alimentação','despesa','a1111111-1111-4111-8111-111111111111'),
 ('b2222222-2222-4222-8222-222222222225','Categoria secreta B','despesa','b2222222-2222-4222-8222-222222222222');
INSERT INTO public.fin_contas(id,nome,company_id) VALUES
 ('a1111111-1111-4111-8111-111111111116','Banco teste A','a1111111-1111-4111-8111-111111111111');
-- Snapshot de schema sem ACL: grants de cliente necessários ao exercício de RLS.
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_contas_pagar TO authenticated;
GRANT SELECT ON public.fin_categorias TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111112","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"a1111111-1111-4111-8111-111111111111"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_id uuid; v_old uuid; v_pix uuid; v_copy uuid; v_other uuid; v_page jsonb; v_result jsonb; v_code text;
 v_updated timestamptz; v_cursor jsonb; v_count integer; v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 -- Cliente legado: criação sem os novos parâmetros e ausência da lista de códigos.
 v_old := (public._guarded_create_conta_pagar('Legado sem código',10,p_data_vencimento=>v_today)->>'id')::uuid;
 IF jsonb_array_length(public.list_fin_codigos_pagamento()->'items') <> 0 THEN RAISE EXCEPTION 'FAIL: legado na listagem'; END IF;
 v_code := '34191.79001 01043.510047 91020.150008 5 99990000012500';
 v_result := public._guarded_create_conta_pagar('Boleto auditado',1250,p_fornecedor=>'Distribuidóra ABC',
   p_data_vencimento=>v_today,p_categoria_id=>'a1111111-1111-4111-8111-111111111115',
   p_idempotency_key=>'payment-code-test',p_dados_pagamento=>jsonb_build_object('tipo','boleto','codigo',v_code));
 v_id := (v_result->>'id')::uuid;
 v_result := public._guarded_create_conta_pagar('Boleto auditado',1250,p_fornecedor=>'Distribuidóra ABC',
   p_data_vencimento=>v_today,p_categoria_id=>'a1111111-1111-4111-8111-111111111115',
   p_idempotency_key=>'payment-code-test',p_dados_pagamento=>jsonb_build_object('tipo','boleto','codigo',v_code));
 IF NOT (v_result->>'idempotente')::boolean THEN RAISE EXCEPTION 'FAIL: retry'; END IF;
 BEGIN
  PERFORM public._guarded_create_conta_pagar('Boleto auditado',1250,p_data_vencimento=>v_today,
   p_categoria_id=>'a1111111-1111-4111-8111-111111111115',p_idempotency_key=>'payment-code-test',
   p_dados_pagamento=>' {"tipo":"pix_chave","codigo":"outra-chave"}');
  RAISE EXCEPTION 'FAIL: chave reutilizada';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%REQUEST_ID_REUTILIZADO%' THEN RAISE; END IF; END;
 v_pix := (public._guarded_create_conta_pagar('PIX vencido',50,p_data_vencimento=>v_today-1,
   p_dados_pagamento=>'{"tipo":"pix_chave","codigo":"pagamento+teste@example.invalid"}')->>'id')::uuid;
 v_copy := (public._guarded_create_conta_pagar('PIX payload longo',51,p_data_vencimento=>v_today+1,
   p_dados_pagamento=>jsonb_build_object('tipo','pix_copia_cola','codigo',repeat('000201BR.GOV.BCB.PIX',300)))->>'id')::uuid;
 v_other := (public._guarded_create_conta_pagar('Outro código',52,p_data_vencimento=>v_today+2,
   p_dados_pagamento=>'{"tipo":"outro","codigo":"  Ref_100% / abc  "}')->>'id')::uuid;
 v_page := public.list_fin_codigos_pagamento(p_status=>'APROVADO',p_tipo=>'boleto',p_search=>'distribuidora',
   p_data_de=>v_today,p_data_ate=>v_today,p_categoria_id=>'a1111111-1111-4111-8111-111111111115');
 IF jsonb_array_length(v_page->'items') <> 1 OR v_page->'items'->0->>'codigo_pagamento' <> v_code
   OR v_page->'items'->0->>'categorias' <> 'Alimentação' OR (v_page->'items'->0->>'valor')::numeric <> 1250
 THEN RAISE EXCEPTION 'FAIL: filtros combinados/fornecedor/categoria/código/valor'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_search=>'alimentacao')->'items') <> 1 THEN RAISE EXCEPTION 'FAIL: busca categoria'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_search=>'Ref_100%')->'items') <> 1 THEN RAISE EXCEPTION 'FAIL: busca literal'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_status=>'VENCIDO')->'items') <> 1 THEN RAISE EXCEPTION 'FAIL: vencido'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_tipo=>'pix_copia_cola')->'items') <> 1 THEN RAISE EXCEPTION 'FAIL: tipo'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_data_de=>v_today,p_data_ate=>v_today+1)->'items') <> 2 THEN RAISE EXCEPTION 'FAIL: período'; END IF;
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_data_de=>date_trunc('month',v_today)::date,
   p_data_ate=>(date_trunc('month',v_today)+interval '1 month - 1 day')::date)->'items') < 1 THEN RAISE EXCEPTION 'FAIL: mês'; END IF;
 v_page:=public.list_fin_codigos_pagamento(p_limit=>2); v_cursor:=v_page->'items'->1;
 IF jsonb_array_length(v_page->'items')<>2 OR NOT (v_page->>'has_more')::boolean THEN RAISE EXCEPTION 'FAIL: primeira página'; END IF;
 v_page:=public.list_fin_codigos_pagamento(p_limit=>2,p_cursor_date=>(v_cursor->>'data_vencimento')::date,p_cursor_id=>(v_cursor->>'id')::uuid);
 IF jsonb_array_length(v_page->'items')<>2 OR (v_page->>'has_more')::boolean THEN RAISE EXCEPTION 'FAIL: segunda página'; END IF;
 -- Adicionar, trocar, remover e editar por cliente antigo sem apagar código.
 SELECT updated_at INTO v_updated FROM public.fin_contas_pagar WHERE id=v_old;
 PERFORM public._guarded_update_conta_pagar(v_old,'Legado editado',11,p_data_vencimento=>v_today,
   p_expected_updated_at=>v_updated,p_dados_pagamento=>'{"tipo":"pix_chave","codigo":"primeira"}');
 PERFORM public._guarded_update_conta_pagar(v_old,'Legado editado 2',12,p_data_vencimento=>v_today);
 IF (SELECT codigo_pagamento FROM public.fin_contas_pagar WHERE id=v_old)<>'primeira' THEN RAISE EXCEPTION 'FAIL: cliente antigo apagou código'; END IF;
 PERFORM public._guarded_update_conta_pagar(v_old,'Legado editado 3',13,p_data_vencimento=>v_today+3,p_fornecedor=>'Novo fornecedor',
   p_dados_pagamento=>'{"tipo":"outro","codigo":"segunda"}');
 v_page:=public.list_fin_codigos_pagamento(p_search=>'Novo fornecedor');
 IF (v_page->'items'->0->>'valor')::numeric<>13 OR v_page->'items'->0->>'codigo_pagamento'<>'segunda' THEN RAISE EXCEPTION 'FAIL: atualização refletida'; END IF;
 PERFORM public._guarded_update_conta_pagar(v_old,'Legado editado 4',14,p_data_vencimento=>v_today,
   p_dados_pagamento=>'{"tipo":null,"codigo":null}');
 IF (SELECT codigo_pagamento IS NOT NULL FROM public.fin_contas_pagar WHERE id=v_old) THEN RAISE EXCEPTION 'FAIL: remoção'; END IF;
 -- Validação do servidor em todos os caminhos; código nunca incluído no erro.
 FOR v_result IN SELECT value FROM jsonb_array_elements('[{"tipo":"inventado","codigo":"segredo"},{"tipo":"boleto","codigo":"   "},{"tipo":null,"codigo":"segredo"},{"tipo":"pix_chave","codigo":123}]') LOOP
  BEGIN
   PERFORM public._guarded_create_conta_pagar('Inválido',1,p_dados_pagamento=>v_result);
   RAISE EXCEPTION 'FAIL: validação';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CODIGO_PAGAMENTO_INVALIDO' THEN RAISE; END IF; END;
 END LOOP;
 BEGIN
  PERFORM public._guarded_create_conta_pagar('Inválido grande',1,p_dados_pagamento=>jsonb_build_object('tipo','outro','codigo',repeat('x',8193)));
  RAISE EXCEPTION 'FAIL: tamanho';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CODIGO_PAGAMENTO_INVALIDO' THEN RAISE; END IF; END;
 -- Recorrência mantém N títulos, sem replicar um boleto em parcelas futuras.
 v_result:=public._guarded_create_conta_pagar('Recorrência',20,p_data_vencimento=>v_today,
   p_recorrencia=>'{"frequencia":"mensal","parcelas":3}',p_dados_pagamento=>'{"tipo":"boleto","codigo":"recorrencia-1"}');
 IF (v_result->>'lancamentos_criados')::int<>3 OR EXISTS(SELECT 1 FROM public.fin_contas_pagar
   WHERE lancamento_pai_id=(v_result->>'id')::uuid AND codigo_pagamento IS NOT NULL) THEN RAISE EXCEPTION 'FAIL: recorrência'; END IF;
 -- Baixa real cria espelho e a mesma consulta passa a mostrar PAGO.
 SELECT updated_at INTO v_updated FROM public.fin_contas_pagar WHERE id=v_id;
 PERFORM public.pay_conta_pagar(v_id,v_updated::text,v_today,'a1111111-1111-4111-8111-111111111116');
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_status=>'PAGO')->'items')<>1 THEN RAISE EXCEPTION 'FAIL: baixa'; END IF;
 BEGIN
  PERFORM public._guarded_update_conta_pagar(v_id,'Não editar pago',1250,p_data_vencimento=>v_today,p_dados_pagamento=>'{"tipo":"outro","codigo":"errado"}');
  RAISE EXCEPTION 'FAIL: imutabilidade pago';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Não é permitido editar%' THEN RAISE; END IF; END;
 SELECT updated_at INTO v_updated FROM public.fin_contas_pagar WHERE id=v_other;
 PERFORM public._guarded_delete_conta_pagar(v_other,v_updated);
 IF jsonb_array_length(public.list_fin_codigos_pagamento(p_search=>'Ref_100%')->'items')<>0 THEN RAISE EXCEPTION 'FAIL: exclusão'; END IF;
 PERFORM set_config('test.payment_id',v_id::text,true);
 RAISE NOTICE 'PASS: cadastro, legado, validação, edição, cópia exata, filtros, paginação, recorrência, baixa e exclusão';
END $$;
RESET ROLE;
-- Auditoria do registro completo não contém o código, inclusive a coluna gerada.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.audit_logs WHERE company_id='a1111111-1111-4111-8111-111111111111'
   AND (before ? 'codigo_pagamento' OR after ? 'codigo_pagamento' OR before ? 'codigo_pagamento_unaccent' OR after ? 'codigo_pagamento_unaccent'))
 THEN RAISE EXCEPTION 'FAIL: código nos logs'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"b2222222-2222-4222-8222-222222222223","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"b2222222-2222-4222-8222-222222222222"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.list_fin_codigos_pagamento()->'items')<>0 THEN RAISE EXCEPTION 'FAIL: dados A em B'; END IF;
 IF EXISTS(SELECT 1 FROM public.fin_contas_pagar WHERE id=current_setting('test.payment_id')::uuid) THEN RAISE EXCEPTION 'FAIL: RLS A em B'; END IF;
 BEGIN
  PERFORM public._guarded_update_conta_pagar(current_setting('test.payment_id')::uuid,'Ataque',1,p_data_vencimento=>(now() AT TIME ZONE 'America/Sao_Paulo')::date,p_dados_pagamento=>'{"tipo":"outro","codigo":"atacado"}');
  RAISE EXCEPTION 'FAIL: IDOR';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Registro não encontrado' THEN RAISE; END IF; END;
 PERFORM public._guarded_create_conta_pagar('Somente B',10,p_dados_pagamento=>'{"tipo":"pix_chave","codigo":"codigo-b"}');
 IF jsonb_array_length(public.list_fin_codigos_pagamento()->'items')<>1 THEN RAISE EXCEPTION 'FAIL: B'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111113","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"a1111111-1111-4111-8111-111111111111"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.list_fin_codigos_pagamento(); RAISE EXCEPTION 'FAIL: sem permissão';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.fin_contas_pagar) THEN RAISE EXCEPTION 'FAIL: RLS sem permissão'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111114","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF jsonb_array_length(public.list_fin_codigos_pagamento()->'items')=0 THEN RAISE EXCEPTION 'FAIL: leitor granular'; END IF;
 BEGIN PERFORM public._guarded_create_conta_pagar('Leitor não cria',1,p_dados_pagamento=>'{"tipo":"outro","codigo":"x"}'); RAISE EXCEPTION 'FAIL: leitor cria';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Permission denied%' THEN RAISE; END IF; END;
 BEGIN UPDATE public.fin_contas_pagar SET codigo_pagamento='destino-indevido' WHERE descricao='PIX vencido'; RAISE EXCEPTION 'FAIL: aprovador altera destino';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.headers','{"x-company-id":"b2222222-2222-4222-8222-222222222222"}',true);
 BEGIN PERFORM public.list_fin_codigos_pagamento(); RAISE EXCEPTION 'FAIL: header adulterado';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: RLS, isolamento, IDOR, header, leitura granular e ausência de permissão';
END $$;
RESET ROLE;
ROLLBACK;
