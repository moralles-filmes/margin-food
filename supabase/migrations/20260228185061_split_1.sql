CREATE OR REPLACE FUNCTION public.list_solic_compra_mercado_cursor(
  p_limit int DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_prioridade text DEFAULT NULL,
  p_solicitante uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(
  id uuid, titulo text, tipo text, solicitante_user_id text,
  responsavel_user_id text, prioridade text, data_necessidade text,
  status text, observacoes text, total_estimado numeric, total_real numeric,
  created_at timestamptz, updated_at timestamptz,
  has_more boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(COALESCE(p_limit, 50), 200);
BEGIN
  IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id, s.titulo, s.tipo, s.solicitante_user_id,
      s.responsavel_user_id, s.prioridade, s.data_necessidade,
      s.status, s.observacoes, s.total_estimado, s.total_real,
      s.created_at, s.updated_at
    FROM solic_compra_mercado s
    WHERE
      (p_status IS NULL OR s.status = p_status)
      AND (p_prioridade IS NULL OR s.prioridade = p_prioridade)
      AND (p_solicitante IS NULL OR s.solicitante_user_id = p_solicitante::text)
      AND (p_search IS NULL OR s.titulo ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR s.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR s.created_at::date <= p_date_to)
      AND (
        p_cursor_created_at IS NULL
        OR (s.created_at, s.id) < (p_cursor_created_at, COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    f.id, f.titulo, f.tipo, f.solicitante_user_id,
    f.responsavel_user_id, f.prioridade, f.data_necessidade,
    f.status, f.observacoes, f.total_estimado, f.total_real,
    f.created_at, f.updated_at,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM filtered f
  LIMIT v_limit;
END;
$function$;