BEGIN;
CREATE TABLE multiunit_private.pending_identity_companies (
 email text PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id), expires_at timestamptz NOT NULL
);
REVOKE ALL ON multiunit_private.pending_identity_companies FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.reserve_company_invitation(p_actor_user_id uuid,p_company_id uuid,p_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_permissions text[];
BEGIN
 v_permissions:=public.get_company_permissions(p_actor_user_id,p_company_id);
 IF NOT v_permissions && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'] THEN
   SELECT public.get_company_permissions(p_actor_user_id,company_id) INTO v_permissions FROM public.profiles WHERE id=p_actor_user_id;
   IF NOT COALESCE('system:global:manage'=ANY(v_permissions),false) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
   END IF;
 END IF;
 INSERT INTO multiunit_private.pending_identity_companies(email,company_id,expires_at)
 VALUES(lower(btrim(p_email)),p_company_id,now()+interval '5 minutes')
 ON CONFLICT(email) DO UPDATE SET company_id=EXCLUDED.company_id,expires_at=EXCLUDED.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_company_invitation(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_company_invitation(uuid,uuid,text) TO service_role;
-- The Auth provider remains the only identity source. Only service-role can look
-- up an identity by e-mail; a store admin never receives the global user list.
CREATE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT id FROM auth.users WHERE lower(email)=lower(btrim(p_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;

CREATE FUNCTION public.admin_upsert_company_membership(
 p_actor_user_id uuid,p_company_id uuid,p_user_id uuid,p_role public.app_role DEFAULT NULL,
 p_permissions text[] DEFAULT NULL,p_status text DEFAULT 'active',p_job_role_id uuid DEFAULT NULL,
 p_sector text DEFAULT NULL,p_if_not_exists boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor_permissions text[]; v_id uuid; v_existed boolean; v_previous_status text;
BEGIN
 v_actor_permissions:=public.get_company_permissions(p_actor_user_id,p_company_id);
 -- Cross-company provisioning is reserved for the platform permission in the
 -- actor's original company. It does not grant operational access to the actor.
 IF NOT v_actor_permissions && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'] THEN
   SELECT public.get_company_permissions(p_actor_user_id,p.company_id) INTO v_actor_permissions
   FROM public.profiles p WHERE p.id=p_actor_user_id;
   IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
   END IF;
 END IF;
 IF p_status NOT IN ('active','inactive','revoked') THEN RAISE EXCEPTION 'INVALID_MEMBERSHIP_STATUS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=p_company_id AND ativo
   AND id<>'00000000-0000-0000-0000-000000000001'::uuid) THEN RAISE EXCEPTION 'COMPANY_INACTIVE'; END IF;
 IF p_job_role_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_roles WHERE id=p_job_role_id AND company_id=p_company_id) THEN
   RAISE EXCEPTION 'JOB_ROLE_COMPANY_MISMATCH';
 END IF;
 -- Serialize retries/concurrent creation for the same identity and unit.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_company_id::text,0));
 SELECT id,status INTO v_id,v_previous_status FROM public.company_memberships WHERE user_id=p_user_id AND company_id=p_company_id FOR UPDATE;
 v_existed:=v_id IS NOT NULL;
 IF v_existed AND p_if_not_exists THEN
   IF v_previous_status<>'revoked' THEN RETURN jsonb_build_object('membership_id',v_id,'already_exists',true); END IF;
   -- Explicitly adding a removed user restores only the newly selected grants.
   DELETE FROM public.user_roles WHERE user_id=p_user_id AND company_id=p_company_id;
   DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id;
 END IF;
 IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) AND
   (COALESCE(p_permissions,ARRAY[]::text[]) && ARRAY['system:global:manage','system:admin']
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key IN ('system:global:manage','system:admin'))) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
 END IF;
 IF p_permissions IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(p_permissions) k WHERE NOT EXISTS(SELECT 1 FROM public.permissions WHERE key=k)) THEN
   RAISE EXCEPTION 'UNKNOWN_PERMISSION';
 END IF;
 INSERT INTO public.company_memberships(user_id,company_id,status,job_role_id,sector)
 VALUES(p_user_id,p_company_id,p_status,p_job_role_id,p_sector)
 ON CONFLICT(user_id,company_id) DO UPDATE SET status=EXCLUDED.status,job_role_id=EXCLUDED.job_role_id,
   sector=EXCLUDED.sector,updated_at=now() RETURNING id INTO v_id;
 IF p_role IS NOT NULL THEN
   DELETE FROM public.user_roles WHERE user_id=p_user_id AND company_id=p_company_id;
   INSERT INTO public.user_roles(user_id,company_id,role) VALUES(p_user_id,p_company_id,p_role);
 END IF;
 IF p_permissions IS NOT NULL THEN
   DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id;
   INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect,granted_by)
   SELECT p_user_id,p_company_id,p.key,
     CASE WHEN p.key=ANY(p_permissions) THEN 'ALLOW' ELSE 'DENY' END,p_actor_user_id
   FROM public.permissions p WHERE p.key=ANY(p_permissions) OR EXISTS(
     SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role=ur.role::text
     WHERE ur.user_id=p_user_id AND ur.company_id=p_company_id AND rp.permission_key=p.key);
 END IF;
 INSERT INTO public.admin_actions_log(actor_user_id,company_id,action,target_user_id,details)
 VALUES(p_actor_user_id,p_company_id,CASE WHEN v_existed THEN 'MEMBERSHIP_UPDATED' ELSE 'MEMBERSHIP_CREATED' END,p_user_id,
   jsonb_build_object('status',p_status,'role',p_role,'permissions_count',cardinality(p_permissions)));
 RETURN jsonb_build_object('membership_id',v_id,'already_exists',false);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_company_membership(uuid,uuid,uuid,public.app_role,text[],text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_company_membership(uuid,uuid,uuid,public.app_role,text[],text,uuid,text,boolean) TO service_role;

-- Do not grant tenant access from self-editable user_metadata or a guessed company.
DROP TRIGGER IF EXISTS on_first_admin_assignment ON public.profiles;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid;
BEGIN
 v_company:=NULLIF(NEW.raw_app_meta_data->>'company_id','')::uuid;
 IF v_company IS NULL THEN
   DELETE FROM multiunit_private.pending_identity_companies
   WHERE email=lower(NEW.email) AND expires_at>now() RETURNING company_id INTO v_company;
 END IF;
 IF v_company IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND ativo
   AND id<>'00000000-0000-0000-0000-000000000001'::uuid) THEN
   RAISE EXCEPTION 'TRUSTED_COMPANY_REQUIRED';
 END IF;
 INSERT INTO public.profiles(id,nome,email,company_id)
 VALUES(NEW.id,COALESCE(NEW.raw_user_meta_data->>'nome',''),COALESCE(NEW.email,''),v_company);
 -- The authorized RPC creates membership and grants in one transaction. If it
 -- fails after Auth creates the identity, retrying can safely finish provisioning.
 RETURN NEW;
