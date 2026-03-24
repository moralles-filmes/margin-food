CREATE OR REPLACE FUNCTION public.generate_next_sku(p_prefix text DEFAULT 'MP'::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_next bigint;
  v_pad integer;
BEGIN
  v_company_id := public.get_current_company_id();

  INSERT INTO public.stock_sku_counter (company_id, prefix, next_value, pad_length, updated_at)
  VALUES (v_company_id, p_prefix, 1, 4, now())
  ON CONFLICT (company_id, prefix)
  DO UPDATE
    SET next_value = public.stock_sku_counter.next_value + 1,
        updated_at = now()
  RETURNING next_value, pad_length
  INTO v_next, v_pad;

  RETURN p_prefix || '-' || lpad(v_next::text, GREATEST(COALESCE(v_pad, 4), 1), '0');
END;
$$;