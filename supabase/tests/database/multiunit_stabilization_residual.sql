\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'moralles_stabilization_%'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF;
END $$;

CREATE TEMP TABLE results(label text);
GRANT ALL ON results TO authenticated;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF;
  INSERT INTO results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO results VALUES(label); RETURN;
  WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM LIKE '%PERMISSION_DENIED%' THEN INSERT INTO results VALUES(label); RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'TEST FAILED expected denial: %',label;
END $$;
CREATE FUNCTION pg_temp.rejected(statement text,pattern text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE pattern THEN INSERT INTO results VALUES(label); RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'TEST FAILED expected rejection: %',label;
END $$;
CREATE FUNCTION pg_temp.context(actor integer,unit integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',format('ac000000-0000-4000-8000-%s',lpad(actor::text,12,'0')),
    'role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object(
    'x-company-id',format('bc000000-0000-4000-8000-%s',lpad(unit::text,12,'0')))::text,true);
END $$;

SET LOCAL session_replication_role=replica;
INSERT INTO companies(id,nome) VALUES
 ('bc000000-0000-4000-8000-000000000001','Stabilization A'),
 ('bc000000-0000-4000-8000-000000000002','Stabilization B');
INSERT INTO auth.users(id,email) VALUES
 ('ac000000-0000-4000-8000-000000000001','stabilization-a@example.test'),
 ('ac000000-0000-4000-8000-000000000002','stabilization-denied@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES
 ('ac000000-0000-4000-8000-000000000001','Fixture A','stabilization-a@example.test','bc000000-0000-4000-8000-000000000001'),
 ('ac000000-0000-4000-8000-000000000002','Fixture denied','stabilization-denied@example.test','bc000000-0000-4000-8000-000000000001');
INSERT INTO company_memberships(user_id,company_id) VALUES
 ('ac000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001'),
 ('ac000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;

INSERT INTO permissions(key,module,submodule,action)
SELECT key,split_part(key,':',1),split_part(key,':',2),split_part(key,':',3)
FROM unnest(ARRAY[
 'system:global:manage','inventario:rapido:create','estoque:saldo:view',
 'estoque:movimentacoes:cancel','compras:checklist:edit','compras:recebimentos:create',
 'compras:lista:approve','compras:lista:view','compras:lista:create','compras:lista:edit','compras:checklist:approve',
 'compras:pedidos:create','compras:pedidos:delete',
 'compras:cotacao:close','planning:meta-compras:edit','rh:banco-horas:reconcile','rh:documentos:manage'
]) key ON CONFLICT(key) DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
SELECT 'ac000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001',key,
  CASE WHEN key='system:global:manage' THEN 'DENY' ELSE 'ALLOW' END
FROM unnest(ARRAY[
 'system:global:manage','inventario:rapido:create','estoque:saldo:view',
 'estoque:movimentacoes:cancel','compras:checklist:edit','compras:recebimentos:create',
 'compras:lista:approve','compras:lista:view','compras:lista:create','compras:lista:edit','compras:checklist:approve',
 'compras:pedidos:create','compras:pedidos:delete',
 'compras:cotacao:close','planning:meta-compras:edit','rh:banco-horas:reconcile','rh:documentos:manage'
]) key;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
VALUES
 ('ac000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000001','system:global:manage','DENY'),
 ('ac000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000001','compras:recebimentos:create','ALLOW'),
 ('ac000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000001','compras:lista:approve','DENY');

SELECT pg_temp.context(1);
INSERT INTO produtos(id,company_id,nome_produto,sku,categoria,unidade_medida,saldo_atual)
VALUES('cc000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001','Produto A','STABA','Outros','UN',10);

-- ACLs and broken overloads.
SELECT pg_temp.ok(to_regprocedure('public.get_relatorios_kpis(text,text)') IS NULL,'broken report text overload removed');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.get_relatorios_kpis(date,date)','EXECUTE'),'anon cannot execute report');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.get_catalog_counts()','EXECUTE'),'anon cannot execute catalog counts');
SELECT pg_temp.ok(to_regprocedure('public._salmon_replace_entry_guarded(uuid,text,text,text,text,integer,integer,numeric,numeric,text,text)') IS NOT NULL,'atomic salmon entry replace exists');
SELECT pg_temp.ok(to_regprocedure('public._salmon_replace_manipulation_guarded(uuid,uuid,text,integer,numeric,numeric,numeric,text)') IS NOT NULL,'atomic salmon manipulation replace exists');

