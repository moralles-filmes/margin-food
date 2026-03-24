
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('OPEN', 'PENDING', 'SHOPPING_OK', 'IN_RECEIVING', 'PARTIAL', 'COMPLETED', 'CANCELLED'));
