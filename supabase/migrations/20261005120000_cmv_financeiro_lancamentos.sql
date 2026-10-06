-- ─────────────────────────────────────────────────────────────────────────────
-- CMV Financeiro — despesas de Lançamentos (Livro Razão) e da Conciliação Bancária
-- Spec: docs/superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md
--
-- Além dos boletos, entra no CMV a despesa de fin_lancamentos que:
--   * é DESPESA e não está CANCELADA (PREVISTO conta: regime de competência);
--   * não deriva de um título: referencia_modulo vazio. Espelho de baixa,
--     encargo da baixa e título criado do extrato ficam fora — o boleto já conta
--     pela própria competência, então nada é contado duas vezes;
--   * se veio da conciliação, está conciliada (mesma regra dos relatórios);
--   * não é a baixa de um boleto: nenhum fin_contas_pagar aponta para ele em
--     lancamento_id (mesmo que o carimbo de referencia_modulo tenha se perdido).
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
      -- Lançamento que é a baixa de um boleto (fin_contas_pagar.lancamento_id) não é
      -- despesa à parte: o boleto já conta. Cobre o fluxo antigo que gravou o título
      -- como PAGO mas perdeu o UPDATE que carimbava referencia_modulo/origem.
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_contas_pagar cp
        WHERE cp.company_id = p_company_id AND cp.lancamento_id = l.id
      )
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

