-- ─────────────────────────────────────────────────────────────────────────────
-- CMV Financeiro (Financeiro → CMV)
--
-- Indicador gerencial: boletos de Contas a Pagar marcados para o CMV, pela DATA
-- DE COMPETÊNCIA, sobre o faturamento bruto do Fechamento de Caixa. Não altera
-- DRE, DFC, Borderô, CMV de estoque nem a baixa/pagamento dos boletos.
--
-- Migration ADITIVA:
--   * a decisão "Aparecer no CMV financeiro?" mora na LINHA DE RATEIO
--     (fin_lancamento_rateios.cmv_incluir). Boleto de categoria única não tem
--     linha de rateio, então a decisão dele mora em fin_contas_pagar.cmv_incluir
--     e só vale enquanto não existir rateio ("rateio manda").
--   * NULL = pendente de classificação. Nada do histórico é classificado aqui.
--   * fin_categorias.cmv_sugerir é só o padrão SUGERIDO em lançamento novo;
--     nenhum relatório lê essa coluna.
--   * cliente antigo (sem p_cmv) continua criando/editando boleto: a decisão
--     fica pendente ou é herdada da mesma categoria do próprio boleto.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fin_contas_pagar       ADD COLUMN IF NOT EXISTS cmv_incluir boolean;
ALTER TABLE public.fin_lancamento_rateios ADD COLUMN IF NOT EXISTS cmv_incluir boolean;
ALTER TABLE public.fin_categorias         ADD COLUMN IF NOT EXISTS cmv_sugerir boolean;

COMMENT ON COLUMN public.fin_contas_pagar.cmv_incluir IS
  'CMV Financeiro: decisão do boleto SEM rateio (true entra, false fica fora, NULL pendente). Ignorada quando há linhas em fin_lancamento_rateios.';
COMMENT ON COLUMN public.fin_lancamento_rateios.cmv_incluir IS
  'CMV Financeiro: decisão da linha de rateio de um boleto (true entra, false fica fora, NULL pendente). Sem efeito em rateio de lançamento/conta a receber.';
COMMENT ON COLUMN public.fin_categorias.cmv_sugerir IS
  'CMV Financeiro: padrão sugerido em lançamentos novos. Não altera boletos já cadastrados e não é lido pela apuração.';

-- ─── RBAC ────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('financeiro:cmv:view',   'Financeiro → CMV Financeiro → Ver',       'financeiro', 'cmv', 'view'),
  ('financeiro:cmv:export', 'Financeiro → CMV Financeiro → Exportar',  'financeiro', 'cmv', 'export'),
  ('financeiro:cmv:manage', 'Financeiro → CMV Financeiro → Gerenciar', 'financeiro', 'cmv', 'manage')
ON CONFLICT (key) DO UPDATE
  SET description = excluded.description,
      module      = excluded.module,
      submodule   = excluded.submodule,
      action      = excluded.action;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('admin'), ('diretor'), ('gerente_geral')) AS r(role)
CROSS JOIN (VALUES
  ('financeiro:cmv:view'),
  ('financeiro:cmv:export'),
  ('financeiro:cmv:manage')
) AS p(key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = r.role AND rp.permission_key = p.key
);

-- ─── Helpers internos (sem EXECUTE para clientes) ────────────────────────────

-- Fonte única das linhas classificáveis: uma linha por rateio do boleto, ou o
-- próprio boleto quando ele não tem rateio. Cada parcela é um título próprio,
-- com a sua competência — nunca se soma pai + parcelas + baixa.
-- Estados que contam: AGUARDANDO_APROVACAO, APROVADO, PAGO (a baixa não muda o
-- valor; estorno devolve para APROVADO e o boleto continua contando).
-- Ficam fora: RASCUNHO e CANCELADO. Boleto excluído é DELETE físico.
CREATE OR REPLACE FUNCTION public._fin_cmv_linhas(p_company_id uuid)
RETURNS TABLE (
  conta_pagar_id uuid,
  rateio_id uuid,
  categoria_id uuid,
  valor numeric,
  cmv_incluir boolean,
  data_competencia date
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT cp.id, r.id, r.categoria_id, r.valor, r.cmv_incluir, cp.data_competencia
  FROM public.fin_contas_pagar cp
  JOIN public.fin_lancamento_rateios r
    ON r.lancamento_id = cp.id AND r.company_id = cp.company_id
  WHERE cp.company_id = p_company_id
    AND cp.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'PAGO')
  UNION ALL
  SELECT cp.id, NULL::uuid, cp.categoria_id, cp.valor, cp.cmv_incluir, cp.data_competencia
  FROM public.fin_contas_pagar cp
  WHERE cp.company_id = p_company_id
    AND cp.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'PAGO')
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = cp.id AND r.company_id = cp.company_id
    );
