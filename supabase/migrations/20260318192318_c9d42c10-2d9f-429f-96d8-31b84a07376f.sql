ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS origin text DEFAULT NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS origin_ref text DEFAULT NULL;