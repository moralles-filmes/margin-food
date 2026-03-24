
-- ============================================================
-- HARDENING FINAL: NOT NULL + missing FK + placeholder trigger
-- ============================================================

-- A) Fix 3 nullable columns
ALTER TABLE public.ai_insights ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.ai_logs ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.rbac_legacy_usage ALTER COLUMN company_id SET NOT NULL;

-- B) Only 1 table missing FK to companies
ALTER TABLE public.rbac_legacy_usage ADD CONSTRAINT fk_rbac_legacy_company FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

-- C) Validation trigger to block placeholder company_id
CREATE OR REPLACE FUNCTION public.trg_block_placeholder_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'company_id placeholder não permitido';
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to all operational tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT t.relname AS tbl
    FROM pg_class t JOIN pg_namespace n ON t.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'company_id'
    WHERE n.nspname = 'public' AND t.relkind = 'r'
    AND t.relname NOT LIKE '%_bkp_%' AND t.relname NOT IN ('profiles','companies')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_block_placeholder_company BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company()',
      r.tbl
    );
  END LOOP;
END $$;
