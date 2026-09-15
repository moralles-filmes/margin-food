BEGIN TRANSACTION READ ONLY;
DO $verify$ DECLARE f text; r text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.cancel_salmon_entry_atomic(uuid,text)','public.cancel_salmon_manipulation_atomic(uuid,text)','public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)','public.create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)','public.ensure_salmon_raw_product()','public.get_salmon_dashboard_summary(date,date)','public.validate_salmon_entry()','public.validate_salmon_manipulation()'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'PHASE4_INTERNAL_ACL: % %',r,f; END IF;
  END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['public._salmon_cancel_entry_guarded(uuid,text)','public._salmon_cancel_manipulation_guarded(uuid,text)','public._salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)','public._salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)','public._salmon_dashboard_guarded(text,text)','public.get_salmon_inventory_adjustment_kg()','public.get_salmon_reconciliation_kpis()','public.upsert_salmon_leftover_atomic(date,numeric,text)'] LOOP
  IF NOT has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'PHASE4_PUBLIC_ACL: %',f; END IF;
 END LOOP;
END $verify$;
SELECT indexdef FROM pg_indexes WHERE indexname='produtos_one_active_salmon_raw';
ROLLBACK;
