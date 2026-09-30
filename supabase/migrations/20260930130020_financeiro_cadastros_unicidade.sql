-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro → Cadastros Base — Centros de Custo e Plano de Contas sem duplicata.
--
-- As duas telas gravam por INSERT direto via PostgREST; a proteção contra duplo
-- clique era só a trava da tela. Reenvio depois de a resposta se perder, duas
-- abas ou duas pessoas criavam o mesmo cadastro duas vezes.
--
-- Unicidade de negócio no servidor, e não chave de idempotência: a regra vale
-- para qualquer caminho (duplo clique, retry, duas abas, dois usuários, edição
-- pelo _guarded_update_*), e o cadastro duplicado nunca é legítimo:
--   · centro de custo: nome normalizado (sem acento/caixa, espaços colapsados)
--     por empresa — a tabela não tem hierarquia;
--   · plano de contas: código (sem espaços nas pontas, sem caixa) por empresa —
--     é a identidade contábil da conta, e a tela nunca preenche pai_id.
-- Só entre ATIVOS: inativar (_guarded_delete_*) é soft delete e libera o nome/
-- código para um cadastro novo.
--
-- Banco vivo em 2026-09-30: 8 centros e 1 conta, 0 duplicatas (inclusive entre
-- inativos). O preflight aborta se isso mudar até a aplicação.
-- ─────────────────────────────────────────────────────────────────────────────

DO $preflight$
DECLARE
  v_cc integer;
  v_pc integer;
BEGIN
  SELECT count(*) INTO v_cc FROM (
    SELECT 1 FROM public.fin_centros_custo
    WHERE ativo
    GROUP BY company_id, regexp_replace(lower(public.immutable_unaccent(btrim(nome))), '\s+', ' ', 'g')
    HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO v_pc FROM (
    SELECT 1 FROM public.fin_plano_contas
    WHERE ativo
    GROUP BY company_id, lower(btrim(codigo))
    HAVING count(*) > 1
  ) d;
  IF v_cc > 0 OR v_pc > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: cadastros duplicados (centros de custo=%, plano de contas=%)', v_cc, v_pc;
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_centros_custo_nome_ativo
  ON public.fin_centros_custo (company_id, (regexp_replace(lower(public.immutable_unaccent(btrim(nome))), '\s+', ' ', 'g')))
  WHERE ativo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_plano_contas_codigo_ativo
  ON public.fin_plano_contas (company_id, (lower(btrim(codigo))))
  WHERE ativo;
