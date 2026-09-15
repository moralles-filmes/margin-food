\set ON_ERROR_STOP on
-- Ensaio exclusivo em PostgreSQL local descartável, sem dados/identidades reais.
BEGIN;
DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase3_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;
CREATE TEMP TABLE phase3_results(label text);
GRANT SELECT,INSERT ON phase3_results TO anon,authenticated,service_role;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF;
 INSERT INTO phase3_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text,expected_state text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=expected_state THEN INSERT INTO phase3_results VALUES(label); RETURN; END IF; RAISE;
 END; RAISE EXCEPTION 'TEST FAILED (expected denial): %',label;
END $$;
CREATE FUNCTION pg_temp.context(actor integer,unit integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',format('a0000000-0000-4000-8000-%s',lpad(actor::text,12,'0')),'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-company-id',format('b0000000-0000-4000-8000-%s',lpad(unit::text,12,'0')))::text,true);
END $$;
INSERT INTO companies(id,nome) VALUES ('b0000000-0000-4000-8000-000000000001','Fixture A'),('b0000000-0000-4000-8000-000000000002','Fixture B'),('00000000-0000-0000-0000-000000000001','Placeholder');
INSERT INTO auth.users(id,email) SELECT format('a0000000-0000-4000-8000-%s',lpad(i::text,12,'0'))::uuid,format('phase3-%s@example.test',i) FROM generate_series(1,6)i;
INSERT INTO profiles(id,nome,email,company_id) SELECT id,'Fixture',email,CASE WHEN id='a0000000-0000-4000-8000-000000000002' THEN 'b0000000-0000-4000-8000-000000000002' ELSE 'b0000000-0000-4000-8000-000000000001' END::uuid FROM auth.users;
INSERT INTO company_memberships(user_id,company_id) SELECT id,company_id FROM profiles;
INSERT INTO company_memberships(user_id,company_id) VALUES('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002');
INSERT INTO permissions(key,description,module,submodule,action) SELECT key,'Fixture',split_part(key,':',1),split_part(key,':',2),split_part(key,':',3) FROM unnest(ARRAY[
 'system:global:manage','system:admin','system:read','configuracoes:auditoria-seguranca:view','configuracoes:auditoria-sistema:view','configuracoes:performance:view','financeiro:auditoria:view',
 'estoque:cadastros:view','estoque:cadastros:create','estoque:cadastros:edit','estoque:cadastros:delete','planning:meta-compras:edit','financeiro:pagar:edit','financeiro:pagar:approve','financeiro:contas:create','financeiro:contas:view','financeiro:pagar:create','financeiro:pagar:view','compras:pedidos:create','compras:pedidos:edit','compras:pedidos:view'
 ])key ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT id,company_id,key,'ALLOW' FROM profiles CROSS JOIN unnest(ARRAY['configuracoes:auditoria-seguranca:view','configuracoes:auditoria-sistema:view'])key WHERE id IN ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000004');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES
 ('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','system:admin','ALLOW'),
 ('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','system:global:manage','DENY'),
 ('a0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000001','system:global:manage','ALLOW');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT 'a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',key,'ALLOW' FROM unnest(ARRAY['estoque:cadastros:view','estoque:cadastros:create','estoque:cadastros:edit','estoque:cadastros:delete','planning:meta-compras:edit','financeiro:auditoria:view','financeiro:pagar:edit','financeiro:pagar:approve','financeiro:contas:create','financeiro:contas:view','financeiro:pagar:create','financeiro:pagar:view','compras:pedidos:create','compras:pedidos:edit','compras:pedidos:view'])key;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES ('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','system:read','DENY');
-- A policy operacional legada usa stock:* (a chave estoque:categorias:* é fora do registry;
-- correção dessa divergência pertence à Fase 6). Não relaxar a policy para este teste.
INSERT INTO permissions(key,description,module,submodule,action) SELECT key,'Fixture','stock','legacy','manage' FROM unnest(ARRAY['stock:read','stock:edit'])key ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) SELECT 'a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',key,'ALLOW' FROM unnest(ARRAY['stock:read','stock:edit'])key;
-- Recursos atuais A/B. Todos os triggers reais permanecem ativos.
INSERT INTO stock_categories(id,name,company_id) VALUES('c0000000-0000-4000-8000-000000000001','A','b0000000-0000-4000-8000-000000000001'),('c0000000-0000-4000-8000-000000000002','B','b0000000-0000-4000-8000-000000000002');
INSERT INTO fin_contas(id,nome,company_id) VALUES('d0000000-0000-4000-8000-000000000001','Banco A','b0000000-0000-4000-8000-000000000001'),('d0000000-0000-4000-8000-000000000002','Banco B','b0000000-0000-4000-8000-000000000002');
INSERT INTO salmon_entries(id,gross_kg,company_id,created_by) VALUES('e0000000-0000-4000-8000-000000000001',10,'b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_logs WHERE log_scope='TENANT' AND company_id='b0000000-0000-4000-8000-000000000002'),'B trigger attributed');
-- Fixtures históricas entram sem stamp somente nesta transação, simulando linhas pré-migration.
ALTER TABLE audit_log DISABLE TRIGGER stamp_log;
ALTER TABLE audit_logs DISABLE TRIGGER stamp_log;
ALTER TABLE integration_logs DISABLE TRIGGER stamp_log;
INSERT INTO audit_log(tabela,registro_id,acao) VALUES('stock_categories','c0000000-0000-4000-8000-000000000001','LEGACY'),('auth.users','a0000000-0000-4000-8000-000000000001','LEGACY'),('stock_categories','c0000000-0000-4000-8000-000000000099','LEGACY');
INSERT INTO audit_logs(entity,entity_id,module,action,before,after,metadata,company_id) VALUES
 ('fin_contas','d0000000-0000-4000-8000-000000000001','financeiro','LEGACY',NULL,'{"company_id":"b0000000-0000-4000-8000-000000000001"}',NULL,NULL),
 ('fin_contas','d0000000-0000-4000-8000-000000000001','financeiro','CONFLICT',NULL,'{"company_id":"b0000000-0000-4000-8000-000000000002"}',NULL,NULL),
 ('fin_contas','d0000000-0000-4000-8000-000000000001','financeiro','INVALID',NULL,'{"company_id":"invalid-uuid"}',NULL,NULL),
 ('fin_contas','d0000000-0000-4000-8000-000000000099','financeiro','DELETED',NULL,'{"company_id":"b0000000-0000-4000-8000-000000000001"}',NULL,NULL),
 ('auth.users','a0000000-0000-4000-8000-000000000001','system','IDENTITY',NULL,NULL,NULL,NULL),
 ('fin_contas',NULL,'financeiro','NO_ID',NULL,NULL,NULL,NULL),
 ('fin_contas','d0000000-0000-4000-8000-000000000001','financeiro','RESOURCE_CONFLICT',NULL,'{"id":"d0000000-0000-4000-8000-000000000002"}',NULL,NULL),
 ('fin_contas','d0000000-0000-4000-8000-000000000001','financeiro','ATTRIBUTED_CONFLICT',NULL,NULL,NULL,'b0000000-0000-4000-8000-000000000002');
INSERT INTO integration_logs(module,action,reference_id) VALUES('salmon_to_stock','LEGACY','e0000000-0000-4000-8000-000000000001'),('salmon_to_stock','INVALID','not-a-uuid');
ALTER TABLE audit_log ENABLE TRIGGER stamp_log;
ALTER TABLE audit_logs ENABLE TRIGGER stamp_log;
ALTER TABLE integration_logs ENABLE TRIGGER stamp_log;
CREATE TEMP TABLE original_logs AS SELECT id,md5((to_jsonb(l)-ARRAY['company_id','log_scope','scope_reason'])::text) digest FROM audit_logs l;

DO $$ DECLARE t text; role_name text; f text; BEGIN
 FOREACH t IN ARRAY ARRAY['audit_log','audit_logs','integration_logs'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   PERFORM pg_temp.ok(NOT has_table_privilege(role_name,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN'),role_name||' no mutation grant '||t);
  END LOOP;
  PERFORM pg_temp.ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass),'RLS/FORCE '||t);
 END LOOP;
 FOREACH f IN ARRAY ARRAY['log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)','log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)','audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)','log_integration_error(text,text,text,text,jsonb)'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP PERFORM pg_temp.ok(NOT has_function_privilege(role_name,'public.'||f,'EXECUTE'),role_name||' no generic writer '||f); END LOOP;
 END LOOP;
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.denied('SELECT * FROM audit_log','anon legacy read');
SELECT pg_temp.denied('SELECT * FROM audit_logs','anon structured read');
SELECT pg_temp.denied('SELECT * FROM integration_logs','anon integration read');
SELECT pg_temp.denied($q$SELECT * FROM list_restricted_logs('audit_logs')$q$,'anon global reader');
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE actor integer; t text; BEGIN
 FOR actor IN 1..6 LOOP
  PERFORM pg_temp.context(actor,CASE WHEN actor=2 THEN 2 ELSE 1 END);
  FOREACH t IN ARRAY ARRAY['audit_log','audit_logs','integration_logs'] LOOP
   PERFORM pg_temp.ok((SELECT public.assert_tenant()) IS NOT NULL,'context valid '||actor||' '||t);
   PERFORM pg_temp.denied(format('INSERT INTO %I(id) VALUES(gen_random_uuid())',t),'actor '||actor||' cannot forge '||t);
   PERFORM pg_temp.denied(format('DELETE FROM %I',t),'actor '||actor||' cannot delete '||t);
  END LOOP;
  IF actor<>5 THEN PERFORM pg_temp.denied($q$SELECT * FROM list_restricted_logs('audit_logs','AMBIGUOUS')$q$,'actor '||actor||' restricted denied'); END IF;
  PERFORM pg_temp.denied($q$SELECT log_audit('db','financeiro','fin_contas',NULL::uuid,'FAKE')$q$,'actor '||actor||' UUID writer denied');
  PERFORM pg_temp.denied($q$SELECT log_audit('db','financeiro','fin_contas','invalid'::text,'FAKE')$q$,'actor '||actor||' text writer denied');
  PERFORM pg_temp.denied($q$SELECT audit_log_write('financeiro','FAKE','fin_contas')$q$,'actor '||actor||' edge impersonation denied');
  PERFORM pg_temp.denied($q$SELECT log_integration_error('salmon_to_stock','FAKE','id','error')$q$,'actor '||actor||' integration writer denied');
  PERFORM pg_temp.denied($q$SELECT backfill_log_scope('audit_logs')$q$,'actor '||actor||' backfill denied');
 END LOOP;
END $$;
SELECT pg_temp.context(1);
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_log),'A reads A with granular ALLOW / legacy DENY');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE company_id<>'b0000000-0000-4000-8000-000000000001'),'A cannot read B');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE log_scope<>'TENANT'),'A cannot read ambiguous');
UPDATE stock_categories SET name='A edit' WHERE id='c0000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_log WHERE acao='UPDATE' AND campo='name' AND valor_novo='A edit' AND user_id=auth.uid()),'server trigger actor/value');
SELECT pg_temp.denied($q$UPDATE stock_categories SET company_id='b0000000-0000-4000-8000-000000000002' WHERE id='c0000000-0000-4000-8000-000000000001'$q$,'cannot move resource to B');
SELECT pg_temp.context(2,2);
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_logs),'B reads B');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_log WHERE company_id<>'b0000000-0000-4000-8000-000000000002'),'B cannot read A');
SELECT pg_temp.context(3);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs),'local admin without functional permission reads nothing');
SELECT pg_temp.context(6);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_log),'ordinary member without permission reads nothing');
SELECT pg_temp.context(4,2);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs),'multi membership does not grant B log permission');
RESET ROLE;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002','configuracoes:auditoria-sistema:view','ALLOW');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(4,2);
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_logs),'multi selects B with permission');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE company_id<>'b0000000-0000-4000-8000-000000000002'),'multi B excludes A');
SELECT set_config('request.headers','{"x-company-id":"invalid"}',true);
SELECT pg_temp.denied('SELECT * FROM audit_logs','invalid header denied');
SELECT pg_temp.context(1,2);
SELECT pg_temp.denied('SELECT * FROM audit_logs','forged B header denied');
RESET ROLE;
UPDATE company_memberships SET status='revoked' WHERE user_id='a0000000-0000-4000-8000-000000000004' AND company_id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(4,2);
SELECT pg_temp.denied('SELECT * FROM audit_logs','revoked membership denied');
RESET ROLE;
UPDATE company_memberships SET status='inactive' WHERE user_id='a0000000-0000-4000-8000-000000000004' AND company_id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT * FROM audit_logs','inactive membership denied');
RESET ROLE;
UPDATE company_memberships SET status='active' WHERE user_id='a0000000-0000-4000-8000-000000000004' AND company_id='b0000000-0000-4000-8000-000000000002';
UPDATE companies SET ativo=false WHERE id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT * FROM audit_logs','inactive company denied');
RESET ROLE;
UPDATE companies SET ativo=true WHERE id='b0000000-0000-4000-8000-000000000002';
-- Policies permissivas extras não removem fronteira nem permissão.
CREATE POLICY synthetic_open ON audit_logs FOR SELECT TO authenticated USING(true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(6);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs),'parallel permissive policy cannot undo permission');
SELECT pg_temp.context(1);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE company_id<>'b0000000-0000-4000-8000-000000000001'),'parallel permissive policy cannot undo scope');
RESET ROLE;
DROP POLICY synthetic_open ON audit_logs;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{}',true);
SELECT pg_temp.ok((backfill_log_scope('audit_logs')->>'dry_run')::boolean,'backfill defaults dry-run');
SELECT pg_temp.ok((SELECT count(*)=8 FROM audit_logs WHERE scope_reason='legacy_pending'),'dry-run preserves pending');
SELECT pg_temp.ok((backfill_log_scope('audit_logs',500,false)->>'tenant')::integer=1,'backfill only corroborated history');
SELECT pg_temp.ok((backfill_log_scope('audit_logs',500,false)->>'scanned')::integer=0,'backfill idempotent');
SELECT pg_temp.ok((backfill_log_scope('audit_log',500,false)->>'tenant')::integer=1,'legacy resource attribution');
SELECT pg_temp.ok((backfill_log_scope('integration_logs',500,false)->>'tenant')::integer=1,'integration historical attribution');
SELECT pg_temp.ok((SELECT count(*)=7 FROM audit_logs WHERE log_scope='AMBIGUOUS'),'ambiguous rows preserved');
SELECT pg_temp.ok((SELECT company_id='b0000000-0000-4000-8000-000000000002' FROM audit_logs WHERE action='ATTRIBUTED_CONFLICT'),'conflicting existing company preserved as evidence');
SELECT pg_temp.denied($q$SELECT backfill_log_scope('audit_logs',0,false)$q$,'batch limit','22023');
SELECT pg_temp.denied($q$SELECT backfill_log_scope('profiles',500,false)$q$,'table allowlist','22023');
SELECT pg_temp.denied($q$SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','inventario','EDGE_EVENT','inventarios',NULL)$q$,'service cannot invent resource');
SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','estoque','EDGE_EVENT','stock_categories','c0000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_logs WHERE action='EDGE_EVENT' AND log_scope='TENANT' AND actor_user_id='a0000000-0000-4000-8000-000000000001' AND source='edge_service'),'service validated event actor/company');
SELECT pg_temp.denied($q$SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','estoque','EDGE_EVENT','stock_categories','c0000000-0000-4000-8000-000000000001')$q$,'service actor must belong to resource company');
SELECT pg_temp.denied($q$SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','estoque','EDGE_EVENT','stock_categories','c0000000-0000-4000-8000-000000000002')$q$,'service cross-resource rejected');
SELECT pg_temp.denied($q$SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','system','JOB_RUN','stock_categories','c0000000-0000-4000-8000-000000000001')$q$,'service tenant API cannot produce global','22023');
SELECT pg_temp.ok(public.cleanup_old_audit_logs()=0,'authorized cleanup records global job');
SELECT pg_temp.ok(jsonb_array_length(public.refresh_materialized_views())=4,'authorized refresh compatible');
INSERT INTO audit_logs(source,module,entity,action) VALUES('edge_function','system','scheduled-jobs','JOB_RUN');
SELECT pg_temp.ok((SELECT count(*)>=3 FROM audit_logs WHERE log_scope='GLOBAL' AND company_id IS NULL AND actor_user_id IS NULL),'service global logs explicitly classified');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE log_scope<>'TENANT'),'tenant excludes global and ambiguous after backfill');
SELECT pg_temp.ok((_guarded_list_fin_audit_logs()->'items') @> '[{"acao":"LEGACY"}]'::jsonb,'finance reader sees correlated historical row');
SELECT pg_temp.ok(NOT (_guarded_list_fin_audit_logs()->'items') @> '[{"acao":"ATTRIBUTED_CONFLICT"}]'::jsonb,'finance definer excludes ambiguous rows');
SELECT pg_temp.denied($q$SELECT _planning_upsert_meta_guarded(2026,9,'Fixture',100)$q$,'known baseline planning ON CONFLICT mismatch (before logging)','42P10');
RESET ROLE;
INSERT INTO planning_metas_compra(id,company_id,year,month,categoria,target_value) VALUES('f0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',2026,9,'Fixture',100);
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied($q$SELECT _planning_delete_meta_guarded('f0000000-0000-4000-8000-000000000001')$q$,'known baseline planning missing deleted_at (before logging)','42703');
RESET ROLE;
SELECT audit_log_write('planning','internal_planning_probe','planning_metas_compra','f0000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_logs WHERE action='internal_planning_probe' AND log_scope='TENANT' AND actor_user_id='a0000000-0000-4000-8000-000000000001'),'planning internal logging contract preserved');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(5);
SELECT pg_temp.ok((SELECT count(*)>=3 FROM list_restricted_logs('audit_logs','GLOBAL')),'global reader legitimate');
SELECT pg_temp.ok((SELECT count(*)=7 FROM list_restricted_logs('audit_logs','AMBIGUOUS')),'global reader can inspect ambiguous without reassignment');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE log_scope<>'TENANT'),'global identity still tenant-scoped on direct SELECT');
SELECT pg_temp.denied($q$SELECT * FROM list_restricted_logs('profiles')$q$,'global reader allowlist','22023');
SELECT public.update_company('b0000000-0000-4000-8000-000000000002','Fixture renamed');
SELECT pg_temp.ok((SELECT count(*)>=1 FROM list_restricted_logs('audit_logs','GLOBAL',100) l WHERE l->>'action'='COMPANY_UPDATED'),'company administration stays global');
SELECT pg_temp.ok((create_purchase_order_atomic('{"title":"Fixture order","type":"FORNECEDOR","items":[]}',gen_random_uuid())->>'status')='created','purchase order RPC with server audit');
SELECT pg_temp.ok((SELECT count(*)>=1 FROM audit_log WHERE acao='CRIACAO' AND user_id=auth.uid()),'purchase audit derives actor');
INSERT INTO inventarios(id,company_id,tipo,status,responsavel_user_id) VALUES('f0000000-0000-4000-8000-000000000010','b0000000-0000-4000-8000-000000000001','parcial','EM_CONTAGEM','a0000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((finalize_inventory_atomic('f0000000-0000-4000-8000-000000000010','Ensaio de auditoria Fase 3')->>'success')::boolean,'inventory finalization compatible');
SELECT pg_temp.ok((SELECT count(*)>=1 FROM audit_log WHERE registro_id='f0000000-0000-4000-8000-000000000010' AND acao='INVENTARIO_FINALIZADO' AND user_id=auth.uid()),'inventory finalization audit in same transaction');
SELECT pg_temp.ok((finalize_inventory_atomic('f0000000-0000-4000-8000-000000000010','Ensaio de auditoria Fase 3')->>'already_finalized')::boolean,'inventory idempotence preserved');
-- Financeiro: pagamento real em fixture, espelho e logs na mesma transação.
INSERT INTO fin_categorias(id,company_id,nome,codigo,tipo) VALUES('f0000000-0000-4000-8000-000000000030','b0000000-0000-4000-8000-000000000001','Fixture despesas','999','DESPESA');
INSERT INTO fin_contas_pagar(id,company_id,descricao,valor,status,conta_id,data_vencimento,categoria_id) VALUES('f0000000-0000-4000-8000-000000000020','b0000000-0000-4000-8000-000000000001','Fixture payment',100,'APROVADO','d0000000-0000-4000-8000-000000000001',current_date,'f0000000-0000-4000-8000-000000000030');
SELECT pg_temp.ok((public.pay_conta_pagar(id,updated_at::text)->>'status')='PAGO','financial payment with audit') FROM fin_contas_pagar WHERE id='f0000000-0000-4000-8000-000000000020';
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_logs WHERE entity_id='f0000000-0000-4000-8000-000000000020' AND action='PAY' AND log_scope='TENANT' AND actor_user_id=auth.uid()),'financial internal RPC log attributed');
RESET ROLE;
SELECT pg_temp.context(1);
SELECT public.log_integration_error('salmon_to_stock','PROBE','e0000000-0000-4000-8000-000000000001','Fixture error');
SELECT pg_temp.ok((SELECT count(*)=1 FROM integration_logs WHERE action='PROBE' AND company_id='b0000000-0000-4000-8000-000000000001' AND actor_user_id='a0000000-0000-4000-8000-000000000001'),'internal integration error resource/actor');
SELECT pg_temp.denied($q$SELECT public.log_integration_error('salmon_to_stock','PROBE','invalid','Fixture')$q$,'integration missing resource is not global','23514');
-- ACL defense: PostgreSQL role, not the JSON claim, authorizes service entrypoints.
GRANT EXECUTE ON FUNCTION public.service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb),public.backfill_log_scope(text,integer,boolean) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"service_role"}',true);
SELECT pg_temp.denied($q$SELECT service_write_audit('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','estoque','FAKE','stock_categories','c0000000-0000-4000-8000-000000000001')$q$,'forged service claim rejected despite accidental grant');
SELECT pg_temp.denied($q$SELECT backfill_log_scope('audit_logs')$q$,'forged service claim cannot backfill');
RESET ROLE;
REVOKE EXECUTE ON FUNCTION public.service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb),public.backfill_log_scope(text,integer,boolean) FROM authenticated;
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM original_logs o JOIN audit_logs l USING(id) WHERE o.digest<>md5((to_jsonb(l)-ARRAY['company_id','log_scope','scope_reason'])::text)),'historical payloads byte-equivalent after classification');
SELECT count(*) AS passed_assertions FROM phase3_results;
ROLLBACK;
