-- Bug: filtro "Sem categoria" (Contas a Pagar/Receber, Livro Razao, alerta do
-- dashboard) checava so categoria_id IS NULL, sem excluir quem tem rateio
-- (categorias na tabela generica fin_lancamento_rateios). Um boleto rateado
-- entre 2+ categorias grava categoria_id=NULL no registro principal e por
-- isso aparecia como "sem categoria" mesmo tendo categorias via rateio.
-- Mesmo padrao ja corrigido em contar_lancamentos_sem_categoria/
-- aplicar_regras_categorizacao/preview_regra_categorizacao, replicado aqui
-- para as 4 RPCs mais novas + get_fin_alertas.
-- Assinaturas nao mudam (so o corpo) — CREATE OR REPLACE sem DROP.

CREATE OR REPLACE FUNCTION public.list_fin_contas_pagar_cursor(
  p_status text DEFAULT NULL::text,
  p_fornecedor text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_data_de date DEFAULT NULL::date,
  p_data_ate date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_pagamento,
      c.fornecedor, c.status, c.categoria_id, c.centro_custo_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.aprovado_por, c.aprovado_em, c.valor_pago
    FROM public.fin_contas_pagar c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_fornecedor IS NULL OR c.fornecedor ILIKE '%' || p_fornecedor || '%')
      AND (p_search IS NULL OR c.descricao ILIKE '%' || p_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (
          COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios flr
            WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
          )
        )
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
      AND (
        p_cursor_date IS NULL
        OR c.data_vencimento < p_cursor_date
        OR (c.data_vencimento = p_cursor_date AND c.id < p_cursor_id)
      )
    ORDER BY c.data_vencimento DESC, c.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_fin_contas_receber_cursor(
  p_status text DEFAULT NULL::text,
  p_cliente text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_data_de date DEFAULT NULL::date,
  p_data_ate date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_recebimento,
      c.cliente, c.status, c.categoria_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.valor_recebido
    FROM public.fin_contas_receber c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_cliente IS NULL OR c.cliente ILIKE '%' || p_cliente || '%')
      AND (p_search IS NULL OR c.descricao ILIKE '%' || p_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (
          COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios flr
            WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
          )
        )
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
      AND (
        p_cursor_date IS NULL
        OR c.data_vencimento < p_cursor_date
        OR (c.data_vencimento = p_cursor_date AND c.id < p_cursor_id)
      )
    ORDER BY c.data_vencimento DESC, c.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_fin_contas_receber_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    WITH filtered AS (
      SELECT l.*,
        COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) AS data_ledger
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start)
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
          OR (
            COALESCE(p_sem_categoria, false) AND l.categoria_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.fin_lancamento_rateios flr
              WHERE flr.lancamento_id = l.id AND flr.categoria_id IS NOT NULL
            )
          )
          OR (p_categoria_id IS NOT NULL AND l.categoria_id = p_categoria_id)
        )
        AND (
          p_cursor_date IS NULL
          OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) < p_cursor_date
          OR (COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) = p_cursor_date AND l.id < p_cursor_id)
        )
      ORDER BY data_ledger DESC, l.id DESC
      LIMIT _effective_limit
    ),
    saldo_inicial_base AS (
      SELECT COALESCE(SUM(c.saldo_inicial), 0) AS v
      FROM public.fin_contas c
      WHERE c.company_id = v_company
        AND (p_conta_id IS NOT NULL OR c.ativo = true)
        AND (p_conta_id IS NULL OR c.id = p_conta_id)
    ),
    ledger AS (
      SELECT l.id,
        COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) AS data_ledger,
        CASE
          WHEN p_conta_id IS NOT NULL THEN
            CASE
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
              WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
              WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
              ELSE 0
            END
          ELSE
            CASE
              WHEN l.tipo = 'RECEITA' THEN l.valor
              WHEN l.tipo = 'DESPESA' THEN -l.valor
              ELSE 0
            END
        END AS delta
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO')
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_conta_id IS NOT NULL OR l.tipo != 'TRANSFERENCIA')
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
    ),
    running AS (
      SELECT led.id,
        (SELECT v FROM saldo_inicial_base) + SUM(led.delta) OVER (
          ORDER BY led.data_ledger ASC, led.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldo_apos
      FROM ledger led
    )
    SELECT
      f.id, f.tipo, f.valor, f.data_competencia, f.data_vencimento, f.data_pagamento,
      f.data_ledger,
      f.descricao, f.status,
      f.conta_id, f.conta_destino_id, f.categoria_id, f.centro_custo_id,
      f.forma_pagamento, f.recorrente, f.observacoes, f.created_at, f.updated_at,
      f.lancamento_pai_id, f.conciliado, f.referencia_modulo, f.referencia_id,
      f.origem, r.saldo_apos
    FROM filtered f
    LEFT JOIN running r ON r.id = f.id
    ORDER BY f.data_ledger DESC, f.id DESC
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_fin_lancamentos_cursor(date, date, text, text, uuid, text, integer, date, uuid, text, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_transferencia numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'RECEITA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'DESPESA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'TRANSFERENCIA'), 0)
  INTO v_receita, v_despesa, v_transferencia
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status != 'CANCELADO'
    AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
    AND (p_start IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start)
    AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
    AND (p_tipo IS NULL OR l.tipo = p_tipo)
    AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
    AND (p_origem IS NULL OR l.origem = p_origem)
    AND (
      (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
      OR (
        COALESCE(p_sem_categoria, false) AND l.categoria_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios flr
          WHERE flr.lancamento_id = l.id AND flr.categoria_id IS NOT NULL
        )
      )
      OR (p_categoria_id IS NOT NULL AND l.categoria_id = p_categoria_id)
    );

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_fin_lancamentos_totais(date, date, text, uuid, text, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_fin_alertas()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_today date;
  v_in7 date;
  v_month_start date;
  v_month_end date;
  _result json;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:alertas:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_in7 := v_today + 7;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::date;

  SELECT json_build_object(
    'cp_vencidas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencidas_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento < v_today
    ),
    'cp_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'cr_atrasadas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_atrasadas_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento < v_today
    ),
    'cr_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'contas_saldo_negativo', (
      SELECT COALESCE(json_agg(json_build_object('nome', c.nome, 'saldo', sc.saldo)), '[]'::json)
      FROM fin_contas c
      JOIN fin_contas_saldo_cache sc ON sc.conta_id = c.id
      WHERE c.company_id = v_company AND c.ativo = true AND sc.saldo < 0
    ),
    'lancamentos_sem_categoria', (
      SELECT COUNT(*)::int FROM fin_lancamentos fl
      WHERE fl.company_id = v_company AND fl.status IN ('REALIZADO','CONCILIADO')
        AND fl.categoria_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_lancamento_rateios flr
          WHERE flr.lancamento_id = fl.id AND flr.categoria_id IS NOT NULL
        )
    ),
    'lancamentos_sem_conta', (
      SELECT COUNT(*)::int FROM fin_lancamentos
      WHERE company_id = v_company AND status IN ('REALIZADO','CONCILIADO') AND conta_id IS NULL AND tipo != 'TRANSFERENCIA'
    ),
    'recorrencias_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'livro_razao'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_lancamentos p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_lancamentos ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_competencia >= v_month_start AND ch.data_competencia < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cp_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_pagar'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_pagar p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_pagar ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cr_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_receber'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_receber p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_receber ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_alertas() TO authenticated;

-- DO-block: forca resolucao de colunas no db push (regra CLAUDE.md) para o
-- novo NOT EXISTS contra fin_lancamento_rateios nas 4 primeiras funcoes.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM 1 FROM public.fin_contas_pagar c
  WHERE c.company_id = v_sentinel
    AND c.categoria_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
    )
  LIMIT 1;

  PERFORM 1 FROM public.fin_contas_receber c
  WHERE c.company_id = v_sentinel
    AND c.categoria_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
    )
  LIMIT 1;

  PERFORM 1 FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel
    AND l.categoria_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = l.id AND flr.categoria_id IS NOT NULL
    )
  LIMIT 1;
END $$;