-- ─── Herança da decisão para o cliente antigo ────────────────────────────────
-- Decisão que a MESMA categoria tinha no documento antes da edição: só quando é
-- unânime; senão, pendente (mesma regra de _guarded_update_conta_pagar).
CREATE OR REPLACE FUNCTION public._fin_cmv_heranca(p_anteriores jsonb, p_categoria_id uuid)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE o.cmv_incluir IS NULL) = 0
              AND count(DISTINCT o.cmv_incluir) = 1 THEN bool_and(o.cmv_incluir) END
  FROM jsonb_to_recordset(COALESCE(p_anteriores, '[]'::jsonb)) AS o(categoria_id uuid, cmv_incluir boolean)
  WHERE o.categoria_id IS NOT DISTINCT FROM p_categoria_id;
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_heranca(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ─── Conciliação: competência própria e decisão do CMV por linha ─────────────
-- p_data continua sendo a data do BANCO: vira data_pagamento e entra na chave de
-- idempotência e na checagem de "possível duplicata" (nada disso muda). A
-- competência (p_data_competencia, opcional) só muda data_competencia — DRE e
-- CMV. Cada item de p_rateio_linhas pode levar "cmv_incluir" (só em DESPESA).
-- Corpo a partir de 20260930130000_conciliacao_chave_ocorrencia.sql (= banco vivo
-- em 2026-10-05, conferido por md5 do prosrc). Parâmetro novo com default:
-- chamadas antigas continuam valendo.
DROP FUNCTION IF EXISTS public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date,
  p_descricao text,
  p_valor numeric,
  p_tipo text,
  p_conta_id uuid,
  p_user_id uuid,
  p_rateio_linhas jsonb DEFAULT NULL::jsonb,
  p_external_id text DEFAULT NULL::text,
  p_force_duplicate boolean DEFAULT false,
  p_occurrence_index integer DEFAULT 0,
  p_data_competencia date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_legacy_idem_key text;
  v_conteudo_idem_key text;
  v_external_id text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
  v_invalid_categories int;
  v_dup_id uuid;
  v_dup_created_at timestamptz;
  v_existing_count int;
  v_occurrence_index int;
  v_descricao_normalizada text;
  v_constraint text;
  v_competencia date;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Transferência não tem competência própria: as duas pernas usam a data do banco.
  IF p_data_competencia IS NOT NULL AND p_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMPETENCIA_INVALIDA: transferência usa a data do banco';
  END IF;
  v_competencia := COALESCE(p_data_competencia, p_data);

  -- Mesmo padrão do cabeçalho de CP/CR: a conta entra na chave e no lançamento.
  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_occurrence_index := GREATEST(COALESCE(p_occurrence_index, 0), 0);

  IF p_tipo <> 'TRANSFERENCIA' THEN
    IF p_rateio_linhas IS NULL OR jsonb_typeof(p_rateio_linhas) <> 'array' OR jsonb_array_length(p_rateio_linhas) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
    SELECT count(*) INTO v_invalid_categories
    FROM jsonb_array_elements(p_rateio_linhas) item
    LEFT JOIN public.fin_categorias c
      ON c.id = NULLIF(item->>'categoria_id', '')::uuid
      AND c.company_id = v_company AND c.ativo = true
    WHERE c.id IS NULL OR c.tipo <> lower(p_tipo);
    IF v_invalid_categories > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: categoria inválida ou incompatível com o tipo';
    END IF;
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NOT NULL AND length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;

  v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);
  -- Linha sem FITID (CSV): a identidade é o conteúdo + a ocorrência dele no
  -- extrato. A 1ª ocorrência mantém a chave legada — lançamentos já gravados
  -- continuam reconhecidos e reimportar o arquivo não duplica —, e a n-ésima
  -- tem chave própria. Sem isso a 2ª venda idêntica do dia caía no caminho
  -- rápido da 1ª e devolvia 'duplicate' antes de olhar p_force_duplicate.
  v_conteudo_idem_key := CASE
    WHEN v_legacy_idem_key IS NULL OR v_occurrence_index = 0 THEN v_legacy_idem_key
    ELSE md5(concat_ws('|', v_legacy_idem_key, 'ocorrencia', v_occurrence_index::text))
  END;
  v_idem_key := CASE
    WHEN v_external_id IS NOT NULL
      THEN md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))
    ELSE v_conteudo_idem_key
  END;

  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_legacy_idem_key AND company_id = v_company;

    IF v_lancamento_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.fin_conciliacao_vinculos v
        WHERE v.company_id = v_company
          AND v.conta_id = p_conta_id
          AND v.lancamento_id = v_lancamento_id
          AND v.external_id <> v_external_id
      ) THEN
        v_lancamento_id := NULL;
      ELSE
        UPDATE public.fin_lancamentos
        SET idempotency_key = v_idem_key
        WHERE id = v_lancamento_id;
      END IF;
    END IF;
  END IF;

  IF v_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- Colapsa espaços internos antes de comparar: o MEMO do OFX varia o espaçamento
  -- entre exportações do mesmo extrato (ex.: Santander), então uma comparação exata
  -- de string (mesmo com lower+unaccent) deixa passar duplicata como se fosse nova.
  v_descricao_normalizada := regexp_replace(lower(public.immutable_unaccent(btrim(p_descricao))), '\s+', ' ', 'g');

  IF NOT p_force_duplicate THEN
    SELECT count(*) INTO v_existing_count
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.conta_id = p_conta_id
      AND l.tipo = p_tipo
      AND l.valor = p_valor
      AND l.data_pagamento = p_data
      AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
      AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr');

    IF v_occurrence_index < v_existing_count THEN
      SELECT l.id, l.created_at INTO v_dup_id, v_dup_created_at
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.conta_id = p_conta_id
        AND l.tipo = p_tipo
        AND l.valor = p_valor
        AND l.data_pagamento = p_data
        AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
        AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr')
      ORDER BY l.created_at ASC
      OFFSET v_occurrence_index
      LIMIT 1;

      IF v_dup_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'status', 'possible_duplicate',
          'lancamento_id', v_dup_id,
          'criado_em', v_dup_created_at
        );
      END IF;
    END IF;
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  BEGIN
    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao, conta_id,
      forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
      created_by, idempotency_key, company_id, origem, categoria_id, centro_custo_id
    ) VALUES (
      p_tipo, p_valor, v_competencia, p_data, p_descricao, p_conta_id,
      'extrato', 'REALIZADO', true, now(), v_uid,
      v_uid, v_idem_key, v_company, 'conciliacao', v_cat_id, v_cc_id
    ) RETURNING id INTO v_lancamento_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra chamada com a mesma chave gravou entre o SELECT acima e este INSERT:
    -- é a mesma linha do extrato, então vale o mesmo retorno do caminho rápido.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
      RAISE;
    END IF;
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_idem_key AND company_id = v_company;
    IF v_lancamento_id IS NULL THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir
      ) VALUES (
        v_lancamento_id, (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric, (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao', v_company,
        -- Só despesa entra no CMV financeiro; sem resposta = pendente.
        CASE WHEN p_tipo = 'DESPESA' AND jsonb_typeof(v_rateio_item->'cmv_incluir') = 'boolean'
          THEN (v_rateio_item->>'cmv_incluir')::boolean END
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data, 'data_competencia', v_competencia,
      'descricao', p_descricao, 'categoria_id', v_cat_id, 'rateios', p_rateio_linhas,
      'external_id_used', v_external_id IS NOT NULL, 'category_validation', 'passed',
      'force_duplicate', p_force_duplicate, 'occurrence_index', v_occurrence_index));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$function$;

-- ─── Livro Razão: a decisão do CMV na criação/edição da despesa manual ───────
-- p_cmv (novo, opcional): {"incluir": true|false|null} = decisão da despesa SEM
-- rateio. Com rateio, cada item de p_rateios leva "cmv_incluir" e, na edição, o
-- "id" da linha, que é preservado (mesma regra de _guarded_update_conta_pagar).
-- Cliente sem p_cmv (versão antiga, edição pela tela de Conciliação): na criação
-- a decisão nasce pendente; na edição herda a da MESMA categoria (se unânime).
-- Nunca exige a resposta: CMV_DECISAO_OBRIGATORIA é só de boleto.
-- `cmv_incluir` por linha de rateio só é considerado quando `p_cmv` não é nulo (`{}` basta).
-- Corpo a partir de 20260929183200_idempotencia_financeiro.sql (= banco vivo em
-- 2026-10-05, conferido por md5 do prosrc).
DROP FUNCTION IF EXISTS public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public._guarded_upsert_lancamento(
  p_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT 'DESPESA'::text,
  p_status text DEFAULT 'PREVISTO'::text,
  p_valor numeric DEFAULT 0,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_data_competencia date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_pagamento date DEFAULT NULL::date,
  p_descricao text DEFAULT ''::text,
  p_observacoes text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'pix'::text,
  p_origem text DEFAULT 'manual'::text,
  p_recorrente boolean DEFAULT false,
  p_recorrencia_config jsonb DEFAULT NULL::jsonb,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_justificativa_edicao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_cmv jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone, idempotente boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _v_id uuid;
  _v_updated_at timestamptz;
  _existing record;
  _request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  _idem_key text;
  _replay boolean := false;
  _constraint text;
  -- CMV Financeiro
  _cmv_cliente boolean := p_cmv IS NOT NULL;
  _despesa boolean := p_tipo = 'DESPESA';
  _rateios jsonb := COALESCE(p_rateios, '[]'::jsonb);
  _tem_rateio boolean;
  _cmv_titulo boolean;
  _cmv_antes jsonb;
  _old_rateios jsonb := '[]'::jsonb;
  _old_set jsonb := '[]'::jsonb;
  _usados uuid[] := '{}';
  _r record;
  _line_id uuid;
  _line_created timestamptz;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.assert_tenant();

  IF p_cmv IS NOT NULL AND (
    jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv ? 'incluir' AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean', 'null'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  -- Permission check
  IF p_id IS NULL THEN
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:create';
    END IF;
  ELSE
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:edit';
    END IF;

    -- Fetch existing for optimistic locking
    SELECT fl.* INTO _existing
    FROM public.fin_lancamentos fl
    WHERE fl.id = p_id AND fl.company_id = _company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lancamento not found';
    END IF;

    -- Block editing conciliados
    IF _existing.conciliado = true THEN
      RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';
    END IF;

    -- Optimistic locking
    IF p_updated_at IS NOT NULL AND _existing.updated_at != p_updated_at THEN
      RAISE EXCEPTION 'CONFLICT: Registro alterado por outro usuário';
    END IF;

    -- Estado anterior da classificação do CMV (auditoria + herança do cliente antigo).
    _cmv_antes := public._fin_cmv_retrato_lancamento(_company_id, p_id);
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'categoria_id', r.categoria_id, 'cmv_incluir', r.cmv_incluir, 'created_at', r.created_at
    )), '[]'::jsonb)
    INTO _old_rateios
    FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = p_id AND r.company_id = _company_id;
    _old_set := CASE WHEN jsonb_array_length(_old_rateios) > 0 THEN _old_rateios
      ELSE jsonb_build_array(jsonb_build_object('categoria_id', _existing.categoria_id, 'cmv_incluir', _existing.cmv_incluir)) END;
  END IF;

  -- p_rateios que não é array continua sendo erro (jsonb_array_length), como no
  -- corpo anterior: nunca vira "sem rateio" em silêncio e apaga as linhas.
  _tem_rateio := jsonb_array_length(_rateios) > 0;

  -- Decisão da despesa SEM rateio (com rateio, cada linha tem a sua). Só despesa
  -- entra no CMV financeiro. Cliente antigo herda a decisão da mesma categoria.
  _cmv_titulo := CASE
    WHEN NOT _despesa OR _tem_rateio THEN NULL
    WHEN _cmv_cliente THEN
      CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END
    WHEN p_id IS NULL THEN NULL
    ELSE public._fin_cmv_heranca(_old_set, p_categoria_id)
  END;

  IF p_id IS NULL THEN
    -- Chave só vale para criação. Prefixo próprio: fin_lancamentos.idempotency_key
    -- é compartilhada com a conciliação (md5) e a recorrência ('recorrencia:').
    IF _request_key IS NOT NULL THEN
      IF length(_request_key) > 200 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
      END IF;
      _idem_key := 'manual:' || _request_key;

      SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
             fl.descricao, fl.categoria_id
        INTO _existing
      FROM public.fin_lancamentos fl
      WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
      _replay := FOUND;
    END IF;

    IF NOT _replay THEN
      BEGIN
        INSERT INTO public.fin_lancamentos (
          tipo, status, valor, conta_id, categoria_id, centro_custo_id,
          data_competencia, data_vencimento, data_pagamento,
          descricao, observacoes, forma_pagamento, origem,
          recorrente, recorrencia_config,
          created_by, company_id, idempotency_key, cmv_incluir
        ) VALUES (
          p_tipo, p_status, p_valor, p_conta_id, p_categoria_id, p_centro_custo_id,
          p_data_competencia, p_data_vencimento, p_data_pagamento,
          p_descricao, p_observacoes, p_forma_pagamento, p_origem,
          p_recorrente, p_recorrencia_config,
          _user_id, _company_id, _idem_key, _cmv_titulo
        )
        RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
        INTO _v_id, _v_updated_at;
      EXCEPTION WHEN unique_violation THEN
        -- Outra chamada com a mesma chave gravou entre o SELECT e este INSERT.
        GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
        IF _idem_key IS NULL OR _constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
          RAISE;
        END IF;
        SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
               fl.descricao, fl.categoria_id
          INTO _existing
        FROM public.fin_lancamentos fl
        WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
        IF NOT FOUND THEN
          RAISE;
        END IF;
        _replay := true;
      END;
    END IF;

    IF _replay THEN
      -- Só é reenvio se descrever a MESMA operação.
      IF _existing.tipo IS DISTINCT FROM p_tipo
         OR round(_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
         OR _existing.conta_id IS DISTINCT FROM p_conta_id
         OR _existing.data_competencia IS DISTINCT FROM p_data_competencia
         OR _existing.descricao IS DISTINCT FROM p_descricao
         OR _existing.categoria_id IS DISTINCT FROM p_categoria_id THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
      END IF;
      RETURN QUERY SELECT _existing.id, _existing.updated_at, true;
      RETURN;
    END IF;
  ELSE
    -- UPDATE
    UPDATE public.fin_lancamentos SET
      tipo = p_tipo,
      status = p_status,
      valor = p_valor,
      conta_id = p_conta_id,
      categoria_id = p_categoria_id,
      centro_custo_id = p_centro_custo_id,
      data_competencia = p_data_competencia,
      data_vencimento = p_data_vencimento,
      data_pagamento = p_data_pagamento,
      descricao = p_descricao,
      observacoes = p_observacoes,
      forma_pagamento = p_forma_pagamento,
      recorrente = p_recorrente,
      recorrencia_config = p_recorrencia_config,
      justificativa_edicao = p_justificativa_edicao,
      cmv_incluir = _cmv_titulo,
      updated_at = now()
    WHERE fin_lancamentos.id = p_id AND company_id = _company_id
    RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
    INTO _v_id, _v_updated_at;
  END IF;

  -- Rateios: apaga e reinsere; a linha que já era deste lançamento mantém id e
  -- created_at (a decisão do CMV é da linha e precisa de identificador estável).
  IF _v_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = _v_id AND company_id = _company_id;

    IF _tem_rateio THEN
      FOR _r IN SELECT * FROM jsonb_to_recordset(_rateios) AS x(
        id uuid, categoria_id uuid, centro_custo_id text, valor numeric, percentual numeric, observacao text, cmv_incluir boolean
      ) LOOP
        _line_id := NULL;
        _line_created := NULL;
        IF p_id IS NOT NULL AND _r.id IS NOT NULL AND NOT (_r.id = ANY(_usados)) THEN
          SELECT o.id, o.created_at INTO _line_id, _line_created
          FROM jsonb_to_recordset(_old_rateios) AS o(id uuid, created_at timestamptz)
          WHERE o.id = _r.id;
        END IF;
        IF _line_id IS NULL THEN
          _line_id := gen_random_uuid();
          _line_created := now();
        END IF;
        _usados := _usados || _line_id;

        INSERT INTO public.fin_lancamento_rateios (
          id, lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir, created_at
        ) VALUES (
          _line_id, _v_id, _r.categoria_id, NULLIF(_r.centro_custo_id, '')::uuid, _r.valor, _r.percentual,
          NULLIF(_r.observacao, ''), _company_id,
          CASE
            WHEN NOT _despesa THEN NULL
            WHEN _cmv_cliente THEN _r.cmv_incluir
            WHEN p_id IS NULL THEN NULL
            ELSE public._fin_cmv_heranca(_old_set, _r.categoria_id)
          END,
          _line_created
        );
      END LOOP;
    END IF;

    -- Na criação _existing não tem a linha inteira (só o SELECT da chave), então
    -- a auditoria de cada caminho fica num ramo próprio.
    IF p_id IS NULL THEN
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'criar',
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'origem', p_origem, 'rateios', jsonb_array_length(_rateios),
          'cmv', public._fin_cmv_retrato_lancamento(_company_id, _v_id)
        ),
        _user_id, _company_id
      );
    ELSE
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'editar',
        jsonb_build_object(
          'tipo', _existing.tipo, 'status', _existing.status, 'valor', _existing.valor,
          'conta_id', _existing.conta_id, 'categoria_id', _existing.categoria_id,
          'data_competencia', _existing.data_competencia, 'descricao', _existing.descricao,
          'cmv', _cmv_antes
        ),
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'rateios', jsonb_array_length(_rateios),
          'cmv', public._fin_cmv_retrato_lancamento(_company_id, _v_id)
        ),
        coalesce(p_justificativa_edicao, ''),
        _user_id, _company_id
      );
    END IF;
  END IF;

  RETURN QUERY SELECT _v_id, _v_updated_at, false;
