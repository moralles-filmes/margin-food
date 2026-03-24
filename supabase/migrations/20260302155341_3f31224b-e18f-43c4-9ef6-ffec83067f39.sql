
-- ═══ P3-A: cmv_cache table ═══
CREATE TABLE public.cmv_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  cache_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_by uuid
);

CREATE UNIQUE INDEX idx_cmv_cache_company_key ON public.cmv_cache(company_id, cache_key);
CREATE INDEX idx_cmv_cache_company_expires ON public.cmv_cache(company_id, expires_at);

ALTER TABLE public.cmv_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmv_cache_select" ON public.cmv_cache FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['cmv:categoria:view','system:global:manage']));

CREATE POLICY "cmv_cache_insert" ON public.cmv_cache FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['cmv:categoria:view','system:global:manage']));

CREATE POLICY "cmv_cache_update" ON public.cmv_cache FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['cmv:categoria:view','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "cmv_cache_delete" ON public.cmv_cache FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['cmv:categoria:view','system:global:manage']));

-- ═══ P3-B: RPC get_consumo_por_produto ═══
CREATE OR REPLACE FUNCTION public.get_consumo_por_produto(
  p_company_id uuid,
  p_since date,
  p_tipos text[],
  p_produtos uuid[]
)
RETURNS TABLE(
  produto_id uuid,
  consumo_total numeric,
  dias_com_mov bigint,
  ultima_mov date,
  media_diaria numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    me.produto_id,
    COALESCE(SUM(ABS(me.quantidade)), 0) AS consumo_total,
    COUNT(DISTINCT me.data) AS dias_com_mov,
    MAX(me.data) AS ultima_mov,
    CASE
      WHEN (CURRENT_DATE - p_since) > 0
      THEN COALESCE(SUM(ABS(me.quantidade)), 0) / (CURRENT_DATE - p_since)
      ELSE 0
    END AS media_diaria
  FROM movimentacoes_estoque me
  WHERE me.company_id = p_company_id
    AND me.status = 'ATIVO'
    AND me.data >= p_since
    AND me.tipo = ANY(p_tipos)
    AND me.produto_id = ANY(p_produtos)
  GROUP BY me.produto_id
$$;

-- ═══ P3-B: Indexes for ledger performance ═══
CREATE INDEX IF NOT EXISTS idx_mov_estoque_company_produto_data_ativo
  ON public.movimentacoes_estoque(company_id, produto_id, data)
  WHERE status = 'ATIVO';

CREATE INDEX IF NOT EXISTS idx_mov_estoque_company_data_ativo
  ON public.movimentacoes_estoque(company_id, data)
  WHERE status = 'ATIVO';

CREATE INDEX IF NOT EXISTS idx_mov_estoque_company_tipo_data_ativo
  ON public.movimentacoes_estoque(company_id, tipo, data)
  WHERE status = 'ATIVO';
