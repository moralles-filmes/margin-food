-- Pausar consumers antes; somente contenção, sem restaurar DELETE ou acesso sem escopo.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND
   (schemaname<>'public' OR tablename NOT IN ('notifications','produtos','movimentacoes_estoque','purchase_orders','cotacoes','cotacao_fornecedores')))
 THEN RAISE EXCEPTION 'PHASE8_ROLLBACK_CALLER_REVIEW_REQUIRED'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.can_access_company_document(text,text) FROM PUBLIC,anon,authenticated,service_role;
-- Mantém a publicação e seus parâmetros seguros, suspende eventos das tabelas da aplicação.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT schemaname,tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' LOOP
   EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I',r.schemaname,r.tablename);
 END LOOP;
END $$;
COMMIT;
