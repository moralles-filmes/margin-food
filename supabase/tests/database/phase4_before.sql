\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase4_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('b4000000-0000-4000-8000-000000000001','Before fixture');
INSERT INTO auth.users(id,email) VALUES('a4000000-0000-4000-8000-000000000001','before@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('a4000000-0000-4000-8000-000000000001','Before','before@example.test','b4000000-0000-4000-8000-000000000001');
INSERT INTO company_memberships(user_id,company_id) VALUES('a4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001');
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM create_salmon_entry_atomic(CURRENT_DATE,'Before','','',1,1,10,100); RAISE EXCEPTION 'Unexpected anonymous success';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS before: anon has ACL but tenant rejects'; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a4000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"b4000000-0000-4000-8000-000000000001"}',true);
DO $$ DECLARE e jsonb; m jsonb; BEGIN
 IF has_permission(auth.uid(),'salmon:entradas:create') THEN RAISE EXCEPTION 'Invalid fixture: has permission'; END IF;
 PERFORM ensure_salmon_raw_product();
 e:=create_salmon_entry_atomic(CURRENT_DATE,'Before','','',1,1,10,100);
 m:=create_salmon_manipulation_atomic((e->>'entry_id')::uuid,CURRENT_DATE,1,4,3);
 PERFORM cancel_salmon_manipulation_atomic((m->>'manipulation_id')::uuid);
 PERFORM cancel_salmon_entry_atomic((e->>'entry_id')::uuid);
 RAISE NOTICE 'PASS before: member without functional permission executes helper and all four atomics';
END $$;
ROLLBACK;
