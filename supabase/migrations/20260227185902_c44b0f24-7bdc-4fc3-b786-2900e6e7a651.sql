
-- 1. SKU counter table
CREATE TABLE public.stock_sku_counter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL DEFAULT 'MP',
  last_number integer NOT NULL DEFAULT 0,
  pad_length integer NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prefix)
);

ALTER TABLE public.stock_sku_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sku counter"
  ON public.stock_sku_counter FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage sku counter"
  ON public.stock_sku_counter FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras') OR has_role(auth.uid(), 'compras_assistente'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras') OR has_role(auth.uid(), 'compras_assistente'));

-- Seed default counter
INSERT INTO public.stock_sku_counter (prefix, last_number, pad_length) VALUES ('MP', 0, 4);

-- 2. Atomic SKU generation function
CREATE OR REPLACE FUNCTION public.generate_next_sku(p_prefix text DEFAULT 'MP')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next integer;
  v_pad integer;
BEGIN
  -- Lock the row and increment atomically
  UPDATE stock_sku_counter
  SET last_number = last_number + 1, updated_at = now()
  WHERE prefix = p_prefix
  RETURNING last_number, pad_length INTO v_next, v_pad;

  -- If no counter exists for this prefix, create one
  IF v_next IS NULL THEN
    INSERT INTO stock_sku_counter (prefix, last_number, pad_length)
    VALUES (p_prefix, 1, 4)
    ON CONFLICT (prefix) DO UPDATE SET last_number = stock_sku_counter.last_number + 1, updated_at = now()
    RETURNING last_number, pad_length INTO v_next, v_pad;
  END IF;

  RETURN p_prefix || '-' || lpad(v_next::text, v_pad, '0');
END;
$$;

-- 3. Add unique constraint on SKU if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'produtos' AND indexname = 'produtos_sku_unique'
  ) THEN
    -- First clean up any empty SKUs to avoid conflicts
    UPDATE produtos SET sku = NULL WHERE sku = '';
    CREATE UNIQUE INDEX produtos_sku_unique ON produtos(sku) WHERE sku IS NOT NULL AND sku != '';
  END IF;
END $$;

-- 4. Sync counter with existing products
UPDATE stock_sku_counter SET last_number = COALESCE(
  (SELECT MAX(
    CASE WHEN sku ~ '^MP-[0-9]+$' THEN substring(sku from '[0-9]+$')::integer ELSE 0 END
  ) FROM produtos WHERE sku IS NOT NULL AND sku != ''), 0
) WHERE prefix = 'MP';