$$;

-- Retrato da classificação de UM boleto (qualquer status), para auditoria e
-- para reconhecer reenvio.
CREATE OR REPLACE FUNCTION public._fin_cmv_retrato(p_company_id uuid, p_conta_pagar_id uuid)
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
    WHERE r.lancamento_id = p_conta_pagar_id AND r.company_id = p_company_id
    UNION ALL
    SELECT NULL::uuid, cp.categoria_id, cp.valor, cp.cmv_incluir
    FROM public.fin_contas_pagar cp
    WHERE cp.id = p_conta_pagar_id AND cp.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = cp.company_id
      )
  ) x;
$$;

-- Ativação por empresa: enquanto desligada, o formulário de Contas a Pagar não
-- pede a decisão e nada muda no fluxo atual.
CREATE OR REPLACE FUNCTION public._fin_cmv_ativo(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT c.value = 'true' FROM public.fin_config c
    WHERE c.company_id = p_company_id AND c.key = 'cmv_financeiro_ativo'
  ), false);
$$;

-- Payload do relatório. Devolve fatos por dia (centavos inteiros); totais,
-- percentuais, agrupamentos e comparação são calculados por UMA implementação
-- no cliente (src/domain/financeiro/cmv), a mesma que abastece tela e PDF.
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
    FROM public._fin_cmv_linhas(p_company_id) l
  ),
  cmv AS (
    SELECT data_competencia AS data, categoria_id, sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1, 2
  ),
  boletos AS (
    SELECT data_competencia AS data, count(DISTINCT conta_pagar_id)::int AS quantidade
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1
  ),
  qualidade AS (
    SELECT data_competencia AS data,
      CASE WHEN cmv_incluir IS NULL THEN 'pendente' ELSE 'fora' END AS situacao,
      count(DISTINCT conta_pagar_id)::int AS titulos,
      sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS NOT TRUE
    GROUP BY 1, 2
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
    -- indice: posição da categoria no cadastro da empresa (ordem de criação).
    -- Não depende do período, então a cor da categoria é a mesma em qualquer filtro.
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
    'boletos', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'quantidade', quantidade) ORDER BY data) FROM boletos), '[]'::jsonb),
    'qualidade', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'situacao', situacao, 'titulos', titulos, 'centavos', centavos) ORDER BY data, situacao) FROM qualidade), '[]'::jsonb),
    'categorias', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'parent_id', parent_id, 'codigo', codigo, 'ordem', ordem, 'ativo', ativo, 'indice', indice) ORDER BY nome, id) FROM categorias), '[]'::jsonb),
    'sem_competencia', (
      SELECT jsonb_build_object(
        'titulos', count(DISTINCT conta_pagar_id),
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM linhas WHERE data_competencia IS NULL
    ),
    'pendentes_geral', (
      SELECT jsonb_build_object(
        'titulos', count(DISTINCT conta_pagar_id),
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM linhas WHERE cmv_incluir IS NULL
    )
  );
$$;

-- Detalhe (drill-down e revisão de pendências), paginado.
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
        'updated_at', p.updated_at
      ) ORDER BY p.data_competencia DESC NULLS FIRST, p.descricao, p.conta_pagar_id, p.rateio_id NULLS FIRST)
      FROM pagina p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_linhas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_retrato(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_ativo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_payload(uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_lista(uuid, date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ─── RPCs de leitura ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_fin_cmv_financeiro(
  p_inicio date,
  p_fim date,
  p_anterior_inicio date DEFAULT NULL,
  p_anterior_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:cmv:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:view';
  END IF;

  IF p_inicio IS NULL OR p_fim IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_OBRIGATORIO';
  END IF;
  IF p_fim < p_inicio THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_INVALIDO';
  END IF;
  IF p_fim - p_inicio > 366 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_LONGO';
  END IF;
  IF (p_anterior_inicio IS NULL) <> (p_anterior_fim IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_COMPARACAO_INVALIDA';
  END IF;
  IF p_anterior_inicio IS NOT NULL AND (
    p_anterior_fim < p_anterior_inicio
    OR p_anterior_fim >= p_inicio
    OR p_anterior_fim - p_anterior_inicio > 366
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_COMPARACAO_INVALIDA';
  END IF;

  RETURN public._fin_cmv_payload(v_company_id, p_inicio, p_fim, p_anterior_inicio, p_anterior_fim);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_fin_cmv_linhas(
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL,
  p_situacao text DEFAULT 'incluido',
  p_categoria_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_so_direto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:cmv:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:view';
  END IF;

  IF p_situacao IS NULL OR p_situacao NOT IN ('incluido', 'fora', 'pendente', 'sem_competencia', 'todos') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_SITUACAO_INVALIDA';
  END IF;
  IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_INVALIDO';
  END IF;

  RETURN public._fin_cmv_lista(
    v_company_id, p_inicio, p_fim, p_situacao, p_categoria_id,
    LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500),
    GREATEST(COALESCE(p_offset, 0), 0),
    COALESCE(p_so_direto, false)
  );
END;
$$;

-- Configuração visível para quem lança boleto (padrões sugeridos) e para a
-- tela de Regras de vínculo. Devolve só categorias de despesa da empresa.
CREATE OR REPLACE FUNCTION public.get_fin_cmv_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:cmv:view', 'financeiro:pagar:view', 'financeiro:pagar:create',
    'financeiro:pagar:edit', 'finance:read', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:view';
  END IF;

  RETURN jsonb_build_object(
    'classificacao_ativa', public._fin_cmv_ativo(v_company_id),
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

-- ─── RPCs de escrita ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fin_cmv_set_ativo(p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_antes boolean;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
  END IF;
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  v_antes := public._fin_cmv_ativo(v_company_id);

  INSERT INTO public.fin_config (company_id, key, value, updated_by)
  VALUES (v_company_id, 'cmv_financeiro_ativo', CASE WHEN p_ativo THEN 'true' ELSE 'false' END, v_uid)
  ON CONFLICT (company_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;

  INSERT INTO public.fin_audit_logs (entidade, acao, user_id, company_id, antes, depois)
  VALUES ('config', 'cmv_financeiro_ativo', v_uid, v_company_id,
    jsonb_build_object('cmv_financeiro_ativo', v_antes),
    jsonb_build_object('cmv_financeiro_ativo', p_ativo));

  RETURN jsonb_build_object('classificacao_ativa', p_ativo);
END;
$$;

-- Padrão sugerido por categoria. NÃO toca em boleto nenhum.
CREATE OR REPLACE FUNCTION public.fin_cmv_set_categoria_padrao(
  p_categoria_id uuid,
  p_sugerir boolean,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_cat record;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
  END IF;

  SELECT c.id, c.nome, c.tipo, c.cmv_sugerir, c.updated_at INTO v_cat
  FROM public.fin_categorias c
  WHERE c.id = p_categoria_id AND c.company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_cat.tipo <> 'despesa' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_CATEGORIA_INVALIDA';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_cat.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  UPDATE public.fin_categorias
  SET cmv_sugerir = p_sugerir, updated_at = v_now
  WHERE id = p_categoria_id AND company_id = v_company_id;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes, depois)
  VALUES ('categorias', p_categoria_id, 'cmv_padrao', v_uid, v_company_id,
    jsonb_build_object('nome', v_cat.nome, 'cmv_sugerir', v_cat.cmv_sugerir),
    jsonb_build_object('nome', v_cat.nome, 'cmv_sugerir', p_sugerir));

  RETURN jsonb_build_object('id', p_categoria_id, 'cmv_sugerir', p_sugerir, 'updated_at', v_now);
END;
$$;

-- Classificação de boletos já cadastrados (inclusive PAGO, que a edição comum
-- não alcança). Só mexe na decisão do CMV: valor, categoria, rateio, status e
-- baixa ficam intactos. Tudo ou nada; conflito de edição concorrente aborta.
--   p_itens: [{ conta_pagar_id, rateio_id | null, incluir: true|false|null,
--               expected_updated_at }]
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
  v_titulos integer;
  v_cp record;
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
      OR jsonb_typeof(e->'conta_pagar_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(e->'expected_updated_at') IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  SELECT count(DISTINCT (e->>'conta_pagar_id')) INTO v_titulos
  FROM jsonb_array_elements(p_itens) e;

  -- Um boleto: quem edita Contas a Pagar também classifica. Lote (revisão do
  -- histórico): só quem gerencia o CMV.
  IF v_titulos > 1 THEN
    IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
    END IF;
  ELSIF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:cmv:manage', 'financeiro:pagar:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:pagar:edit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    GROUP BY e->>'conta_pagar_id', e->>'rateio_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ITEM_DUPLICADO';
  END IF;

  -- Ordem fixa de bloqueio: dois lotes com os mesmos boletos não entram em deadlock.
  FOR v_cp IN
    SELECT cp.id, cp.status, cp.updated_at
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.id IN (SELECT (e->>'conta_pagar_id')::uuid FROM jsonb_array_elements(p_itens) e)
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

  IF jsonb_array_length(v_atualizados) <> v_titulos THEN
    RAISE EXCEPTION 'NOT_FOUND: conta a pagar';
  END IF;

  RETURN jsonb_build_object('titulos', v_titulos, 'itens', v_total, 'atualizados', v_atualizados);
END;
$$;

-- ─── Contas a Pagar: criação/edição passam a carregar a decisão ──────────────
-- p_cmv (novo, opcional): {"incluir": true|false|null} = decisão do boleto SEM
-- rateio. Com rateio, cada linha de p_rateios leva "cmv_incluir" (e, na edição,
-- o "id" da linha, que é preservado). p_cmv NULL = cliente antigo.

DROP FUNCTION IF EXISTS public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb);

CREATE FUNCTION public._guarded_create_conta_pagar(
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'boleto'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_dados_pagamento jsonb DEFAULT NULL::jsonb,
  p_cmv jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_status text;
  v_threshold numeric;
  v_id uuid;
  v_child_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_forn text;
  v_obs text;
  v_rateios jsonb;
  v_recorrencia jsonb;
  v_frequency text;
  v_total integer := 1;
  v_index integer;
  v_due_date date;
  v_competence_date date;
  r record;
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing record;
  v_replay boolean := false;
  v_constraint text;
  v_cmv_cliente boolean := p_cmv IS NOT NULL;
  v_cmv_titulo boolean;
  v_tem_rateio boolean;
  v_soma numeric;
  v_pendentes integer := 0;
  v_incluido numeric := 0;
  v_retrato jsonb;
BEGIN
  IF p_dados_pagamento IS NOT NULL AND (jsonb_typeof(p_dados_pagamento) <> 'object'
    OR (p_dados_pagamento->'tipo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'tipo') NOT IN ('string','null'))
    OR (p_dados_pagamento->'codigo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'codigo') NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'CODIGO_PAGAMENTO_INVALIDO';
  END IF;
  IF v_cmv_cliente AND (jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv->'incluir' IS NOT NULL AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean','null'))) THEN
    RAISE EXCEPTION 'CMV_INVALIDO';
  END IF;
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:pagar:create', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:create';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_forn := public.strip_html(p_fornecedor);
  v_obs := public.strip_html(p_observacoes);

  IF length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas
    WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia';
    v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;
  v_tem_rateio := jsonb_array_length(v_rateios) > 0;

  -- Decisão do CMV: só o cliente novo informa. Com rateio, a decisão é das
  -- linhas e a do título fica nula.
  IF v_cmv_cliente THEN
    IF v_tem_rateio THEN
      SELECT COALESCE(sum(round(x.valor, 2)), 0),
             count(*) FILTER (WHERE x.cmv_incluir IS NULL),
             COALESCE(sum(x.valor) FILTER (WHERE x.cmv_incluir IS TRUE), 0)
        INTO v_soma, v_pendentes, v_incluido
      FROM jsonb_to_recordset(v_rateios) AS x(valor numeric, cmv_incluir boolean);
      IF abs(v_soma - round(p_valor, 2)) > 0.01 THEN
        RAISE EXCEPTION 'RATEIO_NAO_FECHA: a soma do rateio difere do valor do boleto';
      END IF;
    ELSE
      v_cmv_titulo := CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END;
      v_pendentes := CASE WHEN v_cmv_titulo IS NULL THEN 1 ELSE 0 END;
      v_incluido := CASE WHEN v_cmv_titulo THEN p_valor ELSE 0 END;
    END IF;
    IF v_pendentes > 0 AND public._fin_cmv_ativo(v_company_id) THEN
      RAISE EXCEPTION 'CMV_DECISAO_OBRIGATORIA: informe se o boleto aparece no CMV financeiro';
    END IF;
  END IF;

  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
    END IF;
    SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
           cp.descricao, cp.categoria_id, cp.supplier_id, cp.tipo_codigo_pagamento, cp.codigo_pagamento
      INTO v_existing
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
    v_replay := FOUND;
  END IF;

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);
  v_status := CASE WHEN p_valor > v_threshold THEN 'AGUARDANDO_APROVACAO' ELSE 'APROVADO' END;

  IF NOT v_replay THEN
    BEGIN
      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, idempotency_key, tipo_codigo_pagamento, codigo_pagamento,
        cmv_incluir
      ) VALUES (
        v_desc, p_valor, v_forn, p_supplier_id,
        p_data_vencimento, p_data_competencia,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
        CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
        CASE WHEN v_recorrencia IS NOT NULL THEN v_total END,
        v_request_key, p_dados_pagamento->>'tipo', p_dados_pagamento->>'codigo',
        v_cmv_titulo
      )
      RETURNING id, created_at INTO v_id, v_created_at;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_request_key IS NULL OR v_constraint IS DISTINCT FROM 'uq_fin_contas_pagar_idempotency' THEN
        RAISE;
      END IF;
      SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
             cp.descricao, cp.categoria_id, cp.supplier_id, cp.tipo_codigo_pagamento, cp.codigo_pagamento
        INTO v_existing
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_replay := true;
    END;
  END IF;

  IF v_replay THEN
    -- Só é reenvio se descrever a MESMA operação.
    IF round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
       OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
       OR coalesce(v_existing.parcela_total, 1) IS DISTINCT FROM v_total
       OR v_existing.descricao IS DISTINCT FROM v_desc
       OR v_existing.categoria_id IS DISTINCT FROM p_categoria_id
       OR v_existing.supplier_id IS DISTINCT FROM p_supplier_id
       OR (p_dados_pagamento IS NOT NULL AND (
         v_existing.tipo_codigo_pagamento IS DISTINCT FROM (p_dados_pagamento->>'tipo')
         OR v_existing.codigo_pagamento IS DISTINCT FROM (p_dados_pagamento->>'codigo')
       )) THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    -- A decisão do CMV também identifica a operação: reenviar com outra decisão
    -- não pode voltar "já registrado" com a decisão antiga gravada.
    IF v_cmv_cliente THEN
      v_retrato := public._fin_cmv_retrato(v_company_id, v_existing.id);
      IF round((v_retrato->>'incluido')::numeric, 2) IS DISTINCT FROM round(v_incluido, 2)
         OR (v_retrato->>'pendentes')::integer IS DISTINCT FROM v_pendentes THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'created_at', v_existing.created_at,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', (
        SELECT count(*) FROM public.fin_contas_pagar cp
        WHERE cp.company_id = v_company_id
          AND (cp.id = v_existing.id OR cp.lancamento_pai_id = v_existing.id)
      ),
      'idempotente', true
    );
  END IF;

  IF v_tem_rateio THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric, cmv_incluir boolean
    ) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id, cmv_incluir
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id,
        CASE WHEN v_cmv_cliente THEN r.cmv_incluir END
      );
    END LOOP;
  END IF;

  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15)
      END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15)
      END;

      -- Cada parcela é um título próprio, com a sua competência, e herda a
      -- decisão do CMV da primeira.
      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id, cmv_incluir
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')',
        p_valor, v_forn, p_supplier_id,
        v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, false, NULL,
        v_index, v_total, v_id, v_cmv_titulo
      ) RETURNING id INTO v_child_id;

      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir
      )
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id, cmv_incluir
      FROM public.fin_lancamento_rateios
      WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES (
    'contas_pagar', v_id, 'criar',
    jsonb_build_object(
      'descricao', v_desc,
      'valor', p_valor,
      'status', v_status,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', v_total,
      'tipo_codigo_pagamento', p_dados_pagamento->>'tipo',
      'possui_codigo_pagamento', (p_dados_pagamento->>'codigo') IS NOT NULL,
      'cmv', public._fin_cmv_retrato(v_company_id, v_id)
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', v_status,
    'created_at', v_created_at,
    'limite_aprovacao', v_threshold,
    'lancamentos_criados', v_total,
    'idempotente', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb);

CREATE FUNCTION public._guarded_update_conta_pagar(
  p_id uuid,
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_dados_pagamento jsonb DEFAULT NULL::jsonb,
  p_cmv jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_status text;
  v_threshold numeric;
  v_desc text;
  v_forn text;
  v_obs text;
  v_updated_at timestamptz;
  v_rateios jsonb;
  r record;
  v_cmv_cliente boolean := p_cmv IS NOT NULL;
  v_cmv_titulo boolean;
  v_tem_rateio boolean;
  v_old_cat uuid;
  v_old_cmv boolean;
  v_old_rateios jsonb;
  v_old_set jsonb;
  v_cmv_antes jsonb;
  v_soma numeric;
  v_line_id uuid;
  v_line_created timestamptz;
  v_line_cmv boolean;
  v_usados uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_dados_pagamento IS NOT NULL AND (jsonb_typeof(p_dados_pagamento) <> 'object'
    OR (p_dados_pagamento->'tipo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'tipo') NOT IN ('string','null'))
    OR (p_dados_pagamento->'codigo' IS NOT NULL AND jsonb_typeof(p_dados_pagamento->'codigo') NOT IN ('string','null'))) THEN
    RAISE EXCEPTION 'CODIGO_PAGAMENTO_INVALIDO';
  END IF;
  IF v_cmv_cliente AND (jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv->'incluir' IS NOT NULL AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean','null'))) THEN
    RAISE EXCEPTION 'CMV_INVALIDO';
  END IF;
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT public.has_permission('financeiro:pagar:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:edit';
  END IF;

  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status,
    'tipo_codigo_pagamento', tipo_codigo_pagamento, 'possui_codigo_pagamento', codigo_pagamento IS NOT NULL),
    status, updated_at, categoria_id, cmv_incluir
  INTO v_old_data, v_status, v_updated_at, v_old_cat, v_old_cmv
  FROM public.fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;

  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_forn := public.strip_html(p_fornecedor);
  v_obs  := public.strip_html(p_observacoes);

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;
  v_tem_rateio := jsonb_array_length(v_rateios) > 0;

  IF v_cmv_cliente AND v_tem_rateio THEN
    SELECT COALESCE(sum(round(x.valor, 2)), 0) INTO v_soma
    FROM jsonb_to_recordset(v_rateios) AS x(valor numeric);
    IF abs(v_soma - round(p_valor, 2)) > 0.01 THEN
      RAISE EXCEPTION 'RATEIO_NAO_FECHA: a soma do rateio difere do valor do boleto';
    END IF;
  END IF;

  -- Estado anterior da classificação (auditoria + herança do cliente antigo).
  v_cmv_antes := public._fin_cmv_retrato(v_company_id, p_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'categoria_id', categoria_id, 'cmv_incluir', cmv_incluir, 'created_at', created_at
  )), '[]'::jsonb)
  INTO v_old_rateios
  FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  v_old_set := CASE WHEN jsonb_array_length(v_old_rateios) > 0 THEN v_old_rateios
    ELSE jsonb_build_array(jsonb_build_object('categoria_id', v_old_cat, 'cmv_incluir', v_old_cmv)) END;

  -- Decisão do título (boleto sem rateio). Cliente antigo não informa: mantém a
  -- decisão que a MESMA categoria já tinha neste boleto; categoria trocada volta
  -- para pendente, à vista na revisão.
  v_cmv_titulo := CASE
    WHEN v_tem_rateio THEN NULL
    WHEN v_cmv_cliente THEN
      CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END
    ELSE (
      SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE o.cmv_incluir IS NULL) = 0
                   AND count(DISTINCT o.cmv_incluir) = 1 THEN bool_and(o.cmv_incluir) END
      FROM jsonb_to_recordset(v_old_set) AS o(categoria_id uuid, cmv_incluir boolean)
      WHERE o.categoria_id IS NOT DISTINCT FROM p_categoria_id
    )
  END;

  -- Com a classificação ativa, a edição não devolve para "pendente" uma decisão
  -- já tomada (mesma linha de rateio, ou o próprio título sem rateio): quem
  -- troca a categoria responde de novo. Pendência herdada do histórico segue aceita.
  IF v_cmv_cliente AND public._fin_cmv_ativo(v_company_id) THEN
    IF v_tem_rateio THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(v_rateios) AS n(id uuid, cmv_incluir boolean)
        JOIN jsonb_to_recordset(v_old_rateios) AS o(id uuid, cmv_incluir boolean) ON o.id = n.id
        WHERE o.cmv_incluir IS NOT NULL AND n.cmv_incluir IS NULL
      ) THEN
        RAISE EXCEPTION 'CMV_DECISAO_OBRIGATORIA: informe se a linha continua no CMV financeiro';
      END IF;
    ELSIF jsonb_array_length(v_old_rateios) = 0 AND v_old_cmv IS NOT NULL AND v_cmv_titulo IS NULL THEN
      RAISE EXCEPTION 'CMV_DECISAO_OBRIGATORIA: informe se o boleto continua no CMV financeiro';
    END IF;
  END IF;

  UPDATE public.fin_contas_pagar SET
    descricao = v_desc,
    valor = p_valor,
    fornecedor = v_forn,
    supplier_id = p_supplier_id,
    data_vencimento = p_data_vencimento,
    data_competencia = p_data_competencia,
    categoria_id = p_categoria_id,
    centro_custo_id = p_centro_custo_id,
    conta_id = p_conta_id,
    forma_pagamento = p_forma_pagamento,
    tipo_codigo_pagamento = CASE WHEN p_dados_pagamento IS NULL THEN tipo_codigo_pagamento ELSE p_dados_pagamento->>'tipo' END,
    codigo_pagamento = CASE WHEN p_dados_pagamento IS NULL THEN codigo_pagamento ELSE p_dados_pagamento->>'codigo' END,
    observacoes = v_obs,
    status = v_status,
    recorrente = COALESCE((p_recorrencia IS NOT NULL), false),
    recorrencia_config = p_recorrencia,
    cmv_incluir = v_cmv_titulo,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;

  IF v_tem_rateio THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      id uuid, categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric, cmv_incluir boolean
    ) LOOP
      -- Identificador estável: a linha que já era deste boleto mantém o id.
      v_line_id := NULL;
      v_line_created := NULL;
      IF r.id IS NOT NULL AND NOT (r.id = ANY(v_usados)) THEN
        SELECT o.id, o.created_at INTO v_line_id, v_line_created
        FROM jsonb_to_recordset(v_old_rateios) AS o(id uuid, created_at timestamptz)
        WHERE o.id = r.id;
      END IF;
      IF v_line_id IS NULL THEN
        v_line_id := gen_random_uuid();
        v_line_created := now();
      END IF;
      v_usados := v_usados || v_line_id;

      v_line_cmv := CASE
        WHEN v_cmv_cliente THEN r.cmv_incluir
        ELSE (
          SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE o.cmv_incluir IS NULL) = 0
                       AND count(DISTINCT o.cmv_incluir) = 1 THEN bool_and(o.cmv_incluir) END
          FROM jsonb_to_recordset(v_old_set) AS o(categoria_id uuid, cmv_incluir boolean)
          WHERE o.categoria_id IS NOT DISTINCT FROM r.categoria_id
        )
      END;

      INSERT INTO public.fin_lancamento_rateios (
        id, lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id, cmv_incluir, created_at
      ) VALUES (
        v_line_id, p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id, v_line_cmv, v_line_created
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'editar',
    v_old_data || jsonb_build_object('cmv', v_cmv_antes),
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status,
      'dados_pagamento_informados', p_dados_pagamento IS NOT NULL,
      'cmv', public._fin_cmv_retrato(v_company_id, p_id)),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'updated_at', now(),
    'limite_aprovacao', v_threshold);
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb,jsonb) TO authenticated, service_role;

