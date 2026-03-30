-- REPAIR SCHEMA: supplier_item_prices multi-tenant support
-- Adds missing columns and updates unique constraints to match multi-tenant logic.

DO $$
BEGIN
    -- 1. Add columns to supplier_item_prices if they are missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_item_prices' AND column_name = 'company_id') THEN
        ALTER TABLE public.supplier_item_prices ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_item_prices' AND column_name = 'supplier_uuid') THEN
        ALTER TABLE public.supplier_item_prices ADD COLUMN supplier_uuid uuid;
    END IF;

    -- 2. Backfill existing records with the placeholder company_id if they are NULL
    UPDATE public.supplier_item_prices SET company_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE company_id IS NULL;

    -- 3. Reset unique indexes to include company_id
    DROP INDEX IF EXISTS public.idx_supplier_item_unique;
    DROP INDEX IF EXISTS public.idx_supplier_item_company_unique;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_supplier_item_company_unique') THEN
        CREATE UNIQUE INDEX idx_supplier_item_company_unique 
        ON public.supplier_item_prices (supplier_id, stock_item_id, company_id);
    END IF;

    -- 4. Repair public.suppliers (ensure column and constraint are correct)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'company_id') THEN
        ALTER TABLE public.suppliers ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_name_key') THEN
        ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_name_key;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_name_company_key') THEN
        ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_name_company_key UNIQUE (name, company_id);
    END IF;

END $$;

NOTIFY pgrst, 'reload schema';
