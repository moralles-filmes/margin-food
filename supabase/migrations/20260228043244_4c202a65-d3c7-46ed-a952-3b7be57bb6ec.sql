
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS not_delivered_ack_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS not_delivered_ack_by uuid DEFAULT NULL;
