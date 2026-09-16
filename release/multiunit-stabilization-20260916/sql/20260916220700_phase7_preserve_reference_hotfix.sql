-- Historical Phase 7 reference alignment is superseded by live hotfix
-- 20260916153928. Do not recreate phase7_active_consumers or weaken granular
-- ALLOW + legacy DENY behavior. This forward records and verifies the advance.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $verify$
DECLARE v_count integer; v_digest text;
BEGIN
 SELECT count(*),md5(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text)
 INTO v_count,v_digest FROM pg_policies p WHERE p.schemaname='public' AND (
   (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
   (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
   (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
   (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
   (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
 );
 IF v_count<>17 OR v_digest<>'9a49d198cabb2ec4f9fd1984e8c20404' THEN
   RAISE EXCEPTION 'PHASE7_REFERENCE_HOTFIX_DRIFT count=% digest=%',v_count,v_digest;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('stock_categories','stock_locations','stock_sectors')
   AND policyname='phase7_active_consumers') THEN
   RAISE EXCEPTION 'PHASE7_SUPERSEDED_POLICY_PRESENT';
 END IF;
END $verify$;
COMMIT;
