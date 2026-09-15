\set ON_ERROR_STOP on
-- Fixtures próprias e reversíveis; PostgreSQL real, sem mocks de RPC/banco.
BEGIN;
DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase4_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;
CREATE TEMP TABLE results(label text);
CREATE TEMP TABLE resources(name text PRIMARY KEY, value jsonb);
GRANT SELECT,INSERT,UPDATE ON results,resources TO anon,authenticated,service_role;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF;
 INSERT INTO results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text,expected_state text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected_state THEN INSERT INTO results VALUES(label); RETURN; END IF; RAISE;
 END; RAISE EXCEPTION 'TEST FAILED (expected denial): %',label;
END $$;
CREATE FUNCTION pg_temp.context(actor integer,unit integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',format('a4000000-0000-4000-8000-%s',lpad(actor::text,12,'0')),'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-company-id',format('b4000000-0000-4000-8000-%s',lpad(unit::text,12,'0')))::text,true);
END $$;
CREATE FUNCTION pg_temp.entry(label text DEFAULT 'Fixture') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public._salmon_create_entry_guarded('2026-09-15',label,'SIF fixture','Fornecedor fixture',1,2,10,100,'Notes','2026-09-20');
$$;
CREATE FUNCTION pg_temp.manip(entry_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public._salmon_create_manipulation_guarded(entry_id,'2026-09-15',1,4,3,0,'Fixture');
$$;
CREATE FUNCTION pg_temp.digest() RETURNS text LANGUAGE sql AS $$
 SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.salmon_entries e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.salmon_manipulations e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.produtos e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.movimentacoes_estoque e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.audit_logs e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.suppliers e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.supplier_item_prices e),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY company_id,prefix) FROM public.stock_sku_counter e)
 )::text);
$$;
INSERT INTO companies(id,nome) VALUES('b4000000-0000-4000-8000-000000000001','Phase4 A'),('b4000000-0000-4000-8000-000000000002','Phase4 B'),('00000000-0000-0000-0000-000000000001','Placeholder');
INSERT INTO auth.users(id,email) SELECT format('a4000000-0000-4000-8000-%s',lpad(i::text,12,'0'))::uuid,format('phase4-%s@example.test',i) FROM generate_series(1,7)i;
INSERT INTO profiles(id,nome,email,company_id) SELECT id,'Fixture',email,CASE WHEN id='a4000000-0000-4000-8000-000000000002' THEN 'b4000000-0000-4000-8000-000000000002' ELSE 'b4000000-0000-4000-8000-000000000001' END::uuid FROM auth.users;
INSERT INTO company_memberships(user_id,company_id) SELECT id,company_id FROM profiles;
INSERT INTO company_memberships(user_id,company_id) VALUES('a4000000-0000-4000-8000-000000000004','b4000000-0000-4000-8000-000000000002');
INSERT INTO permissions(key,description,module,submodule,action) SELECT key,'Fixture',split_part(key,':',1),split_part(key,':',2),split_part(key,':',3) FROM unnest(ARRAY[
 'salmon:entradas:create','salmon:entradas:delete','salmon:entradas:view','salmon:manipulacao:create','salmon:manipulacao:delete','salmon:dashboard:view','salmon:estoque:view','system:global:manage','system:admin','salmon:write','salmon:delete','salmon:entries:create','salmon:entries:delete','salmon:manipulation:create','salmon:read','stock:read','configuracoes:auditoria-sistema:view'
])key ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT id,company_id,key,'ALLOW' FROM profiles CROSS JOIN unnest(ARRAY['salmon:entradas:create','salmon:entradas:delete','salmon:entradas:view','salmon:manipulacao:create','salmon:manipulacao:delete','salmon:dashboard:view','salmon:estoque:view','configuracoes:auditoria-sistema:view'])key WHERE id IN ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000004');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 SELECT 'a4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',key,'DENY' FROM unnest(ARRAY['salmon:write','salmon:delete','salmon:entries:create','salmon:entries:delete','salmon:manipulation:create','salmon:read','stock:read'])key;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES
 ('a4000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000001','system:admin','ALLOW'),
 ('a4000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000001','system:global:manage','DENY'),
 ('a4000000-0000-4000-8000-000000000005','b4000000-0000-4000-8000-000000000001','system:global:manage','ALLOW'),
 ('a4000000-0000-4000-8000-000000000007','b4000000-0000-4000-8000-000000000001','salmon:dashboard:view','ALLOW');
