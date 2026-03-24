
-- RPC: count requisitions that have at least one pending (SOLICITADO) item
-- Used by the Requisições sub-tab badge in Estoque
CREATE OR REPLACE FUNCTION public.count_requisicoes_with_pending_items()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(DISTINCT re.id)::integer, 0)
  FROM requisicoes_estoque re
  INNER JOIN requisicao_estoque_itens rei ON rei.requisicao_id = re.id
  WHERE re.status IN ('SOLICITADA', 'PARCIALMENTE_ATENDIDA')
    AND rei.status = 'SOLICITADO'
    AND re.company_id = (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
$$;
