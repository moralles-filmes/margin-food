\set ON_ERROR_STOP on
-- PostgreSQL real isolado com schema ATUAL + migration da Fase 2. Nunca produção.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT LIKE 'moralles_phase2_test%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
  RAISE EXCEPTION 'PHASE2_TEST_REQUIRES_LOCAL_DISPOSABLE_DATABASE';
 END IF;
END $$;
CREATE TEMP TABLE phase2_results(label text);
GRANT SELECT,INSERT ON phase2_results TO anon,authenticated,service_role;
CREATE FUNCTION pg_temp.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF;
 INSERT INTO phase2_results VALUES(label);
END $$;
CREATE FUNCTION pg_temp.denied(statement text,label text,expected_state text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE=expected_state AND (expected_state<>'P0001' OR SQLERRM LIKE '403:%') THEN
   INSERT INTO phase2_results VALUES(label); RETURN;
  END IF;
  RAISE;
 END;
 RAISE EXCEPTION 'TEST FAILED (expected %): %',expected_state,label;
END $$;
CREATE FUNCTION pg_temp.context(actor integer,unit integer DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',format('a0000000-0000-4000-8000-%s',lpad(actor::text,12,'0')),'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-company-id',format('b0000000-0000-4000-8000-%s',lpad(unit::text,12,'0')))::text,true);
END $$;

INSERT INTO companies(id,nome) VALUES
 ('b0000000-0000-4000-8000-000000000001','Fase2 A'),
 ('b0000000-0000-4000-8000-000000000002','Fase2 B'),
 ('b0000000-0000-4000-8000-000000000003','Fase2 C'),
 ('00000000-0000-0000-0000-000000000001','Placeholder');
INSERT INTO auth.users(id,email)
 SELECT format('a0000000-0000-4000-8000-%s',lpad(i::text,12,'0'))::uuid,format('phase2-%s@example.test',i) FROM generate_series(1,4) i;
INSERT INTO profiles(id,nome,email,company_id)
 SELECT id,'Fixture',email,'b0000000-0000-4000-8000-000000000001' FROM auth.users;
INSERT INTO company_memberships(user_id,company_id)
 SELECT id,'b0000000-0000-4000-8000-000000000001' FROM auth.users;
INSERT INTO company_memberships(user_id,company_id) VALUES
 ('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000002');
INSERT INTO permissions(key,description,module,submodule,action) VALUES
 ('system:admin','Legacy admin','system','global','manage'),
 ('system:global:manage','Platform management','system','global','manage');
INSERT INTO role_permissions(role,permission_key) VALUES('admin','system:admin');
INSERT INTO user_roles(user_id,company_id,role) VALUES
 ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','admin');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES
 ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','system:global:manage','DENY'),
 ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001','system:global:manage','ALLOW');

SET LOCAL ROLE anon;
SELECT pg_temp.denied('SELECT public.cleanup_old_audit_logs()','anon cleanup');
SELECT pg_temp.denied('SELECT public.refresh_materialized_views()','anon refresh');
SELECT pg_temp.denied($q$SELECT public.rpc_create_company('Denied')$q$,'anon create');
SELECT pg_temp.denied('SELECT * FROM public.companies','anon companies');
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$ DECLARE actor integer; n integer; BEGIN
 FOR actor IN 1..4 LOOP
  PERFORM pg_temp.context(actor);
  PERFORM pg_temp.denied('SELECT public.cleanup_old_audit_logs()',format('actor %s cleanup denied',actor));
  PERFORM pg_temp.denied('SELECT public.refresh_materialized_views()',format('actor %s refresh denied',actor));
  PERFORM pg_temp.denied('TRUNCATE public.companies CASCADE',format('actor %s truncate denied',actor));
  IF actor<>4 THEN
   PERFORM pg_temp.ok((SELECT count(*)=1 FROM companies),format('actor %s sees A only',actor));
   PERFORM pg_temp.denied($q$INSERT INTO companies(nome) VALUES('Denied')$q$,format('actor %s direct create',actor));
   PERFORM pg_temp.denied($q$SELECT rpc_create_company('Denied')$q$,format('actor %s RPC create',actor));
   PERFORM pg_temp.denied($q$SELECT onboard_new_company('Denied')$q$,format('actor %s onboarding',actor),'P0001');
   PERFORM pg_temp.denied('SELECT list_companies()',format('actor %s global list',actor),'P0001');
   PERFORM pg_temp.denied($q$SELECT update_company('b0000000-0000-4000-8000-000000000002','Denied')$q$,format('actor %s global update',actor),'P0001');
   UPDATE companies SET ativo=false WHERE id='b0000000-0000-4000-8000-000000000002'; GET DIAGNOSTICS n=ROW_COUNT;
   PERFORM pg_temp.ok(n=0,format('actor %s cannot update B',actor));
   DELETE FROM companies WHERE id='b0000000-0000-4000-8000-000000000002'; GET DIAGNOSTICS n=ROW_COUNT;
   PERFORM pg_temp.ok(n=0,format('actor %s cannot delete B',actor));
   UPDATE companies SET nome='Denied' WHERE id='b0000000-0000-4000-8000-000000000001'; GET DIAGNOSTICS n=ROW_COUNT;
   PERFORM pg_temp.ok(n=0,format('actor %s cannot administer A globally',actor));
  END IF;
 END LOOP;
END $$;
SELECT pg_temp.context(2);
SELECT pg_temp.ok(has_permission(auth.uid(),'system:admin') AND NOT has_permission(auth.uid(),'system:global:manage'),'legacy admin never expands to global');
SELECT pg_temp.ok((SELECT count(*)=1 FROM list_my_companies()),'admin A discovery');
SELECT pg_temp.context(2,2);
SELECT pg_temp.denied('SELECT * FROM companies','admin forged B header');
SELECT pg_temp.context(3);
SELECT pg_temp.ok((SELECT count(*)=2 FROM list_my_companies()),'multi discovers A/B');
SELECT pg_temp.context(3,2);
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(nome='Fase2 B') FROM companies),'multi reads selected B');
SELECT pg_temp.context(3,3);
SELECT pg_temp.denied('SELECT * FROM companies','multi cannot select C');
SELECT pg_temp.context(4);
SELECT pg_temp.ok(NOT has_permission(auth.uid(),'system:admin') AND has_permission(auth.uid(),'system:global:manage'),'explicit global without legacy');
SELECT pg_temp.ok((SELECT count(*)=3 FROM companies),'super admin global discovery excludes placeholder');
SELECT pg_temp.ok(jsonb_array_length(list_companies())=3,'global list RPC');
SELECT pg_temp.ok((update_company('b0000000-0000-4000-8000-000000000002','Updated B')->>'success')::boolean,'global update RPC');
UPDATE companies SET nome='Fase2 B' WHERE id='b0000000-0000-4000-8000-000000000002';
SELECT pg_temp.ok((SELECT nome='Fase2 B' FROM companies WHERE id='b0000000-0000-4000-8000-000000000002'),'global direct update');
SELECT pg_temp.ok((rpc_create_company('Created by global')->>'id') IS NOT NULL,'global legacy RPC create and audit');
SELECT pg_temp.ok((onboard_new_company('Onboarded by global')->>'success')::boolean,'global onboarding with category and role seeds');
-- Super admin não ganha acesso implícito: criar a empresa não o vincula a ela, e o
-- atalho rpc_set_user_company (vínculo entre unidades) foi removido (20261006200000).
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM company_memberships m JOIN companies c ON c.id=m.company_id
  WHERE c.nome='Onboarded by global' AND m.user_id=auth.uid()),'onboarding does not grant the creator access');
