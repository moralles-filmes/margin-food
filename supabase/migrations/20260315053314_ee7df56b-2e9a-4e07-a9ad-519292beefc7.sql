
-- Consolidated recorrencias listing RPC with cursor pagination
CREATE OR REPLACE FUNCTION public._guarded_list_recorrencias(
  p_cursor_data timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_mes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_mes text;
  v_inicio date;
  v_fim date;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:recorrencias:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Resolve month
  v_mes := COALESCE(p_mes, to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'));
  v_inicio := (v_mes || '-01')::date;
  v_fim := (v_inicio + interval '1 month')::date;

  WITH all_recorrencias AS (
    -- 1) fin_lancamentos recorrentes
    SELECT
      l.id,
      'lancamento'::text AS origem,
      'lancamento:' || l.id::text AS chave_unica,
      l.descricao,
      l.tipo,
      l.status,
      l.valor,
      COALESCE((l.recorrencia_config->>'dia_vencimento')::int, EXTRACT(DAY FROM l.data_competencia)::int) AS dia_vencimento,
      COALESCE(l.recorrencia_config->>'frequencia', 'mensal') AS frequencia,
      l.recorrente AS ativo,
      l.data_competencia::timestamptz AS proxima_data,
      (SELECT COUNT(*) FROM fin_lancamentos ch
       WHERE ch.lancamento_pai_id = l.id
         AND ch.data_competencia >= v_inicio
         AND ch.data_competencia < v_fim) AS filhos_mes,
      EXISTS(
        SELECT 1 FROM fin_lancamentos ch
        WHERE ch.lancamento_pai_id = l.id
          AND ch.data_competencia >= v_inicio
          AND ch.data_competencia < v_fim
      ) AS gerado_mes,
      l.updated_at,
      COALESCE((l.recorrencia_config->>'parcelas_geradas')::int, 0) AS parcelas_geradas,
      COALESCE((l.recorrencia_config->>'parcelas')::int, 0) AS parcelas_max,
      l.recorrencia_config
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.recorrente = true
      AND l.lancamento_pai_id IS NULL

    UNION ALL

    -- 2) fin_contas_pagar recorrentes
    SELECT
      cp.id,
      'conta_pagar'::text AS origem,
      'conta_pagar:' || cp.id::text AS chave_unica,
      cp.descricao,
      'DESPESA'::text AS tipo,
      cp.status,
      cp.valor,
      COALESCE((cp.recorrencia_config->>'dia_vencimento')::int, EXTRACT(DAY FROM cp.data_vencimento)::int) AS dia_vencimento,
      COALESCE(cp.recorrencia_config->>'frequencia', 'mensal') AS frequencia,
      cp.recorrente AS ativo,
      cp.data_vencimento::timestamptz AS proxima_data,
      (SELECT COUNT(*) FROM fin_contas_pagar ch
       WHERE ch.lancamento_pai_id = cp.id
         AND ch.data_vencimento >= v_inicio
         AND ch.data_vencimento < v_fim) AS filhos_mes,
      EXISTS(
        SELECT 1 FROM fin_contas_pagar ch
        WHERE ch.lancamento_pai_id = cp.id
          AND ch.data_vencimento >= v_inicio
          AND ch.data_vencimento < v_fim
      ) AS gerado_mes,
      cp.updated_at,
      COALESCE((cp.recorrencia_config->>'parcelas_geradas')::int, 0) AS parcelas_geradas,
      COALESCE((cp.recorrencia_config->>'parcelas')::int, 0) AS parcelas_max,
      cp.recorrencia_config
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.recorrente = true
      AND cp.lancamento_pai_id IS NULL

    UNION ALL

    -- 3) fin_contas_receber recorrentes
    SELECT
      cr.id,
      'conta_receber'::text AS origem,
      'conta_receber:' || cr.id::text AS chave_unica,
      cr.descricao,
      'RECEITA'::text AS tipo,
      cr.status,
      cr.valor,
      COALESCE((cr.recorrencia_config->>'dia_vencimento')::int, EXTRACT(DAY FROM cr.data_vencimento)::int) AS dia_vencimento,
      COALESCE(cr.recorrencia_config->>'frequencia', 'mensal') AS frequencia,
      cr.recorrente AS ativo,
      cr.data_vencimento::timestamptz AS proxima_data,
      (SELECT COUNT(*) FROM fin_contas_receber ch
       WHERE ch.lancamento_pai_id = cr.id
         AND ch.data_vencimento >= v_inicio
         AND ch.data_vencimento < v_fim) AS filhos_mes,
      EXISTS(
        SELECT 1 FROM fin_contas_receber ch
        WHERE ch.lancamento_pai_id = cr.id
          AND ch.data_vencimento >= v_inicio
          AND ch.data_vencimento < v_fim
      ) AS gerado_mes,
      cr.updated_at,
      COALESCE((cr.recorrencia_config->>'parcelas_geradas')::int, 0) AS parcelas_geradas,
      COALESCE((cr.recorrencia_config->>'parcelas')::int, 0) AS parcelas_max,
      cr.recorrencia_config
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.recorrente = true
      AND cr.lancamento_pai_id IS NULL
  ),
  filtered AS (
    SELECT *
    FROM all_recorrencias r
    WHERE (p_cursor_data IS NULL OR p_cursor_id IS NULL)
       OR (r.proxima_data, r.id) < (p_cursor_data, p_cursor_id)
    ORDER BY r.proxima_data DESC, r.id DESC
    LIMIT p_limit + 1
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'origem', f.origem,
        'chave_unica', f.chave_unica,
        'descricao', f.descricao,
        'tipo', f.tipo,
        'status', f.status,
        'valor', f.valor,
        'dia_vencimento', f.dia_vencimento,
        'frequencia', f.frequencia,
        'ativo', f.ativo,
        'proxima_data', f.proxima_data,
        'filhos_mes', f.filhos_mes,
        'gerado_mes', f.gerado_mes,
        'updated_at', f.updated_at,
        'parcelas_geradas', f.parcelas_geradas,
        'parcelas_max', f.parcelas_max
      ) ORDER BY f.proxima_data DESC, f.id DESC)
      FROM (SELECT * FROM filtered LIMIT p_limit) f
    ), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) FROM filtered) > p_limit,
    'next_cursor_data', (
      SELECT f.proxima_data FROM (SELECT * FROM filtered LIMIT p_limit) f
      ORDER BY f.proxima_data ASC, f.id ASC LIMIT 1
    ),
    'next_cursor_id', (
      SELECT f.id FROM (SELECT * FROM filtered LIMIT p_limit) f
      ORDER BY f.proxima_data ASC, f.id ASC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_list_recorrencias(timestamptz, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_list_recorrencias(timestamptz, uuid, integer, text) TO authenticated;
