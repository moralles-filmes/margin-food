import { cn } from '@/lib/utils';

/**
 * Global status badge for the entire system.
 * Ensures consistent visual representation of status across all modules.
 *
 * Color rules:
 *   green  → ok / ativo / aprovado / pago / concluído / publicada / recebido
 *   yellow → atenção / pendente / baixo / revisão / parcial / pressionado
 *   red    → crítico / cancelado / sem_estoque / rejeitado / ruptura / perda / vencido
 *   blue   → info / em_andamento / processando / aberto
 *   gray   → inativo / desabilitado / sem_dado / rascunho
 */

export type StatusType =
  | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  // semantic aliases
  | 'ok' | 'ativo' | 'aprovado' | 'pago' | 'concluido' | 'recebido' | 'publicada' | 'saudavel' | 'alta'
  | 'atencao' | 'pendente' | 'baixo' | 'parcial' | 'pressionado' | 'media' | 'revisao' | 'aberto_warning'
  | 'critico' | 'cancelado' | 'sem_estoque' | 'rejeitado' | 'ruptura' | 'perda' | 'vencido' | 'alto'
  | 'em_andamento' | 'processando' | 'informativo' | 'aberto'
  | 'inativo' | 'desabilitado' | 'sem_dado' | 'rascunho' | 'sem_custo';

const STATUS_MAP: Record<StatusType, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  // Direct
  success: 'success', warning: 'warning', danger: 'danger', info: 'info', neutral: 'neutral',
  // Green
  ok: 'success', ativo: 'success', aprovado: 'success', pago: 'success', concluido: 'success',
  recebido: 'success', publicada: 'success', saudavel: 'success', alta: 'success',
  // Yellow
  atencao: 'warning', pendente: 'warning', baixo: 'warning', parcial: 'warning',
  pressionado: 'warning', media: 'warning', revisao: 'warning', aberto_warning: 'warning',
  // Red
  critico: 'danger', cancelado: 'danger', sem_estoque: 'danger', rejeitado: 'danger',
  ruptura: 'danger', perda: 'danger', vencido: 'danger', alto: 'danger',
  // Blue
  em_andamento: 'info', processando: 'info', informativo: 'info', aberto: 'info',
  // Gray
  inativo: 'neutral', desabilitado: 'neutral', sem_dado: 'neutral', rascunho: 'neutral', sem_custo: 'neutral',
};

const VARIANT_STYLES: Record<string, string> = {
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  danger: 'bg-destructive-soft text-destructive border-destructive-border',
  info: 'bg-info-soft text-info border-info-border',
  neutral: 'bg-neutral-soft text-neutral border-neutral-border',
};

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  dot?: boolean;
}

export default function StatusBadge({
  status,
  label,
  className,
  size = 'sm',
  dot = false,
}: StatusBadgeProps) {
  const mapped = STATUS_MAP[status as StatusType] ?? 'neutral';
  const styles = VARIANT_STYLES[mapped];

  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
  }[size];

  const dotColor = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    info: 'bg-info',
    neutral: 'bg-neutral',
  }[mapped];

  const displayLabel = label ?? status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap leading-tight',
        styles,
        sizeClasses,
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />}
      {displayLabel}
    </span>
  );
}

/**
 * Helper to resolve a raw status string to a StatusType.
 * Useful for mapping DB values like 'PUBLICADA' → 'publicada'
 */
export function resolveStatus(raw: string): StatusType {
  const normalized = raw.toLowerCase().trim()
    .replace(/\s+/g, '_')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized in STATUS_MAP) return normalized as StatusType;
  return 'neutral';
}