-- Purchase requisition mutations validate parent scope and commit audit with data.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
CREATE TEMP TABLE created_purchase_requisition AS
SELECT public.mutate_purchase_requisition_atomic('criar',jsonb_build_object(
  'tipo','manual','observacao','fixture requisition','itens',jsonb_build_array(jsonb_build_object(
    'produto_id','cc000000-0000-4000-8000-000000000001','produto_nome','Produto A',
    'quantidade_sugerida',2,'quantidade_escolhida',2,'unidade','UN','preco_referencia',3
  )))) AS value;
CREATE TEMP TABLE second_purchase_requisition AS
SELECT public.mutate_purchase_requisition_atomic('criar',jsonb_build_object(
  'tipo','manual','itens',jsonb_build_array(jsonb_build_object(
    'produto_id','cc000000-0000-4000-8000-000000000001','produto_nome','Produto A',
    'quantidade_escolhida',1,'unidade','UN','preco_referencia',1
  )))) AS value;
SELECT public.mutate_purchase_requisition_atomic('editar',jsonb_build_object(
  'id',(SELECT value->>'id' FROM created_purchase_requisition),
  'itens',jsonb_build_array(jsonb_build_object(
    'id',(SELECT id FROM purchase_requisition_items
      WHERE requisition_id=(SELECT (value->>'id')::uuid FROM created_purchase_requisition)),
    'quantidade_escolhida',4,'preco_referencia',3
  ))));
SELECT pg_temp.rejected(format(
  'SELECT public.mutate_purchase_requisition_atomic(''editar'',%L::jsonb)',
  jsonb_build_object(
    'id',(SELECT value->>'id' FROM created_purchase_requisition),
    'itens',jsonb_build_array(jsonb_build_object(
      'id',(SELECT id FROM purchase_requisition_items
        WHERE requisition_id=(SELECT (value->>'id')::uuid FROM second_purchase_requisition)),
      'quantidade_escolhida',99
    ))
  )::text),'%REQUISITION_ITEM_NOT_FOUND%','requisition edit rejects child from another parent');
SELECT public.mutate_purchase_requisition_atomic('ignorar_item',jsonb_build_object(
  'item_id',(SELECT id FROM purchase_requisition_items
    WHERE requisition_id=(SELECT (value->>'id')::uuid FROM created_purchase_requisition)),
  'ignored',true,'reason','fixture'
));
SELECT public.mutate_purchase_requisition_atomic('converter',jsonb_build_object(
  'id',(SELECT value->>'id' FROM created_purchase_requisition)
));
RESET ROLE;
SELECT pg_temp.ok((SELECT total_estimado=0 AND status='CONVERTIDA'
  FROM purchase_requisitions WHERE id=(SELECT (value->>'id')::uuid FROM created_purchase_requisition)),
  'requisition edit ignore and conversion are atomic');
SELECT pg_temp.ok((SELECT count(*)=4 FROM purchase_requisition_audit
  WHERE requisition_id=(SELECT (value->>'id')::uuid FROM created_purchase_requisition)),
  'requisition data mutations have matching audit rows');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_constraint
  WHERE conname='stabilization_purchase_requisition_items_parent_tenant_fk'),
  'requisition item parent has tenant composite foreign key');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_constraint
  WHERE conname='stabilization_purchase_requisition_audit_parent_tenant_fk'),
  'requisition audit parent has tenant composite foreign key');

-- Order creation and assignment notification commit together.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
CREATE TEMP TABLE created_order_result AS
SELECT public.create_purchase_order_atomic(jsonb_build_object(
  'title','Pedido atômico com responsável','type','FORNECEDOR',
  'responsible_user_id','ac000000-0000-4000-8000-000000000002',
  'items',jsonb_build_array(jsonb_build_object(
    'stock_item_id','cc000000-0000-4000-8000-000000000001',
    'name_snapshot','Produto A','unit_snapshot','UN',
    'estimated_unit_value',5,'qty_requested',1
  ))
),'ad000000-0000-4000-8000-000000000001') AS value;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM notifications
  WHERE company_id='bc000000-0000-4000-8000-000000000001'
    AND recipient_user_id='ac000000-0000-4000-8000-000000000002'
    AND entity_id=(SELECT (value->>'order_id')::uuid FROM created_order_result)),
  'assignment notification is part of order transaction');

