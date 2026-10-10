-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — linha de rateio sem categoria é recusada.
--
-- O rateio manda nos relatórios: com linhas em fin_lancamento_rateios, o
-- categoria_id do cabeçalho é ignorado e a linha sem categoria cai em
-- "Sem categoria — Despesas" no DRE/DFC. O ContaFormDialog só conferia a soma
-- do rateio, e Contas a Pagar/Receber salvavam linha sem categoria (boleto de
-- R$ 100,00 em 2026-10-10; R$ 707,60 copiado para o espelho da baixa).
--
-- Os formulários passam a exigir a categoria em todas as linhas
-- (src/domain/financeiro/categoriaObrigatoria.ts). A trava fica também no
-- trigger da tabela, que já confere a empresa da categoria: cobre o bundle
-- antigo do PWA, todas as RPCs que gravam p_rateios, as que copiam o rateio
-- do título (pay_conta_pagar, receive_conta_receber, reconcile_pay/receive_*)
-- e o INSERT direto via PostgREST.
--
-- Só a escrita nova é barrada: as linhas antigas sem categoria continuam como
-- estão (precisam de reclassificação manual), e o UPDATE só de cmv_incluir
-- (fin_cmv_classificar) não dispara o trigger (UPDATE OF categoria_id,
-- centro_custo_id, company_id). A FK de categoria não tem ON DELETE SET NULL:
-- excluir categoria não esbarra na trava. Pagar/conciliar título legado com
-- linha sem categoria passa a pedir a categoria antes (a cópia seria recusada).
--
-- Banco vivo em 2026-10-10: 3 de 5.714 linhas de rateio estão sem categoria.
-- ─────────────────────────────────────────────────────────────────────────────

DO $preflight$
DECLARE
  v_nulas integer;
BEGIN
  -- Esta migration só troca o corpo da função: sem o trigger a trava não valeria.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_fin_rateio_valida_empresa'
      AND tgrelid = 'public.fin_lancamento_rateios'::regclass AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT: trigger trg_fin_rateio_valida_empresa ausente em fin_lancamento_rateios';
  END IF;

  SELECT count(*) INTO v_nulas FROM public.fin_lancamento_rateios WHERE categoria_id IS NULL;
  RAISE NOTICE 'PREFLIGHT: % linha(s) de rateio sem categoria continuam como estão', v_nulas;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.fin_rateio_valida_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Linha sem categoria cai em "Sem categoria" nos relatórios (o rateio manda).
  IF NEW.categoria_id IS NULL THEN
    RAISE EXCEPTION 'RATEIO_SEM_CATEGORIA: selecione a categoria em todas as linhas do rateio'
      USING ERRCODE = '23502';
  END IF;

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

-- O trigger trg_fin_rateio_valida_empresa (BEFORE INSERT OR UPDATE OF
-- categoria_id, centro_custo_id, company_id) não muda: só o corpo da função.
