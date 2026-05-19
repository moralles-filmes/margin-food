-- =========================================================
-- PERF: get_salmon_reconciliation_kpis
-- Substitui 3 queries separadas em SalmonReconciliationReport.tsx
-- (salmon_entries, salmon_manipulations, movimentacoes_estoque)
-- por uma única RPC com SUM/COUNT no Postgres, eliminando
-- O(n) na rede para calcular totais de reconciliação de salmão.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_salmon_reconciliation_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company        uuid;
  v_entries_count  bigint;
  v_entries_kg     numeric;
  v_manips_count   bigint;
  v_manips_kg      numeric;
  v_ledger_saldo   numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:entradas:view', 'salmon:read', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão para reconciliação de salmão';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(gross_kg), 0)
    INTO v_entries_count, v_entries_kg
    FROM public.salmon_entries
   WHERE company_id = v_company
     AND status = 'ACTIVE';

  SELECT COUNT(*), COALESCE(SUM(gross_out_kg), 0)
    INTO v_manips_count, v_manips_kg
    FROM public.salmon_manipulations
   WHERE company_id = v_company
     AND status = 'ACTIVE';

  -- Replica exatamente a lógica do reduce no client: IN soma, OUT subtrai,
  -- e tipos de estorno são ignorados.
  SELECT COALESCE(SUM(
    CASE direction
      WHEN 'IN'  THEN  quantidade
      WHEN 'OUT' THEN -quantidade
      ELSE 0
    END
  ), 0)
    INTO v_ledger_saldo
    FROM public.movimentacoes_estoque
   WHERE company_id    = v_company
     AND source_module = 'salmon'
     AND status        = 'ATIVO'
     AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO');

  RETURN jsonb_build_object(
    'entries', jsonb_build_object(
      'count',    v_entries_count,
      'total_kg', v_entries_kg
    ),
    'manips', jsonb_build_object(
      'count',    v_manips_count,
      'total_kg', v_manips_kg
    ),
    'ledger_saldo', v_ledger_saldo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salmon_reconciliation_kpis TO authenticated;
-- DO block omitido: assert_tenant() requer sessão autenticada; colunas são estáveis.
