\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase5_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;
CREATE TEMP TABLE results(label text);
CREATE TEMP TABLE resources(name text PRIMARY KEY, value text);
GRANT ALL ON results,resources TO anon,authenticated,service_role;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF; INSERT INTO results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text,expected_state text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=expected_state THEN INSERT INTO results VALUES(label); RETURN; END IF; RAISE;
 END; RAISE EXCEPTION 'TEST FAILED (expected denial): %',label;
END $$;
CREATE FUNCTION pg_temp.context(actor integer,unit integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',format('a5000000-0000-4000-8000-%s',lpad(actor::text,12,'0')),'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-company-id',format('b5000000-0000-4000-8000-%s',lpad(unit::text,12,'0')))::text,true);
END $$;
CREATE FUNCTION pg_temp.digest() RETURNS text LANGUAGE sql AS $$
 SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM suppliers t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM supplier_item_prices t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM produtos t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM purchase_orders t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM purchase_order_items t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimentacoes_estoque t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_log t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_logs t))::text);
$$;
CREATE FUNCTION pg_temp.price(name text DEFAULT 'Mesmo Nome',product uuid DEFAULT 'c5000000-0000-4000-8000-000000000001') RETURNS uuid LANGUAGE sql AS $$
 SELECT public.upsert_supplier_price(name,product,25,'CX');
$$;
INSERT INTO companies(id,nome) VALUES('b5000000-0000-4000-8000-000000000001','Phase5 A'),('b5000000-0000-4000-8000-000000000002','Phase5 B'),('00000000-0000-0000-0000-000000000001','Placeholder');
INSERT INTO auth.users(id,email) SELECT format('a5000000-0000-4000-8000-%s',lpad(i::text,12,'0'))::uuid,format('phase5-%s@example.test',i) FROM generate_series(1,7)i;
INSERT INTO profiles(id,nome,email,company_id) SELECT id,'Fixture',email,CASE WHEN id='a5000000-0000-4000-8000-000000000002' THEN 'b5000000-0000-4000-8000-000000000002' ELSE 'b5000000-0000-4000-8000-000000000001' END::uuid FROM auth.users;
INSERT INTO company_memberships(user_id,company_id) SELECT id,company_id FROM profiles;
INSERT INTO company_memberships(user_id,company_id) VALUES('a5000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000002');
INSERT INTO permissions(key,description,module,submodule,action) SELECT key,'Fixture',split_part(key,':',1),split_part(key,':',2),split_part(key,':',3) FROM unnest(ARRAY[
 'compras:fornecedores:create','compras:fornecedores:edit','compras:fornecedores:view','compras:fornecedores:delete','compras:ranking:view','compras:recebimentos:close','system:global:manage','system:admin','suppliers:edit','purchases:edit','purchases:read','purchases:receiving:manage','salmon:entradas:create','salmon:entradas:delete'
])key ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT user_id,company_id,key,'ALLOW' FROM company_memberships CROSS JOIN unnest(ARRAY['compras:fornecedores:create','compras:fornecedores:edit','compras:fornecedores:view','compras:fornecedores:delete','compras:ranking:view','compras:recebimentos:close','salmon:entradas:create','salmon:entradas:delete'])key WHERE user_id IN ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000004');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) SELECT 'a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',key,'DENY' FROM unnest(ARRAY['suppliers:edit','purchases:edit','purchases:read','purchases:receiving:manage'])key;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES
 ('a5000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000001','system:admin','ALLOW'),
 ('a5000000-0000-4000-8000-000000000005','b5000000-0000-4000-8000-000000000001','system:global:manage','ALLOW'),
 ('a5000000-0000-4000-8000-000000000007','b5000000-0000-4000-8000-000000000001','compras:fornecedores:create','ALLOW');
