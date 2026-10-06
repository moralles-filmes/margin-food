-- ─────────────────────────────────────────────────────────────────────────────
-- CMV Financeiro — despesas de Lançamentos (Livro Razão) e da Conciliação Bancária
-- Spec: docs/superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md
--
-- Além dos boletos, entra no CMV a despesa de fin_lancamentos que:
--   * é DESPESA e não está CANCELADA (PREVISTO conta: regime de competência);
--   * não deriva de um título: referencia_modulo vazio. Espelho de baixa,
--     encargo da baixa e título criado do extrato ficam fora — o boleto já conta
--     pela própria competência, então nada é contado duas vezes;
--   * se veio da conciliação, está conciliada (mesma regra dos relatórios).
-- Data = data_competencia. Decisão = linha de rateio; sem rateio, o próprio
-- lançamento (fin_lancamentos.cmv_incluir). NULL = pendente, nunca "Sim".
--
-- Aditiva: nada do histórico é classificado. O contrato do relatório continua
-- 'cmv-financeiro/v1' (só ganha campos), então a tela publicada não quebra.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS cmv_incluir boolean;

COMMENT ON COLUMN public.fin_lancamentos.cmv_incluir IS
  'CMV Financeiro: decisão da despesa SEM rateio (true entra, false fica fora, NULL pendente). Ignorada quando há linhas em fin_lancamento_rateios.';
COMMENT ON COLUMN public.fin_lancamento_rateios.cmv_incluir IS
  'CMV Financeiro: decisão da linha de rateio de um boleto ou de uma despesa de fin_lancamentos (true entra, false fica fora, NULL pendente). Sem efeito em conta a receber.';

-- Mesma trava dos boletos: a decisão só é gravada pelas RPCs (SECURITY DEFINER).
CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao
  BEFORE INSERT OR UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();

-- ─── Helpers internos (sem EXECUTE para clientes) ────────────────────────────

-- Linhas classificáveis de fin_lancamentos (regra no cabeçalho do arquivo).
CREATE OR REPLACE FUNCTION public._fin_cmv_linhas_lancamentos(p_company_id uuid)
RETURNS TABLE (
  lancamento_id uuid,
  rateio_id uuid,
  categoria_id uuid,
  valor numeric,
  cmv_incluir boolean,
  data_competencia date
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH despesas AS (
    SELECT l.id, l.categoria_id, l.valor, l.cmv_incluir, l.data_competencia
    FROM public.fin_lancamentos l
    WHERE l.company_id = p_company_id
      AND l.tipo = 'DESPESA'
      AND l.status <> 'CANCELADO'
      AND NULLIF(l.referencia_modulo, '') IS NULL
      AND l.origem NOT IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento')
      AND (l.origem <> 'conciliacao' OR l.conciliado IS TRUE)
  )
  SELECT d.id, r.id, r.categoria_id, r.valor, r.cmv_incluir, d.data_competencia
  FROM despesas d
  JOIN public.fin_lancamento_rateios r
    ON r.lancamento_id = d.id AND r.company_id = p_company_id
  UNION ALL
  SELECT d.id, NULL::uuid, d.categoria_id, d.valor, d.cmv_incluir, d.data_competencia
  FROM despesas d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = d.id AND r.company_id = p_company_id
  );
$$;

-- Fonte única da apuração: boletos (regra de antes, inalterada) + lançamentos.
CREATE OR REPLACE FUNCTION public._fin_cmv_linhas_fontes(p_company_id uuid)
RETURNS TABLE (
  fonte text,
  documento_id uuid,
  rateio_id uuid,
  categoria_id uuid,
  valor numeric,
  cmv_incluir boolean,
  data_competencia date
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT 'boleto'::text, b.conta_pagar_id, b.rateio_id, b.categoria_id, b.valor, b.cmv_incluir, b.data_competencia
  FROM public._fin_cmv_linhas(p_company_id) b
  UNION ALL
  SELECT 'lancamento'::text, l.lancamento_id, l.rateio_id, l.categoria_id, l.valor, l.cmv_incluir, l.data_competencia
  FROM public._fin_cmv_linhas_lancamentos(p_company_id) l;
$$;

-- Retrato da classificação de UM lançamento (qualquer status), para auditoria.
CREATE OR REPLACE FUNCTION public._fin_cmv_retrato_lancamento(p_company_id uuid, p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'incluido', COALESCE(sum(x.valor) FILTER (WHERE x.cmv_incluir IS TRUE), 0),
    'fora', COALESCE(sum(x.valor) FILTER (WHERE x.cmv_incluir IS FALSE), 0),
    'pendentes', count(*) FILTER (WHERE x.cmv_incluir IS NULL),
    'linhas', COALESCE(jsonb_agg(jsonb_build_object(
      'rateio_id', x.rateio_id, 'categoria_id', x.categoria_id,
      'valor', x.valor, 'cmv_incluir', x.cmv_incluir
    ) ORDER BY x.rateio_id), '[]'::jsonb)
  )
  FROM (
    SELECT r.id AS rateio_id, r.categoria_id, r.valor, r.cmv_incluir
    FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = p_lancamento_id AND r.company_id = p_company_id
    UNION ALL
    SELECT NULL::uuid, l.categoria_id, l.valor, l.cmv_incluir
    FROM public.fin_lancamentos l
    WHERE l.id = p_lancamento_id AND l.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = l.company_id
      )
  ) x;
