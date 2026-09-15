-- Financeiro → Borderô: despesa completa do período (pagas + a vencer).
--
-- O Borderô v1 só listava contas a pagar em aberto, então o total nunca batia com
-- Contas a Pagar ("Todos os status"), que soma também as pagas do mesmo vencimento.
-- Esta migration substitui só o helper interno e é ADITIVA no contrato: os campos
-- existentes (items/totalPayableCents/projectedFinalBalanceCents...) mantêm o mesmo
-- significado, e entram paidItems/totalPaidCents/paidCount/totalExpenseCents.
--
-- Regras das despesas já pagas (sem duplicar):
--  * Conta a pagar PAGO entra pela própria CP, filtrada por data_vencimento (pontas
--    inclusivas) e valor da CP — o mesmo critério de Contas a Pagar. Rateio: FIN-RATEIO.
--  * Demais despesas vêm do razão pela mesma regra do DFC/Dashboard (caixa):
--    public._fin_dfc_effective_allocations — REALIZADO/CONCILIADO, sem transferência,
--    sem conciliação pendente, data efetiva COALESCE(data_pagamento, conciliado_em,
--    data_competencia), rateio prevalece. Inclui lançamentos manuais e da conciliação.
--  * Lançamento que representa a baixa de uma CP (origem espelho_cp ou
--    referencia_modulo contas_pagar) fica fora: a CP paga já é a despesa. A exceção é
--    origem ajuste_pagamento (juros/tarifa da divergência boleto × extrato), que é
--    dinheiro a mais e não está no valor da CP.
--  * Saldo final provisionado continua saldo das contas − contas a vencer: o que já
--    foi pago já saiu do saldo bancário e não pode ser descontado de novo.

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
  paid_payables AS (
    SELECT
      payable.id,
      payable.descricao,
      payable.fornecedor,
      payable.data_vencimento,
      payable.data_pagamento,
      payable.valor,
      payable.categoria_id
    FROM public.fin_contas_pagar AS payable
    WHERE payable.company_id = p_company_id
      AND payable.status = 'PAGO'
      AND payable.data_vencimento >= p_start
      AND payable.data_vencimento <= p_end_inclusive
  ),
  paid_payable_allocations AS (
    SELECT
      allocation.id AS allocation_id,
      payable.id AS payable_id,
      allocation.categoria_id,
      allocation.valor,
      true AS split
    FROM paid_payables AS payable
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
    FROM paid_payables AS payable
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios AS allocation
      WHERE allocation.lancamento_id = payable.id
        AND allocation.company_id = p_company_id
    )
  ),
  -- Despesas do razão pela regra oficial de caixa do DFC, sem as baixas de CP.
  paid_ledger AS (
    SELECT
      effective.allocation_id,
      effective.lancamento_id,
      effective.categoria_id,
      effective.valor,
      effective.effective_date,
      effective.descricao,
      effective.origem,
      effective.allocation_source = 'allocation' AS split
    FROM public._fin_dfc_effective_allocations(p_company_id, p_start, p_end_inclusive) AS effective
    JOIN public.fin_lancamentos AS ledger
      ON ledger.id = effective.lancamento_id
     AND ledger.company_id = p_company_id
    WHERE effective.tipo = 'DESPESA'
      AND (
        effective.origem = 'ajuste_pagamento'
        OR NOT (
          COALESCE(effective.origem, '') = 'espelho_cp'
          OR COALESCE(ledger.referencia_modulo, '') = 'contas_pagar'
        )
      )
  ),
  paid_items AS (
    SELECT
      allocation.allocation_id,
      allocation.payable_id AS source_id,
      'conta_pagar'::text AS source,
      NULL::text AS origin,
      COALESCE(category.id, '00000000-0000-0000-0000-000000000102'::uuid) AS category_id,
      COALESCE(NULLIF(pg_catalog.btrim(payable.descricao), ''), 'Conta sem descrição') AS description,
      NULLIF(pg_catalog.btrim(payable.fornecedor), '') AS supplier,
      payable.data_vencimento AS due_date,
      payable.data_pagamento AS paid_date,
      payable.data_vencimento AS reference_date,
      (pg_catalog.round(allocation.valor, 2) * 100)::bigint AS amount_cents,
      allocation.split
    FROM paid_payable_allocations AS allocation
    JOIN paid_payables AS payable ON payable.id = allocation.payable_id
    LEFT JOIN public.fin_categorias AS category
      ON category.id = allocation.categoria_id
     AND category.company_id = p_company_id

    UNION ALL

    SELECT
      ledger.allocation_id,
      ledger.lancamento_id AS source_id,
      'lancamento'::text AS source,
      ledger.origem AS origin,
      COALESCE(category.id, '00000000-0000-0000-0000-000000000102'::uuid) AS category_id,
      ledger.descricao AS description,
      NULL::text AS supplier,
      NULL::date AS due_date,
      ledger.effective_date AS paid_date,
      ledger.effective_date AS reference_date,
      (pg_catalog.round(ledger.valor, 2) * 100)::bigint AS amount_cents,
      ledger.split
    FROM paid_ledger AS ledger
    LEFT JOIN public.fin_categorias AS category
      ON category.id = ledger.categoria_id
     AND category.company_id = p_company_id
  ),
  -- Categorias referenciadas (mesmo inativas ou de outro tipo) e toda a cadeia de
  -- ancestrais entram na árvore, para a soma das categorias fechar com o total.
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
      'paidPayablesDateField', 'fin_contas_pagar.data_vencimento',
      'paidLedgerSource', '_fin_dfc_effective_allocations',
      'paidLedgerExcludes', 'espelho_cp / referencia_modulo contas_pagar (exceto ajuste_pagamento)'
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
  'Helper interno do Borderô: despesa completa do período — CP em aberto e CP pagas por data_vencimento (inclusivo) + despesas do razão pela regra de caixa do DFC sem baixas de CP; rateio FIN-RATEIO; saldo por fin_contas_saldo_cache; sem EXECUTE para papéis da Data API.';

COMMENT ON FUNCTION public.get_fin_bordero(date, date) IS
  'Financeiro → Borderô: contas já pagas, contas a vencer, total do período, saldo das contas e saldo final provisionado (centavos), tenant-scoped.';

-- Força o planejamento das consultas do helper já no deploy (colunas erradas
-- quebram aqui, não na primeira chamada em produção). Tenant aleatório: leitura vazia.
DO $validate$
BEGIN
  PERFORM public._fin_bordero_payload(gen_random_uuid(), CURRENT_DATE, CURRENT_DATE);
END;
$validate$;
