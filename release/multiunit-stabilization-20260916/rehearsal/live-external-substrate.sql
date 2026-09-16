-- LOCAL REHEARSAL FIXTURE ONLY. Never apply this file to hosted Supabase.
-- The schema-only public template intentionally omits the platform-owned
-- storage schema and publication memberships. Recreate only the catalog
-- surface read by F8 so the forward sequence sees the same four policies,
-- private bucket and six publication members as the read-only live snapshot.
DO $$
BEGIN
  IF current_database() NOT LIKE 'moralles_stabilization_release_%'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
     OR to_regnamespace('storage') IS NOT NULL
  THEN
    RAISE EXCEPTION 'LOCAL_DISPOSABLE_RELEASE_REHEARSAL_ONLY';
  END IF;
END $$;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;

INSERT INTO storage.buckets(id,name,public)
VALUES ('rh-documentos','rh-documentos',false);
CREATE POLICY company_documents_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='rh-documentos' AND public.can_access_company_document(name,'delete'));
CREATE POLICY company_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='rh-documentos' AND public.can_access_company_document(name,'create'));
CREATE POLICY company_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='rh-documentos' AND public.can_access_company_document(name,'view'));
CREATE POLICY company_documents_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='rh-documentos' AND public.can_access_company_document(name,'edit'))
  WITH CHECK (bucket_id='rh-documentos' AND public.can_access_company_document(name,'edit'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.notifications,public.purchase_orders,public.cotacoes,
  public.cotacao_fornecedores,public.produtos,public.movimentacoes_estoque;