-- Effective ACLs include PUBLIC and inherited rights.
DO $$ DECLARE f record; role_name text; BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%salmon%' LOOP
  PERFORM pg_temp.ok(NOT has_function_privilege('anon',f.oid,'EXECUTE'),'anon ACL '||f.proname);
  PERFORM pg_temp.ok(NOT has_function_privilege('service_role',f.oid,'EXECUTE'),'service ACL '||f.proname);
  IF f.proname ~ '^(create_salmon_|cancel_salmon_|ensure_salmon_|validate_salmon_|get_salmon_dashboard_summary)' THEN
   PERFORM pg_temp.ok(NOT has_function_privilege('authenticated',f.oid,'EXECUTE'),'internal ACL '||f.proname);
  ELSE PERFORM pg_temp.ok(has_function_privilege('authenticated',f.oid,'EXECUTE'),'public ACL '||f.proname); END IF;
 END LOOP;
END $$;
INSERT INTO resources VALUES('before-denials',to_jsonb(pg_temp.digest()));
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.denied('SELECT pg_temp.entry()','anon wrapper');
SELECT pg_temp.denied('SELECT public.ensure_salmon_raw_product()','anon helper');
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE actor integer; statement text; BEGIN
 FOR actor IN 1..7 LOOP
  PERFORM pg_temp.context(actor,CASE WHEN actor=2 THEN 2 ELSE 1 END);
  FOREACH statement IN ARRAY ARRAY[
   $q$SELECT public.create_salmon_entry_atomic(CURRENT_DATE,'x','','',1,1,10,100)$q$,
   $q$SELECT public.cancel_salmon_entry_atomic(gen_random_uuid())$q$,
   $q$SELECT public.create_salmon_manipulation_atomic(gen_random_uuid(),CURRENT_DATE,1,4,3)$q$,
   $q$SELECT public.cancel_salmon_manipulation_atomic(gen_random_uuid())$q$,
   $q$SELECT public.ensure_salmon_raw_product()$q$,
   $q$SELECT public.log_audit('db','salmon','salmon_entries',NULL::uuid,'FORGED',NULL,NULL,'{"company_id":"b4000000-0000-4000-8000-000000000002"}')$q$,
   $q$SELECT public.log_integration_error('salmon_to_stock','FORGED','x','error')$q$
  ] LOOP PERFORM pg_temp.denied(statement,'direct actor '||actor||' '||statement); END LOOP;
 END LOOP;
