-- ============================================================================
-- Financeiro › Categorização: regras automáticas que de fato aplicam.
--
-- Checkup de 2026-10-10 (produção):
--  * "Aplicar Regras" nunca concluía: trg_validate_fin_lancamento_update exige
--    justificativa_edicao para trocar a categoria de lançamento REALIZADO, e o
--    UPDATE da RPC não a enviava — a primeira regra que casasse desfazia tudo.
--  * Transferência entrava na contagem, na prévia, na aplicação e no alerta do
--    Dashboard, mas por desenho nunca leva categoria (a conciliação também a
--    dispensa). Ren Sushi mostrava 30 pendentes; 29 eram transferências.
--  * A regra não conferia o tipo (categoria de despesa caía em receita) nem a
--    empresa da categoria/centro (a FK não confere), e "Contém"/"Exato" não
--    ignoravam acento e liam % e _ como curinga.
--
-- Mudanças:
--  1-3. contar/aplicar/prévia reescritas com search_path vazio: transferência
--       fora; categoria ativa da empresa e do mesmo tipo do lançamento; centro de
--       custo de outra empresa ignorado; casamento sem acento com % e _ literais;
--       justificativa automática no UPDATE. A aplicação só mexe em lançamento sem
--       linha de rateio (com rateio, a categoria do cabeçalho é ignorada nos
--       relatórios). A prévia ganha p_categoria_id (DEFAULT NULL: cliente antigo
--       com 2 argumentos continua funcionando) — assinatura nova exige DROP da
--       antiga; CREATE OR REPLACE deixa a migration reaplicável.
--  4.   get_fin_alertas: só "lancamentos_sem_categoria" deixa de contar
--       transferência. Demais chaves com o corpo vivo, sem alteração.
--  5-6. Livro Razão (list_fin_lancamentos_cursor de 12 argumentos e
--       get_fin_lancamentos_totais): o filtro "Sem categoria" deixa de trazer
--       transferência, para bater com a contagem da Categorização. Corpos vivos,
--       só o ramo v_sem muda.
--
-- RLS, grants de tabela e permissões não mudam. CREATE OR REPLACE preserva o
-- ACL das funções existentes. Reversão: docs/categorizacao-regras/reversao.sql.
-- ============================================================================

