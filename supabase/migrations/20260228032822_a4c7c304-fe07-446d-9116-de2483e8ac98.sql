
-- Purchase Orders (unified: FORNECEDOR, MERCADO, SAZONAL)
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'MERCADO' CHECK (type IN ('FORNECEDOR', 'MERCADO', 'SAZONAL')),
  priority TEXT NOT NULL DEFAULT 'MEDIA' CHECK (priority IN ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE')),
  category TEXT NOT NULL DEFAULT '',
  supplier_name TEXT,
  payment_type TEXT,
  need_by_date DATE,
  delivery_forecast_date DATE,
  responsible_user_id UUID,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_RECEIVING', 'PARTIAL', 'COMPLETED', 'CANCELLED')),
  total_estimated NUMERIC NOT NULL DEFAULT 0,
  total_confirmed NUMERIC NOT NULL DEFAULT 0,
  concluded_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  stock_item_id UUID REFERENCES public.produtos(id),
  name_snapshot TEXT NOT NULL,
  unit_snapshot TEXT NOT NULL DEFAULT 'UN',
  estimated_unit_value NUMERIC NOT NULL DEFAULT 0,
  qty_requested NUMERIC NOT NULL DEFAULT 0,
  qty_received NUMERIC NOT NULL DEFAULT 0,
  received_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (received_status IN ('PENDING', 'RECEIVED', 'NOT_DELIVERED')),
  not_delivered_reason TEXT,
  received_at TIMESTAMPTZ,
  received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX idx_purchase_orders_created_by ON public.purchase_orders(created_by);
CREATE INDEX idx_purchase_orders_responsible ON public.purchase_orders(responsible_user_id);
CREATE INDEX idx_purchase_order_items_order_id ON public.purchase_order_items(order_id);

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_orders
CREATE POLICY "Authenticated users can read purchase_orders"
  ON public.purchase_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert purchase_orders"
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated users can update purchase_orders"
  ON public.purchase_orders FOR UPDATE TO authenticated USING (true);

-- RLS Policies for purchase_order_items
CREATE POLICY "Authenticated users can read purchase_order_items"
  ON public.purchase_order_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert purchase_order_items"
  ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update purchase_order_items"
  ON public.purchase_order_items FOR UPDATE TO authenticated USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
