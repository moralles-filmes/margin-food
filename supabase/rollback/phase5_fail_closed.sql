-- Contenção, não restauração das ACLs vulneráveis. Não apaga dados nem remove FKs.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE ALL ON FUNCTION public.upsert_supplier(text),
 public.upsert_supplier_price(text,uuid,numeric,text),
 public.receive_purchase_order_atomic(uuid,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN
 ON public.suppliers,public.supplier_item_prices FROM authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