-- ─── Grants das RPCs novas ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_fin_cmv_financeiro(date, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_cmv_financeiro(date, date, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_fin_cmv_linhas(date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fin_cmv_linhas(date, date, text, uuid, integer, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_fin_cmv_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_cmv_config() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_cmv_set_ativo(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_set_ativo(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_cmv_set_categoria_padrao(uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_set_categoria_padrao(uuid, boolean, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fin_cmv_classificar(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_classificar(jsonb, text) TO authenticated, service_role;

-- ─── Escrita só pelas RPCs ───────────────────────────────────────────────────
-- As policies de UPDATE/INSERT dessas tabelas já existiam e aceitam gravação
-- direta pelo PostgREST; sem estas travas, a decisão do CMV e a ativação por
-- empresa poderiam ser alteradas sem o gate `financeiro:cmv:manage`, sem lock
-- otimista e sem auditoria. As RPCs SECURITY DEFINER rodam como owner e passam.
CREATE OR REPLACE FUNCTION public._fin_cmv_guard_decisao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF (TG_OP = 'INSERT' AND NEW.cmv_incluir IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.cmv_incluir IS DISTINCT FROM OLD.cmv_incluir) THEN
      RAISE EXCEPTION 'CMV_ESCRITA_DIRETA: a decisão do CMV financeiro só é gravada pelas RPCs do módulo'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao
  BEFORE INSERT OR UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();

CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao
  BEFORE INSERT OR UPDATE ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();

CREATE OR REPLACE FUNCTION public._fin_cmv_guard_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND 'cmv_financeiro_ativo' IN (
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.key END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.key END
     ) THEN
    RAISE EXCEPTION 'CMV_ESCRITA_DIRETA: a ativação do CMV financeiro só é alterada por fin_cmv_set_ativo'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_config
  BEFORE INSERT OR UPDATE OR DELETE ON public.fin_config
  FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_config();

REVOKE ALL ON FUNCTION public._fin_cmv_guard_decisao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_guard_config() FROM PUBLIC, anon, authenticated;

-- ─── Resolução de colunas no deploy ──────────────────────────────────────────
-- As consultas pesadas são LANGUAGE sql (validadas no CREATE); aqui elas rodam
-- uma vez, sobre uma empresa inexistente, para que erro de coluna apareça na
-- aplicação da migration e não na primeira chamada em produção.
DO $$
DECLARE
  v_vazio uuid := '00000000-0000-0000-0000-0000000000ff';
  v_payload jsonb;
BEGIN
  PERFORM 1 FROM public._fin_cmv_linhas(v_vazio);
  PERFORM public._fin_cmv_retrato(v_vazio, v_vazio);
  v_payload := public._fin_cmv_payload(v_vazio, DATE '2026-01-01', DATE '2026-01-07', DATE '2025-12-25', DATE '2025-12-31');
  IF v_payload->>'contrato' IS DISTINCT FROM 'cmv-financeiro/v1' THEN
    RAISE EXCEPTION 'CMV: payload inesperado';
  END IF;
  PERFORM public._fin_cmv_lista(v_vazio, NULL, NULL, 'pendente', NULL, 1, 0, false);
  PERFORM public._fin_cmv_lista(v_vazio, DATE '2026-01-01', DATE '2026-01-07', 'incluido', v_vazio, 1, 0, true);
END;
$$;