END;
$$;

DO $onboarding$
DECLARE v_before text; v_def text;
BEGIN
 SELECT pg_get_functiondef('public.onboard_new_company(text,text,uuid)'::regprocedure) INTO v_before;
 v_def:=replace(v_before,'UPDATE profiles SET company_id = v_new_company_id WHERE id = p_admin_user_id;',
   'INSERT INTO public.company_memberships(user_id,company_id) VALUES(p_admin_user_id,v_new_company_id) ON CONFLICT(user_id,company_id) DO UPDATE SET status=''active'',updated_at=now();');
 v_def:=replace(v_def,'INSERT INTO user_roles (user_id, role)','INSERT INTO user_roles (user_id, company_id, role)');
 v_def:=replace(v_def,'VALUES (p_admin_user_id, ''admin'')','VALUES (p_admin_user_id, v_new_company_id, ''admin'')');
 v_def:=replace(v_def,'ON CONFLICT (user_id, role)','ON CONFLICT (user_id, company_id, role)');
 IF v_before=v_def THEN RAISE EXCEPTION 'MULTIUNIT_ONBOARDING_DRIFT'; END IF;
 EXECUTE v_def;
 SELECT pg_get_functiondef('public.list_companies()'::regprocedure) INTO v_before;
 EXECUTE replace(v_before,'count(*) FROM profiles p WHERE p.company_id = c.id','count(*) FROM public.company_memberships p WHERE p.company_id = c.id AND p.status=''active''');
END;
$onboarding$;

CREATE OR REPLACE FUNCTION public.rpc_set_user_company(p_user_id uuid,p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.assert_tenant();
 IF NOT public.has_permission(auth.uid(),'system:global:manage') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED'; END IF;
 RETURN public.admin_upsert_company_membership(auth.uid(),p_company_id,p_user_id,'operador',NULL,'active',NULL,NULL,true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid:=public.assert_tenant(); v_result jsonb;
BEGIN
 IF NOT public.has_any_permission(auth.uid(),ARRAY['configuracoes:usuarios:view','configuracoes:usuarios:manage','users:manage','system:global:manage']) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'email',p.email,'company_id',m.company_id)), '[]'::jsonb)
 INTO v_result FROM public.profiles p JOIN public.company_memberships m ON m.user_id=p.id WHERE m.company_id=v_company;
 RETURN v_result;
END;
$$;

DO $super_admin$
DECLARE v_before text; v_def text;
BEGIN
 SELECT pg_get_functiondef('public.admin_set_super_admin(uuid,boolean,text,text)'::regprocedure) INTO v_before;
 v_def:=replace(v_before,'v_target_company IS DISTINCT FROM v_company','NOT public.is_company_member(p_target_user_id,v_company)');
 v_def:=replace(v_def,'(user_id, permission_key, effect, granted_by)','(user_id, company_id, permission_key, effect, granted_by)');
 v_def:=replace(v_def,'VALUES (p_target_user_id, ''system:global:manage'', ''grant'', v_actor)',
   'VALUES (p_target_user_id, v_company, ''system:global:manage'', ''ALLOW'', v_actor)');
 v_def:=replace(v_def,'ON CONFLICT DO NOTHING;',
   'ON CONFLICT (user_id,company_id,permission_key) DO UPDATE SET effect=''ALLOW'',granted_by=EXCLUDED.granted_by;');
 v_def:=replace(v_def,'WHERE user_id = p_target_user_id AND permission_key',
   'WHERE user_id = p_target_user_id AND company_id = v_company AND permission_key');
 IF v_before=v_def THEN RAISE EXCEPTION 'MULTIUNIT_SUPER_ADMIN_DRIFT'; END IF;
 EXECUTE v_def;
END;
$super_admin$;
COMMIT;