-- Planning delete no longer references nonexistent columns.
INSERT INTO planning_metas_compra(id,company_id,year,month,categoria,target_value,created_by)
VALUES('dc000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001',2026,9,'Teste',100,
 'ac000000-0000-4000-8000-000000000001');
SELECT pg_temp.context(1);
SET LOCAL ROLE authenticated;
SELECT public._planning_delete_meta_guarded('dc000000-0000-4000-8000-000000000001');
RESET ROLE;
SELECT pg_temp.ok((SELECT NOT ativo FROM planning_metas_compra WHERE id='dc000000-0000-4000-8000-000000000001'),'planning delete deactivates existing schema');

-- Quick inventory uses produtos.saldo_atual, valid tipo and replay response.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
CREATE TEMP TABLE quick_result AS
SELECT public.create_quick_inventory_atomic(
  '[{"product_id":"cc000000-0000-4000-8000-000000000001","counted_quantity":7}]'::jsonb,
  'fixture','quick-stabilization-1') AS value;
SELECT pg_temp.ok((SELECT value->>'success'='true' FROM quick_result),'quick inventory succeeds');
SELECT pg_temp.ok(public.create_quick_inventory_atomic(
  '[{"product_id":"cc000000-0000-4000-8000-000000000001","counted_quantity":7}]'::jsonb,
  'fixture','quick-stabilization-1')->>'idempotent'='true','quick inventory replay is success');
RESET ROLE;
SELECT pg_temp.ok((SELECT tipo='parcial' FROM inventarios WHERE id=(SELECT (value->>'inventory_id')::uuid FROM quick_result)),'quick inventory uses valid type');
SELECT pg_temp.ok((SELECT saldo_teorico=10 FROM inventario_itens WHERE inventario_id=(SELECT (value->>'inventory_id')::uuid FROM quick_result)),'quick inventory reads cached balance');
SELECT pg_temp.ok((SELECT count(*)=1 FROM inventarios WHERE company_id='bc000000-0000-4000-8000-000000000001' AND idempotency_key='quick-stabilization-1'),'quick inventory no duplicate row');

