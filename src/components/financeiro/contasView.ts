import type { StatusType } from '@/components/ui/StatusBadge';

/**
 * Funções puras de apresentação de Contas a Pagar e Contas a Receber (Redesign V2, Fase 05A).
 * Só rotulam o que a tela já recebe; a regra de "vencida" é a mesma de antes da fase.
 * Os rótulos do Excel continuam nos mapas das próprias telas (sem acento), para o arquivo não mudar.
 */

export interface ContaBadge {
  label: string;
  status: StatusType;
}

export type ContaVariant = 'pagar' | 'receber';

/** Abaixo desta largura da lista, a tabela de contas vira cartões (uma só marcação, D45). */
export const CONTAS_LISTA_LIMITE_PX = 832;

/** Colunas da grade do resumo: nunca mais colunas que cards (D38). */
export function colunasDoResumo(cards: number): 2 | 3 | 4 {
  return cards >= 4 ? 4 : cards === 3 ? 3 : 2;
}

const PAGAR_BADGE: Record<string, ContaBadge> = {
  RASCUNHO: { label: 'Rascunho', status: 'neutral' },
  AGUARDANDO_APROVACAO: { label: 'Aguard. Aprovação', status: 'warning' },
  APROVADO: { label: 'Aprovado', status: 'info' },
  PAGO: { label: 'Pago', status: 'success' },
  VENCIDO: { label: 'Vencido', status: 'danger' },
  CANCELADO: { label: 'Cancelado', status: 'neutral' },
};

const RECEBER_BADGE: Record<string, ContaBadge> = {
  RASCUNHO: { label: 'Rascunho', status: 'neutral' },
  A_RECEBER: { label: 'A Receber', status: 'info' },
  RECEBIDO: { label: 'Recebido', status: 'success' },
  VENCIDO: { label: 'Vencido', status: 'danger' },
  CANCELADO: { label: 'Cancelado', status: 'neutral' },
};

/** Status que encerram o título: depois deles a conta nunca aparece como vencida. */
const STATUS_ENCERRADO: Record<ContaVariant, string> = { pagar: 'PAGO', receber: 'RECEBIDO' };

/** Mesma regra das telas antes da fase: vencimento antes de hoje e título fora de pago/recebido/cancelado. */
export function contaVencida(variant: ContaVariant, status: string, dataVencimento: string, hoje: string): boolean {
  return dataVencimento < hoje && ![STATUS_ENCERRADO[variant], 'CANCELADO'].includes(status);
}

/** Selo da linha com a precedência de antes: vencida vence o status; status desconhecido cai em Rascunho. */
export function contaStatusBadge(variant: ContaVariant, status: string, vencida: boolean): ContaBadge {
  const mapa = variant === 'pagar' ? PAGAR_BADGE : RECEBER_BADGE;
  if (vencida) return mapa.VENCIDO;
  return mapa[status] ?? mapa.RASCUNHO;
}

/** Selo do detalhe (Contas a Pagar, a Receber e Livro Razão), pelo status gravado — sem derivar vencimento. */
const DETALHE_BADGE: Record<string, ContaBadge> = {
  ...PAGAR_BADGE,
  ...RECEBER_BADGE,
  PREVISTO: { label: 'Previsto', status: 'warning' },
  REALIZADO: { label: 'Realizado', status: 'success' },
};

export function detalheStatusBadge(status: string): ContaBadge {
  return DETALHE_BADGE[status] ?? DETALHE_BADGE.RASCUNHO;
}

/** Legenda da lista: quantas contas aparecem e, quando há mais páginas, de quantas. */
export function contasCaption(exibidas: number, total: number): string {
  if (exibidas === 0) return '';
  if (total > exibidas) return `Mostrando ${exibidas} de ${total} contas`;
  return exibidas === 1 ? '1 conta' : `${exibidas} contas`;
}

/** Sub do card "Total filtrado": a contagem que a RPC devolveu para os filtros aplicados. */
export function totalFiltradoSub(count: number): string {
  return `${count} ${count === 1 ? 'lançamento' : 'lançamentos'} com os filtros aplicados`;
}
