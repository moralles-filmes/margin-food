-- =========================================================================
-- P1-4: cancelar_movimentacao (edge function requisicao-estoque) tinha uma
-- corrida — duas chamadas concorrentes para cancelar a MESMA movimentação
-- passavam ambas pelo SELECT "existingReversal" (TOCTOU sob READ COMMITTED)
-- e cada uma inseria seu próprio estorno ATIVO, duplicando o ajuste de
-- estoque. Fecha a corrida no banco com um índice único parcial; a edge
-- function (supabase/functions/requisicao-estoque/index.ts) já foi ajustada
-- para tratar o unique_violation (23505) resultante como conflito 409 em
-- vez de estourar erro 500.
--
-- P2-7: compute_requisicao_status_agregado é SECURITY DEFINER, STABLE, com
-- EXECUTE concedido a PUBLIC/authenticated, e não tinha nenhuma checagem de
-- tenant — qualquer usuário autenticado podia chamá-la diretamente via RPC
-- com um requisicao_id de OUTRA empresa e receber o status agregado
-- (SOLICITADA/ATENDIDA/NEGADA/PARCIALMENTE_ATENDIDA). Baixa sensibilidade
-- (só um enum), mas é um vazamento cross-tenant real e desnecessário — o
-- único chamador em produção (attend_requisicao_item_atomic) já valida o
-- tenant antes de chamar, então adicionar a checagem aqui não muda nada
-- para o fluxo legítimo.
--
-- P3-2: inventarios e inventario_itens tinham RLS habilitado mas SEM
-- FORCE ROW LEVEL SECURITY (confirmado via pg_class.relforcerowsecurity),
-- divergindo do invariante do projeto ("FORCE RLS em todas as tabelas, sem
-- exceção" — CLAUDE.md). Sem FORCE, o dono da tabela (e roles com
-- BYPASSRLS) ignoram as policies; como toda leitura/escrita destas tabelas
-- já passa por Edge Functions SECURITY DEFINER com checagem manual de
-- tenant, o risco prático é baixo — mas alinhar remove a divergência
-- silenciosa do invariante declarado.
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_movimentacoes_estorno_de_id_ativo
ON public.movimentacoes_estoque (estorno_de_id)
WHERE status = 'ATIVO' AND estorno_de_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_requisicao_status_agregado(p_requisicao_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total_items int;
  atendidos int;
  recusados int;
  solicitados int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.requisicoes_estoque r
    WHERE r.id = p_requisicao_id
      AND r.company_id = public.get_current_company_id()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'ATENDIDO'),
    count(*) FILTER (WHERE status = 'RECUSADO'),
    count(*) FILTER (WHERE status = 'SOLICITADO')
  INTO total_items, atendidos, recusados, solicitados
  FROM public.requisicao_estoque_itens
  WHERE requisicao_id = p_requisicao_id;

  IF total_items = 0 THEN RETURN 'SOLICITADA'; END IF;
  IF recusados = total_items THEN RETURN 'NEGADA'; END IF;
  IF atendidos = total_items THEN RETURN 'ATENDIDA'; END IF;
  IF solicitados = total_items THEN RETURN 'SOLICITADA'; END IF;
  IF atendidos > 0 AND recusados > 0 AND solicitados = 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF atendidos > 0 AND solicitados > 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF recusados > 0 AND solicitados > 0 THEN RETURN 'SOLICITADA'; END IF;

  RETURN 'SOLICITADA';
END;
$function$;

ALTER TABLE public.inventarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_itens FORCE ROW LEVEL SECURITY;