-- Stock cancel creates reversal before cancellation and is idempotency-safe.
INSERT INTO movimentacoes_estoque(
 id,produto_id,company_id,data,tipo,direction,quantidade,custo_unitario,custo_total,
 origem,created_by,status,source_module
) VALUES(
 'ec000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001',
 'bc000000-0000-4000-8000-000000000001',current_date,'ENTRADA','IN',2,5,10,
 'Fixture','ac000000-0000-4000-8000-000000000001','ATIVO','estoque'
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT public.cancel_stock_movement_atomic('ec000000-0000-4000-8000-000000000001','fixture');
RESET ROLE;
SELECT pg_temp.ok((SELECT status='CANCELADO' FROM movimentacoes_estoque WHERE id='ec000000-0000-4000-8000-000000000001'),'stock original cancelled');
SELECT pg_temp.ok((SELECT count(*)=1 FROM movimentacoes_estoque WHERE estorno_de_id='ec000000-0000-4000-8000-000000000001' AND status='ATIVO'),'stock reversal exists once');

-- Checklist and receipt are each one transaction; free item replay is stable.
INSERT INTO purchase_orders(id,title,type,status,created_by,responsible_user_id,company_id)
VALUES('fc000000-0000-4000-8000-000000000001','Pedido fixture','MERCADO','PENDING',
 'ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001',
 'bc000000-0000-4000-8000-000000000001');
INSERT INTO purchase_order_items(id,order_id,company_id,name_snapshot,unit_snapshot,estimated_unit_value,qty_requested)
VALUES('ed000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001',
 'bc000000-0000-4000-8000-000000000001','Item livre','UN',10,2);
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT public.confirm_purchase_shopping_atomic('fc000000-0000-4000-8000-000000000001',
 '[{"order_item_id":"ed000000-0000-4000-8000-000000000001","shopping_status":"OK"}]'::jsonb);
CREATE TEMP TABLE receipt_result AS SELECT public.receive_purchase_order_atomic(
 'fc000000-0000-4000-8000-000000000001',
 '[{"order_item_id":"ed000000-0000-4000-8000-000000000001","status":"RECEIVED","qty_received":2,"unit_cost":10}]'::jsonb,
 '{"idempotency_key":"fd000000-0000-4000-8000-000000000001"}'::jsonb) AS value;
SELECT pg_temp.ok(public.receive_purchase_order_atomic(
 'fc000000-0000-4000-8000-000000000001',
 '[{"order_item_id":"ed000000-0000-4000-8000-000000000001","status":"RECEIVED","qty_received":2,"unit_cost":10}]'::jsonb,
 '{"idempotency_key":"fd000000-0000-4000-8000-000000000001"}'::jsonb)->>'idempotent'='true','receipt replay identified');
RESET ROLE;
SELECT pg_temp.ok((SELECT status='COMPLETED' AND total_confirmed=20 FROM purchase_orders WHERE id='fc000000-0000-4000-8000-000000000001'),'free item received once');
SELECT pg_temp.ok((SELECT count(*)=1 FROM purchase_receipt_batches WHERE order_id='fc000000-0000-4000-8000-000000000001'),'receipt batch persisted once');

-- Receiving permission alone cannot bypass the independent approve gate.
INSERT INTO purchase_orders(id,title,type,status,created_by,company_id)
VALUES('fc000000-0000-4000-8000-000000000002','Pedido sem approve','FORNECEDOR','IN_RECEIVING',
 'ac000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001');
INSERT INTO purchase_order_items(id,order_id,company_id,name_snapshot,unit_snapshot,
 estimated_unit_value,qty_requested,shopping_status)
VALUES('ed000000-0000-4000-8000-000000000002','fc000000-0000-4000-8000-000000000002',
 'bc000000-0000-4000-8000-000000000001','Sem approve','UN',1,1,'OK');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(2);
SELECT pg_temp.denied($q$SELECT public.receive_purchase_order_atomic(
 'fc000000-0000-4000-8000-000000000002',
 '[{"order_item_id":"ed000000-0000-4000-8000-000000000002","status":"RECEIVED","qty_received":1,"unit_cost":1}]',
 '{"idempotency_key":"fd000000-0000-4000-8000-000000000002"}')$q$,
 'receiving also requires approve permission');
RESET ROLE;
SELECT pg_temp.ok((SELECT received_status='PENDING' FROM purchase_order_items
 WHERE id='ed000000-0000-4000-8000-000000000002'),'denied receipt has no partial write');

-- RFQ conversion is replay-safe and keeps a single deterministic order.
INSERT INTO cotacoes(id,company_id,codigo,titulo,status,created_by)
VALUES('ca000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001',
 'COT-STAB-1','Cotação idempotente','EM_ANALISE','ac000000-0000-4000-8000-000000000001');
INSERT INTO cotacao_itens(id,cotacao_id,company_id,produto_id,produto_nome_snapshot,
 unidade_snapshot,purchase_unit_snapshot,quantidade)
VALUES('ca100000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001',
 'bc000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001',
 'Produto A','UN','UN',2);
INSERT INTO cotacao_fornecedores(id,cotacao_id,company_id,supplier_nome_snapshot,status)
VALUES('ca200000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001',
 'bc000000-0000-4000-8000-000000000001','Fornecedor fixture','RESPONDIDO');
INSERT INTO cotacao_respostas(id,cotacao_fornecedor_id,cotacao_item_id,company_id,
 preco_unitario,disponivel,selecionado)
VALUES('ca300000-0000-4000-8000-000000000001','ca200000-0000-4000-8000-000000000001',
 'ca100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001',
 7,true,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
CREATE TEMP TABLE cotacao_first AS SELECT public.create_purchase_orders_from_cotacao_atomic(
 'ca000000-0000-4000-8000-000000000001',NULL) AS value;
CREATE TEMP TABLE cotacao_replay AS SELECT public.create_purchase_orders_from_cotacao_atomic(
 'ca000000-0000-4000-8000-000000000001',NULL) AS value;
RESET ROLE;
SELECT pg_temp.ok((SELECT value->>'idempotent'='false' FROM cotacao_first),
 'first RFQ conversion creates order');
SELECT pg_temp.ok((SELECT value->>'idempotent'='true' FROM cotacao_replay),
 'RFQ conversion replay succeeds');
SELECT pg_temp.ok((SELECT count(*)=1 FROM purchase_orders
 WHERE company_id='bc000000-0000-4000-8000-000000000001'
   AND origin='COTACAO' AND origin_ref='ca000000-0000-4000-8000-000000000001'),
 'RFQ conversion creates one supplier order');

-- RH rows and audit either commit together or roll back together.
INSERT INTO rh_colaboradores(id,nome,company_id,created_by)
VALUES('ce000000-0000-4000-8000-000000000001','Colaborador fixture',
 'bc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT public.replace_rh_banco_horas_period_atomic('2026-09',
 '[{"colaborador_id":"ce000000-0000-4000-8000-000000000001","horas_trabalhadas":176,"horas_escaladas":176,"horas_extras":0,"banco_horas_saldo":0,"atrasos_min":0,"faltas":0,"dias_trabalhados":22}]'::jsonb);
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 FROM rh_banco_horas WHERE colaborador_id='ce000000-0000-4000-8000-000000000001' AND periodo='2026-09'),'RH batch row persisted');
SELECT pg_temp.ok((SELECT count(*)=1 FROM rh_audit_log WHERE acao='calcular_banco_horas' AND company_id='bc000000-0000-4000-8000-000000000001'),'RH audit persisted');