/* ─────────────────────────────────────────────────────────────────────────
   1. contar_lancamentos_sem_categoria
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.contar_lancamentos_sem_categoria()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_count int;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:view',
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Transferência nunca leva categoria: não é pendência.
  SELECT count(*)::int INTO v_count
  FROM public.fin_lancamentos fl
  WHERE fl.company_id = v_company_id
    AND fl.categoria_id IS NULL
    AND fl.status <> 'CANCELADO'
    AND fl.tipo <> 'TRANSFERENCIA'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = fl.id
        AND flr.categoria_id IS NOT NULL
    );

  RETURN v_count;
END;
$function$;

/* ─────────────────────────────────────────────────────────────────────────
   2. aplicar_regras_categorizacao
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.aplicar_regras_categorizacao()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_total int := 0;
  v_categorizados int := 0;
  v_regra record;
  v_match_count int;
  v_padrao text;
  v_padrao_like text;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Mesmo universo de contar_lancamentos_sem_categoria.
  SELECT count(*) INTO v_total
  FROM public.fin_lancamentos fl
  WHERE fl.company_id = v_company_id
    AND fl.categoria_id IS NULL
    AND fl.status <> 'CANCELADO'
    AND fl.tipo <> 'TRANSFERENCIA'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = fl.id
        AND flr.categoria_id IS NOT NULL
    );

  IF v_total = 0 THEN
    RETURN json_build_object('total', 0, 'categorizados', 0);
  END IF;

  -- Só categoria ativa da própria empresa (a FK não confere a empresa); centro de
  -- custo de outra empresa é ignorado e o lançamento mantém o que já tem.
  FOR v_regra IN
    SELECT r.padrao, r.tipo_match, r.categoria_id,
      upper(c.tipo) AS tipo_lancamento,
      cc.id AS centro_custo_id
    FROM public.fin_regras_categorizacao r
    JOIN public.fin_categorias c
      ON c.id = r.categoria_id AND c.company_id = v_company_id AND c.ativo = true
    LEFT JOIN public.fin_centros_custo cc
      ON cc.id = r.centro_custo_id AND cc.company_id = v_company_id
    WHERE r.company_id = v_company_id AND r.ativo = true
    ORDER BY r.prioridade DESC, r.created_at ASC
  LOOP
    -- Sem acento e sem caixa; no "Contém", \ % e _ do padrão valem como texto.
    v_padrao := lower(public.immutable_unaccent(COALESCE(v_regra.padrao, '')));
    v_padrao_like := '%' || replace(replace(replace(v_padrao, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

    WITH matched AS (
      UPDATE public.fin_lancamentos fl
      SET
        categoria_id = v_regra.categoria_id,
        centro_custo_id = COALESCE(v_regra.centro_custo_id, fl.centro_custo_id),
        -- Lançamento REALIZADO só troca categoria com justificativa
        -- (trg_validate_fin_lancamento_update); fica também no histórico de auditoria.
        justificativa_edicao = 'Categorização automática pela regra "' || v_regra.padrao || '"',
        updated_at = now()
      WHERE fl.company_id = v_company_id
        AND fl.categoria_id IS NULL
        AND fl.status <> 'CANCELADO'
        -- Tipo da categoria (despesa/receita) = tipo do lançamento; deixa a transferência de fora.
        AND fl.tipo = v_regra.tipo_lancamento
        -- Com linha de rateio, a categoria do cabeçalho é ignorada nos relatórios.
        AND NOT EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios flr
          WHERE flr.lancamento_id = fl.id
        )
        AND (
          CASE v_regra.tipo_match
            WHEN 'contem' THEN lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) LIKE v_padrao_like ESCAPE E'\\'
            WHEN 'exato'  THEN lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) = v_padrao
            WHEN 'regex'  THEN COALESCE(fl.descricao, '') ~* v_regra.padrao
            ELSE false
          END
        )
      RETURNING fl.id
    )
    SELECT count(*) INTO v_match_count FROM matched;
    v_categorizados := v_categorizados + v_match_count;
  END LOOP;

  RETURN json_build_object('total', v_total, 'categorizados', v_categorizados);
END;
$function$;

/* ─────────────────────────────────────────────────────────────────────────
   3. preview_regra_categorizacao — assinatura nova (p_categoria_id)
   ───────────────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.preview_regra_categorizacao(text, text);

CREATE OR REPLACE FUNCTION public.preview_regra_categorizacao(
  p_padrao text,
  p_tipo_match text DEFAULT 'contem'::text,
  p_categoria_id uuid DEFAULT NULL::uuid
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_result json;
  v_tipo text;
  v_padrao text;
  v_padrao_like text;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:view',
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Com categoria escolhida, só lançamentos do tipo dela, como na aplicação;
  -- categoria inativa ou de outra empresa não casa nada.
  IF p_categoria_id IS NOT NULL THEN
    SELECT upper(c.tipo) INTO v_tipo
    FROM public.fin_categorias c
    WHERE c.id = p_categoria_id AND c.company_id = v_company_id AND c.ativo = true;
    IF v_tipo IS NULL THEN
      RETURN '[]'::json;
    END IF;
  END IF;

  -- Mesmo casamento de aplicar_regras_categorizacao.
  v_padrao := lower(public.immutable_unaccent(COALESCE(p_padrao, '')));
  v_padrao_like := '%' || replace(replace(replace(v_padrao, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  SELECT COALESCE(json_agg(json_build_object(
    'id', sub.id,
    'descricao', sub.descricao,
    'valor', sub.valor,
    'data_competencia', sub.data_competencia::text
  )), '[]'::json) INTO v_result
  FROM (
    SELECT fl.id, fl.descricao, fl.valor, fl.data_competencia
    FROM public.fin_lancamentos fl
    WHERE fl.company_id = v_company_id
      AND fl.categoria_id IS NULL
      AND fl.status <> 'CANCELADO'
      AND fl.tipo <> 'TRANSFERENCIA'
      AND (v_tipo IS NULL OR fl.tipo = v_tipo)
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios flr
        WHERE flr.lancamento_id = fl.id
      )
      AND (
        CASE p_tipo_match
          WHEN 'contem' THEN lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) LIKE v_padrao_like ESCAPE E'\\'
          WHEN 'exato'  THEN lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) = v_padrao
          WHEN 'regex'  THEN COALESCE(fl.descricao, '') ~* p_padrao
          ELSE false
        END
      )
    ORDER BY fl.data_competencia DESC
    LIMIT 20
  ) sub;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_regra_categorizacao(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_regra_categorizacao(text, text, uuid) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   4. get_fin_alertas — corpo vivo; só "lancamentos_sem_categoria" muda
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.get_fin_alertas()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        AND fl.tipo <> 'TRANSFERENCIA'
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
$function$;

/* ─────────────────────────────────────────────────────────────────────────
   5. get_fin_lancamentos_totais — corpo vivo; só o ramo "Sem categoria" muda
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_sem_categoria boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_transferencia numeric;
  v_sem boolean := COALESCE(p_sem_categoria, false);
  v_scope uuid[];
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT v_sem THEN
    WITH RECURSIVE category_scope AS (
      SELECT c.id FROM public.fin_categorias c
      WHERE c.company_id = v_company AND c.id = p_categoria_id
      UNION
      SELECT child.id FROM public.fin_categorias child
      JOIN category_scope scope ON child.parent_id = scope.id
      WHERE child.company_id = v_company
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope FROM category_scope;
  END IF;

  WITH base AS (
    SELECT l.id, l.tipo, l.valor, l.categoria_id,
      EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios flr
        WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
      ) AS tem_rateio
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND (p_start IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start)
      AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_origem IS NULL OR l.origem = p_origem)
  ),
  scoped AS (
    SELECT base.tipo,
      CASE
        WHEN NOT v_sem AND v_scope IS NULL THEN base.valor
        WHEN base.tem_rateio THEN (
          SELECT COALESCE(SUM(flr.valor), 0) FROM public.fin_lancamento_rateios flr
          WHERE flr.lancamento_id = base.id AND flr.company_id = v_company
            AND ((v_sem AND flr.categoria_id IS NULL) OR flr.categoria_id = ANY(v_scope))
        )
        WHEN v_sem AND base.categoria_id IS NULL AND base.tipo <> 'TRANSFERENCIA' THEN base.valor
        WHEN base.categoria_id = ANY(v_scope) THEN base.valor
        ELSE 0
      END AS valor
    FROM base
  )
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'TRANSFERENCIA'), 0)
  INTO v_receita, v_despesa, v_transferencia
  FROM scoped;

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

/* ─────────────────────────────────────────────────────────────────────────
   6. list_fin_lancamentos_cursor (12 argumentos) — corpo vivo; só o ramo "Sem categoria" muda
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_cursor_date date DEFAULT NULL::date, p_cursor_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_sem_categoria boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
  v_sem boolean := COALESCE(p_sem_categoria, false);
  v_scope uuid[];
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  IF p_categoria_id IS NOT NULL AND NOT v_sem THEN
    WITH RECURSIVE category_scope AS (
      SELECT c.id FROM public.fin_categorias c
      WHERE c.company_id = v_company AND c.id = p_categoria_id
      UNION
      SELECT child.id FROM public.fin_categorias child
      JOIN category_scope scope ON child.parent_id = scope.id
      WHERE child.company_id = v_company
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope FROM category_scope;
  END IF;

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    WITH filtered AS (
      SELECT l.*,
        COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) AS data_ledger
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start)
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          (NOT v_sem AND v_scope IS NULL)
          OR (
            v_sem AND l.tipo <> 'TRANSFERENCIA' AND (
              EXISTS (
                SELECT 1 FROM public.fin_lancamento_rateios flr
                WHERE flr.lancamento_id = l.id AND flr.company_id = v_company AND flr.categoria_id IS NULL
              )
              OR (
                l.categoria_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.fin_lancamento_rateios flr
                  WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
                )
              )
            )
          )
          OR (
            v_scope IS NOT NULL AND (
              EXISTS (
                SELECT 1 FROM public.fin_lancamento_rateios flr
                WHERE flr.lancamento_id = l.id AND flr.company_id = v_company AND flr.categoria_id = ANY(v_scope)
              )
              OR (
                l.categoria_id = ANY(v_scope)
                AND NOT EXISTS (
                  SELECT 1 FROM public.fin_lancamento_rateios flr
                  WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
                )
              )
            )
          )
        )
        AND (
          p_cursor_date IS NULL
          OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) < p_cursor_date
          OR (COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) = p_cursor_date AND l.id < p_cursor_id)
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
        COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) AS data_ledger,
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
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
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

/* ─────────────────────────────────────────────────────────────────────────
   Resolução de colunas na aplicação (PL/pgSQL só valida na 1ª execução):
   força os JOINs novos, immutable_unaccent, o ESCAPE e justificativa_edicao.
   ───────────────────────────────────────────────────────────────────────── */
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM 1
  FROM public.fin_regras_categorizacao r
  JOIN public.fin_categorias c
    ON c.id = r.categoria_id AND c.company_id = v_sentinel AND c.ativo = true
  LEFT JOIN public.fin_centros_custo cc
    ON cc.id = r.centro_custo_id AND cc.company_id = v_sentinel
  WHERE r.company_id = v_sentinel AND r.ativo = true AND upper(c.tipo) IS NOT NULL
  LIMIT 1;

  PERFORM 1
  FROM public.fin_lancamentos fl
  WHERE fl.company_id = v_sentinel
    AND fl.categoria_id IS NULL
    AND fl.tipo <> 'TRANSFERENCIA'
    AND fl.justificativa_edicao IS NULL
    AND lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) LIKE '%x%' ESCAPE E'\\'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = fl.id
    )
  LIMIT 1;
END $$;
