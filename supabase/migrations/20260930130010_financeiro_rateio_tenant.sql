-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — categoria e centro de custo do rateio precisam ser da empresa.
--
-- _guarded_upsert_lancamento, _guarded_create_conta_pagar/_receber,
-- _guarded_update_conta_pagar/_receber e reconcile_import_lancamento (centro de
-- custo) gravavam fin_lancamento_rateios a partir de p_rateios sem conferir de
-- quem eram categoria_id e centro_custo_id. E não só as RPCs: a RLS de
-- fin_lancamento_rateios deixa INSERT/UPDATE direto via PostgREST conferindo
-- apenas o company_id da própria linha. Um rateio da empresa A podia apontar
-- para categoria/centro da empresa B.
--
-- A validação fica num trigger BEFORE INSERT/UPDATE da própria tabela, não em
-- cada RPC: cobre todas as que gravam rateio a partir de jsonb, as que copiam
-- rateio do título (pay/receive/reconcile_*), o INSERT direto e qualquer RPC
-- futura. Erro no padrão do cabeçalho de CP/CR ("NOT_FOUND: … não pertence à
-- empresa"). _guarded_update_reconciled_classification já validava (RATEIO_INVALIDO)
-- e continua igual.
--
-- O pai do rateio (lancamento_id) é conferido em trg_validate_rateio_sum
-- (migration 20260930041802, fix/achados-paralelos) — este trigger não o toca.
--
-- Banco vivo em 2026-09-30: 0 rateios com categoria ou centro de custo de outra
-- empresa (4.257 rateios); o preflight aborta se isso mudar até a aplicação.
-- ─────────────────────────────────────────────────────────────────────────────

DO $preflight$
DECLARE
  v_cat integer;
  v_cc integer;
BEGIN
  SELECT count(*) INTO v_cat
  FROM public.fin_lancamento_rateios r
  JOIN public.fin_categorias c ON c.id = r.categoria_id
  WHERE c.company_id IS DISTINCT FROM r.company_id;

  SELECT count(*) INTO v_cc
  FROM public.fin_lancamento_rateios r
  JOIN public.fin_centros_custo cc ON cc.id = r.centro_custo_id
  WHERE cc.company_id IS DISTINCT FROM r.company_id;

  IF v_cat > 0 OR v_cc > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: rateios apontando para outra empresa (categoria=%, centro de custo=%)', v_cat, v_cc;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fin_rateio_valida_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- SECURITY DEFINER: a conferência não pode depender de quem grava enxergar
  -- o cadastro (quem lança sem financeiro:cadastros:view teria a própria
  -- categoria recusada); a empresa é sempre a do rateio.
  IF NEW.categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_categorias c
    WHERE c.id = NEW.categoria_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: categoria do rateio não pertence à empresa';
  END IF;

  IF NEW.centro_custo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_centros_custo cc
    WHERE cc.id = NEW.centro_custo_id AND cc.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: centro de custo do rateio não pertence à empresa';
  END IF;

  RETURN NEW;
END;
$function$;

-- Função de trigger: não é chamada por cliente nenhum.
REVOKE ALL ON FUNCTION public.fin_rateio_valida_empresa() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fin_rateio_valida_empresa ON public.fin_lancamento_rateios;
CREATE TRIGGER trg_fin_rateio_valida_empresa
  BEFORE INSERT OR UPDATE OF categoria_id, centro_custo_id, company_id
  ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public.fin_rateio_valida_empresa();

notify pgrst, 'reload schema';
