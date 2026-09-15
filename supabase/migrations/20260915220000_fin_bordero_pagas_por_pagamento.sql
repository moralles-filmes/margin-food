-- Financeiro → Borderô: contas já pagas pela data do pagamento (regra de caixa).
--
-- Em 20260915210000 a CP paga entrava pela data_vencimento, e o Borderô divergia do
-- Livro Razão/DFC sempre que um boleto era pago em data diferente do vencimento
-- (caso real: 2 boletos vencidos 12/09 e pagos 14/09, R$ 2.553,00). Agora TODA
-- despesa já paga vem do razão, pela regra de caixa do DFC
-- (public._fin_dfc_effective_allocations: REALIZADO/CONCILIADO, sem transferência,
-- sem conciliação pendente, data efetiva COALESCE(data_pagamento, conciliado_em,
-- data_competencia), rateio prevalece). Assim "Contas já pagas" = saídas do Livro
-- Razão = despesas do DFC no mesmo período, e é o que já saiu do saldo bancário.
--
--  * A baixa de boleto (espelho_cp, ou conciliacao com referencia_modulo contas_pagar)
--    é a própria despesa paga: o lançamento carrega valor, data e rateio da CP
--    (conferido em produção em 2026-09-15: 155/155 iguais). A CP só enriquece a linha
--    (fornecedor, vencimento) — nunca é somada de novo. ajuste_pagamento
--    (juros/tarifa) entra como lançamento próprio.
--  * Contas a vencer continuam CP em aberto por data_vencimento (inalterado).
--  * Contrato aditivo inalterado: mesmos campos de 20260915210000.

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
  paid_ledger AS (
    SELECT
      effective.allocation_id,
      effective.lancamento_id,
      effective.categoria_id,
      effective.valor,
      effective.effective_date,
      effective.descricao,
      effective.origem,
      effective.allocation_source = 'allocation' AS split,
      payable.id AS payable_id,
      payable.descricao AS payable_description,
      payable.fornecedor AS payable_supplier,
      payable.data_vencimento AS payable_due_date
    FROM public._fin_dfc_effective_allocations(p_company_id, p_start, p_end_inclusive) AS effective
    JOIN public.fin_lancamentos AS ledger
      ON ledger.id = effective.lancamento_id
     AND ledger.company_id = p_company_id
    LEFT JOIN public.fin_contas_pagar AS payable
      ON COALESCE(ledger.referencia_modulo, '') = 'contas_pagar'
     AND COALESCE(effective.origem, '') <> 'ajuste_pagamento'
     AND payable.id::text = ledger.referencia_id
     AND payable.company_id = p_company_id
    WHERE effective.tipo = 'DESPESA'
  ),
  paid_items AS (
    SELECT
      ledger.allocation_id,
      COALESCE(ledger.payable_id, ledger.lancamento_id) AS source_id,
      CASE WHEN ledger.payable_id IS NULL THEN 'lancamento' ELSE 'conta_pagar' END AS source,
      ledger.origem AS origin,
      COALESCE(category.id, '00000000-0000-0000-0000-000000000102'::uuid) AS category_id,
      COALESCE(NULLIF(pg_catalog.btrim(ledger.payable_description), ''), ledger.descricao) AS description,
      NULLIF(pg_catalog.btrim(ledger.payable_supplier), '') AS supplier,
      ledger.payable_due_date AS due_date,
      ledger.effective_date AS paid_date,
      ledger.effective_date AS reference_date,
      (pg_catalog.round(ledger.valor, 2) * 100)::bigint AS amount_cents,
      ledger.split
    FROM paid_ledger AS ledger
    LEFT JOIN public.fin_categorias AS category
      ON category.id = ledger.categoria_id
     AND category.company_id = p_company_id
  ),
  lineage AS (
    SELECT category.id, category.parent_id
    FROM public.fin_categorias AS category
    WHERE category.company_id = p_company_id
      AND (
        category.id IN (SELECT item.category_id FROM items AS item)
        OR category.id IN (SELECT paid.category_id FROM paid_items AS paid)
      )

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
    OR EXISTS (
      SELECT 1 FROM paid_items AS paid
      WHERE paid.category_id = '00000000-0000-0000-0000-000000000102'::uuid
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
      COALESCE((SELECT sum(paid.amount_cents) FROM paid_items AS paid), 0)::bigint AS paid_cents,
      (SELECT count(DISTINCT (paid.source, paid.source_id)) FROM paid_items AS paid)::integer AS paid_count,
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
      'balanceSource', 'fin_contas_saldo_cache',
      'paidSource', '_fin_dfc_effective_allocations',
      'paidDateField', 'COALESCE(data_pagamento, conciliado_em, data_competencia)'
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
    'paidItems', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'allocationId', paid.allocation_id,
        'sourceId', paid.source_id,
        'source', paid.source,
        'origin', paid.origin,
        'categoryId', paid.category_id,
        'description', paid.description,
        'supplier', paid.supplier,
        'dueDate', pg_catalog.to_char(paid.due_date, 'YYYY-MM-DD'),
        'paidDate', pg_catalog.to_char(paid.paid_date, 'YYYY-MM-DD'),
        'referenceDate', pg_catalog.to_char(paid.reference_date, 'YYYY-MM-DD'),
        'amountCents', paid.amount_cents,
        'split', paid.split
      ) ORDER BY paid.reference_date, lower(COALESCE(paid.supplier, paid.description)), paid.description, paid.allocation_id)
      FROM paid_items AS paid
    ), '[]'::jsonb),
    'totalPaidCents', totals.paid_cents,
    'paidCount', totals.paid_count,
    'totalExpenseCents', totals.paid_cents + totals.payable_cents,
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
  'Helper interno do Borderô: contas a vencer = CP em aberto por data_vencimento (inclusivo); contas já pagas = despesas do razão pela regra de caixa do DFC (inclui baixas de boleto, enriquecidas pela CP); rateio FIN-RATEIO; saldo por fin_contas_saldo_cache; sem EXECUTE para papéis da Data API.';

COMMENT ON FUNCTION public.get_fin_bordero(date, date) IS
  'Financeiro → Borderô: contas já pagas, contas a vencer, total do período, saldo das contas e saldo final provisionado (centavos), tenant-scoped.';

DO $validate$
BEGIN
  PERFORM public._fin_bordero_payload(gen_random_uuid(), CURRENT_DATE, CURRENT_DATE);
END;
$validate$;
