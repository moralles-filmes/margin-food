
-- Add purchase unit snapshot columns to purchase_order_items
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_unit_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS purchase_unit_cost_snapshot NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC DEFAULT 1;
