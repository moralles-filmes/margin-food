BEGIN TRANSACTION READ ONLY;
DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime'
   AND NOT puballtables AND pubinsert AND pubupdate AND pubdelete AND pubtruncate
   AND pubowner='postgres'::regrole)
 THEN RAISE EXCEPTION 'PHASE8_PUBLICATION_DRIFT'; END IF;
 IF (SELECT array_agg(schemaname||'.'||tablename ORDER BY schemaname,tablename)
     FROM pg_publication_tables WHERE pubname='supabase_realtime') IS DISTINCT FROM
    ARRAY['public.cotacao_fornecedores','public.cotacoes','public.movimentacoes_estoque','public.notifications','public.produtos','public.purchase_orders']
   OR EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND rowfilter IS NOT NULL)
 THEN RAISE EXCEPTION 'PHASE8_PUBLICATION_TABLE_DRIFT'; END IF;
END $guard$;
ROLLBACK;
