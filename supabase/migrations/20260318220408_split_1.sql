CREATE OR REPLACE FUNCTION public.compute_requisicao_status_agregado(p_requisicao_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_items int;
  atendidos int;
  recusados int;
  solicitados int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'ATENDIDO'),
    count(*) FILTER (WHERE status = 'RECUSADO'),
    count(*) FILTER (WHERE status = 'SOLICITADO')
  INTO total_items, atendidos, recusados, solicitados
  FROM public.requisicao_estoque_itens
  WHERE requisicao_id = p_requisicao_id;

  IF total_items = 0 THEN RETURN 'SOLICITADA'; END IF;
  IF recusados = total_items THEN RETURN 'NEGADA'; END IF;
  IF atendidos = total_items THEN RETURN 'ATENDIDA'; END IF;
  IF solicitados = total_items THEN RETURN 'SOLICITADA'; END IF;
  IF atendidos > 0 AND recusados > 0 AND solicitados = 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF atendidos > 0 AND solicitados > 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF recusados > 0 AND solicitados > 0 THEN RETURN 'SOLICITADA'; END IF;

  RETURN 'SOLICITADA';
END;
$$;

-- Add PARCIALMENTE_ATENDIDA to status display
COMMENT ON FUNCTION public.compute_requisicao_status_agregado IS 'Computes aggregated requisition status from item-level statuses. Returns: SOLICITADA, ATENDIDA, NEGADA, or PARCIALMENTE_ATENDIDA';