-- Corrige a delegação de Admin entre memberships sem elevar privilégios globais.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_upsert_company_membership(
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
 -- system:admin já pertence aos perfis administrativos legados. Pode ser
 -- delegado por quem o possui nesta unidade, sem conceder gestão global.
 IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) THEN
   IF COALESCE('system:global:manage'=ANY(p_permissions),false)
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:global:manage') THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
   END IF;
   IF NOT COALESCE('system:admin'=ANY(v_actor_permissions),false) AND
     (COALESCE('system:admin'=ANY(p_permissions),false)
       OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:admin')) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
   END IF;
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

COMMIT;
