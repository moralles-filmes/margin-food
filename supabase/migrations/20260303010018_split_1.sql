CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_current_company_id_strict();
END;
$$;

-- 1) Normalize stock_sku_counter columns and constraints
DO $$
BEGIN
  -- Rename legacy last_number -> next_value when needed
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_sku_counter'
      AND column_name = 'last_number'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_sku_counter'
      AND column_name = 'next_value'
  ) THEN
    ALTER TABLE public.stock_sku_counter
      RENAME COLUMN last_number TO next_value;
  END IF;

  -- Ensure next_value exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_sku_counter'
      AND column_name = 'next_value'
  ) THEN
    ALTER TABLE public.stock_sku_counter
      ADD COLUMN next_value bigint NOT NULL DEFAULT 0;
  END IF;

  -- Keep company_id/prefix required as requested
  ALTER TABLE public.stock_sku_counter
    ALTER COLUMN company_id SET NOT NULL,
    ALTER COLUMN company_id SET DEFAULT public.get_current_company_id(),
    ALTER COLUMN prefix SET NOT NULL,
    ALTER COLUMN next_value SET NOT NULL;

  -- Ensure updated_at exists (enterprise observability)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_sku_counter'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.stock_sku_counter
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Ensure uniqueness is tenant-aware
ALTER TABLE public.stock_sku_counter
  DROP CONSTRAINT IF EXISTS stock_sku_counter_prefix_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_sku_counter'::regclass
      AND conname = 'stock_sku_counter_company_prefix_key'
  ) THEN
    ALTER TABLE public.stock_sku_counter
      ADD CONSTRAINT stock_sku_counter_company_prefix_key UNIQUE (company_id, prefix);
  END IF;
END $$;

-- 2) FORCE RLS + granular tenant policies
ALTER TABLE public.stock_sku_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sku_counter FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_read_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_insert_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_update_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_delete_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_sku_counter_select ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_sku_counter_insert ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_sku_counter_update ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_sku_counter_delete ON public.stock_sku_counter;

CREATE POLICY stock_sku_counter_select
ON public.stock_sku_counter
FOR SELECT
TO authenticated
USING (
  company_id = public.get_current_company_id()
  AND public.has_any_permission(
    auth.uid(),
    ARRAY['stock:read', 'estoque:catalogo:view', 'estoque:catalogo:create', 'system:global:manage']
  )
);

CREATE POLICY stock_sku_counter_insert
ON public.stock_sku_counter
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_current_company_id()
  AND public.has_any_permission(
    auth.uid(),
    ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:sku:manage', 'system:global:manage']
  )
);

CREATE POLICY stock_sku_counter_update
ON public.stock_sku_counter
FOR UPDATE
TO authenticated
USING (
  company_id = public.get_current_company_id()
  AND public.has_any_permission(
    auth.uid(),
    ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:sku:manage', 'system:global:manage']
  )
)
WITH CHECK (
  company_id = public.get_current_company_id()
  AND public.has_any_permission(
    auth.uid(),
    ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:sku:manage', 'system:global:manage']
  )
);

CREATE POLICY stock_sku_counter_delete
ON public.stock_sku_counter
FOR DELETE
TO authenticated
USING (
  company_id = public.get_current_company_id()
  AND public.has_any_permission(
    auth.uid(),
    ARRAY['stock:delete', 'estoque:sku:manage', 'system:global:manage']
  )
);

-- 3) Atomic, concurrent, tenant-scoped SKU generator