SELECT pg_temp.ok(to_regprocedure('public.rpc_set_user_company(uuid,uuid)') IS NULL,'global membership shortcut removed');
DO $$ DECLARE v_id uuid; n integer; BEGIN
 INSERT INTO companies(nome) VALUES('Direct global') RETURNING id INTO v_id;
 PERFORM pg_temp.ok(v_id IS NOT NULL,'global direct insert');
 -- A policy autoriza o global; a FK das categorias continua impedindo apagar empresa com dependências.
 PERFORM pg_temp.denied(format('DELETE FROM companies WHERE id=%L',v_id),'global delete preserves category FK','23503');
 DELETE FROM companies WHERE id='00000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.ok(n=0,'global cannot delete placeholder');
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT company_id='b0000000-0000-4000-8000-000000000001' FROM profiles WHERE id='a0000000-0000-4000-8000-000000000001'),'membership does not move original profile');
UPDATE company_memberships SET status='revoked' WHERE user_id='a0000000-0000-4000-8000-000000000003' AND company_id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(3,2);
SELECT pg_temp.ok((SELECT count(*)=1 FROM list_my_companies()),'revocation removes B discovery');
SELECT pg_temp.denied('SELECT * FROM companies','revoked B denied');
RESET ROLE;
UPDATE companies SET ativo=false WHERE id='b0000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.context(1,2);
SELECT pg_temp.ok((SELECT count(*)=1 FROM list_my_companies()),'inactive company removed');
SELECT pg_temp.denied('SELECT * FROM companies','inactive B denied');
RESET ROLE;

