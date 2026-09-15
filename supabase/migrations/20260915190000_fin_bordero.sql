-- Financeiro → Borderô: previsão de contas a vencer e disponibilidade de caixa.
--
-- Substitui, no frontend, o antigo "Relatório Sócios" (relatorio_socios_resumo
-- permanece no banco, sem consumidor). Migration puramente aditiva: duas funções
-- de leitura, nenhuma tabela/índice/dado alterado.
--
-- Regras (auditoria 2026-09-15):
--  * Contas filtradas EXCLUSIVAMENTE por fin_contas_pagar.data_vencimento, com as
--    duas pontas inclusivas — nunca competência, lançamento, criação ou pagamento.
--  * Obrigação em aberto = AGUARDANDO_APROVACAO, APROVADO, VENCIDO: o mesmo conjunto
--    "em aberto" do DRE e do índice parcial idx_fin_contas_pagar_abertos. RASCUNHO,
--    PAGO e CANCELADO ficam fora. Não existe pagamento parcial (pay_conta_pagar e
--    reconcile_pay_conta_pagar baixam o valor integral), então o valor a vencer é
--    fin_contas_pagar.valor, como em Contas a Pagar e no DRE.
--  * Categoria segue FIN-RATEIO: havendo linhas em fin_lancamento_rateios para a CP,
--    elas prevalecem e categoria_id do cabeçalho é ignorado. Sem categoria (ou
--    categoria que não pertence ao tenant) cai no nó sintético do DFC
--    "Sem categoria — Despesas" (00000000-0000-0000-0000-000000000102).
--  * Saldo das contas = fin_contas_saldo_cache das contas ativas (FIN-SALDO),
--    mantido por trigger — mesma fórmula de get_all_saldos_contas (Contas Bancárias).
--  * Tenant vem de assert_tenant() (header x-company-id validado contra
--    company_memberships); nenhum company_id é aceito do cliente.
--  * Valores devolvidos em centavos inteiros (bigint), para tela e PDF não
--    divergirem por arredondamento de float.

