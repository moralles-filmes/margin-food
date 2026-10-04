import type { StatusType } from '@/components/ui/StatusBadge';

/**
 * Funções puras de apresentação do Livro Razão (Redesign V2, Fase 04A). Só rotulam o que a tela já
 * recebe de `list_fin_lancamentos_cursor`, `get_fin_lancamentos_totais` e `get_fin_saldo_atual`.
 */

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' sem passar por `Date` (nada de fuso). */
function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Período dos totais, exatamente o que vai para `p_start`/`p_end` (vazio = sem limite). */
export function formatLedgerPeriodLabel(de: string, ate: string): string {
  if (de && ate) return de === ate ? isoToBR(de) : `${isoToBR(de)} a ${isoToBR(ate)}`;
  if (ate) return `Até ${isoToBR(ate)}`;
  if (de) return `Desde ${isoToBR(de)}`;
  return 'Todo o período';
}

/**
 * Rótulo do card de saldo. Com data, `get_fin_saldo_atual` devolve o saldo ao fim daquele dia
 * (inclusivo) — não o saldo de hoje. Sem data, é o saldo atual.
 */
export function ledgerSaldoLabel(ate: string): string {
  return ate ? `Saldo em ${isoToBR(ate)}` : 'Saldo atual';
}

/**
 * Rótulo do saldo no cabeçalho de cada dia. `saldo_apos` é o saldo corrente depois da linha e ignora
 * os filtros de tipo/origem/categoria: sem esses filtros a primeira linha do dia é o último lançamento
 * do dia (saldo de fechamento); com eles, pode não ser.
 */
export function daySaldoLabel(hasRowFilter: boolean): string {
  return hasRowFilter ? 'Saldo após o último lançamento listado' : 'Saldo no fim do dia';
}

export interface LedgerBadge {
  label: string;
  status: StatusType;
}

const TIPO_BADGE: Record<string, LedgerBadge> = {
  RECEITA: { label: 'Receita', status: 'success' },
  DESPESA: { label: 'Despesa', status: 'danger' },
  TRANSFERENCIA: { label: 'Transferência', status: 'neutral' },
};

export function ledgerTipoBadge(tipo: string): LedgerBadge {
  return TIPO_BADGE[tipo] ?? { label: tipo, status: 'neutral' };
}

const STATUS_BADGE: Record<string, LedgerBadge> = {
  PREVISTO: { label: 'Previsto', status: 'warning' },
  REALIZADO: { label: 'Realizado', status: 'success' },
  CANCELADO: { label: 'Cancelado', status: 'neutral' },
};

export function ledgerStatusBadge(status: string): LedgerBadge {
  return STATUS_BADGE[status] ?? { label: status, status: 'neutral' };
}

export interface LedgerOrigem {
  text: string;
  className: string;
  tooltip: string;
}

/** Chips de origem com tokens -soft/-border (sem opacidade de cor). */
export const LEDGER_ORIGEM: Record<string, LedgerOrigem> = {
  manual: { text: 'Manual', className: 'bg-neutral-soft text-neutral border-neutral-border', tooltip: 'Lançamento criado manualmente no Livro Razão' },
  conciliacao: { text: 'Conciliação', className: 'bg-primary-soft text-primary-ink border-primary-border', tooltip: 'Lançamento criado a partir da conciliação bancária' },
  espelho_cp: { text: 'Espelho CP', className: 'bg-warning-soft text-warning border-warning-border', tooltip: 'Lançamento gerado pela baixa de uma Conta a Pagar' },
  espelho_cr: { text: 'Espelho CR', className: 'bg-success-soft text-success border-success-border', tooltip: 'Lançamento gerado pelo recebimento de uma Conta a Receber' },
  transferencia: { text: 'Transferência', className: 'bg-neutral-soft text-neutral border-neutral-border', tooltip: 'Movimentação entre contas financeiras' },
  ajuste_pagamento: { text: 'Ajuste', className: 'bg-info-soft text-info border-info-border', tooltip: 'Diferença entre o valor do boleto e o valor debitado no extrato (juros, tarifa ou desconto)' },
};

/** Mesma regra de antes: sem origem, transferência cai em 'transferencia' e o resto em 'manual'. */
export function ledgerOrigem(origem: string | null | undefined, tipo: string): LedgerOrigem {
  return LEDGER_ORIGEM[origem || (tipo === 'TRANSFERENCIA' ? 'transferencia' : 'manual')] || LEDGER_ORIGEM.manual;
}
