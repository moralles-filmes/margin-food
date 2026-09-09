\set ON_ERROR_STOP on
-- Run against the disposable PostgreSQL database restored from the real schema
-- with multiunit seed + migrations. All data changes below are rolled back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF; END; $$;
CREATE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'TEST FAILED (expected 42501): %',label;
END; $$;

SELECT pg_temp.assert_true((SELECT count(*)=2 FROM company_memberships),'backfill count');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM auth.users),'identities retained');
INSERT INTO permissions(key,description,module,submodule,action) VALUES('finance:manage','Legacy finance','finance','global','manage');
INSERT INTO role_permissions(role,permission_key) VALUES('admin','finance:manage');
INSERT INTO notifications(recipient_user_id,title,company_id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Mensagem A','11111111-1111-4111-8111-111111111111'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Mensagem B','22222222-2222-4222-8222-222222222222');
INSERT INTO rh_colaboradores(id,nome,company_id) VALUES
 ('11111111-bbbb-4111-8111-111111111111','Pessoa A','11111111-1111-4111-8111-111111111111'),
 ('22222222-bbbb-4222-8222-222222222222','Pessoa B','22222222-2222-4222-8222-222222222222');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-client-info":"multiunit-test"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM list_my_companies()),'single company preserved');
SELECT pg_temp.assert_true(get_current_company_id()='11111111-1111-4111-8111-111111111111','legacy default');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fin_contas),'single-company SELECT');
SELECT pg_temp.assert_true(NOT has_permission(auth.uid(),'financeiro:relatorio-socios:export'),'legacy DENY preserved');
SELECT pg_temp.denied($q$SELECT admin_upsert_company_membership(auth.uid(),'22222222-2222-4222-8222-222222222222',auth.uid())$q$,'membership writes require service');
SELECT pg_temp.denied($q$UPDATE profiles SET company_id='33333333-3333-4333-8333-333333333333' WHERE id=auth.uid()$q$,'profile cannot select tenant');
SELECT pg_temp.denied($q$INSERT INTO fin_contas(nome,tipo,company_id) VALUES('Forbidden','CAIXA','33333333-3333-4333-8333-333333333333')$q$,'cross-tenant INSERT');
DO $$DECLARE n integer; BEGIN
 UPDATE fin_contas SET nome='Wrong' WHERE company_id='22222222-2222-4222-8222-222222222222';GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.assert_true(n=0,'cross-tenant UPDATE');
 DELETE FROM fin_contas WHERE company_id='22222222-2222-4222-8222-222222222222';GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.assert_true(n=0,'cross-tenant DELETE');
END;$$;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notifications),'recipient policy cannot mix companies');
SELECT set_config('request.headers','{"x-company-id":"33333333-3333-4333-8333-333333333333"}',true);
SELECT pg_temp.denied('SELECT assert_tenant()','forged header');
SELECT pg_temp.denied('SELECT * FROM fin_contas','forged table request');
SELECT pg_temp.denied('SELECT get_fin_presentation_category_metadata()','forged presentation RPC');
SELECT set_config('request.headers','{"x-company-id":"invalid"}',true);
SELECT pg_temp.denied('SELECT assert_tenant()','malformed header');
RESET ROLE;

-- Store B adds the existing e-mail. The provider identity is never recreated.
SELECT pg_temp.assert_true(find_auth_user_by_email(' SINGLE@EXAMPLE.TEST ')='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','normalized identity lookup');
SELECT admin_upsert_company_membership('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operador',ARRAY['financeiro:relatorio-socios:view','financeiro:contas:view'],'active',NULL,NULL,true);
SELECT pg_temp.assert_true((admin_upsert_company_membership('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',NULL,'active',NULL,NULL,true)->>'already_exists')::boolean,'repeated addition is idempotent');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM auth.users),'no duplicated identities');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM company_memberships),'one additional membership');
SELECT pg_temp.denied($q$SELECT admin_upsert_company_membership('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operador',ARRAY['system:global:manage'])$q$,'local administrator cannot grant global management');

SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"x-company-id":"22222222-2222-4222-8222-222222222222"}',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM list_my_companies()),'multi-company list');
SELECT pg_temp.assert_true((get_my_company_context()->>'company_name')='Loja B','unit context B');
SELECT pg_temp.assert_true(has_role(auth.uid(),'operador') AND NOT has_role(auth.uid(),'admin'),'role is local');
SELECT pg_temp.assert_true(NOT has_permission(auth.uid(),'configuracoes:usuarios:manage'),'no inherited A admin permissions');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(nome)='Conta B' FROM fin_contas),'B scope returns B only');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(title)='Mensagem B' FROM notifications),'notification B only');
SELECT pg_temp.assert_true(NOT can_access_company_document('22222222-bbbb-4222-8222-222222222222/file.pdf','view'),'storage permission is local');
SELECT pg_temp.assert_true(get_fin_presentation_category_metadata()='{}'::jsonb,'presentation reads B');
SELECT get_fin_presentation_revenue('2026-09',ARRAY[2026]);
SELECT get_fin_presentation_expenses('2026-09',ARRAY[2026]);
SELECT set_config('request.headers','{"x-company-id":"11111111-1111-4111-8111-111111111111"}',true);
SELECT pg_temp.assert_true(has_role(auth.uid(),'admin'),'A permissions preserved after local B request');
SELECT pg_temp.assert_true(can_access_company_document('11111111-bbbb-4111-8111-111111111111/file.pdf','view'),'A storage permitted');
SELECT pg_temp.assert_true(NOT can_access_company_document('22222222-bbbb-4222-8222-222222222222/file.pdf','view'),'wrong storage unit denied');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(nome)='Conta A' FROM fin_contas),'global A remains independently queryable');
SELECT set_config('request.headers','',true);
SELECT pg_temp.assert_true(can_receive_company_change('22222222-2222-4222-8222-222222222222',ARRAY[]::text[]),'Realtime membership B');
SELECT pg_temp.assert_true(NOT can_receive_company_change('33333333-3333-4333-8333-333333333333',ARRAY[]::text[]),'Realtime unauthorized C');
SELECT set_config('request.headers','{"x-company-id":"11111111-1111-4111-8111-111111111111"}',true);
SELECT pg_temp.assert_true(NOT can_receive_company_change('22222222-2222-4222-8222-222222222222',ARRAY[]::text[]),'Realtime policy cannot widen HTTP scope');
RESET ROLE;

UPDATE company_memberships SET status='revoked' WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND company_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"x-company-id":"22222222-2222-4222-8222-222222222222"}',true);
SELECT pg_temp.denied('SELECT get_my_company_context()','revocation on next request');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM list_my_companies()),'revocation removes dropdown entry');
SELECT set_config('request.headers','',true);
SELECT pg_temp.assert_true(NOT can_receive_company_change('22222222-2222-4222-8222-222222222222',ARRAY[]::text[]),'Realtime revocation');
SELECT set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"11111111-1111-4111-8111-111111111111"}',true);
SELECT pg_temp.denied('SELECT assert_tenant()','other identity cannot access A');
RESET ROLE;
SELECT admin_upsert_company_membership('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer',ARRAY['financeiro:relatorio-socios:view'],'active',NULL,NULL,true);
SELECT pg_temp.assert_true(is_company_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222'),'authorized re-add restores revoked access');
SELECT pg_temp.assert_true(NOT ('financeiro:contas:view'=ANY(get_company_permissions('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222'))),'re-add does not resurrect old grants');
UPDATE companies SET ativo=false WHERE id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"x-company-id":"22222222-2222-4222-8222-222222222222"}',true);
SELECT pg_temp.denied('SELECT assert_tenant()','inactive company');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM list_my_companies()),'zero available units');
RESET ROLE;

-- Public sign-up metadata cannot create an authorized identity.
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','new@example.test','{"company_id":"11111111-1111-4111-8111-111111111111"}');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM company_memberships WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'partial provisioning grants no access');
SELECT admin_upsert_company_membership('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','operador',NULL,'active',NULL,NULL,true);
SELECT pg_temp.assert_true(is_company_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111'),'retry completes provisioning');
DO $$ BEGIN
 BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','attacker@example.test','{"company_id":"11111111-1111-4111-8111-111111111111"}');
 RAISE EXCEPTION 'TEST FAILED: untrusted signup accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TRUSTED_COMPANY_REQUIRED' THEN RAISE; END IF; END;
END;$$;
ROLLBACK;
\echo Multiunit security checks passed.
