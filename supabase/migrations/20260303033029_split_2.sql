CREATE OR REPLACE FUNCTION public.get_supplier_ranking(
  p_stock_item_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_sort text DEFAULT 'cheapest'
)
RETURNS TABLE(
  supplier_id text, supplier_uuid uuid, supplier_name text,
  avg_unit_cost numeric, min_unit_cost numeric, max_unit_cost numeric,
  last_price numeric, last_updated_at timestamptz,
  items_count bigint, rank_position bigint, has_more boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limit INT := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid := assert_tenant();
BEGIN
  IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      sip.supplier_id AS sid,
      sip.supplier_uuid AS suuid,
      COALESCE(s.name, sip.supplier_id) AS sname,
      sip.unit_cost,
      sip.last_updated_at AS lua,
      sip.stock_item_id
    FROM supplier_item_prices sip
    LEFT JOIN suppliers s ON s.id = sip.supplier_uuid AND s.company_id = v_company
    WHERE
      sip.company_id = v_company
      AND (p_stock_item_id IS NULL OR sip.stock_item_id = p_stock_item_id)
      AND (p_category IS NULL OR EXISTS (
        SELECT 1 FROM produtos p WHERE p.id = sip.stock_item_id AND p.categoria = p_category AND p.company_id = v_company
      ))
  ),
  agg AS (
    SELECT
      b.sid, b.suuid, b.sname,
      ROUND(AVG(b.unit_cost)::numeric, 4) AS avg_cost,
      ROUND(MIN(b.unit_cost)::numeric, 4) AS min_cost,
      ROUND(MAX(b.unit_cost)::numeric, 4) AS max_cost,
      COUNT(DISTINCT b.stock_item_id) AS cnt,
      MAX(b.lua) AS last_ua
    FROM base b
    GROUP BY b.sid, b.suuid, b.sname
  ),
  ranked AS (
    SELECT a.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort = 'cheapest' THEN a.avg_cost END ASC,
          CASE WHEN p_sort = 'expensive' THEN a.avg_cost END DESC,
          a.sname ASC
      ) AS rn
    FROM agg a
  ),
  with_last AS (
    SELECT r.*,
      (SELECT b2.unit_cost FROM base b2 WHERE b2.sid = r.sid ORDER BY b2.lua DESC LIMIT 1) AS lp
    FROM ranked r
    WHERE r.rn > p_offset
    ORDER BY r.rn
    LIMIT v_limit + 1
  )
  SELECT
    wl.sid, wl.suuid, wl.sname,
    wl.avg_cost, wl.min_cost, wl.max_cost, wl.lp, wl.last_ua,
    wl.cnt, wl.rn,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM with_last wl
  LIMIT v_limit;
END;
$function$;

-- ============================================================
-- C4) purchase_reminders — fix SELECT USING(true)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read reminders" ON public.purchase_reminders;
CREATE POLICY "purchases:read reminders"
  ON public.purchase_reminders FOR SELECT TO authenticated
  USING (company_id = get_current_company_id());

-- ============================================================
-- C5) Add company_id filter to SELECT policies on 9 tables
-- ============================================================

-- purchase_requisitions
DROP POLICY IF EXISTS "purchases:read requisitions" ON public.purchase_requisitions;
CREATE POLICY "purchases:read requisitions"
  ON public.purchase_requisitions FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- purchase_requisition_items
DROP POLICY IF EXISTS "purchases:read req_items" ON public.purchase_requisition_items;
CREATE POLICY "purchases:read req_items"
  ON public.purchase_requisition_items FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- purchase_requisition_audit
DROP POLICY IF EXISTS "purchases:read req_audit" ON public.purchase_requisition_audit;
CREATE POLICY "purchases:read req_audit"
  ON public.purchase_requisition_audit FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- aprovacoes_solic_compra_mercado
DROP POLICY IF EXISTS "purchases:read aprovacoes" ON public.aprovacoes_solic_compra_mercado;
CREATE POLICY "purchases:read aprovacoes"
  ON public.aprovacoes_solic_compra_mercado FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- confirmacoes_recebimento
DROP POLICY IF EXISTS "purchases:read confirmacoes" ON public.confirmacoes_recebimento;
CREATE POLICY "purchases:read confirmacoes"
  ON public.confirmacoes_recebimento FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- recebimentos
DROP POLICY IF EXISTS "purchases:read recebimentos" ON public.recebimentos;
CREATE POLICY "purchases:read recebimentos"
  ON public.recebimentos FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- recebimento_itens
DROP POLICY IF EXISTS "purchases:read receb_itens" ON public.recebimento_itens;
CREATE POLICY "purchases:read receb_itens"
  ON public.recebimento_itens FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- purchase_ignored_rules
DROP POLICY IF EXISTS "purchases:read ignored_rules" ON public.purchase_ignored_rules;
CREATE POLICY "purchases:read ignored_rules"
  ON public.purchase_ignored_rules FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

-- solic_compra_mercado — tighten both SELECT policies
DROP POLICY IF EXISTS "purchases:read solic_mercado" ON public.solic_compra_mercado;
CREATE POLICY "purchases:read solic_mercado"
  ON public.solic_compra_mercado FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'purchases:read'));

DROP POLICY IF EXISTS "Solicitantes can read own solic_mercado" ON public.solic_compra_mercado;
CREATE POLICY "Solicitantes can read own solic_mercado"
  ON public.solic_compra_mercado FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND solicitante_user_id = auth.uid());

-- ============================================================
-- FORCE RLS on all 13 Compras tables
-- ============================================================
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_reminders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_ignored_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes_solic_compra_mercado FORCE ROW LEVEL SECURITY;
ALTER TABLE public.confirmacoes_recebimento FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_itens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solic_compra_mercado FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_item_prices FORCE ROW LEVEL SECURITY;