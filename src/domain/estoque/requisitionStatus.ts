/**
 * Domain rules for requisition item-level and aggregated statuses.
 * Single source of truth — no business logic in components.
 */

/** Official item-level statuses */
export type RequisicaoItemStatus = 'SOLICITADO' | 'ATENDIDO' | 'RECUSADO';

/** Official requisition-level statuses */
export type RequisicaoStatus =
  | 'SOLICITADA'
  | 'ATENDIDA'
  | 'NEGADA'
  | 'PARCIALMENTE_ATENDIDA'
  | 'CANCELADA';

/** Official rejection reasons (predefined options) */
export const MOTIVOS_RECUSA = [
  'Sem estoque',
  'Item indisponível',
  'Produto descontinuado',
  'Erro na solicitação',
  'Quantidade inválida',
  'Outro motivo',
] as const;

export type MotivoRecusa = (typeof MOTIVOS_RECUSA)[number];

/** Can an item be rejected? Only SOLICITADO items */
export function canRejectItem(itemStatus: string): boolean {
  return itemStatus === 'SOLICITADO';
}

/** Can an item be attended? Only SOLICITADO items */
export function canAttendItem(itemStatus: string): boolean {
  return itemStatus === 'SOLICITADO';
}

/** Can the requisition header still be acted upon? */
export function canActOnRequisicao(status: string): boolean {
  return status === 'SOLICITADA' || status === 'PARCIALMENTE_ATENDIDA';
}

/** Does the requisition have any pending items? */
export function hasPendingItems(items: { status: string }[]): boolean {
  return items.some(i => i.status === 'SOLICITADO');
}

/** Display label for item status */
export function itemStatusLabel(status: string): string {
  switch (status) {
    case 'SOLICITADO': return 'Solicitado';
    case 'ATENDIDO': return 'Atendido';
    case 'RECUSADO': return 'Recusado';
    default: return status;
  }
}

/** Display label for requisition status */
export function requisicaoStatusLabel(status: string): string {
  switch (status) {
    case 'SOLICITADA': return 'Solicitada';
    case 'ATENDIDA': return 'Atendida';
    case 'NEGADA': return 'Negada';
    case 'PARCIALMENTE_ATENDIDA': return 'Parcial';
    case 'CANCELADA': return 'Cancelada';
    default: return status;
  }
}

/** Style class for item status badge */
export function itemStatusStyle(status: string): string {
  switch (status) {
    case 'SOLICITADO': return 'bg-primary/15 text-primary';
    case 'ATENDIDO': return 'bg-success/15 text-success';
    case 'RECUSADO': return 'bg-destructive/15 text-destructive';
    default: return 'bg-secondary text-muted-foreground';
  }
}

/** Style class for requisition status badge */
export function requisicaoStatusStyle(status: string): string {
  switch (status) {
    case 'SOLICITADA': return 'bg-primary/15 text-primary';
    case 'ATENDIDA': return 'bg-success/15 text-success';
    case 'NEGADA': return 'bg-destructive/15 text-destructive';
    case 'PARCIALMENTE_ATENDIDA': return 'bg-warning/15 text-warning';
    case 'CANCELADA': return 'bg-secondary text-muted-foreground';
    default: return 'bg-secondary text-muted-foreground';
  }
}