$$;

-- Payload do relatório (mesma assinatura e mesmo contrato v1, só com campos a mais):
-- "boletos" continua contando só boletos; "lancamentos" é a contagem nova.
CREATE OR REPLACE FUNCTION public._fin_cmv_payload(
  p_company_id uuid,
  p_inicio date,
  p_fim date,
  p_anterior_inicio date,
  p_anterior_fim date
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH linhas AS MATERIALIZED (
    SELECT l.*,
      round(l.valor * 100)::bigint AS centavos,
      CASE
        WHEN l.data_competencia BETWEEN p_inicio AND p_fim THEN 'atual'
        WHEN p_anterior_inicio IS NOT NULL
          AND l.data_competencia BETWEEN p_anterior_inicio AND p_anterior_fim THEN 'anterior'
      END AS janela
    FROM public._fin_cmv_linhas_fontes(p_company_id) l
  ),
  cmv AS (
    SELECT data_competencia AS data, categoria_id, sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1, 2
  ),
  documentos AS (
    SELECT data_competencia AS data, fonte, count(DISTINCT documento_id)::int AS quantidade
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1, 2
  ),
  qualidade AS (
    SELECT data_competencia AS data,
      CASE WHEN cmv_incluir IS NULL THEN 'pendente' ELSE 'fora' END AS situacao,
      count(DISTINCT documento_id)::int AS titulos,
      sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS NOT TRUE
    GROUP BY 1, 2
  ),
  pendentes AS (
    SELECT fonte, count(DISTINCT documento_id)::int AS titulos, COALESCE(sum(centavos), 0)::bigint AS centavos
    FROM linhas
    WHERE cmv_incluir IS NULL
    GROUP BY fonte
  ),
  faturamento AS (
    -- Uma linha por (empresa, data) — idx_fechamento_caixa_company_data.
    -- Linha existente = fechamento registrado (inclusive com valor zero).
    SELECT f.data, round(f.faturamento_bruto * 100)::bigint AS centavos
    FROM public.financeiro_fechamento_caixa f
    WHERE f.company_id = p_company_id
      AND (f.data BETWEEN p_inicio AND p_fim
        OR (p_anterior_inicio IS NOT NULL AND f.data BETWEEN p_anterior_inicio AND p_anterior_fim))
  ),
  categorias AS (
    WITH RECURSIVE arvore AS (
      SELECT c.id, c.nome, c.parent_id, c.codigo, c.ordem, c.ativo, c.created_at
      FROM public.fin_categorias c
      WHERE c.company_id = p_company_id
        AND c.id IN (SELECT categoria_id FROM linhas WHERE janela IS NOT NULL AND cmv_incluir IS TRUE AND categoria_id IS NOT NULL)
      UNION
      SELECT p.id, p.nome, p.parent_id, p.codigo, p.ordem, p.ativo, p.created_at
      FROM public.fin_categorias p
      JOIN arvore a ON a.parent_id = p.id
      WHERE p.company_id = p_company_id
    )
    SELECT a.id, a.nome, a.parent_id, a.codigo, a.ordem, a.ativo,
      (SELECT count(*) FROM public.fin_categorias x
       WHERE x.company_id = p_company_id
         AND (x.created_at, x.id) < (a.created_at, a.id))::int AS indice
    FROM arvore a
  )
  SELECT jsonb_build_object(
    'contrato', 'cmv-financeiro/v1',
    'gerado_em', now(),
    'hoje', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'classificacao_ativa', public._fin_cmv_ativo(p_company_id),
    'empresa', (SELECT company.nome FROM public.companies AS company WHERE company.id = p_company_id),
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'anterior', CASE WHEN p_anterior_inicio IS NULL THEN NULL
      ELSE jsonb_build_object('inicio', p_anterior_inicio, 'fim', p_anterior_fim) END,
    'faturamento', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'centavos', centavos) ORDER BY data) FROM faturamento), '[]'::jsonb),
    'cmv', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'categoria_id', categoria_id, 'centavos', centavos) ORDER BY data, categoria_id) FROM cmv), '[]'::jsonb),
    'boletos', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'quantidade', quantidade) ORDER BY data) FROM documentos WHERE fonte = 'boleto'), '[]'::jsonb),
    'lancamentos', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'quantidade', quantidade) ORDER BY data) FROM documentos WHERE fonte = 'lancamento'), '[]'::jsonb),
    'qualidade', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'situacao', situacao, 'titulos', titulos, 'centavos', centavos) ORDER BY data, situacao) FROM qualidade), '[]'::jsonb),
    'categorias', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'parent_id', parent_id, 'codigo', codigo, 'ordem', ordem, 'ativo', ativo, 'indice', indice) ORDER BY nome, id) FROM categorias), '[]'::jsonb),
    'sem_competencia', (
      SELECT jsonb_build_object(
        'titulos', count(DISTINCT documento_id),
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM linhas WHERE data_competencia IS NULL
    ),
    'pendentes_geral', (
      SELECT jsonb_build_object(
        'titulos', COALESCE(sum(titulos), 0)::int,
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM pendentes
    ),
    'pendentes_geral_por_fonte', jsonb_build_object(
      'boleto', COALESCE((SELECT jsonb_build_object('titulos', titulos, 'centavos', centavos) FROM pendentes WHERE fonte = 'boleto'),
        jsonb_build_object('titulos', 0, 'centavos', 0)),
      'lancamento', COALESCE((SELECT jsonb_build_object('titulos', titulos, 'centavos', centavos) FROM pendentes WHERE fonte = 'lancamento'),
        jsonb_build_object('titulos', 0, 'centavos', 0))
    )
  );
$$;

-- Detalhe (drill-down e revisão de pendências), paginado, das duas fontes.
-- Item de boleto mantém "conta_pagar_id" (o cliente publicado lê esse campo).
-- Fornecedor e vencimento são conceitos do título: o item de lançamento os devolve nulos.
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
    FROM public._fin_cmv_linhas_fontes(p_company_id) l
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
          -- com período informado, documento sem competência nunca entra
          AND (p_inicio IS NULL AND p_fim IS NULL OR l.data_competencia IS NOT NULL)))
      -- uuid nulo (zeros) = só as linhas SEM categoria
      AND (p_categoria_id IS NULL
        OR (p_categoria_id = '00000000-0000-0000-0000-000000000000'::uuid AND l.categoria_id IS NULL)
        -- "lançado direto": só a própria categoria, sem os descendentes
        OR (p_so_direto AND l.categoria_id = p_categoria_id)
        OR (NOT p_so_direto AND l.categoria_id IN (SELECT id FROM ramo)))
  ),
  documentos AS (
    SELECT 'boleto'::text AS fonte, cp.id, cp.descricao, cp.fornecedor, cp.data_vencimento, cp.status,
      cp.updated_at, round(cp.valor * 100)::bigint AS titulo_centavos, NULL::text AS origem, NULL::text AS conta_nome
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = p_company_id
      AND cp.id IN (SELECT f.documento_id FROM filtradas f WHERE f.fonte = 'boleto')
    UNION ALL
    SELECT 'lancamento'::text, l.id, l.descricao, NULL::text, NULL::date, l.status,
      l.updated_at, round(l.valor * 100)::bigint, l.origem, ct.nome
    FROM public.fin_lancamentos l
    LEFT JOIN public.fin_contas ct ON ct.id = l.conta_id AND ct.company_id = p_company_id
    WHERE l.company_id = p_company_id
      AND l.id IN (SELECT f.documento_id FROM filtradas f WHERE f.fonte = 'lancamento')
  ),
  pagina AS (
    SELECT f.*, d.descricao, d.fornecedor, d.data_vencimento, d.status, d.updated_at,
      d.titulo_centavos, d.origem, d.conta_nome, cat.nome AS categoria_nome
    FROM filtradas f
    JOIN documentos d ON d.id = f.documento_id AND d.fonte = f.fonte
    LEFT JOIN public.fin_categorias cat ON cat.id = f.categoria_id AND cat.company_id = p_company_id
    ORDER BY f.data_competencia DESC NULLS FIRST, d.descricao, f.documento_id, f.rateio_id NULLS FIRST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total_linhas', (SELECT count(*) FROM filtradas),
    'total_titulos', (SELECT count(DISTINCT documento_id) FROM filtradas),
    'total_centavos', (SELECT COALESCE(sum(centavos), 0)::bigint FROM filtradas),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fonte', p.fonte,
        'documento_id', p.documento_id,
        'conta_pagar_id', CASE WHEN p.fonte = 'boleto' THEN p.documento_id END,
        'lancamento_id', CASE WHEN p.fonte = 'lancamento' THEN p.documento_id END,
        'rateio_id', p.rateio_id,
        'descricao', p.descricao,
        'fornecedor', p.fornecedor,
        'origem', p.origem,
        'conta_nome', p.conta_nome,
        'data_competencia', p.data_competencia,
        'data_vencimento', p.data_vencimento,
        'status', p.status,
        'categoria_id', p.categoria_id,
        'categoria_nome', p.categoria_nome,
        'titulo_centavos', p.titulo_centavos,
        'linha_centavos', p.centavos,
        'cmv_incluir', p.cmv_incluir,
        'updated_at', p.updated_at,
        'serie_boletos', CASE WHEN p.fonte = 'boleto'
          THEN (SELECT count(*) FROM public._fin_cmv_serie(p_company_id, p.documento_id)) ELSE 1 END
      ) ORDER BY p.data_competencia DESC NULLS FIRST, p.descricao, p.documento_id, p.rateio_id NULLS FIRST)
      FROM pagina p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_linhas_lancamentos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_linhas_fontes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_retrato_lancamento(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_payload(uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_lista(uuid, date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ─── Configuração: também para quem lança despesa e para quem concilia ────────
CREATE OR REPLACE FUNCTION public.get_fin_cmv_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  -- O formulário do Livro Razão e a linha do extrato sugerem a resposta pelo
  -- padrão da categoria: quem lança e quem concilia também leem a configuração.
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:cmv:view', 'financeiro:pagar:view', 'financeiro:pagar:create',
    'financeiro:pagar:edit', 'financeiro:lancamentos:view', 'financeiro:lancamentos:create',
    'financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile',
    'finance:read', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:view';
  END IF;

  RETURN jsonb_build_object(
    'classificacao_ativa', public._fin_cmv_ativo(v_company_id),
    -- Sinal para o frontend: o banco aceita a decisão em Lançamentos e na Conciliação.
    'recursos', jsonb_build_object('lancamentos', true),
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'parent_id', c.parent_id,
        'grupo', c.grupo, 'ativo', c.ativo, 'cmv_sugerir', c.cmv_sugerir,
        'updated_at', c.updated_at
      ) ORDER BY c.nome, c.id)
      FROM public.fin_categorias c
      WHERE c.company_id = v_company_id AND c.tipo = 'despesa'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_cmv_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_cmv_config() TO authenticated, service_role;

-- ─── Resolução de colunas no deploy ──────────────────────────────────────────
-- As consultas são LANGUAGE sql (validadas no CREATE); aqui elas rodam uma vez,
-- sobre uma empresa inexistente, para erro de coluna aparecer na aplicação.
DO $$
DECLARE
  v_vazio uuid := '00000000-0000-0000-0000-0000000000ff';
  v_payload jsonb;
BEGIN
  PERFORM 1 FROM public._fin_cmv_linhas_fontes(v_vazio);
  PERFORM public._fin_cmv_retrato_lancamento(v_vazio, v_vazio);
  PERFORM public._fin_cmv_lista(v_vazio, NULL, NULL, 'pendente', NULL, 1, 0, false);
  v_payload := public._fin_cmv_payload(v_vazio, DATE '2026-01-01', DATE '2026-01-07', DATE '2025-12-25', DATE '2025-12-31');
  IF v_payload->>'contrato' IS DISTINCT FROM 'cmv-financeiro/v1' OR NOT (v_payload ? 'lancamentos') THEN
    RAISE EXCEPTION 'CMV lançamentos: payload inesperado';
  END IF;
END;
$$;
