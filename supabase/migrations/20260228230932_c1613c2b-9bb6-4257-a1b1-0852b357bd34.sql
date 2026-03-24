
-- =====================================================
-- PLANNING PHASE 1: Table + RLS + RPC
-- =====================================================

-- 1) CREATE TABLE planning_metas_compra
CREATE TABLE IF NOT EXISTS public.planning_metas_compra (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    categoria text NOT NULL,
    target_value numeric(12, 2) NOT NULL CHECK (target_value >= 0),
    alerta_amarelo_percent numeric(5,2) NOT NULL DEFAULT 85,
    alerta_vermelho_percent numeric(5,2) NOT NULL DEFAULT 100,
    ativo boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid NOT NULL DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (year, month, categoria)
);

-- 2) INDEXES
CREATE INDEX IF NOT EXISTS idx_planning_period ON public.planning_metas_compra (year, month);
CREATE INDEX IF NOT EXISTS idx_planning_categoria ON public.planning_metas_compra (categoria);
CREATE INDEX IF NOT EXISTS idx_planning_updated ON public.planning_metas_compra (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_planning_ativo ON public.planning_metas_compra (ativo) WHERE ativo = true;

-- 3) TRIGGERS
DROP TRIGGER IF EXISTS update_updated_at ON public.planning_metas_compra;
CREATE TRIGGER update_updated_at
  BEFORE UPDATE ON public.planning_metas_compra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS audit_planning_metas ON public.planning_metas_compra;
CREATE TRIGGER audit_planning_metas
  AFTER INSERT OR UPDATE OR DELETE ON public.planning_metas_compra
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('planning', 'planning_metas_compra');

-- 4) RLS
ALTER TABLE public.planning_metas_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planning_select" ON public.planning_metas_compra;
CREATE POLICY "planning_select" ON public.planning_metas_compra
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'planning:read'));

DROP POLICY IF EXISTS "planning_insert" ON public.planning_metas_compra;
CREATE POLICY "planning_insert" ON public.planning_metas_compra
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'planning:manage') AND created_by = auth.uid());

DROP POLICY IF EXISTS "planning_update" ON public.planning_metas_compra;
CREATE POLICY "planning_update" ON public.planning_metas_compra
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'planning:manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'planning:manage'));

DROP POLICY IF EXISTS "planning_delete" ON public.planning_metas_compra;
CREATE POLICY "planning_delete" ON public.planning_metas_compra
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'planning:manage'));

-- 5) INDEX on purchase_order_items for RPC performance
CREATE INDEX IF NOT EXISTS idx_poi_received_period 
  ON public.purchase_order_items (received_at, received_status) 
  WHERE received_status = 'RECEIVED' AND qty_received > 0;

-- 6) RPC: get_planning_spend_summary
CREATE OR REPLACE FUNCTION public.get_planning_spend_summary(
  p_year int,
  p_month int,
  p_source text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date date;
  v_end_date date;
  v_metas jsonb;
  v_realizado jsonb;
  v_realizado_total numeric;
  v_comparativo jsonb;
  v_weekly jsonb;
BEGIN
  -- Guard
  IF NOT has_permission(auth.uid(), 'planning:read') THEN
    RAISE EXCEPTION 'Sem permissão (planning:read).';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (date_trunc('month', v_start_date) + interval '1 month' - interval '1 day')::date;

  -- Metas do mês
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pm.id,
    'categoria', pm.categoria,
    'target_value', pm.target_value,
    'alerta_amarelo_percent', pm.alerta_amarelo_percent,
    'alerta_vermelho_percent', pm.alerta_vermelho_percent
  )), '[]'::jsonb)
  INTO v_metas
  FROM planning_metas_compra pm
  WHERE pm.year = p_year AND pm.month = p_month AND pm.ativo = true;

  -- Realizado por categoria (fonte canônica: purchase_order_items recebidos)
  -- Mesma fórmula de get_relatorios_compras
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      poi.received_at
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE poi.received_at::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
  ),
  cat_totals AS (
    SELECT cat, ROUND(SUM(item_value)::numeric, 2) AS spent_value
    FROM received_items
    GROUP BY cat
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'spent_value', spent_value)), '[]'::jsonb),
    COALESCE(SUM(spent_value), 0)
  INTO v_realizado, v_realizado_total
  FROM cat_totals
  WHERE (p_categoria IS NULL OR cat = p_categoria);

  -- Weekly breakdown (W1-W5 fixed blocks)
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      EXTRACT(DAY FROM poi.received_at)::int AS day_num
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE poi.received_at::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND (p_categoria IS NULL OR COALESCE(prod.categoria, 'Sem Categoria') = p_categoria)
  ),
  weekly AS (
    SELECT
      CASE
        WHEN day_num <= 7 THEN 'W1'
        WHEN day_num <= 14 THEN 'W2'
        WHEN day_num <= 21 THEN 'W3'
        WHEN day_num <= 28 THEN 'W4'
        ELSE 'W5'
      END AS week_label,
      ROUND(SUM(item_value)::numeric, 2) AS total
    FROM received_items
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_object_agg(week_label, total), '{}'::jsonb)
  INTO v_weekly
  FROM weekly;

  -- Comparativo metas vs realizado
  WITH all_cats AS (
    SELECT categoria AS cat, target_value, alerta_amarelo_percent, alerta_vermelho_percent
    FROM planning_metas_compra
    WHERE year = p_year AND month = p_month AND ativo = true
  ),
  cat_spent AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      ROUND(SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value))::numeric, 2) AS spent
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE poi.received_at::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0 AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'categoria', COALESCE(ac.cat, cs.cat),
    'target_value', COALESCE(ac.target_value, 0),
    'spent_value', COALESCE(cs.spent, 0),
    'delta_value', COALESCE(ac.target_value, 0) - COALESCE(cs.spent, 0),
    'percent_of_target', CASE 
      WHEN COALESCE(ac.target_value, 0) > 0 
      THEN ROUND((COALESCE(cs.spent, 0) / ac.target_value * 100)::numeric, 2) 
      ELSE 0 END
  )), '[]'::jsonb)
  INTO v_comparativo
  FROM all_cats ac
  FULL OUTER JOIN cat_spent cs ON ac.cat = cs.cat
  WHERE (p_categoria IS NULL OR COALESCE(ac.cat, cs.cat) = p_categoria);

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', p_year, 'month', p_month, 'start_date', v_start_date, 'end_date', v_end_date),
    'metas', v_metas,
    'realizado_por_categoria', v_realizado,
    'realizado_total', COALESCE(v_realizado_total, 0),
    'weekly_breakdown', v_weekly,
    'comparativo', v_comparativo,
    'computed_at', now()
  );
END;
$function$;
