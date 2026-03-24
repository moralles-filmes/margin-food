-- Fix root cause of SKU generation error: tenant-safe counters by (company_id, prefix)

-- 1) Make uniqueness tenant-aware
ALTER TABLE public.stock_sku_counter
  DROP CONSTRAINT IF EXISTS stock_sku_counter_prefix_key;

ALTER TABLE public.stock_sku_counter
  ADD CONSTRAINT stock_sku_counter_company_prefix_key UNIQUE (company_id, prefix);

-- 2) Harden RLS for tenant isolation on stock_sku_counter
DROP POLICY IF EXISTS stock_read_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_edit_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_update_sku_counter ON public.stock_sku_counter;
DROP POLICY IF EXISTS stock_delete_sku_counter ON public.stock_sku_counter;

CREATE POLICY stock_read_sku_counter
ON public.stock_sku_counter
FOR SELECT
TO authenticated
USING (
  company_id = public.get_current_company_id_strict()
  AND public.has_any_permission(auth.uid(), ARRAY['stock:read', 'estoque:catalogo:view', 'estoque:catalogo:create', 'estoque:cadastros:manage', 'system:global:manage'])
);

CREATE POLICY stock_insert_sku_counter
ON public.stock_sku_counter
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_current_company_id_strict()
  AND public.has_any_permission(auth.uid(), ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:cadastros:manage', 'system:global:manage'])
);

CREATE POLICY stock_update_sku_counter
ON public.stock_sku_counter
FOR UPDATE
TO authenticated
USING (
  company_id = public.get_current_company_id_strict()
  AND public.has_any_permission(auth.uid(), ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:cadastros:manage', 'system:global:manage'])
)
WITH CHECK (
  company_id = public.get_current_company_id_strict()
  AND public.has_any_permission(auth.uid(), ARRAY['stock:edit', 'estoque:catalogo:create', 'estoque:cadastros:manage', 'system:global:manage'])
);

CREATE POLICY stock_delete_sku_counter
ON public.stock_sku_counter
FOR DELETE
TO authenticated
USING (
  company_id = public.get_current_company_id_strict()
  AND public.has_any_permission(auth.uid(), ARRAY['stock:delete', 'estoque:cadastros:manage', 'system:global:manage'])
);

-- 3) Rewrite SKU generator to use tenant-scoped row only
CREATE OR REPLACE FUNCTION public.generate_next_sku(p_prefix text DEFAULT 'MP'::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
  v_pad integer;
  v_company_id uuid;
BEGIN
  v_company_id := public.get_current_company_id_strict();

  UPDATE public.stock_sku_counter
  SET last_number = last_number + 1,
      updated_at = now()
  WHERE prefix = p_prefix
    AND company_id = v_company_id
  RETURNING last_number, pad_length
  INTO v_next, v_pad;

  IF v_next IS NULL THEN
    INSERT INTO public.stock_sku_counter (prefix, last_number, pad_length, company_id)
    VALUES (p_prefix, 1, 4, v_company_id)
    ON CONFLICT (company_id, prefix)
    DO UPDATE SET
      last_number = public.stock_sku_counter.last_number + 1,
      updated_at = now()
    RETURNING last_number, pad_length
    INTO v_next, v_pad;
  END IF;

  RETURN p_prefix || '-' || lpad(v_next::text, v_pad, '0');
END;
$function$;