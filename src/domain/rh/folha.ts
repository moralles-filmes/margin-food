/**
 * ─── Folha de pagamento: respostas do servidor ───
 *
 * As transições (RASCUNHO ⇄ CALCULADO → APROVADO → PAGO) são garantidas no
 * banco por `trg_rh_folha_transicao`; `rh_folha_salvar_calculo` e
 * `rh_folha_mudar_status` são o caminho da tela.
 */

export type StatusFolha = 'RASCUNHO' | 'CALCULADO' | 'APROVADO' | 'PAGO';

/** Retorno de `rh_folha_salvar_calculo`. */
export interface ResultadoCalculoFolha {
  periodo: string;
  inseridas: number;
  recalculadas: number;
  /** Folhas APROVADO/PAGO do período que ficaram como estavam. */
  fechadas: Array<{ colaborador_id: string; status: StatusFolha }>;
}

/** Retorno de `rh_folha_mudar_status`. */
export interface ResultadoStatusFolha {
  id: string;
  status: StatusFolha;
  aprovado_em: string | null;
  /** A folha já estava no status pedido (duplo clique, retry). */
  idempotente: boolean;
}

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'rascunho',
  CALCULADO: 'calculada',
  APROVADO: 'aprovada',
  PAGO: 'paga',
};

/** Mensagem para a tela a partir do erro das RPCs/trigger da folha. */
export function mensagemErroFolha(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  const transicao = /STATUS_INVALIDO: (\w+) -> (\w+)/.exec(texto)
    ?? /FOLHA_TRANSICAO_INVALIDA: (\w+) -> (\w+)/.exec(texto);
  if (transicao) {
    const atual = ROTULO_STATUS[transicao[1]] ?? transicao[1];
    return `A folha está ${atual} — a lista foi atualizada. Confira antes de repetir.`;
  }
  if (texto.includes('FOLHA_FECHADA')) {
    return 'Folha aprovada ou paga não pode ser recalculada.';
  }
  if (texto.includes('PERMISSION_DENIED')) {
    return 'Sem permissão para gerenciar a folha.';
  }
  if (texto.includes('NOT_FOUND')) {
    return 'Folha não encontrada — a lista foi atualizada.';
  }
  return texto || 'Erro ao atualizar a folha.';
}