CREATE OR REPLACE FUNCTION public._fin_bordero_payload(
  p_company_id uuid,
  p_start date,
  p_end_inclusive date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH RECURSIVE open_payables AS (
    SELECT
      payable.id,
      payable.descricao,
      payable.fornecedor,
      payable.data_vencimento,
      payable.status,
      payable.valor,
      payable.categoria_id
    FROM public.fin_contas_pagar AS payable
    WHERE payable.company_id = p_company_id
      AND payable.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO')
      AND payable.data_vencimento >= p_start
      AND payable.data_vencimento <= p_end_inclusive
  ),
  allocations AS (
    SELECT
      allocation.id AS allocation_id,
      payable.id AS payable_id,
      allocation.categoria_id,
      allocation.valor,
      true AS split
    FROM open_payables AS payable
    JOIN public.fin_lancamento_rateios AS allocation
      ON allocation.lancamento_id = payable.id
     AND allocation.company_id = p_company_id

    UNION ALL

    SELECT
      payable.id AS allocation_id,
      payable.id AS payable_id,
      payable.categoria_id,
      payable.valor,
      false AS split
    FROM open_payables AS payable
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios AS allocation
      WHERE allocation.lancamento_id = payable.id
        AND allocation.company_id = p_company_id
    )
  ),
  items AS (
    SELECT
      allocation.allocation_id,
      allocation.payable_id,
      COALESCE(category.id, '00000000-0000-0000-0000-000000000102'::uuid) AS category_id,
      COALESCE(NULLIF(pg_catalog.btrim(payable.descricao), ''), 'Conta sem descrição') AS description,
      NULLIF(pg_catalog.btrim(payable.fornecedor), '') AS supplier,
      payable.data_vencimento AS due_date,
      payable.status,
      (pg_catalog.round(allocation.valor, 2) * 100)::bigint AS amount_cents,
      allocation.split
    FROM allocations AS allocation
    JOIN open_payables AS payable ON payable.id = allocation.payable_id
    LEFT JOIN public.fin_categorias AS category
      ON category.id = allocation.categoria_id
     AND category.company_id = p_company_id
  ),
  -- Categorias referenciadas (mesmo inativas ou de outro tipo) e toda a cadeia de
  -- ancestrais entram na árvore, para a soma das categorias fechar com o total.
  lineage AS (
    SELECT category.id, category.parent_id
    FROM public.fin_categorias AS category
    WHERE category.company_id = p_company_id
      AND category.id IN (SELECT item.category_id FROM items AS item)

    UNION

    SELECT parent.id, parent.parent_id
    FROM public.fin_categorias AS parent
    JOIN lineage AS child ON child.parent_id = parent.id
    WHERE parent.company_id = p_company_id
  ),
  categories AS (
    SELECT
      category.id,
      category.nome AS name,
      COALESCE(category.codigo, '') AS code,
      category.parent_id,
      COALESCE(category.ordem, 0) AS sort_order,
      category.tipo AS kind,
      category.ativo AS active,
      category.excluir_dos_totais AS non_operational,
      false AS synthetic
    FROM public.fin_categorias AS category
    WHERE category.company_id = p_company_id
      AND (
        (category.ativo AND category.tipo = 'despesa')
        OR category.id IN (SELECT lineage.id FROM lineage)
      )

    UNION ALL

    SELECT
      '00000000-0000-0000-0000-000000000102'::uuid,
      'Sem categoria — Despesas',
      'S/C-D',
      NULL::uuid,
      9981,
      'despesa',
      true,
      false,
      true
    WHERE EXISTS (
      SELECT 1 FROM items AS item
      WHERE item.category_id = '00000000-0000-0000-0000-000000000102'::uuid
    )
  ),
  accounts AS (
    SELECT
      account.id,
      account.nome AS name,
      account.tipo AS kind,
      NULLIF(pg_catalog.btrim(account.banco), '') AS bank,
      (pg_catalog.round(COALESCE(balance.saldo, 0), 2) * 100)::bigint AS balance_cents,
      balance.updated_at AS balance_updated_at,
      balance.conta_id IS NOT NULL AS balance_available
    FROM public.fin_contas AS account
    LEFT JOIN public.fin_contas_saldo_cache AS balance
      ON balance.conta_id = account.id
     AND balance.company_id = p_company_id
    WHERE account.company_id = p_company_id
      AND account.ativo = true
  ),
  overdue AS (
    SELECT
      count(*)::integer AS quantity,
      COALESCE(sum((pg_catalog.round(payable.valor, 2) * 100)::bigint), 0)::bigint AS amount_cents
    FROM public.fin_contas_pagar AS payable
    WHERE payable.company_id = p_company_id
      AND payable.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO')
      AND payable.data_vencimento < p_start
  ),
  totals AS (
    SELECT
      COALESCE((SELECT sum(item.amount_cents) FROM items AS item), 0)::bigint AS payable_cents,
      (SELECT count(DISTINCT item.payable_id) FROM items AS item)::integer AS payable_count,
      COALESCE((SELECT sum(account.balance_cents) FROM accounts AS account), 0)::bigint AS balance_cents
  )
  SELECT jsonb_build_object(
    'contractVersion', '1.0',
    'period', jsonb_build_object(
      'start', pg_catalog.to_char(p_start, 'YYYY-MM-DD'),
      'end', pg_catalog.to_char(p_end_inclusive, 'YYYY-MM-DD')
    ),
    'store', (
      SELECT jsonb_build_object('id', company.id, 'name', company.nome)
      FROM public.companies AS company
      WHERE company.id = p_company_id
    ),
    'generatedAt', pg_catalog.to_jsonb(pg_catalog.now()),
    'rules', jsonb_build_object(
      'dateField', 'fin_contas_pagar.data_vencimento',
      'inclusiveBounds', true,
      'statusIncluded', jsonb_build_array('AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO'),
      'amountField', 'fin_contas_pagar.valor',
      'allocationRule', 'FIN-RATEIO',
      'balanceSource', 'fin_contas_saldo_cache'
    ),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'code', category.code,
        'parentId', category.parent_id,
        'sortOrder', category.sort_order,
        'kind', category.kind,
        'active', category.active,
        'nonOperational', category.non_operational,
        'synthetic', category.synthetic
      ) ORDER BY category.sort_order, category.code, category.id)
      FROM categories AS category
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'allocationId', item.allocation_id,
        'payableId', item.payable_id,
        'categoryId', item.category_id,
        'description', item.description,
        'supplier', item.supplier,
        'dueDate', pg_catalog.to_char(item.due_date, 'YYYY-MM-DD'),
        'status', item.status,
        'amountCents', item.amount_cents,
        'split', item.split
      ) ORDER BY item.due_date, lower(COALESCE(item.supplier, item.description)), item.description, item.allocation_id)
      FROM items AS item
    ), '[]'::jsonb),
    'totalPayableCents', totals.payable_cents,
    'payableCount', totals.payable_count,
    'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', account.id,
        'name', account.name,
        'kind', account.kind,
        'bank', account.bank,
        'balanceCents', account.balance_cents,
        'balanceUpdatedAt', account.balance_updated_at,
        'balanceAvailable', account.balance_available
      ) ORDER BY lower(account.name), account.id)
      FROM accounts AS account
    ), '[]'::jsonb),
    'totalAccountBalanceCents', totals.balance_cents,
    'projectedFinalBalanceCents', totals.balance_cents - totals.payable_cents,
    'overdueBeforePeriod', jsonb_build_object(
      'count', overdue.quantity,
      'amountCents', overdue.amount_cents
    )
  )
  FROM totals
  CROSS JOIN overdue;
$function$;

REVOKE ALL ON FUNCTION public._fin_bordero_payload(uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._fin_bordero_payload(uuid, date, date) IS
  'Helper interno do Borderô: contas a pagar em aberto por data_vencimento (inclusivo), rateio FIN-RATEIO, saldo por fin_contas_saldo_cache; sem EXECUTE para papéis da Data API.';

CREATE OR REPLACE FUNCTION public.get_fin_bordero(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  -- A tela Borderô é gateada pela mesma chave do antigo Relatório Sócios.
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:relatorio-socios:view',
    'finance:read',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  IF p_inicio IS NULL OR p_fim IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BORDERO_PERIODO_OBRIGATORIO';
  END IF;
  IF p_fim < p_inicio THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BORDERO_PERIODO_INVALIDO';
  END IF;
  IF p_fim - p_inicio > 366 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BORDERO_PERIODO_LONGO';
  END IF;

  RETURN public._fin_bordero_payload(v_company_id, p_inicio, p_fim);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_bordero(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_bordero(date, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_bordero(date, date) IS
  'Financeiro → Borderô v1.0: contas a vencer por data_vencimento, saldo das contas ativas e saldo final provisionado (centavos), tenant-scoped.';

-- Força o planejamento das consultas do helper já no deploy (colunas erradas
-- quebram aqui, não na primeira chamada em produção). Tenant aleatório: leitura vazia.
DO $validate$
BEGIN
  PERFORM public._fin_bordero_payload(gen_random_uuid(), CURRENT_DATE, CURRENT_DATE);
END;
$validate$;
