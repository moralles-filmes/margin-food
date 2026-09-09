BEGIN;

CREATE OR REPLACE FUNCTION public.is_company_member(p_user_id uuid,p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.company_memberships m JOIN public.companies c ON c.id=m.company_id
   WHERE m.user_id=p_user_id AND m.company_id=p_company_id AND m.status='active' AND c.ativo);
$$;
REVOKE ALL ON FUNCTION public.is_company_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_company uuid; v_requested text;
BEGIN
 IF v_user IS NULL THEN RETURN NULL; END IF;
 v_requested := NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
 IF v_requested IS NOT NULL THEN
   BEGIN v_company := v_requested::uuid;
   EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END;
 ELSE
   SELECT company_id INTO v_company FROM public.profiles WHERE id=v_user;
 END IF;
 IF NOT public.is_company_member(v_user,v_company) THEN
   IF v_requested IS NULL THEN RETURN NULL; END IF;
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED';
 END IF;
 RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_tenant()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid := public.get_current_company_id();
BEGIN
 IF v_company IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END IF;
 RETURN v_company;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_current_company_id_strict()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT public.assert_tenant(); $$;

-- Explicit company permissions are also used for Realtime (which has no HTTP scope).
CREATE OR REPLACE FUNCTION public.get_company_permissions(p_user_id uuid,p_company_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(array_agg(k.permission_key ORDER BY k.permission_key),ARRAY[]::text[])
 FROM (
   SELECT rp.permission_key FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role=ur.role::text
   WHERE ur.user_id=p_user_id AND ur.company_id=p_company_id
   UNION
   SELECT permission_key FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id AND effect='ALLOW'
 ) k
 WHERE public.is_company_member(p_user_id,p_company_id)
 AND NOT EXISTS(SELECT 1 FROM public.user_permissions d WHERE d.user_id=p_user_id AND d.company_id=p_company_id
   AND d.permission_key=k.permission_key AND d.effect='DENY');
$$;
REVOKE ALL ON FUNCTION public.get_company_permissions(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_permissions(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid; v_requested text;
BEGIN
 IF auth.uid() IS NOT NULL THEN v_company:=public.get_current_company_id();
 ELSIF (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role')='service_role' THEN
   v_requested:=NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
   IF v_requested IS NOT NULL THEN v_company:=v_requested::uuid;
   ELSE SELECT company_id INTO v_company FROM public.profiles WHERE id=_user_id; END IF;
 ELSE RETURN ARRAY[]::text[];
 END IF;
 RETURN public.get_company_permissions(_user_id,v_company);
END;
$$;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid,_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(_permission=ANY(public.get_effective_permissions(_user_id)),false);
$$;
CREATE OR REPLACE FUNCTION public.has_permission_quick(_user_id uuid,_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.has_permission(_user_id,_permission);
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role=_role
   AND r.company_id=public.get_current_company_id() AND public.is_company_member(r.user_id,r.company_id));
$$;

CREATE OR REPLACE FUNCTION public.list_my_companies()
RETURNS TABLE(id uuid,nome text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT c.id,c.nome FROM public.company_memberships m JOIN public.companies c ON c.id=m.company_id
 WHERE m.user_id=auth.uid() AND m.status='active' AND c.ativo ORDER BY c.nome,c.id;
$$;
REVOKE ALL ON FUNCTION public.list_my_companies() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_companies() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_company_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid := public.assert_tenant(); v_result jsonb;
BEGIN
 SELECT jsonb_build_object('company_id',c.id,'company_name',c.nome,'nome',p.nome,'email',p.email,
   'avatar_url',p.avatar_url,'sector',m.sector,'job_role_id',m.job_role_id,
   'roles',COALESCE((SELECT jsonb_agg(r.role) FROM public.user_roles r WHERE r.user_id=p.id AND r.company_id=c.id),'[]'::jsonb),
   'permissions',to_jsonb(public.get_company_permissions(p.id,c.id))) INTO v_result
 FROM public.company_memberships m JOIN public.companies c ON c.id=m.company_id JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=auth.uid() AND m.company_id=v_company AND m.status='active' AND c.ativo;
 IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ACCESS_DENIED'; END IF;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_company_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_context() TO authenticated;

CREATE POLICY membership_read ON public.company_memberships FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR (company_id=(SELECT public.get_current_company_id())
 AND (SELECT public.has_any_permission(auth.uid(),ARRAY['configuracoes:usuarios:view','configuracoes:usuarios:manage','users:manage','system:global:manage']))));

-- Remove global RBAC policies before replacing them; permissive policies combine with OR.
DO $policies$
DECLARE r record;
BEGIN
 FOR r IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('user_roles','user_permissions') LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename);
 END LOOP;
END;
$policies$;
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated
 USING(company_id=(SELECT public.get_current_company_id()) AND (user_id=(SELECT auth.uid())
 OR (SELECT public.has_any_permission(auth.uid(),ARRAY['configuracoes:usuarios:view','configuracoes:usuarios:manage','users:manage','system:global:manage']))));
CREATE POLICY permissions_read ON public.user_permissions FOR SELECT TO authenticated
 USING(company_id=(SELECT public.get_current_company_id()) AND (user_id=(SELECT auth.uid())
 OR (SELECT public.has_any_permission(auth.uid(),ARRAY['configuracoes:usuarios:view','configuracoes:usuarios:manage','users:manage','system:global:manage']))));
-- Writes are atomic administrative RPCs/Edge operations, not unrestricted RLS mutations.
DROP POLICY IF EXISTS perm_role_permissions_manage ON public.role_permissions;
CREATE POLICY role_templates_manage ON public.role_permissions FOR ALL TO authenticated
 USING((SELECT public.has_permission(auth.uid(),'system:global:manage')))
 WITH CHECK((SELECT public.has_permission(auth.uid(),'system:global:manage')));

CREATE OR REPLACE FUNCTION public.protect_profile_identity_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') AND
   (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id OR
    NEW.email IS DISTINCT FROM OLD.email OR NEW.job_role_id IS DISTINCT FROM OLD.job_role_id OR NEW.sector IS DISTINCT FROM OLD.sector) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PROFILE_IDENTITY_PROTECTED';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_identity_scope BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_identity_scope();

-- Read identities through memberships; the original company_id is not an access grant.
DROP POLICY IF EXISTS profiles_select_admin_company ON public.profiles;
DROP POLICY IF EXISTS profiles_select_company_member ON public.profiles;
CREATE POLICY profiles_select_company_member ON public.profiles FOR SELECT TO authenticated
 USING(public.is_company_member(id,(SELECT public.get_current_company_id())) AND nome NOT ILIKE '[EXCLUÍDO]%');

-- Resolve direct legacy tenant subqueries through the same request guard.
DO $legacy_policies$
DECLARE r record; v_using text; v_check text;
BEGIN
 FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('produtos','alertas_falta_estoque','audit_logs','fin_contas_saldo_cache') LOOP
   v_using:=regexp_replace(r.qual,'\( SELECT (profiles|p)\.company_id\s+FROM profiles( p)?\s+WHERE \((profiles|p)\.id = \( SELECT auth.uid\(\) AS uid\)\)\)', '(SELECT public.get_current_company_id())','g');
   v_check:=regexp_replace(r.with_check,'\( SELECT (profiles|p)\.company_id\s+FROM profiles( p)?\s+WHERE \((profiles|p)\.id = \( SELECT auth.uid\(\) AS uid\)\)\)', '(SELECT public.get_current_company_id())','g');
   IF v_using IS DISTINCT FROM r.qual OR v_check IS DISTINCT FROM r.with_check THEN
     EXECUTE format('ALTER POLICY %I ON public.%I%s%s',r.policyname,r.tablename,
       CASE WHEN v_using IS NULL THEN '' ELSE ' USING ('||v_using||')' END,
       CASE WHEN v_check IS NULL THEN '' ELSE ' WITH CHECK ('||v_check||')' END);
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('produtos','alertas_falta_estoque','audit_logs','fin_contas_saldo_cache') AND coalesce(qual,'')||coalesce(with_check,'') ~ 'profiles') THEN
   RAISE EXCEPTION 'MULTIUNIT_LEGACY_POLICY_UNRESOLVED';
 END IF;
END;
$legacy_policies$;

-- Grant each new public API deliberately.
REVOKE ALL ON FUNCTION public.get_current_company_id(),public.assert_tenant(),public.get_current_company_id_strict(),
 public.get_effective_permissions(uuid),public.has_permission(uuid,text),public.has_permission_quick(uuid,text),public.has_role(uuid,public.app_role)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_company_id(),public.assert_tenant(),public.get_current_company_id_strict(),
 public.get_effective_permissions(uuid),public.has_permission(uuid,text),public.has_permission_quick(uuid,text),public.has_role(uuid,public.app_role)
 TO authenticated,service_role;
COMMIT;
