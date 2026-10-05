import type { StatusType } from '@/components/ui/StatusBadge';

/**
 * Funções puras de apresentação da Conciliação Bancária (Redesign V2, Fase 04B). Só rotulam e
 * pintam o estado que a tela já calcula — nenhuma regra de matching, duplicata ou saldo mora aqui.
 */

/** Estado de exibição de uma linha do extrato, com os mesmos sinais que o render já derivava. */
export interface ExtratoLinhaEstado {
  isDone: boolean;
  isInternal: boolean;
  isAutomaticPending: boolean;
  isJaConciliada: boolean;
  isIgnorada: boolean;
  hasMatch: boolean;
  hasSuggestions: boolean;
}

export interface ConciliacaoBadge {
  label: string;
  status: StatusType;
}

/**
 * Selo da coluna Status — mesma precedência (e os mesmos textos) do encadeamento anterior.
 * "Criar novo" desmarcado fica neutro: o Processar ignora a linha (antes ela vinha esmaecida).
 */
export function extratoLinhaStatus(e: ExtratoLinhaEstado, selecionada = true): ConciliacaoBadge {
  if (e.isDone) return { label: 'Concluído', status: 'success' };
  if (e.isInternal) return { label: 'Mov. interna', status: 'info' };
  if (e.isAutomaticPending) return { label: 'Tratamento pendente', status: 'warning' };
  if (e.isJaConciliada) return { label: 'Já conciliado', status: 'neutral' };
  if (e.isIgnorada) return { label: 'Ignorado', status: 'neutral' };
  if (e.hasMatch) return { label: 'Conciliar c/ existente', status: 'success' };
  if (e.hasSuggestions) return { label: 'Sugestão p/ conciliar', status: 'warning' };
  return { label: 'Criar novo', status: selecionada ? 'info' : 'neutral' };
}

/**
 * Fundo da linha com tokens `-soft` (sem opacidade: antes as linhas já resolvidas ficavam
 * esmaecidas e o texto perdia contraste). Mesma precedência do `className` anterior.
 */
export function extratoLinhaFundo(e: ExtratoLinhaEstado): string {
  if (e.isDone) return 'bg-success-soft';
  if (e.isInternal) return 'bg-info-soft';
  if (e.isAutomaticPending) return 'bg-warning-soft';
  if (e.isJaConciliada || e.isIgnorada) return 'bg-muted';
  if (e.hasMatch) return 'bg-success-soft';
  if (e.hasSuggestions) return 'bg-warning-soft';
  return '';
}

/** Linha já resolvida (conciliada ou ignorada): o texto fica secundário, sem esmaecer por opacidade. */
export function extratoLinhaResolvida(e: ExtratoLinhaEstado): boolean {
  return e.isJaConciliada || e.isIgnorada;
}

/** Tipo da linha do extrato. ContaMax (aplicação/resgate) é movimento interno, sem efeito no saldo. */
export function extratoTipoBadge(tipo: 'RECEITA' | 'DESPESA', interna: boolean): ConciliacaoBadge {
  if (interna) return { label: 'Interna', status: 'neutral' };
  return tipo === 'RECEITA' ? { label: 'Receita', status: 'success' } : { label: 'Despesa', status: 'danger' };
}

/** Botão de sugestões da linha ("1 sugestão", "3 sugestões"). */
export function sugestoesLabel(n: number): string {
  return `${n} ${n === 1 ? 'sugestão' : 'sugestões'}`;
}

export type MatchOrigem = 'lancamento' | 'conta_pagar' | 'conta_receber';

/** Selo de onde vem o registro casado com a linha (mesmas cores de antes, agora por token). */
export const MATCH_ORIGEM: Record<MatchOrigem, { label: string; className: string }> = {
  lancamento: { label: 'Lançamento', className: 'bg-success-soft text-success border-success-border' },
  conta_pagar: { label: 'Conta a Pagar', className: 'bg-primary-soft text-primary-ink border-primary-border' },
  conta_receber: { label: 'Conta a Receber', className: 'bg-warning-soft text-warning border-warning-border' },
};

/** Situação de conciliação de um lançamento da visão "Lançamentos" (vocabulário da D44). */
export function lancamentoConciliacaoBadge(conciliado: boolean | null | undefined): ConciliacaoBadge {
  return conciliado ? { label: 'Conciliado', status: 'success' } : { label: 'Pendente', status: 'warning' };
}

/** Legenda da lista de linhas do extrato: total do arquivo ou o recorte do filtro ativo. */
export function extratoLinhasCaption(filtradas: number, total: number): string {
  if (filtradas === total) return `${total} ${total === 1 ? 'linha' : 'linhas'}`;
  return `Mostrando ${filtradas} de ${total} ${total === 1 ? 'linha' : 'linhas'}`;
}

export type ChipTom = 'success' | 'warning' | 'info' | 'neutral' | 'default';

/** Cores dos chips de filtro — tokens `-soft`/`-border`, nunca opacidade de cor. */
export const CHIP_TOM: Record<ChipTom, string> = {
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  info: 'bg-info-soft text-info border-info-border',
  neutral: 'bg-neutral-soft text-neutral border-neutral-border',
  default: 'bg-card text-foreground border-border hover:bg-card-hover',
};
