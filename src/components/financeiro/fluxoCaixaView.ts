import { formatDateISO } from '@/lib/datetime';

/**
 * Funções puras de apresentação do Fluxo de Caixa (Redesign V2, Fase 04A).
 */

/**
 * Período carregado de `get_fin_cashflow`: do dia 1 do mês atual ao último dia do mês seguinte,
 * pela data local (o mesmo cálculo que o componente sempre fez).
 */
export function fluxoCaixaPeriodo(now: Date): { inicio: string; fim: string } {
  return {
    inicio: formatDateISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    fim: formatDateISO(new Date(now.getFullYear(), now.getMonth() + 2, 0)),
  };
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' sem passar por `Date`. */
export function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface FluxoOrigem {
  text: string;
  className: string;
}

/** Chips de origem dos detalhes do dia, com tokens -soft/-border (sem opacidade de cor). */
const FLUXO_ORIGEM: Record<string, FluxoOrigem> = {
  manual: { text: 'Manual', className: 'bg-neutral-soft text-neutral border-neutral-border' },
  conciliacao: { text: 'Conciliação', className: 'bg-primary-soft text-primary-ink border-primary-border' },
  espelho_cp: { text: 'Espelho CP', className: 'bg-warning-soft text-warning border-warning-border' },
  espelho_cr: { text: 'Espelho CR', className: 'bg-success-soft text-success border-success-border' },
  transferencia: { text: 'Transferência', className: 'bg-neutral-soft text-neutral border-neutral-border' },
  ajuste_pagamento: { text: 'Ajuste', className: 'bg-info-soft text-info border-info-border' },
  conta_pagar: { text: 'Conta a Pagar', className: 'bg-warning-soft text-warning border-warning-border' },
  conta_receber: { text: 'Conta a Receber', className: 'bg-success-soft text-success border-success-border' },
  conta_pagar_vencida: { text: 'Pagar (Vencida)', className: 'bg-destructive-soft text-destructive border-destructive-border' },
  conta_receber_vencida: { text: 'Receber (Vencida)', className: 'bg-destructive-soft text-destructive border-destructive-border' },
};

export function fluxoOrigem(origem: string): FluxoOrigem {
  return FLUXO_ORIGEM[origem] || FLUXO_ORIGEM.manual;
}