END;
$function$;

-- ─── Lançamento conciliado: reclassificação com decisão e competência ────────
-- Continua sem desfazer a conciliação: categoria, centro de custo, rateio,
-- observações, a decisão do CMV e a DATA DE COMPETÊNCIA (com justificativa). A
-- data do banco (data_pagamento) nunca muda; se o lançamento não tem, a
-- competência antiga vira data_pagamento antes da troca — o reconhecimento da
-- linha já conciliada usa data_pagamento || data_competencia.
-- `cmv_incluir` por linha de rateio só é considerado quando `p_cmv` não é nulo (`{}` basta).
-- Corpo a partir de 20260825182354_allow_safe_reconciled_classification_edit.sql
-- (= banco vivo em 2026-10-05, conferido por md5 do prosrc).
DROP FUNCTION IF EXISTS public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text);

CREATE OR REPLACE FUNCTION public._guarded_update_reconciled_classification(
  p_id uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_justificativa_edicao text DEFAULT NULL::text,
  p_cmv jsonb DEFAULT NULL::jsonb,
  p_data_competencia date DEFAULT NULL::date
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_lanc public.fin_lancamentos%ROWTYPE;
  v_rateios jsonb;
  v_rateio_count integer;
  v_rateio_sum numeric;
  v_invalid_count integer;
  v_header_categoria_id uuid;
  v_header_centro_custo_id uuid;
  v_updated_at timestamptz;
  v_antes jsonb;
  v_depois jsonb;
  -- CMV Financeiro e competência
  v_cmv_cliente boolean := p_cmv IS NOT NULL;
  v_despesa boolean;
  v_cmv_titulo boolean;
  v_cmv_antes jsonb;
  v_old_rateios jsonb;
  v_old_set jsonb;
  v_usados uuid[] := '{}';
  v_r record;
  v_line_id uuid;
  v_line_created timestamptz;
  v_competencia date;
  v_pagamento date;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario nao autenticado';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:lancamentos:edit',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:edit necessario';
  END IF;

  SELECT l.*
  INTO v_lanc
  FROM public.fin_lancamentos l
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lancamento nao encontrado';
  END IF;

  IF v_lanc.conciliado IS NOT TRUE THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lancamento nao esta conciliado';
  END IF;

  IF v_lanc.tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: transferencia nao possui classificacao contabil';
  END IF;

  IF v_lanc.origem IN ('espelho_cp', 'espelho_cr') THEN
    RAISE EXCEPTION 'ORIGEM_INVALIDA: edite a conta a pagar/receber de origem';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_lanc.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  IF NULLIF(btrim(p_justificativa_edicao), '') IS NULL THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  IF p_rateios IS NULL OR jsonb_typeof(p_rateios) <> 'array' THEN
    RAISE EXCEPTION 'RATEIO_INVALIDO: rateios deve ser um array';
  END IF;

  IF p_cmv IS NOT NULL AND (
    jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv ? 'incluir' AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean', 'null'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;
  v_despesa := v_lanc.tipo = 'DESPESA';

  v_rateios := p_rateios;
  v_rateio_count := jsonb_array_length(v_rateios);

  IF v_rateio_count = 0 THEN
    IF p_categoria_id IS NULL THEN
      RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA';
    END IF;

    PERFORM 1
    FROM public.fin_categorias c
    WHERE c.id = p_categoria_id
      AND c.company_id = v_company_id
      AND c.ativo = true
      AND c.tipo = lower(v_lanc.tipo);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATEGORIA_INVALIDA: categoria inativa, de outro tipo ou empresa';
    END IF;

    IF p_centro_custo_id IS NOT NULL THEN
      PERFORM 1
      FROM public.fin_centros_custo cc
      WHERE cc.id = p_centro_custo_id
        AND cc.company_id = v_company_id
        AND cc.ativo = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'CENTRO_CUSTO_INVALIDO';
      END IF;
    END IF;

    v_header_categoria_id := p_categoria_id;
    v_header_centro_custo_id := p_centro_custo_id;
  ELSE
    SELECT
      count(*) FILTER (
        WHERE r.categoria_id IS NULL
           OR r.valor IS NULL
           OR r.valor <= 0
           OR c.id IS NULL
           OR (r.centro_custo_id IS NOT NULL AND cc.id IS NULL)
      ),
      COALESCE(sum(r.valor), 0)
    INTO v_invalid_count, v_rateio_sum
    FROM jsonb_to_recordset(v_rateios) AS r(
      categoria_id uuid,
      centro_custo_id uuid,
      valor numeric,
      percentual numeric,
      observacao text
    )
    LEFT JOIN public.fin_categorias c
      ON c.id = r.categoria_id
     AND c.company_id = v_company_id
     AND c.ativo = true
     AND c.tipo = lower(v_lanc.tipo)
    LEFT JOIN public.fin_centros_custo cc
      ON cc.id = r.centro_custo_id
     AND cc.company_id = v_company_id
     AND cc.ativo = true;

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'RATEIO_INVALIDO: categoria, centro de custo ou valor invalido';
    END IF;

    IF abs(v_rateio_sum - v_lanc.valor) >= 0.01 THEN
      RAISE EXCEPTION 'RATEIO_INCOMPLETO: total (%) difere do lancamento (%)',
        v_rateio_sum, v_lanc.valor;
    END IF;

    IF v_rateio_count = 1 THEN
      SELECT r.categoria_id, r.centro_custo_id
      INTO v_header_categoria_id, v_header_centro_custo_id
      FROM jsonb_to_record(v_rateios->0) AS r(
        categoria_id uuid,
        centro_custo_id uuid
      );
    ELSE
      v_header_categoria_id := NULL;
      v_header_centro_custo_id := NULL;
    END IF;
  END IF;

  -- Competência: só a data de competência muda; a data do banco fica.
  v_competencia := COALESCE(p_data_competencia, v_lanc.data_competencia);
  v_pagamento := CASE
    WHEN v_competencia IS DISTINCT FROM v_lanc.data_competencia
      THEN COALESCE(v_lanc.data_pagamento, v_lanc.data_competencia)
    ELSE v_lanc.data_pagamento
  END;

  -- Decisão do CMV: estado anterior (auditoria e herança do cliente antigo).
  v_cmv_antes := public._fin_cmv_retrato_lancamento(v_company_id, p_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'categoria_id', r.categoria_id, 'cmv_incluir', r.cmv_incluir, 'created_at', r.created_at
  )), '[]'::jsonb)
  INTO v_old_rateios
  FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = p_id AND r.company_id = v_company_id;
  v_old_set := CASE WHEN jsonb_array_length(v_old_rateios) > 0 THEN v_old_rateios
    ELSE jsonb_build_array(jsonb_build_object('categoria_id', v_lanc.categoria_id, 'cmv_incluir', v_lanc.cmv_incluir)) END;
  v_cmv_titulo := CASE
    WHEN NOT v_despesa OR v_rateio_count > 0 THEN NULL
    WHEN v_cmv_cliente THEN
      CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END
    ELSE public._fin_cmv_heranca(v_old_set, v_header_categoria_id)
  END;

  v_antes := jsonb_build_object(
    'categoria_id', v_lanc.categoria_id,
    'centro_custo_id', v_lanc.centro_custo_id,
    'observacoes', v_lanc.observacoes,
    'data_competencia', v_lanc.data_competencia,
    'data_pagamento', v_lanc.data_pagamento,
    'cmv', v_cmv_antes,
    'rateios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'categoria_id', r.categoria_id,
        'centro_custo_id', r.centro_custo_id,
        'valor', r.valor,
        'percentual', r.percentual,
        'observacao', r.observacao
      ) ORDER BY r.created_at, r.id)
      FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = p_id
        AND r.company_id = v_company_id
    ), '[]'::jsonb)
  );

  UPDATE public.fin_lancamentos l
  SET categoria_id = v_header_categoria_id,
      centro_custo_id = v_header_centro_custo_id,
      observacoes = public.strip_html(p_observacoes),
      justificativa_edicao = btrim(p_justificativa_edicao),
      data_competencia = v_competencia,
      data_pagamento = v_pagamento,
      cmv_incluir = v_cmv_titulo,
      updated_at = now()
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  RETURNING l.updated_at INTO v_updated_at;

  DELETE FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = p_id
    AND r.company_id = v_company_id;

  IF v_rateio_count > 0 THEN
    FOR v_r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      id uuid, categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric, observacao text, cmv_incluir boolean
    ) LOOP
      v_line_id := NULL;
      v_line_created := NULL;
      IF v_r.id IS NOT NULL AND NOT (v_r.id = ANY(v_usados)) THEN
        SELECT o.id, o.created_at INTO v_line_id, v_line_created
        FROM jsonb_to_recordset(v_old_rateios) AS o(id uuid, created_at timestamptz)
        WHERE o.id = v_r.id;
      END IF;
      IF v_line_id IS NULL THEN
        v_line_id := gen_random_uuid();
        v_line_created := now();
      END IF;
      v_usados := v_usados || v_line_id;

      INSERT INTO public.fin_lancamento_rateios (
        id, lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir, created_at
      ) VALUES (
        v_line_id, p_id, v_r.categoria_id, v_r.centro_custo_id, v_r.valor,
        round((v_r.valor / v_lanc.valor) * 100, 4), public.strip_html(v_r.observacao), v_company_id,
        CASE
          WHEN NOT v_despesa THEN NULL
          WHEN v_cmv_cliente THEN v_r.cmv_incluir
          ELSE public._fin_cmv_heranca(v_old_set, v_r.categoria_id)
        END,
        v_line_created
      );
    END LOOP;
  END IF;

  v_depois := jsonb_build_object(
    'categoria_id', v_header_categoria_id,
    'centro_custo_id', v_header_centro_custo_id,
    'observacoes', public.strip_html(p_observacoes),
    'data_competencia', v_competencia,
    'data_pagamento', v_pagamento,
    'cmv', public._fin_cmv_retrato_lancamento(v_company_id, p_id),
    'rateios', v_rateios,
    'conciliado_preservado', true,
    'justificativa', btrim(p_justificativa_edicao)
  );

  INSERT INTO public.fin_audit_logs (
    entidade,
    entidade_id,
    acao,
    user_id,
    company_id,
    antes,
    depois
  ) VALUES (
    'lancamentos',
    p_id,
    'editar_classificacao_conciliado',
    v_user_id,
    v_company_id,
    v_antes,
    v_depois
  );

  RETURN QUERY SELECT p_id, v_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date) TO authenticated, service_role;

