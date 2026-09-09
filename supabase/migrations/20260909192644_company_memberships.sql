-- Fase 1: estrutura aditiva. Não altera a empresa original ou identidade.
BEGIN;
CREATE SCHEMA IF NOT EXISTS multiunit_private;
REVOKE ALL ON SCHEMA multiunit_private FROM PUBLIC, anon, authenticated;

-- Evidência anterior e suporte ao rollback; schema fora da Data API.
CREATE TABLE multiunit_private.rbac_before AS
SELECT 'role'::text AS kind, to_jsonb(r) AS record FROM public.user_roles r
UNION ALL SELECT 'permission', to_jsonb(p) FROM public.user_permissions p;
CREATE TABLE multiunit_private.definitions_before AS
SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS definition,
       p.proacl AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f';
CREATE TABLE multiunit_private.policies_before AS SELECT * FROM pg_policies
WHERE schemaname IN ('public', 'storage');
CREATE TABLE multiunit_private.relations_before AS
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p');
CREATE TABLE multiunit_private.triggers_before AS
SELECT t.tgname,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t WHERE t.tgrelid='public.profiles'::regclass AND NOT t.tgisinternal;
CREATE TABLE multiunit_private.publication_before AS SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime';
REVOKE ALL ON ALL TABLES IN SCHEMA multiunit_private FROM PUBLIC, anon, authenticated;

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id
             LEFT JOIN public.companies c ON c.id=p.company_id
             WHERE u.id IS NULL OR c.id IS NULL) THEN
    RAISE EXCEPTION 'MULTIUNIT_BACKFILL_ORPHAN';
  END IF;
END;
$preflight$;

CREATE TABLE public.company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','revoked')),
  job_role_id uuid REFERENCES public.job_roles(id),
  sector text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_memberships_user_company_key UNIQUE (user_id,company_id),
  CONSTRAINT company_memberships_real_company CHECK (company_id <> '00000000-0000-0000-0000-000000000001'::uuid)
);
CREATE INDEX company_memberships_company_status_idx ON public.company_memberships(company_id,status,user_id);
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships FORCE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.company_memberships TO authenticated, service_role;
REVOKE ALL ON TABLE public.company_memberships FROM anon;

INSERT INTO public.company_memberships(user_id,company_id,job_role_id,sector,created_at)
SELECT id,company_id,job_role_id,sector,created_at FROM public.profiles
WHERE company_id <> '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT(user_id,company_id) DO NOTHING;

ALTER TABLE public.user_roles ADD COLUMN company_id uuid;
ALTER TABLE public.user_permissions ADD COLUMN company_id uuid;
UPDATE public.user_roles r SET company_id=p.company_id FROM public.profiles p WHERE p.id=r.user_id;
UPDATE public.user_permissions r SET company_id=p.company_id FROM public.profiles p WHERE p.id=r.user_id;
ALTER TABLE public.user_roles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.user_permissions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN company_id SET DEFAULT public.get_current_company_id();
ALTER TABLE public.user_permissions ALTER COLUMN company_id SET DEFAULT public.get_current_company_id();
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_company_role_key UNIQUE(user_id,company_id,role);
ALTER TABLE public.user_permissions DROP CONSTRAINT user_permissions_user_id_permission_key_key;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_company_permission_key UNIQUE(user_id,company_id,permission_key);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_membership_fk FOREIGN KEY(user_id,company_id)
  REFERENCES public.company_memberships(user_id,company_id);
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_membership_fk FOREIGN KEY(user_id,company_id)
  REFERENCES public.company_memberships(user_id,company_id);
CREATE INDEX user_roles_company_user_idx ON public.user_roles(company_id,user_id);
CREATE INDEX user_permissions_company_user_idx ON public.user_permissions(company_id,user_id);
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions FORCE ROW LEVEL SECURITY;

DO $backfill$
BEGIN
  IF (SELECT count(*) FROM public.company_memberships) <
     (SELECT count(*) FROM public.profiles WHERE company_id <> '00000000-0000-0000-0000-000000000001'::uuid) THEN
    RAISE EXCEPTION 'MULTIUNIT_BACKFILL_COUNT';
  END IF;
  IF EXISTS (SELECT 1 FROM multiunit_private.rbac_before b WHERE
     (b.kind='role' AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.id=(b.record->>'id')::uuid
       AND to_jsonb(r)-'company_id'=b.record)) OR
     (b.kind='permission' AND NOT EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.id=(b.record->>'id')::uuid
       AND to_jsonb(p)-'company_id'=b.record))) THEN
    RAISE EXCEPTION 'MULTIUNIT_BACKFILL_GRANTS_CHANGED';
  END IF;
END;
$backfill$;
COMMIT;
