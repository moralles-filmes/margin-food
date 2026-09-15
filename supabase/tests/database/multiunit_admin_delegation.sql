\set ON_ERROR_STOP on
-- Banco descartável com schema real e fixtures de multiunit_before.sql.
-- Reproduz o legado de produção: Admin possui system:admin, sem gestão global.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %',label; END IF; END; $$;
CREATE OR REPLACE FUNCTION pg_temp.denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'TEST FAILED (expected 42501): %',label;
END; $$;

INSERT INTO permissions(key,description,module,submodule,action)
VALUES('system:admin','Admin legado','system','global','manage');
INSERT INTO role_permissions(role,permission_key) VALUES('admin','system:admin');

DO $$
DECLARE
 actor_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 target_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 company_a uuid := '11111111-1111-4111-8111-111111111111';
 company_b uuid := '22222222-2222-4222-8222-222222222222';
 company_c uuid := '33333333-3333-4333-8333-333333333333';
 original_permissions text[];
 original_identity jsonb;
 admin_permissions text[];
BEGIN
 original_permissions := get_company_permissions(target_id,company_a);
 SELECT to_jsonb(u) INTO original_identity FROM auth.users u WHERE id=target_id;
 SELECT array_agg(permission_key ORDER BY permission_key) INTO admin_permissions
 FROM role_permissions WHERE role='admin';
 PERFORM pg_temp.assert_true('system:admin'=ANY(get_company_permissions(actor_id,company_b))
   AND NOT 'system:global:manage'=ANY(get_company_permissions(actor_id,company_b)), 'actor is a local legacy admin');

 -- API sem overrides: permissões herdadas do perfil.
 PERFORM admin_upsert_company_membership(actor_id,company_b,target_id,'admin',NULL,'active',NULL,NULL,true);
 PERFORM pg_temp.assert_true('system:admin'=ANY(get_company_permissions(target_id,company_b)), 'local admin can assign the same legacy role');
 PERFORM pg_temp.assert_true(NOT 'system:global:manage'=ANY(get_company_permissions(target_id,company_b)), 'role assignment grants no global management');
 PERFORM pg_temp.assert_true(get_company_permissions(target_id,company_a)=original_permissions, 'original unit permissions preserved');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM auth.users), 'existing identity is reused');
 PERFORM pg_temp.assert_true((SELECT to_jsonb(u)=original_identity FROM auth.users u WHERE id=target_id), 'Auth identity is unchanged');

 -- Tela de cadastro envia todas as permissões do perfil explicitamente.
 PERFORM admin_upsert_company_membership(actor_id,company_b,target_id,NULL,NULL,'revoked');
 PERFORM admin_upsert_company_membership(actor_id,company_b,target_id,'admin',admin_permissions,'active',NULL,NULL,true);
 PERFORM pg_temp.assert_true(get_company_permissions(target_id,company_b)=admin_permissions, 'form payload restores revoked membership with selected grants');
 PERFORM pg_temp.assert_true((admin_upsert_company_membership(actor_id,company_b,target_id,'operador',ARRAY[]::text[],
   'active',NULL,NULL,true)->>'already_exists')::boolean, 'retry remains idempotent');
 PERFORM pg_temp.assert_true(get_company_permissions(target_id,company_b)=admin_permissions, 'retry does not replace existing permissions');
 PERFORM admin_upsert_company_membership(actor_id,company_b,target_id,'admin',admin_permissions);
 PERFORM pg_temp.assert_true(get_company_permissions(target_id,company_b)=admin_permissions, 'editing an admin also works');

 -- A permissão legada não autoriza conceder gestão global, direta ou herdada.
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,NULL,ARRAY[''system:global:manage''])',
   actor_id,company_b,target_id), 'legacy admin cannot explicitly grant global management');
 INSERT INTO role_permissions(role,permission_key) VALUES('admin','system:global:manage');
 INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 VALUES(actor_id,company_b,'system:global:manage','DENY');
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''admin'')',
   actor_id,company_b,target_id), 'legacy admin cannot grant global management through a role');
 DELETE FROM role_permissions WHERE role='admin' AND permission_key='system:global:manage';

 -- Quem só gerencia usuários não pode adquirir nem repassar system:admin.
 INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 VALUES(actor_id,company_b,'system:admin','DENY');
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''admin'')',
   actor_id,company_b,target_id), 'manager without legacy permission cannot assign admin role');
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''operador'',ARRAY[''system:admin''])',
   actor_id,company_b,target_id), 'manager without legacy permission cannot grant it explicitly');
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''admin'')',
   actor_id,company_b,actor_id), 'manager cannot elevate their own legacy access');
 PERFORM admin_upsert_company_membership(actor_id,company_b,target_id,'operador',ARRAY['financeiro:relatorio-socios:view']);
 PERFORM pg_temp.assert_true(NOT 'system:admin'=ANY(get_company_permissions(target_id,company_b)), 'regular user management remains available');

 DELETE FROM user_permissions WHERE user_id=actor_id AND company_id=company_b AND permission_key='system:admin';
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''admin'')',
   actor_id,company_c,target_id), 'legacy admin cannot provision an unauthorized company');
 UPDATE company_memberships SET status='inactive' WHERE user_id=actor_id AND company_id=company_b;
 PERFORM pg_temp.denied(format('SELECT admin_upsert_company_membership(%L,%L,%L,''admin'')',
   actor_id,company_b,target_id), 'inactive admin cannot provision users');
 UPDATE company_memberships SET status='active' WHERE user_id=actor_id AND company_id=company_b;

 INSERT INTO user_permissions(user_id,company_id,permission_key,effect)
 VALUES(target_id,company_a,'system:global:manage','ALLOW');
 PERFORM admin_upsert_company_membership(target_id,company_c,actor_id,'admin',ARRAY['system:global:manage','system:admin']);
 PERFORM pg_temp.assert_true('system:global:manage'=ANY(get_company_permissions(actor_id,company_c)), 'explicit global admin can still provision across companies');
END; $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT admin_upsert_company_membership(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin')$q$, 'membership RPC remains service-role-only');
RESET ROLE;
ROLLBACK;
\echo Multiunit admin delegation checks passed.
