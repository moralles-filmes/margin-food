-- LOCAL REHEARSAL FIXTURE ONLY. Synthetic rows in a disposable release clone.
DO $$
BEGIN
  IF current_database() NOT LIKE 'moralles_stabilization_release_%'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  THEN RAISE EXCEPTION 'LOCAL_DISPOSABLE_RELEASE_REHEARSAL_ONLY'; END IF;
END $$;

SET session_replication_role=replica;
INSERT INTO public.companies(id,nome)
VALUES ('db000000-0000-4000-8000-000000000001','Concurrency A');
INSERT INTO auth.users(id,email)
VALUES ('da000000-0000-4000-8000-000000000001','concurrency@example.test');
INSERT INTO public.profiles(id,nome,email,company_id)
VALUES ('da000000-0000-4000-8000-000000000001','Concurrency fixture',
  'concurrency@example.test','db000000-0000-4000-8000-000000000001');
INSERT INTO public.company_memberships(user_id,company_id)
VALUES ('da000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001');
INSERT INTO public.permissions(key,description,module,submodule,action)
VALUES ('compras:cotacao:close','Fixture','compras','cotacao','close')
ON CONFLICT(key) DO NOTHING;
INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect)
VALUES ('da000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  'compras:cotacao:close','ALLOW');
INSERT INTO public.produtos(id,company_id,nome_produto,sku,categoria,unidade_medida,saldo_atual)
VALUES ('dc000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  'Produto concorrente','CONCURRENT-1','Outros','UN',0);
INSERT INTO public.cotacoes(id,company_id,codigo,titulo,status,created_by)
VALUES ('dd000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  'COT-CONCURRENT-1','Cotação concorrente','EM_ANALISE','da000000-0000-4000-8000-000000000001');
INSERT INTO public.cotacao_itens(id,cotacao_id,company_id,produto_id,produto_nome_snapshot,
  unidade_snapshot,purchase_unit_snapshot,quantidade)
VALUES ('de000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000001',
  'Produto concorrente','UN','UN',2);
INSERT INTO public.cotacao_fornecedores(id,cotacao_id,company_id,supplier_nome_snapshot,status)
VALUES ('df000000-0000-4000-8000-000000000001','dd000000-0000-4000-8000-000000000001',
  'db000000-0000-4000-8000-000000000001','Fornecedor concorrente','RESPONDIDO');
INSERT INTO public.cotacao_respostas(id,cotacao_fornecedor_id,cotacao_item_id,company_id,
  preco_unitario,disponivel,selecionado)
VALUES ('d1000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001',
  9,true,true);
SET session_replication_role=origin;