-- RH Storage accepts the company/collaborator namespace used by the UI, keeps
-- rolling compatibility, and permits the recoverable metadata lifecycle.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.ok(public.can_access_company_document(
  'bc000000-0000-4000-8000-000000000001/ce000000-0000-4000-8000-000000000001/fixture.pdf','create'
), 'Storage accepts canonical company/collaborator path');
SELECT pg_temp.ok(public.can_access_company_document(
  'ce000000-0000-4000-8000-000000000001/fixture.pdf','view'
), 'Storage keeps legacy collaborator path during rollout');
SELECT pg_temp.ok(NOT public.can_access_company_document(
  'bc000000-0000-4000-8000-000000000002/ce000000-0000-4000-8000-000000000001/fixture.pdf','view'
), 'Storage rejects forged company prefix');
INSERT INTO rh_documentos(
  id,colaborador_id,tipo,nome,arquivo_path,arquivo_nome,arquivo_tamanho,
  uploaded_by,company_id,storage_state
) VALUES (
  'ce100000-0000-4000-8000-000000000001',
  'ce000000-0000-4000-8000-000000000001','outro','Documento saga',
  'bc000000-0000-4000-8000-000000000001/ce000000-0000-4000-8000-000000000001/fixture.pdf',
  'fixture.pdf',9,'ac000000-0000-4000-8000-000000000001',
  'bc000000-0000-4000-8000-000000000001','PENDING_UPLOAD'
);
UPDATE rh_documentos SET storage_state='ACTIVE'
 WHERE id='ce100000-0000-4000-8000-000000000001' AND storage_state='PENDING_UPLOAD';
UPDATE rh_documentos SET storage_state='DELETING'
 WHERE id='ce100000-0000-4000-8000-000000000001' AND storage_state='ACTIVE';
WITH deleted AS (
  DELETE FROM rh_documentos
   WHERE id='ce100000-0000-4000-8000-000000000001' AND storage_state='DELETING'
   RETURNING id
)
SELECT pg_temp.ok((SELECT count(*)=1 FROM deleted), 'RH document metadata delete returns exactly one row');
RESET ROLE;

-- Denied actor cannot call newly exposed readers/mutators.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(2);
SELECT pg_temp.denied('SELECT public.get_catalog_counts()','catalog reader requires RBAC');
SELECT pg_temp.denied($q$SELECT public.create_quick_inventory_atomic('[{"product_id":"cc000000-0000-4000-8000-000000000001","counted_quantity":1}]','denied','denied')$q$,'quick inventory requires RBAC');
RESET ROLE;

SELECT pg_temp.ok((SELECT storage_state='ACTIVE' FROM rh_documentos LIMIT 1) IS NOT FALSE,'storage state column available');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname='stabilization_requisicao_itens_requisicao_tenant_fk'),'requisition parent composite FK exists');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='inventarios_turno_id_fkey'),'simple turno FK removed');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conname='stabilization_salmon_purchase_targets_tenant_key'),'salmon target key tenant-scoped');
SELECT count(*) AS stabilization_assertions FROM results;
ROLLBACK;
