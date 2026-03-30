-- REPAIR: suppliers and prices multi-tenant constraints
-- Update unique constraints to include company_id to allow ON CONFLICT upserts to work correctly.

DO $$
BEGIN
    -- 1. Repair public.suppliers
    -- Remove the old single-column unique constraint if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_name_key') THEN
        ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_name_key;
    END IF;
    
    -- Ensure NEW unique constraint includes company_id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_name_company_key') THEN
        ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_name_company_key UNIQUE (name, company_id);
    END IF;

    -- 2. Repair public.supplier_item_prices
    -- Drop old index
    DROP INDEX IF EXISTS public.idx_supplier_item_unique;
    
    -- Create NEW unique index including company_id
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_supplier_item_company_unique') THEN
        CREATE UNIQUE INDEX idx_supplier_item_company_unique 
        ON public.supplier_item_prices (supplier_id, stock_item_id, company_id);
    END IF;

    -- Also check for public.stock_sku_counter (used by generate_next_sku)
    -- It should already have (company_id, prefix) unique based on generate_next_sku's ON CONFLICT
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stock_sku_counter_pkey') THEN
       -- If it has no pkey, let's at least make sure (company_id, prefix) is unique
       DROP INDEX IF EXISTS public.stock_sku_counter_company_id_prefix_idx;
       CREATE UNIQUE INDEX IF NOT EXISTS stock_sku_counter_company_id_prefix_idx 
       ON public.stock_sku_counter (company_id, prefix);
    END IF;

END $$;

NOTIFY pgrst, 'reload schema';