END $$;
SELECT pg_temp.context(6);
SELECT set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000006","role":"service_role"}',true);
SELECT pg_temp.denied('SELECT public.ensure_salmon_raw_product()','forged service claim cannot invoke helper');
SELECT pg_temp.denied('SELECT pg_temp.entry()','forged service claim cannot bypass functional gate');
SELECT pg_temp.context(6);
SELECT pg_temp.denied('SELECT pg_temp.entry()','member without permission create');
SELECT pg_temp.denied('SELECT pg_temp.manip(gen_random_uuid())','member without permission manipulation');
SELECT pg_temp.denied('SELECT _salmon_cancel_entry_guarded(gen_random_uuid())','member without permission cancel entry');
SELECT pg_temp.denied('SELECT _salmon_cancel_manipulation_guarded(gen_random_uuid())','member without permission cancel manipulation');
SELECT pg_temp.context(3);
SELECT pg_temp.denied('SELECT pg_temp.entry()','local admin cannot bypass functional permission');
SELECT pg_temp.context(7);
SELECT pg_temp.ok((upsert_salmon_leftover_atomic(CURRENT_DATE,1)->>'success')::boolean=false,'view permission cannot write leftover');
SELECT pg_temp.context(1,2);
SELECT pg_temp.denied('SELECT pg_temp.entry()','forged header B');
SELECT set_config('request.headers','{"x-company-id":"invalid"}',true);
SELECT pg_temp.denied('SELECT pg_temp.entry()','malformed header');
SELECT set_config('request.headers','{"x-company-id":"00000000-0000-0000-0000-000000000001"}',true);
SELECT pg_temp.denied('SELECT pg_temp.entry()','placeholder header');
SELECT pg_temp.context(4,2);
SELECT pg_temp.denied('SELECT pg_temp.entry()','multi B lacks functional grant');
RESET ROLE;
UPDATE company_memberships SET status='revoked' WHERE user_id='a4000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied('SELECT pg_temp.entry()','revoked membership');
RESET ROLE;
UPDATE company_memberships SET status='inactive' WHERE user_id='a4000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT pg_temp.entry()','inactive membership');
RESET ROLE;
UPDATE company_memberships SET status='active' WHERE user_id='a4000000-0000-4000-8000-000000000001';
UPDATE companies SET ativo=false WHERE id='b4000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('SELECT pg_temp.entry()','inactive company');
RESET ROLE;
UPDATE companies SET ativo=true WHERE id='b4000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.denied('SELECT public.ensure_salmon_raw_product()','real service has no internal caller');
SELECT pg_temp.denied('SELECT pg_temp.entry()','real service cannot impersonate wrapper');
RESET ROLE;
SELECT pg_temp.ok((SELECT value=to_jsonb(pg_temp.digest()) FROM resources WHERE name='before-denials'),'all refusals leave operations/products/logs unchanged');
-- Ordinary successful path requires no catalog/stock permission or legacy ALLOW.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
INSERT INTO resources VALUES('entryA',pg_temp.entry());
INSERT INTO resources VALUES('manipA',pg_temp.manip((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryA')));
SELECT pg_temp.ok((upsert_salmon_leftover_atomic('2026-09-15',1)->>'success')::boolean,'leftover with create permission');
SELECT pg_temp.ok((upsert_salmon_leftover_atomic('2026-09-15',1)->>'success')::boolean,'leftover repeated upsert');
SELECT pg_temp.context(2,2);
INSERT INTO resources VALUES('entryB',pg_temp.entry('B'));
SELECT pg_temp.context(1);
SELECT pg_temp.denied($q$SELECT pg_temp.manip((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryB'))$q$,'B entry in A manipulation','P0001');
SELECT pg_temp.denied($q$SELECT _salmon_cancel_entry_guarded((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryB'))$q$,'B entry in A cancellation','P0001');
SELECT pg_temp.denied($q$SELECT _salmon_cancel_entry_guarded((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryA'))$q$,'active manipulation blocks parent cancellation','P0001');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=2 FROM produtos WHERE is_salmon_raw_linked),'one linked product per tenant');
SELECT pg_temp.ok((SELECT saldo_atual=6 FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000001'),'A cached balance 10 - 4 = 6');
SELECT pg_temp.ok((SELECT saldo_atual=10 FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000002'),'B cached balance 10');
SELECT pg_temp.ok((SELECT count(*)=3 FROM movimentacoes_estoque WHERE status='ATIVO'),'exactly three mirrors');
SELECT pg_temp.ok((SELECT count(*)=0 FROM movimentacoes_estoque m JOIN produtos p ON p.id=m.produto_id WHERE p.company_id<>m.company_id),'mirror product ownership');
SELECT pg_temp.ok((SELECT expiration_date='2026-09-20' FROM salmon_entries WHERE id=(SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryA')),'expiration preserved');
SELECT pg_temp.ok((SELECT count(*)=2 FROM suppliers WHERE name='Fornecedor fixture'),'same supplier name already scoped per company');
SELECT pg_temp.ok((SELECT count(*)=0 FROM supplier_item_prices s JOIN produtos p ON p.id=s.stock_item_id JOIN suppliers f ON f.id=s.supplier_uuid WHERE s.company_id<>p.company_id OR s.company_id<>f.company_id),'supplier price links stay within tenant');
SELECT pg_temp.ok((SELECT count(*)>0 FROM audit_logs WHERE source='rpc' AND action='CREATE_ATOMIC' AND log_scope='TENANT' AND company_id='b4000000-0000-4000-8000-000000000001' AND actor_user_id='a4000000-0000-4000-8000-000000000001'),'trusted audit actor and tenant');
SELECT pg_temp.ok((SELECT count(*)=1 FROM salmon_daily_records WHERE record_date='2026-09-15' AND company_id='b4000000-0000-4000-8000-000000000001'),'leftover upsert idempotent');
-- Corrupted legacy mirror pointing to B must fail atomically, never touch B.
UPDATE movimentacoes_estoque SET produto_id=(SELECT id FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000002') WHERE id=(SELECT (value->>'movement_id')::uuid FROM resources WHERE name='manipA');
INSERT INTO resources VALUES('before-cross-product',to_jsonb(pg_temp.digest()));
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied($q$SELECT _salmon_cancel_manipulation_guarded((SELECT (value->>'manipulation_id')::uuid FROM resources WHERE name='manipA'))$q$,'cross-tenant product rejected');
RESET ROLE;
SELECT pg_temp.ok((SELECT value=to_jsonb(pg_temp.digest()) FROM resources WHERE name='before-cross-product'),'invalid product cancellation leaves all data unchanged');
UPDATE movimentacoes_estoque SET produto_id=(SELECT id FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000001') WHERE id=(SELECT (value->>'movement_id')::uuid FROM resources WHERE name='manipA');
-- Failure after entry/product writes must roll back the entire statement.
CREATE FUNCTION pg_temp.fail_mirror() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_MIRROR_FAILURE'; END $$;
CREATE TRIGGER zz_phase4_failure BEFORE INSERT ON movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_mirror();
INSERT INTO resources VALUES('before-failure',to_jsonb(pg_temp.digest()));
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT pg_temp.denied('SELECT pg_temp.entry()','intermediate failure','P0001');
SELECT pg_temp.denied($q$SELECT _salmon_cancel_manipulation_guarded((SELECT (value->>'manipulation_id')::uuid FROM resources WHERE name='manipA'))$q$,'intermediate reversal failure','P0001');
RESET ROLE;
SELECT pg_temp.ok((SELECT value=to_jsonb(pg_temp.digest()) FROM resources WHERE name='before-failure'),'entry failure atomic including SKU, logs and supplier');
DROP TRIGGER zz_phase4_failure ON movimentacoes_estoque;
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT _salmon_cancel_manipulation_guarded((SELECT (value->>'manipulation_id')::uuid FROM resources WHERE name='manipA'),'Fixture cancel');
SELECT pg_temp.denied($q$SELECT _salmon_cancel_manipulation_guarded((SELECT (value->>'manipulation_id')::uuid FROM resources WHERE name='manipA'))$q$,'repeat cancel manipulation has existing already-cancelled contract','P0001');
RESET ROLE;
SELECT pg_temp.ok((SELECT saldo_atual=10 FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000001'),'cancel manipulation restores cached 10');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1);
SELECT _salmon_cancel_entry_guarded((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryA'),'Fixture cancel');
SELECT pg_temp.denied($q$SELECT _salmon_cancel_entry_guarded((SELECT (value->>'entry_id')::uuid FROM resources WHERE name='entryA'))$q$,'repeat cancel entry already-cancelled contract','P0001');
RESET ROLE;
SELECT pg_temp.ok((SELECT saldo_atual=0 FROM produtos WHERE is_salmon_raw_linked AND company_id='b4000000-0000-4000-8000-000000000001'),'full cycle cached balance zero');
SELECT pg_temp.ok((SELECT count(*)=2 FROM movimentacoes_estoque WHERE estorno_de_id IS NOT NULL),'only one reversal per original');
SELECT pg_temp.ok((SELECT count(*)=2 FROM movimentacoes_estoque WHERE status='CANCELADO'),'both original mirrors cancelled');
SELECT pg_temp.ok((SELECT count(*)=0 FROM audit_logs WHERE source='rpc' AND company_id IS NULL),'RPC audit never unscoped');
-- Successful super and multitenant paths use the selected membership.
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(5);
INSERT INTO resources VALUES('super',pg_temp.entry('Super'));
SELECT pg_temp.context(4);
INSERT INTO resources VALUES('multiA',pg_temp.entry('Multi A'));
RESET ROLE;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('a4000000-0000-4000-8000-000000000004','b4000000-0000-4000-8000-000000000002','salmon:entradas:create','ALLOW');
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(4,2);
INSERT INTO resources VALUES('multiB',pg_temp.entry('Multi B'));
RESET ROLE;
SELECT pg_temp.ok((SELECT company_id='b4000000-0000-4000-8000-000000000002' FROM salmon_entries WHERE id=(SELECT (value->>'entry_id')::uuid FROM resources WHERE name='multiB')),'multi B entry scoped');
SELECT pg_temp.ok((SELECT company_id='b4000000-0000-4000-8000-000000000001' FROM profiles WHERE id='a4000000-0000-4000-8000-000000000004'),'identity origin unchanged');
SELECT count(*) AS passed_assertions FROM results;
ROLLBACK;
