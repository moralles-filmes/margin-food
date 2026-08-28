import { ArrowDown, ArrowUp, LucideIcon, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold';

export interface KpiCardDelta {
  /** e.g. "vs. período anterior" */
  label: string;
  /** já formatado pelo consumidor: "+12,4%", "Sem dados", "Base zero"… */
  formatted: string;
  /** seta exibida ao lado do valor — 'none' para estados sem comparação numérica */
  direction?: 'up' | 'down' | 'flat' | 'none';
  /** cor do valor — o consumidor decide (ex.: despesa em queda é positiva) */
  tone?: 'positive' | 'negative' | 'neutral';
}

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: KpiCardDelta;
  icon?: LucideIcon;
  variant?: KpiVariant;
  className?: string;
  onClick?: () => void;
  /** rótulo acessível do card clicável — default é o próprio `label` visível */
  ariaLabel?: string;
}

const DELTA_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus, none: null } as const;
const DELTA_TONE_CLASS: Record<NonNullable<KpiCardDelta['tone']>, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const VARIANT_STYLES: Record<KpiVariant, { border: string; iconBg: string; iconColor: string }> = {
  default:  { border: 'border-border',        iconBg: 'bg-secondary',      iconColor: 'text-muted-foreground' },
  primary:  { border: 'border-primary-border', iconBg: 'bg-primary-soft',   iconColor: 'text-primary-ink' },
  success:  { border: 'border-success-border', iconBg: 'bg-success-soft',   iconColor: 'text-success' },
  warning:  { border: 'border-warning-border', iconBg: 'bg-warning-soft',   iconColor: 'text-warning' },
  danger:   { border: 'border-destructive-border', iconBg: 'bg-destructive-soft', iconColor: 'text-destructive' },
  gold:     { border: 'border-warning-border', iconBg: 'bg-warning-soft',   iconColor: 'text-warning' },
};

export default function KpiCard({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  variant = 'default',
  className,
  onClick,
  ariaLabel,
}: KpiCardProps) {
  const v = VARIANT_STYLES[variant];
  const DeltaIcon = delta ? DELTA_ICON[delta.direction ?? 'none'] : null;

  return (
    <div
      className={cn(
        'bg-card rounded-xl p-4 border transition-colors animate-fade-up',
        v.border,
        onClick && 'cursor-pointer hover:bg-card-hover',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider leading-tight">
          {label}
        </span>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', v.iconBg)}>
            <Icon className={cn('w-4 h-4', v.iconColor)} />
          </div>
        )}
      </div>
      <p className="text-xl font-display font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{sub}</p>}
      {delta && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground leading-tight">{delta.label}</span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-semibold leading-tight',
            delta.tone ? DELTA_TONE_CLASS[delta.tone] : 'text-muted-foreground',
          )}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" />}
            {delta.formatted}
          </span>
        </div>
      )}
    </div>
  );
}
