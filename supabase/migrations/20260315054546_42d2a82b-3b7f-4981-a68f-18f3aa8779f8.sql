
CREATE OR REPLACE FUNCTION public._guarded_list_fin_audit_logs(
  p_entidade text DEFAULT NULL,
  p_acao text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_dias integer DEFAULT 30,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_desde timestamptz;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:auditoria:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_desde := (now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => p_dias);

  WITH unified_logs AS (
    -- fin_audit_logs
    SELECT
      f.id,
      f.created_at,
      f.acao,
      f.entidade,
      f.entidade_id::text AS entidade_id,
      f.justificativa,
      f.antes,
      f.depois,
      f.user_id,
      'fin_audit_logs'::text AS origem_log,
      NULL::jsonb AS metadata
    FROM fin_audit_logs f
    WHERE f.company_id = v_company_id
      AND f.created_at >= v_desde

    UNION ALL

    -- audit_logs where module = financeiro or entity starts with fin_
    SELECT
      a.id,
      a.created_at,
      a.action AS acao,
      a.entity AS entidade,
      a.entity_id::text AS entidade_id,
      NULL::text AS justificativa,
      a.before AS antes,
      a.after AS depois,
      a.actor_user_id AS user_id,
      'audit_logs'::text AS origem_log,
      a.metadata
    FROM audit_logs a
    WHERE a.company_id = v_company_id
      AND a.created_at >= v_desde
      AND (a.module = 'financeiro' OR a.entity LIKE 'fin_%')
  ),
  filtered AS (
    SELECT
      ul.*,
      p.nome AS user_nome,
      p.email AS user_email
    FROM unified_logs ul
    LEFT JOIN profiles p ON p.id = ul.user_id
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
      AND (p_search IS NULL OR (
        ul.entidade ILIKE '%' || p_search || '%'
        OR ul.acao ILIKE '%' || p_search || '%'
        OR ul.justificativa ILIKE '%' || p_search || '%'
        OR p.nome ILIKE '%' || p_search || '%'
        OR p.email ILIKE '%' || p_search || '%'
        OR ul.entidade_id ILIKE '%' || p_search || '%'
      ))
      AND (
        p_cursor_created_at IS NULL
        OR (ul.created_at, ul.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY ul.created_at DESC, ul.id DESC
    LIMIT p_limit + 1
  ),
  page AS (
    SELECT * FROM filtered LIMIT p_limit
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE) AS total,
      COUNT(*) FILTER (WHERE acao = 'INSERT') AS inserts,
      COUNT(*) FILTER (WHERE acao = 'UPDATE') AS updates,
      COUNT(*) FILTER (WHERE acao = 'DELETE') AS deletes,
      COUNT(DISTINCT user_id) AS usuarios_ativos
    FROM unified_logs ul
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'created_at', pg.created_at,
        'acao', pg.acao,
        'entidade', pg.entidade,
        'entidade_id', pg.entidade_id,
        'justificativa', pg.justificativa,
        'antes', pg.antes,
        'depois', pg.depois,
        'user_id', pg.user_id,
        'user_nome', pg.user_nome,
        'user_email', pg.user_email,
        'origem_log', pg.origem_log,
        'metadata', pg.metadata
      ) ORDER BY pg.created_at DESC, pg.id DESC)
      FROM page pg
    ), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) FROM filtered) > p_limit,
    'next_cursor_created_at', (SELECT created_at FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'next_cursor_id', (SELECT id FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'summary', (SELECT jsonb_build_object(
      'total', total,
      'inserts', inserts,
      'updates', updates,
      'deletes', deletes,
      'usuarios_ativos', usuarios_ativos
    ) FROM summary)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_list_fin_audit_logs(text, text, text, integer, timestamptz, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_list_fin_audit_logs(text, text, text, integer, timestamptz, uuid, integer) TO authenticated;