-- Mesmo diante de concessão acidental, claims forjadas não satisfazem o guard da conexão.
GRANT EXECUTE ON FUNCTION cleanup_old_audit_logs(integer),refresh_materialized_views() TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs()','forged service claim cannot cleanup');
SELECT pg_temp.denied('SELECT refresh_materialized_views()','forged service claim cannot refresh');
RESET ROLE;
REVOKE EXECUTE ON FUNCTION cleanup_old_audit_logs(integer),refresh_materialized_views() FROM authenticated;

INSERT INTO audit_logs(source,module,entity,action,company_id,created_at) VALUES
 ('db','phase2','fixture','OLD','b0000000-0000-4000-8000-000000000001',now()-interval '25 months'),
 ('db','phase2','fixture','OLD','b0000000-0000-4000-8000-000000000002',now()-interval '25 months'),
 ('db','phase2','fixture','RECENT','b0000000-0000-4000-8000-000000000001',now()-interval '23 months');
INSERT INTO dashboard_cache(key,payload,expires_at) VALUES('phase2-expired','{}',now()-interval '1 day'),('phase2-active','{}',now()+interval '1 day');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(NULL)','retention null','22023');
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(-1)','retention negative','22023');
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(0)','retention zero','22023');
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(23)','retention below minimum','22023');
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(121)','retention above maximum','22023');
SELECT pg_temp.denied('SELECT cleanup_old_audit_logs(2147483647)','retention overflow','22023');
SELECT pg_temp.ok(cleanup_old_audit_logs(120)=0,'maximum retention accepted');
SELECT pg_temp.ok(cleanup_old_audit_logs()=2,'scheduler default removes two old fixture logs');
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_logs WHERE module='phase2'),'recent log preserved');
SELECT pg_temp.ok(jsonb_array_length(refresh_materialized_views())=4,'service refreshes all four existing reporting views');
SELECT pg_temp.ok((SELECT count(*)=1 FROM dashboard_cache WHERE key LIKE 'phase2-%'),'refresh expires only old cache');
SELECT pg_temp.ok((SELECT count(*)=1 FROM audit_logs WHERE entity='materialized_views' AND action='JOB_RUN'),'refresh completion audit');
RESET ROLE;
SELECT count(*) AS assertions_passed FROM phase2_results;
SELECT label FROM phase2_results ORDER BY label;
ROLLBACK;
SELECT count(*)=0 AS fixtures_rolled_back FROM public.companies WHERE nome LIKE 'Fase2 %';
