-- CMV Financeiro: aplicar a decisão de um boleto às outras parcelas da mesma série.
--
-- Aditiva: uma função interna, uma RPC nova e a lista do CMV passa a informar o
-- tamanho da série (mesma assinatura). Nada do histórico é classificado aqui.
--
-- Série = títulos gerados juntos por "Repetir lançamento". `lancamento_pai_id`
-- sozinho não serve: excluir a 1ª parcela zera o vínculo das demais (é o caso de
-- todas as séries do histórico). As parcelas nascem na mesma transação, então
-- têm `created_at` idêntico; o vínculo de pai, quando existe, também vale.
-- Autor e fornecedor entram como desempate: trocar o fornecedor de uma parcela
-- tira essa parcela da série (erra para o lado de alterar menos).

CREATE OR REPLACE FUNCTION public._fin_cmv_serie(p_company_id uuid, p_conta_pagar_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT cp.id
  FROM public.fin_contas_pagar ref
  JOIN public.fin_contas_pagar cp
    ON cp.company_id = ref.company_id
   AND (
     cp.id = ref.id
     OR (cp.status <> 'CANCELADO' AND (
       (ref.parcela_total > 1
         AND cp.parcela_total = ref.parcela_total
         AND cp.created_at = ref.created_at
         AND cp.created_by IS NOT DISTINCT FROM ref.created_by
         AND cp.supplier_id IS NOT DISTINCT FROM ref.supplier_id
         AND cp.fornecedor IS NOT DISTINCT FROM ref.fornecedor)
       OR cp.lancamento_pai_id = COALESCE(ref.lancamento_pai_id, ref.id)
       OR cp.id = ref.lancamento_pai_id
     ))
   )
  WHERE ref.id = p_conta_pagar_id AND ref.company_id = p_company_id;
$$;

-- Mesmo corpo de antes, com `serie_boletos` em cada item (1 = boleto avulso).
CREATE OR REPLACE FUNCTION public._fin_cmv_lista(
  p_company_id uuid,
  p_inicio date,
  p_fim date,
  p_situacao text,
  p_categoria_id uuid,
  p_limit integer,
  p_offset integer,
  p_so_direto boolean
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE ramo AS (
    SELECT c.id FROM public.fin_categorias c
    WHERE c.company_id = p_company_id AND c.id = p_categoria_id
    UNION
    SELECT c.id FROM public.fin_categorias c
    JOIN ramo r ON c.parent_id = r.id
    WHERE c.company_id = p_company_id
  ),
  filtradas AS MATERIALIZED (
    SELECT l.*, round(l.valor * 100)::bigint AS centavos
    FROM public._fin_cmv_linhas(p_company_id) l
    WHERE CASE p_situacao
        WHEN 'incluido' THEN l.cmv_incluir IS TRUE
        WHEN 'fora' THEN l.cmv_incluir IS FALSE
        WHEN 'pendente' THEN l.cmv_incluir IS NULL
        WHEN 'sem_competencia' THEN l.data_competencia IS NULL
        ELSE true
      END
      AND (p_situacao = 'sem_competencia'
        OR ((p_inicio IS NULL OR l.data_competencia >= p_inicio)
          AND (p_fim IS NULL OR l.data_competencia <= p_fim)
          -- com período informado, boleto sem competência nunca entra
          AND (p_inicio IS NULL AND p_fim IS NULL OR l.data_competencia IS NOT NULL)))
      -- uuid nulo (zeros) = só as linhas SEM categoria
      AND (p_categoria_id IS NULL
        OR (p_categoria_id = '00000000-0000-0000-0000-000000000000'::uuid AND l.categoria_id IS NULL)
        -- "lançado direto": só a própria categoria, sem os descendentes
        OR (p_so_direto AND l.categoria_id = p_categoria_id)
        OR (NOT p_so_direto AND l.categoria_id IN (SELECT id FROM ramo)))
  ),
  pagina AS (
    SELECT f.*, cp.descricao, cp.fornecedor, cp.data_vencimento, cp.status,
      cp.updated_at, round(cp.valor * 100)::bigint AS titulo_centavos, cat.nome AS categoria_nome
    FROM filtradas f
    JOIN public.fin_contas_pagar cp ON cp.id = f.conta_pagar_id AND cp.company_id = p_company_id
    LEFT JOIN public.fin_categorias cat ON cat.id = f.categoria_id AND cat.company_id = p_company_id
    ORDER BY f.data_competencia DESC NULLS FIRST, cp.descricao, f.conta_pagar_id, f.rateio_id NULLS FIRST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total_linhas', (SELECT count(*) FROM filtradas),
    'total_titulos', (SELECT count(DISTINCT conta_pagar_id) FROM filtradas),
    'total_centavos', (SELECT COALESCE(sum(centavos), 0)::bigint FROM filtradas),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'conta_pagar_id', p.conta_pagar_id,
        'rateio_id', p.rateio_id,
        'descricao', p.descricao,
        'fornecedor', p.fornecedor,
        'data_competencia', p.data_competencia,
        'data_vencimento', p.data_vencimento,
        'status', p.status,
        'categoria_id', p.categoria_id,
        'categoria_nome', p.categoria_nome,
        'titulo_centavos', p.titulo_centavos,
        'linha_centavos', p.centavos,
        'cmv_incluir', p.cmv_incluir,
        'updated_at', p.updated_at,
        'serie_boletos', (SELECT count(*) FROM public._fin_cmv_serie(p_company_id, p.conta_pagar_id))
      ) ORDER BY p.data_competencia DESC NULLS FIRST, p.descricao, p.conta_pagar_id, p.rateio_id NULLS FIRST)
      FROM pagina p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_serie(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_lista(uuid, date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

-- Copia a decisão do boleto de referência para as outras parcelas da série,
-- categoria por categoria: em cada parcela, a linha (rateio, ou o título quando
-- não há rateio) recebe a resposta que a referência deu para a MESMA categoria.
-- Categoria sem resposta única na referência (pendente ou Sim e Não misturados)
-- não é copiada. Só a decisão muda; parcela cancelada fica de fora.
-- `p_simular` devolve a contagem sem gravar (prévia da confirmação) e a versão
-- da referência, que a confirmação devolve em `p_expected_updated_at`.
CREATE OR REPLACE FUNCTION public.fin_cmv_aplicar_serie(
  p_conta_pagar_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_justificativa text DEFAULT NULL,
  p_simular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_ref record;
  v_cp record;
  v_ids uuid[];
  v_regras jsonb;
  v_antes jsonb;
  v_n integer;
  v_serie integer := 0;
  v_titulos integer := 0;
  v_linhas integer := 0;
  v_simular boolean := COALESCE(p_simular, false);
  v_now timestamptz := now();
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- Alcança vários boletos: mesma exigência do lote de fin_cmv_classificar.
  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
  END IF;

  IF p_conta_pagar_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  -- A série é resolvida uma vez só. Na gravação, com a ordem fixa de bloqueio de
  -- fin_cmv_classificar; o que entrar na série depois disso fica para a próxima.
  IF v_simular THEN
    SELECT array_agg(s.id) INTO v_ids
    FROM public._fin_cmv_serie(v_company_id, p_conta_pagar_id) AS s(id);
  ELSE
    SELECT array_agg(t.id) INTO v_ids
    FROM (
      SELECT cp.id
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id
        AND cp.id IN (SELECT public._fin_cmv_serie(v_company_id, p_conta_pagar_id))
      ORDER BY cp.id
      FOR UPDATE
    ) t;
  END IF;

  SELECT cp.id, cp.status, cp.updated_at INTO v_ref
  FROM public.fin_contas_pagar cp
  WHERE cp.id = p_conta_pagar_id AND cp.company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta a pagar';
  END IF;
  IF v_ref.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_ref.status;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at <> v_ref.updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %', v_ref.id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('categoria_id', s.categoria_id, 'incluir', s.incluir))
    INTO v_regras
  FROM (
    SELECT x.categoria_id, bool_and(x.cmv_incluir) AS incluir
    FROM jsonb_to_recordset(public._fin_cmv_retrato(v_company_id, v_ref.id)->'linhas')
      AS x(categoria_id uuid, cmv_incluir boolean)
    GROUP BY x.categoria_id
    HAVING count(*) FILTER (WHERE x.cmv_incluir IS NULL) = 0
       AND count(DISTINCT x.cmv_incluir) = 1
  ) s;
  IF v_regras IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_DECISAO_OBRIGATORIA';
  END IF;

  FOR v_cp IN
    SELECT cp.id, cp.categoria_id, cp.cmv_incluir,
      EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id
      ) AS tem_rateio
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.id = ANY (v_ids)
      -- o status é relido depois do bloqueio
      AND (cp.id = v_ref.id OR cp.status <> 'CANCELADO')
    ORDER BY cp.id
  LOOP
    v_serie := v_serie + 1;
    CONTINUE WHEN v_cp.id = v_ref.id;

    IF v_cp.tem_rateio THEN
      SELECT count(*) INTO v_n
      FROM public.fin_lancamento_rateios r
      JOIN jsonb_to_recordset(v_regras) AS g(categoria_id uuid, incluir boolean)
        ON r.categoria_id IS NOT DISTINCT FROM g.categoria_id
      WHERE r.lancamento_id = v_cp.id AND r.company_id = v_company_id
        AND r.cmv_incluir IS DISTINCT FROM g.incluir;
    ELSE
      SELECT count(*) INTO v_n
      FROM jsonb_to_recordset(v_regras) AS g(categoria_id uuid, incluir boolean)
      WHERE g.categoria_id IS NOT DISTINCT FROM v_cp.categoria_id
        AND g.incluir IS DISTINCT FROM v_cp.cmv_incluir;
    END IF;

    CONTINUE WHEN v_n = 0;
    v_titulos := v_titulos + 1;
    v_linhas := v_linhas + v_n;
    CONTINUE WHEN v_simular;

    v_antes := public._fin_cmv_retrato(v_company_id, v_cp.id);

    IF v_cp.tem_rateio THEN
      UPDATE public.fin_lancamento_rateios r
      SET cmv_incluir = g.incluir
      FROM jsonb_to_recordset(v_regras) AS g(categoria_id uuid, incluir boolean)
      WHERE r.lancamento_id = v_cp.id AND r.company_id = v_company_id
        AND r.categoria_id IS NOT DISTINCT FROM g.categoria_id
        AND r.cmv_incluir IS DISTINCT FROM g.incluir;
    ELSE
      UPDATE public.fin_contas_pagar cp
      SET cmv_incluir = g.incluir
      FROM jsonb_to_recordset(v_regras) AS g(categoria_id uuid, incluir boolean)
      WHERE cp.id = v_cp.id AND cp.company_id = v_company_id
        AND g.categoria_id IS NOT DISTINCT FROM cp.categoria_id;
    END IF;

    -- A decisão faz parte da versão do boleto (ver fin_cmv_classificar).
    UPDATE public.fin_contas_pagar
    SET updated_at = v_now
    WHERE id = v_cp.id AND company_id = v_company_id;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES ('contas_pagar', v_cp.id, 'cmv_classificar', v_antes,
      public._fin_cmv_retrato(v_company_id, v_cp.id) || jsonb_build_object('serie_origem', v_ref.id),
      COALESCE(NULLIF(public.strip_html(p_justificativa), ''), 'Decisão aplicada à série'), v_uid, v_company_id);
  END LOOP;

  RETURN jsonb_build_object(
    'serie_titulos', v_serie,
    'titulos_alterados', v_titulos,
    'linhas_alteradas', v_linhas,
    'simulado', v_simular,
    'referencia_updated_at', v_ref.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fin_cmv_aplicar_serie(uuid, timestamptz, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_aplicar_serie(uuid, timestamptz, text, boolean) TO authenticated, service_role;

-- ─── Resolução de colunas no deploy ──────────────────────────────────────────
DO $$
DECLARE
  v_vazio uuid := '00000000-0000-0000-0000-0000000000ff';
BEGIN
  PERFORM 1 FROM public._fin_cmv_serie(v_vazio, v_vazio);
  PERFORM public._fin_cmv_lista(v_vazio, NULL, NULL, 'pendente', NULL, 1, 0, false);
  PERFORM public._fin_cmv_lista(v_vazio, DATE '2026-01-01', DATE '2026-01-07', 'incluido', v_vazio, 1, 0, true);
END;
$$;