-- O DROP da assinatura antiga apagou o comentário que ela tinha.
COMMENT ON FUNCTION public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date) IS
  'Reclassifica um lançamento conciliado sem desfazer a conciliação: altera só categoria, centro de custo, rateios, observações, data de competência e a decisão do CMV, sempre com justificativa, e mantém o vínculo da conciliação (fin_conciliacao_vinculos). Valor, conta, tipo, status, descrição e data do banco exigem desconciliar.';

-- ─── Classificação depois (revisão do CMV): boletos E lançamentos ────────────
-- p_itens: [{ conta_pagar_id | lancamento_id, rateio_id | null, incluir, expected_updated_at }]
-- Exatamente um documento por item. Só a decisão do CMV muda; tudo ou nada.
-- Ordem de bloqueio: boletos por id, depois lançamentos por id — a mesma de
-- fin_cmv_aplicar_padroes —, para dois lotes nunca se travarem.
-- O caminho do boleto é o do banco vivo (20261003140000_cmv_financeiro.sql; o prosrc
-- vivo em 2026-10-05 tem o mesmo md5, com fim de linha CRLF): mesmos gates, mesmo
-- lock otimista e mesma auditoria. O que muda é só aceitar o lançamento ao lado.
-- Lançamento: só o que a apuração conta (_fin_cmv_linhas_lancamentos) — despesa não
-- cancelada, sem referência de título, conciliada se veio da conciliação e que não
-- seja a baixa de um boleto (fin_contas_pagar.lancamento_id).
CREATE OR REPLACE FUNCTION public.fin_cmv_classificar(
  p_itens jsonb,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_total integer;
  v_documentos integer;
  v_lancamentos integer;
  v_cp record;
  v_lanc record;
  v_item record;
  v_antes jsonb;
  v_depois jsonb;
  v_tem_rateio boolean;
  v_now timestamptz := now();
  v_atualizados jsonb := '[]'::jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;
  v_total := jsonb_array_length(p_itens);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_LOTE_INVALIDO';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    WHERE jsonb_typeof(e) <> 'object'
      OR NOT (e ? 'incluir')
      OR jsonb_typeof(e->'incluir') NOT IN ('boolean', 'null')
      OR (jsonb_typeof(e->'conta_pagar_id') IS NOT DISTINCT FROM 'string')
         = (jsonb_typeof(e->'lancamento_id') IS NOT DISTINCT FROM 'string')
      OR jsonb_typeof(e->'expected_updated_at') IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  SELECT count(DISTINCT COALESCE(e->>'conta_pagar_id', e->>'lancamento_id')),
         count(DISTINCT e->>'lancamento_id')
  INTO v_documentos, v_lancamentos
  FROM jsonb_array_elements(p_itens) e;

  -- Um documento: quem edita aquele cadastro também classifica. Lote (revisão
  -- do histórico): só quem gerencia o CMV.
  IF v_documentos > 1 THEN
    IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
    END IF;
  ELSIF v_lancamentos = 1 THEN
    IF NOT public.has_any_permission(v_uid, ARRAY[
      'financeiro:cmv:manage', 'financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile',
      'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:lancamentos:edit';
    END IF;
  ELSIF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:cmv:manage', 'financeiro:pagar:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:pagar:edit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    GROUP BY COALESCE(e->>'conta_pagar_id', e->>'lancamento_id'), e->>'rateio_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ITEM_DUPLICADO';
  END IF;

  -- Boletos (mesma regra de antes).
  FOR v_cp IN
    SELECT cp.id, cp.status, cp.updated_at
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.id IN (
        SELECT (e->>'conta_pagar_id')::uuid FROM jsonb_array_elements(p_itens) e
        WHERE jsonb_typeof(e->'conta_pagar_id') = 'string'
      )
    ORDER BY cp.id
    FOR UPDATE
  LOOP
    IF v_cp.status = 'CANCELADO' THEN
      RAISE EXCEPTION 'STATUS_INVALIDO: %', v_cp.status;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'conta_pagar_id')::uuid = v_cp.id
        AND (e->>'expected_updated_at')::timestamptz <> v_cp.updated_at
    ) THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %', v_cp.id;
    END IF;

    v_antes := public._fin_cmv_retrato(v_company_id, v_cp.id);
    v_tem_rateio := EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = v_cp.id AND r.company_id = v_company_id
    );

    FOR v_item IN
      SELECT NULLIF(e->>'rateio_id', '')::uuid AS rateio_id,
        CASE WHEN jsonb_typeof(e->'incluir') = 'boolean' THEN (e->>'incluir')::boolean END AS incluir
      FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'conta_pagar_id')::uuid = v_cp.id
    LOOP
      IF v_item.rateio_id IS NULL THEN
        IF v_tem_rateio THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: boleto rateado classifica por linha';
        END IF;
        UPDATE public.fin_contas_pagar
        SET cmv_incluir = v_item.incluir
        WHERE id = v_cp.id AND company_id = v_company_id;
      ELSE
        UPDATE public.fin_lancamento_rateios
        SET cmv_incluir = v_item.incluir
        WHERE id = v_item.rateio_id AND lancamento_id = v_cp.id AND company_id = v_company_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'NOT_FOUND: linha de rateio';
        END IF;
      END IF;
    END LOOP;

    -- A decisão faz parte da versão do boleto: quem estiver editando em outra
    -- tela recebe conflito em vez de sobrescrever.
    UPDATE public.fin_contas_pagar
    SET updated_at = v_now
    WHERE id = v_cp.id AND company_id = v_company_id;

    v_depois := public._fin_cmv_retrato(v_company_id, v_cp.id);

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES ('contas_pagar', v_cp.id, 'cmv_classificar', v_antes, v_depois,
      COALESCE(public.strip_html(p_justificativa), ''), v_uid, v_company_id);

    v_atualizados := v_atualizados || jsonb_build_object(
      'conta_pagar_id', v_cp.id,
      'updated_at', (SELECT cp.updated_at FROM public.fin_contas_pagar cp WHERE cp.id = v_cp.id AND cp.company_id = v_company_id)
    );
  END LOOP;

  -- Lançamentos (Livro Razão e conciliação).
  FOR v_lanc IN
    SELECT l.id, l.status, l.tipo, l.origem, l.conciliado, l.referencia_modulo, l.updated_at
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.id IN (
        SELECT (e->>'lancamento_id')::uuid FROM jsonb_array_elements(p_itens) e
        WHERE jsonb_typeof(e->'lancamento_id') = 'string'
      )
    ORDER BY l.id
    FOR UPDATE
  LOOP
    IF v_lanc.status = 'CANCELADO' THEN
      RAISE EXCEPTION 'STATUS_INVALIDO: %', v_lanc.status;
    END IF;
    -- Mesma regra da apuração (_fin_cmv_linhas_lancamentos): espelho de baixa,
    -- encargo, receita e transferência não são despesas do CMV (o boleto de origem
    -- é que se classifica); nem a linha da conciliação desconciliada; nem a baixa de
    -- um boleto que perdeu o carimbo de referencia_modulo (o título aponta para ela).
    IF v_lanc.tipo <> 'DESPESA'
       OR NULLIF(v_lanc.referencia_modulo, '') IS NOT NULL
       OR v_lanc.origem IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento')
       OR (v_lanc.origem = 'conciliacao' AND v_lanc.conciliado IS NOT TRUE)
       OR EXISTS (
         SELECT 1 FROM public.fin_contas_pagar cp
         WHERE cp.company_id = v_company_id AND cp.lancamento_id = v_lanc.id
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: lançamento fora do CMV financeiro';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'lancamento_id')::uuid = v_lanc.id
        AND (e->>'expected_updated_at')::timestamptz <> v_lanc.updated_at
    ) THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %', v_lanc.id;
    END IF;

    v_antes := public._fin_cmv_retrato_lancamento(v_company_id, v_lanc.id);
    v_tem_rateio := EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = v_lanc.id AND r.company_id = v_company_id
    );

    FOR v_item IN
      SELECT NULLIF(e->>'rateio_id', '')::uuid AS rateio_id,
        CASE WHEN jsonb_typeof(e->'incluir') = 'boolean' THEN (e->>'incluir')::boolean END AS incluir
      FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'lancamento_id')::uuid = v_lanc.id
    LOOP
      IF v_item.rateio_id IS NULL THEN
        IF v_tem_rateio THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: lançamento rateado classifica por linha';
        END IF;
        UPDATE public.fin_lancamentos
        SET cmv_incluir = v_item.incluir
        WHERE id = v_lanc.id AND company_id = v_company_id;
      ELSE
        UPDATE public.fin_lancamento_rateios
        SET cmv_incluir = v_item.incluir
        WHERE id = v_item.rateio_id AND lancamento_id = v_lanc.id AND company_id = v_company_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'NOT_FOUND: linha de rateio';
        END IF;
      END IF;
    END LOOP;

    -- Só a versão muda: nenhum campo vigiado pelo gatilho de lançamento realizado.
    UPDATE public.fin_lancamentos
    SET updated_at = v_now
    WHERE id = v_lanc.id AND company_id = v_company_id;

    v_depois := public._fin_cmv_retrato_lancamento(v_company_id, v_lanc.id);

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES ('lancamentos', v_lanc.id, 'cmv_classificar', v_antes, v_depois,
      COALESCE(public.strip_html(p_justificativa), ''), v_uid, v_company_id);

    v_atualizados := v_atualizados || jsonb_build_object(
      'lancamento_id', v_lanc.id,
      'updated_at', (SELECT l.updated_at FROM public.fin_lancamentos l WHERE l.id = v_lanc.id AND l.company_id = v_company_id)
    );
  END LOOP;

  IF jsonb_array_length(v_atualizados) <> v_documentos THEN
    RAISE EXCEPTION 'NOT_FOUND: documento';
  END IF;

  RETURN jsonb_build_object('titulos', v_documentos, 'itens', v_total, 'atualizados', v_atualizados);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_cmv_classificar(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_classificar(jsonb, text) TO authenticated, service_role;

-- ─── Aplicar o padrão da categoria às linhas pendentes (histórico) ───────────
-- Só linhas PENDENTES (cmv_incluir NULL) de categoria COM padrão, com competência
-- a partir de p_desde, de boletos e de lançamentos. Decisão já tomada nunca é
-- trocada e categoria sem padrão continua pendente. p_simular (padrão) só conta.
-- A elegibilidade (o que é despesa do CMV) vem de _fin_cmv_linhas_fontes: não é
-- repetida aqui, então a baixa legada de boleto e o espelho ficam de fora sozinhos.
CREATE OR REPLACE FUNCTION public.fin_cmv_aplicar_padroes(
  p_desde date,
  p_simular boolean DEFAULT true,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_doc record;
  v_antes jsonb;
  v_depois jsonb;
  v_n integer;
  v_sim bigint;
  v_nao bigint;
  v_linhas_doc integer;
  v_sim_doc bigint;
  v_nao_doc bigint;
  v_documentos integer := 0;
  v_linhas integer := 0;
  v_total_sim bigint := 0;
  v_total_nao bigint := 0;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_OBRIGATORIO';
  END IF;

  IF COALESCE(p_simular, true) THEN
    RETURN (
      WITH alvo AS (
        SELECT l.fonte, l.documento_id, round(l.valor * 100)::bigint AS centavos, c.cmv_sugerir
        FROM public._fin_cmv_linhas_fontes(v_company_id) l
        LEFT JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.company_id = v_company_id
        WHERE l.cmv_incluir IS NULL AND l.data_competencia >= p_desde
      ),
      por_fonte AS (
        SELECT f.fonte, jsonb_build_object(
          'documentos', count(DISTINCT a.documento_id) FILTER (WHERE a.cmv_sugerir IS NOT NULL),
          'linhas_sim', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS TRUE),
          'centavos_sim', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS TRUE), 0),
          'linhas_nao', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS FALSE),
          'centavos_nao', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS FALSE), 0),
          'linhas_sem_padrao', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS NULL),
          'centavos_sem_padrao', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS NULL), 0)
        ) AS resumo
        FROM (VALUES ('boleto'), ('lancamento')) AS f(fonte)
        LEFT JOIN alvo a ON a.fonte = f.fonte
        GROUP BY f.fonte
      )
      SELECT jsonb_build_object(
        'simulado', true,
        'desde', p_desde,
        'boleto', (SELECT resumo FROM por_fonte WHERE fonte = 'boleto'),
        'lancamento', (SELECT resumo FROM por_fonte WHERE fonte = 'lancamento')
      )
    );
  END IF;

  IF NULLIF(btrim(p_justificativa), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  -- Ordem fixa: boletos, depois lançamentos, por id — a mesma de fin_cmv_classificar.
  FOR v_doc IN
    SELECT DISTINCT l.fonte, l.documento_id
    FROM public._fin_cmv_linhas_fontes(v_company_id) l
    JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.company_id = v_company_id
    WHERE l.cmv_incluir IS NULL AND l.data_competencia >= p_desde AND c.cmv_sugerir IS NOT NULL
    ORDER BY l.fonte, l.documento_id
  LOOP
    IF v_doc.fonte = 'boleto' THEN
      PERFORM 1 FROM public.fin_contas_pagar cp
      WHERE cp.id = v_doc.documento_id AND cp.company_id = v_company_id FOR UPDATE;
      v_antes := public._fin_cmv_retrato(v_company_id, v_doc.documento_id);
    ELSE
      PERFORM 1 FROM public.fin_lancamentos l
      WHERE l.id = v_doc.documento_id AND l.company_id = v_company_id FOR UPDATE;
      v_antes := public._fin_cmv_retrato_lancamento(v_company_id, v_doc.documento_id);
    END IF;

    -- Linhas de rateio pendentes (boleto e lançamento usam a mesma tabela).
    WITH alteradas AS (
      UPDATE public.fin_lancamento_rateios r
      SET cmv_incluir = c.cmv_sugerir
      FROM public.fin_categorias c
      WHERE r.lancamento_id = v_doc.documento_id AND r.company_id = v_company_id
        AND r.cmv_incluir IS NULL
        AND c.id = r.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
      RETURNING r.cmv_incluir, round(r.valor * 100)::bigint AS centavos
    )
    SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
    INTO v_linhas_doc, v_sim_doc, v_nao_doc
    FROM alteradas;

    -- Documento sem rateio: a decisão é do cabeçalho.
    IF v_doc.fonte = 'boleto' THEN
      WITH alterado AS (
        UPDATE public.fin_contas_pagar cp
        SET cmv_incluir = c.cmv_sugerir
        FROM public.fin_categorias c
        WHERE cp.id = v_doc.documento_id AND cp.company_id = v_company_id
          AND cp.cmv_incluir IS NULL
          AND c.id = cp.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios r
            WHERE r.lancamento_id = cp.id AND r.company_id = cp.company_id
          )
        RETURNING cp.cmv_incluir, round(cp.valor * 100)::bigint AS centavos
      )
      SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
      INTO v_n, v_sim, v_nao
      FROM alterado;
    ELSE
      WITH alterado AS (
        UPDATE public.fin_lancamentos l
        SET cmv_incluir = c.cmv_sugerir
        FROM public.fin_categorias c
        WHERE l.id = v_doc.documento_id AND l.company_id = v_company_id
          AND l.cmv_incluir IS NULL
          AND c.id = l.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios r
            WHERE r.lancamento_id = l.id AND r.company_id = l.company_id
          )
        RETURNING l.cmv_incluir, round(l.valor * 100)::bigint AS centavos
      )
      SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
      INTO v_n, v_sim, v_nao
      FROM alterado;
    END IF;
    v_linhas_doc := v_linhas_doc + v_n;
    v_sim_doc := v_sim_doc + v_sim;
    v_nao_doc := v_nao_doc + v_nao;

    -- Alguém decidiu a linha entre a listagem e o bloqueio: nada mudou neste
    -- documento, então nem a versão nem a auditoria se mexem.
    IF v_linhas_doc = 0 THEN CONTINUE; END IF;

    IF v_doc.fonte = 'boleto' THEN
      UPDATE public.fin_contas_pagar SET updated_at = v_now
      WHERE id = v_doc.documento_id AND company_id = v_company_id;
      v_depois := public._fin_cmv_retrato(v_company_id, v_doc.documento_id);
    ELSE
      UPDATE public.fin_lancamentos SET updated_at = v_now
      WHERE id = v_doc.documento_id AND company_id = v_company_id;
      v_depois := public._fin_cmv_retrato_lancamento(v_company_id, v_doc.documento_id);
    END IF;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES (CASE WHEN v_doc.fonte = 'boleto' THEN 'contas_pagar' ELSE 'lancamentos' END,
      v_doc.documento_id, 'cmv_aplicar_padroes', v_antes, v_depois,
      public.strip_html(btrim(p_justificativa)), v_uid, v_company_id);

    v_documentos := v_documentos + 1;
    v_linhas := v_linhas + v_linhas_doc;
    v_total_sim := v_total_sim + v_sim_doc;
    v_total_nao := v_total_nao + v_nao_doc;
  END LOOP;

  RETURN jsonb_build_object('simulado', false, 'desde', p_desde, 'documentos', v_documentos, 'linhas', v_linhas,
    'centavos_sim', v_total_sim, 'centavos_nao', v_total_nao);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