SELECT pg_temp.context(1);
INSERT INTO produtos(id,company_id,nome_produto,sku,categoria,unidade_medida) VALUES('c5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','Produto A','P5A','Outros','UN');
SELECT pg_temp.context(2,2);
INSERT INTO produtos(id,company_id,nome_produto,sku,categoria,unidade_medida) VALUES('c5000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000002','Produto B','P5B','Outros','UN');
-- Reproduz criação/repetição, sem renomear ou normalizar identidades existentes.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
INSERT INTO resources VALUES('supplierA',public.upsert_supplier('Mesmo Nome')::text),('priceA',pg_temp.price()::text);
SELECT pg_temp.ok(public.upsert_supplier('Mesmo Nome')::text=(SELECT value FROM resources WHERE name='supplierA'),'same tenant same UUID');
SELECT pg_temp.ok(pg_temp.price()::text=(SELECT value FROM resources WHERE name='priceA'),'same tenant price repeats without duplicate');
SELECT pg_temp.ok((SELECT supplier_uuid::text=(SELECT value FROM resources WHERE name='supplierA') AND source='manual' AND purchase_unit='CX' AND unit_cost=25 FROM supplier_item_prices),'manual consumer uses returned UUID and preserves units/source');
SELECT pg_temp.context(2,2);
INSERT INTO resources VALUES('supplierB',public.upsert_supplier('Mesmo Nome')::text),('priceB',pg_temp.price('Mesmo Nome','c5000000-0000-4000-8000-000000000002')::text);
SELECT pg_temp.ok((SELECT value FROM resources WHERE name='supplierB')<>(SELECT value FROM resources WHERE name='supplierA'),'same name A B distinct UUID');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(id::text=(SELECT value FROM resources WHERE name='supplierB')) FROM suppliers),'B direct lookup only B');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(supplier_uuid::text=(SELECT value FROM resources WHERE name='supplierB')) FROM get_supplier_ranking()),'B ranking only B');
SELECT pg_temp.context(4,1);
SELECT pg_temp.ok(public.upsert_supplier('Mesmo Nome')::text=(SELECT value FROM resources WHERE name='supplierA'),'multi A uses A');
SELECT pg_temp.context(4,2);
SELECT pg_temp.ok(public.upsert_supplier('Mesmo Nome')::text=(SELECT value FROM resources WHERE name='supplierB'),'multi B uses B without changing profile');
SELECT pg_temp.context(5);
SELECT pg_temp.ok(public.upsert_supplier('Mesmo Nome')::text=(SELECT value FROM resources WHERE name='supplierA'),'super respects selected tenant');
SELECT pg_temp.context(7);
SELECT pg_temp.ok(public.upsert_supplier('Create Only') IS NOT NULL,'create-only can register supplier');
SELECT pg_temp.denied('SELECT pg_temp.price()','create-only cannot change prices');
RESET ROLE;
INSERT INTO resources VALUES('before-denials',pg_temp.digest());
SET LOCAL ROLE anon;
SELECT pg_temp.denied('SELECT public.upsert_supplier(''x'')','anon supplier');
SELECT pg_temp.denied('SELECT pg_temp.price()','anon price');
SELECT pg_temp.denied('SELECT * FROM get_supplier_ranking()','anon ranking');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(6);
SELECT pg_temp.denied('SELECT public.upsert_supplier(''x'')','no permission supplier');
SELECT pg_temp.denied('SELECT pg_temp.price()','no permission price');
SELECT pg_temp.denied('SELECT * FROM get_supplier_ranking()','no permission lookup','P0001');
SELECT pg_temp.context(3);
SELECT pg_temp.denied('SELECT pg_temp.price()','admin A without functional permission');
SELECT pg_temp.denied('SELECT public.upsert_supplier(''x'')','admin A supplier without functional permission');
SELECT pg_temp.context(1,2);
SELECT pg_temp.denied('SELECT pg_temp.price()','forged B header');
SELECT set_config('request.headers','{"x-company-id":"invalid"}',true);
SELECT pg_temp.denied('SELECT pg_temp.price()','malformed header');
SELECT set_config('request.headers','{"x-company-id":"00000000-0000-0000-0000-000000000001"}',true);
SELECT pg_temp.denied('SELECT pg_temp.price()','placeholder header');
SELECT pg_temp.context(1);
SELECT pg_temp.denied($q$SELECT pg_temp.price('Intruso','c5000000-0000-4000-8000-000000000002')$q$,'B product in A');
SELECT pg_temp.denied($q$INSERT INTO suppliers(name,company_id) VALUES('x','b5000000-0000-4000-8000-000000000002')$q$,'arbitrary supplier company');
WITH changed AS (UPDATE suppliers SET name='Invadido' WHERE id::text=(SELECT value FROM resources WHERE name='supplierB') RETURNING id) SELECT pg_temp.ok(count(*)=0,'A cannot update supplier B') FROM changed;
SELECT pg_temp.denied($q$UPDATE supplier_item_prices SET unit_cost=9,source='salmon'$q$,'direct price/origin forgery');
SELECT pg_temp.denied($q$SELECT log_audit('db','purchases','suppliers',NULL::uuid,'FORGED')$q$,'generic log forgery');
SELECT pg_temp.denied($q$SELECT upsert_supplier_price('x','c5000000-0000-4000-8000-000000000001',25,'UN','b5000000-0000-4000-8000-000000000002')$q$,'no actor/company parameter overload','42883');
SELECT pg_temp.denied($q$SELECT upsert_supplier_price('x','c5000000-0000-4000-8000-000000000001','NaN','UN')$q$,'NaN refused','22023');
SELECT pg_temp.context(6);
SELECT set_config('request.jwt.claims','{"sub":"a5000000-0000-4000-8000-000000000006","role":"service_role"}',true);
SELECT pg_temp.denied('SELECT pg_temp.price()','JSON service claim is not authorization');
RESET ROLE;
UPDATE company_memberships SET status='revoked' WHERE user_id='a5000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied('SELECT pg_temp.price()','revoked membership');
RESET ROLE;
UPDATE company_memberships SET status='inactive' WHERE user_id='a5000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT pg_temp.price()','inactive membership');
RESET ROLE;
UPDATE company_memberships SET status='active' WHERE user_id='a5000000-0000-4000-8000-000000000001';
UPDATE companies SET ativo=false WHERE id='b5000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT pg_temp.price()','inactive company');
RESET ROLE;
UPDATE companies SET ativo=true WHERE id='b5000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.denied('SELECT public.upsert_supplier(''x'')','real service public supplier RPC closed');
SELECT pg_temp.denied('SELECT pg_temp.price()','real service manual price RPC closed');
SELECT pg_temp.denied($q$INSERT INTO supplier_item_prices(supplier_id,supplier_uuid,stock_item_id,company_id) SELECT 'cross',(SELECT value::uuid FROM resources WHERE name='supplierB'),'c5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001'$q$,'FK blocks B supplier A price service','23503');
SELECT pg_temp.denied($q$INSERT INTO supplier_item_prices(supplier_id,supplier_uuid,stock_item_id,company_id) SELECT 'cross',(SELECT value::uuid FROM resources WHERE name='supplierA'),'c5000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001'$q$,'FK blocks A supplier B product service','23503');
SELECT pg_temp.denied($q$UPDATE supplier_item_prices SET supplier_uuid=(SELECT value::uuid FROM resources WHERE name='supplierB') WHERE id::text=(SELECT value FROM resources WHERE name='priceA')$q$,'identity guard blocks crossed price update service');
SELECT pg_temp.denied($q$UPDATE supplier_item_prices SET company_id='b5000000-0000-4000-8000-000000000002'$q$,'price company immutable service');
RESET ROLE;
SELECT pg_temp.ok(pg_temp.digest()=(SELECT value FROM resources WHERE name='before-denials'),'refusals preserve all resources/prices/costs/logs');
-- Falha depois de criar fornecedor e auditá-lo deve reverter ambos.
CREATE FUNCTION pg_temp.fail_price() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.supplier_id='Falha intermediária' THEN RAISE EXCEPTION 'injected' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
CREATE TRIGGER phase5_fail BEFORE INSERT ON supplier_item_prices FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_price();
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied($q$SELECT pg_temp.price('Falha intermediária')$q$,'atomic supplier+price+log rollback','P0001');
RESET ROLE;
DROP TRIGGER phase5_fail ON supplier_item_prices;
SELECT pg_temp.ok(pg_temp.digest()=(SELECT value FROM resources WHERE name='before-denials'),'intermediate error leaves no supplier/log/price');
-- Cadastro direto com empresa explícita, renomeação não reescreve snapshots/preços.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
INSERT INTO suppliers(name,company_id) VALUES('Cadastro direto','b5000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=1 FROM suppliers WHERE name='Cadastro direto'),'legitimate direct registration');
UPDATE suppliers SET name='Renomeado' WHERE id::text=(SELECT value FROM resources WHERE name='supplierA');
SELECT pg_temp.ok((SELECT supplier_name='Renomeado' AND supplier_id='Mesmo Nome' FROM get_supplier_ranking()),'ranking canonical name with preserved historical text');
UPDATE suppliers SET name='Mesmo Nome' WHERE id::text=(SELECT value FROM resources WHERE name='supplierA');
RESET ROLE;
-- Recebimento segue o contrato real: frontend já marcou RECEIVED antes da RPC.
SELECT pg_temp.context(1);
INSERT INTO purchase_orders(id,title,supplier_name,created_by,company_id) VALUES('d5000000-0000-4000-8000-000000000001','PO A','Mesmo Nome','a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001');
INSERT INTO purchase_order_items(id,order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,qty_requested,qty_received,received_status,purchase_unit_snapshot,conversion_factor_snapshot,company_id)
VALUES('e5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','Produto A','UN',20,2,2,'RECEIVED','CX',5,'b5000000-0000-4000-8000-000000000001');
CREATE FUNCTION pg_temp.receive(order_id uuid DEFAULT 'd5000000-0000-4000-8000-000000000001') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.receive_purchase_order_atomic(order_id,'[{"order_item_id":"e5000000-0000-4000-8000-000000000001","status":"RECEIVED","qty_received":2,"unit_cost":20}]','{"company_id":"b5000000-0000-4000-8000-000000000002","source":"forged","actor":"forged"}');
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(2,2);
SELECT pg_temp.denied('SELECT pg_temp.receive()','B cannot receive A order','P0001');
SELECT pg_temp.context(1);
SELECT pg_temp.ok(pg_temp.receive()->>'status'='COMPLETED','legitimate receipt completed');
SELECT pg_temp.ok(pg_temp.receive()->>'items_received'='0','repeated completed receipt is no-op');
RESET ROLE;
SELECT pg_temp.ok((SELECT saldo_atual=10 AND last_cost_purchase_unit=20 AND last_cost_base_unit=4 FROM produtos WHERE id='c5000000-0000-4000-8000-000000000001'),'receipt preserves conversion costs and cached stock');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(supplier_uuid::text=(SELECT value FROM resources WHERE name='supplierA') AND unit_cost=20 AND source='purchases' AND purchase_unit='CX') FROM supplier_item_prices WHERE company_id='b5000000-0000-4000-8000-000000000001'),'receipt updates correct price UUID');
SELECT pg_temp.ok((SELECT unit_cost=25 FROM supplier_item_prices WHERE id::text=(SELECT value FROM resources WHERE name='priceB')),'receipt leaves B price unchanged');
SELECT pg_temp.ok((SELECT total_confirmed=40 FROM purchase_orders WHERE id='d5000000-0000-4000-8000-000000000001'),'receipt repetition does not add total');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(company_id='b5000000-0000-4000-8000-000000000001' AND actor_user_id='a5000000-0000-4000-8000-000000000001' AND source='rpc') FROM audit_logs WHERE action='RECEBIMENTO_ATOMICO'),'receipt log derives actor tenant source');
-- Falha tardia de preço no recebimento reverte fornecedor, item, estoque, custo e logs.
INSERT INTO purchase_orders(id,title,supplier_name,created_by,company_id) VALUES('d5000000-0000-4000-8000-000000000002','PO fail','Falha intermediária','a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001');
INSERT INTO purchase_order_items(id,order_id,stock_item_id,name_snapshot,estimated_unit_value,qty_requested,company_id)
VALUES('e5000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002','c5000000-0000-4000-8000-000000000001','Produto A',30,3,'b5000000-0000-4000-8000-000000000001');
CREATE FUNCTION pg_temp.receive_item(order_id uuid,item_id uuid,qty numeric DEFAULT 2) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.receive_purchase_order_atomic(order_id,jsonb_build_array(jsonb_build_object('order_item_id',item_id,'qty_received',qty,'unit_cost',30,'status','RECEIVED')));
$$;
INSERT INTO resources VALUES('before-receipt-failure',pg_temp.digest());
CREATE TRIGGER phase5_fail BEFORE INSERT ON supplier_item_prices FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_price();
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT pg_temp.receive_item('d5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002')$q$,'receipt late failure','P0001');
RESET ROLE;
SELECT pg_temp.ok(pg_temp.digest()=(SELECT value FROM resources WHERE name='before-receipt-failure'),'receipt failure atomic including shortfall row');
DROP TRIGGER phase5_fail ON supplier_item_prices;
UPDATE purchase_order_items SET stock_item_id='c5000000-0000-4000-8000-000000000002' WHERE id='e5000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT pg_temp.receive_item('d5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002')$q$,'receipt rejects crossed product');
SELECT pg_temp.denied($q$SELECT pg_temp.receive_item('d5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001')$q$,'receipt rejects item from another order','P0001');
RESET ROLE;
UPDATE purchase_order_items SET stock_item_id='c5000000-0000-4000-8000-000000000001' WHERE id='e5000000-0000-4000-8000-000000000002';
UPDATE purchase_orders SET supplier_name='Mesmo Nome' WHERE id='d5000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(pg_temp.receive_item('d5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002')->>'status'='PARTIAL','partial receipt');
SELECT pg_temp.ok(pg_temp.receive_item('d5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000002')->>'items_received'='0','repeat partial receipt skips existing mirror');
RESET ROLE;
SELECT pg_temp.ok((SELECT total_confirmed=60 FROM purchase_orders WHERE id='d5000000-0000-4000-8000-000000000002'),'partial retry preserves total');
INSERT INTO resources SELECT 'shortfall',id::text FROM purchase_order_items WHERE order_id='d5000000-0000-4000-8000-000000000002' AND received_status='NOT_DELIVERED';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT pg_temp.receive_item('d5000000-0000-4000-8000-000000000002',(SELECT value::uuid FROM resources WHERE name='shortfall'),1)$q$,'preexisting post-approval trigger requires lista approve','P0001');
RESET ROLE;
INSERT INTO permissions(key,description,module,submodule,action) VALUES('compras:lista:approve','Fixture','compras','lista','approve') ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('a5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','compras:lista:approve','ALLOW');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(pg_temp.receive_item('d5000000-0000-4000-8000-000000000002',(SELECT value::uuid FROM resources WHERE name='shortfall'),1)->>'status'='COMPLETED','later delivery receives shortfall');
RESET ROLE;
SELECT pg_temp.ok((SELECT total_confirmed=90 FROM purchase_orders WHERE id='d5000000-0000-4000-8000-000000000002'),'partial then completion total');
SELECT pg_temp.ok((SELECT saldo_atual=13 FROM produtos WHERE id='c5000000-0000-4000-8000-000000000001'),'partial then completion cached balance');
-- Cotação: vínculo UUID opcional, snapshot mantido quando fornecedor é removido.
INSERT INTO cotacoes(id,company_id,codigo,titulo,created_by) VALUES('f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','P5','Fixture','a5000000-0000-4000-8000-000000000001');
SELECT pg_temp.denied($q$INSERT INTO cotacao_fornecedores(cotacao_id,company_id,supplier_id,supplier_nome_snapshot) SELECT 'f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',value::uuid,'Snapshot' FROM resources WHERE name='supplierB'$q$,'quote rejects B supplier in A even definer','23503');
INSERT INTO cotacao_fornecedores(cotacao_id,company_id,supplier_id,supplier_nome_snapshot) SELECT 'f5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',id,'Snapshot preservado' FROM suppliers WHERE name='Cadastro direto';
DELETE FROM suppliers WHERE name='Cadastro direto';
SELECT pg_temp.ok((SELECT supplier_id IS NULL AND supplier_nome_snapshot='Snapshot preservado' AND company_id='b5000000-0000-4000-8000-000000000001' FROM cotacao_fornecedores),'quote ON DELETE nulls only UUID, keeps tenant and snapshot');
-- Fornecedor/preço do Salmão continua usando a mesma identidade por empresa.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
INSERT INTO resources VALUES('salmon',(_salmon_create_entry_guarded('2026-09-15','Phase5','','Mesmo Nome',1,1,10,100,'','2026-09-20')->>'entry_id'));
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(supplier_uuid::text=(SELECT value FROM resources WHERE name='supplierA') AND purchase_unit='KG') FROM supplier_item_prices WHERE source='salmon'),'salmon preserves supplier and unit');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT _salmon_cancel_entry_guarded((SELECT value::uuid FROM resources WHERE name='salmon'),'Phase5 regression');
RESET ROLE;
SELECT pg_temp.ok((SELECT saldo_atual=0 FROM produtos WHERE is_salmon_raw_linked),'salmon cancellation keeps cached balance');
SELECT count(*) AS phase5_assertions FROM results;
ROLLBACK;
