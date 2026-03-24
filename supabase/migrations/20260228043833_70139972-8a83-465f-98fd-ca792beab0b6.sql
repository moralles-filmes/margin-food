
-- ==============================
-- 1. purchase_reminders
-- ==============================
CREATE TABLE public.purchase_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon..6=Sun
  recurrence TEXT NOT NULL DEFAULT 'WEEKLY',
  active BOOLEAN NOT NULL DEFAULT true,
  type_default TEXT DEFAULT 'FORNECEDOR',
  category_ids TEXT[] DEFAULT '{}',
  item_ids UUID[] DEFAULT '{}',
  supplier_id TEXT DEFAULT NULL,
  payment_type TEXT DEFAULT NULL,
  need_by_offset_days INT DEFAULT 0,
  delivery_forecast_offset_days INT DEFAULT NULL,
  responsible_user_ids UUID[] DEFAULT '{}',
  notes_template TEXT DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reminders"
  ON public.purchase_reminders FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert reminders"
  ON public.purchase_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update reminders"
  ON public.purchase_reminders FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete reminders"
  ON public.purchase_reminders FOR DELETE
  TO authenticated USING (true);

-- ==============================
-- 2. supplier_item_prices
-- ==============================
CREATE TABLE public.supplier_item_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.produtos(id),
  purchase_unit TEXT NOT NULL DEFAULT 'UN',
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual'
);

ALTER TABLE public.supplier_item_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read supplier prices"
  ON public.supplier_item_prices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert supplier prices"
  ON public.supplier_item_prices FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update supplier prices"
  ON public.supplier_item_prices FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete supplier prices"
  ON public.supplier_item_prices FOR DELETE
  TO authenticated USING (true);

CREATE UNIQUE INDEX idx_supplier_item_unique ON public.supplier_item_prices (supplier_id, stock_item_id);
