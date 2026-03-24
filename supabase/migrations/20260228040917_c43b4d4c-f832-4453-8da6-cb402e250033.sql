
-- Add shopping_status to purchase_order_items for checklist workflow
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS shopping_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS shopping_note TEXT DEFAULT '';

-- Add shopping completion tracking to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS shopping_done_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopping_done_by UUID;

-- Update existing FORNECEDOR orders: set shopping_status to 'OK' (they skip shopping checklist)
UPDATE public.purchase_order_items poi
SET shopping_status = 'OK'
FROM public.purchase_orders po
WHERE poi.order_id = po.id AND po.type = 'FORNECEDOR';

-- For completed/received items in existing MERCADO/SAZONAL orders, also set OK
UPDATE public.purchase_order_items
SET shopping_status = 'OK'
WHERE received_status IN ('RECEIVED', 'NOT_DELIVERED');
