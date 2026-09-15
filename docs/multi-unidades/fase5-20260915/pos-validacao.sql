BEGIN TRANSACTION READ ONLY;
SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.proconfig,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role
FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN
 ('upsert_supplier','upsert_supplier_price','receive_purchase_order_atomic','validate_supplier_item_price','get_supplier_ranking');
SELECT conname,convalidated,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.supplier_item_prices'::regclass;
SELECT count(*) AS inconsistent_prices FROM public.supplier_item_prices t
LEFT JOIN public.suppliers s ON s.id=t.supplier_uuid LEFT JOIN public.produtos p ON p.id=t.stock_item_id
WHERE s.id IS NULL OR p.id IS NULL OR s.company_id<>t.company_id OR p.company_id<>t.company_id;
SELECT relname,relacl,relrowsecurity,relforcerowsecurity FROM pg_class
WHERE oid IN ('public.suppliers'::regclass,'public.supplier_item_prices'::regclass);
ROLLBACK;
