import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  variant?: KpiVariant;
  className?: string;
  onClick?: () => void;
}

const VARIANT_STYLES: Record<KpiVariant, { border: string; iconBg: string; iconColor: string }> = {
  default:  { border: 'border-border',           iconBg: 'bg-secondary',        iconColor: 'text-muted-foreground' },
  primary:  { border: 'border-primary/25',       iconBg: 'bg-primary/15',       iconColor: 'text-primary' },
  success:  { border: 'border-success/25',       iconBg: 'bg-success/15',       iconColor: 'text-success' },
  warning:  { border: 'border-warning/25',       iconBg: 'bg-warning/15',       iconColor: 'text-warning' },
  danger:   { border: 'border-destructive/25',   iconBg: 'bg-destructive/15',   iconColor: 'text-destructive' },
  gold:     { border: 'border-warning/25',       iconBg: 'bg-warning/15',       iconColor: 'text-warning' },
};

export default function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = 'default',
  className,
  onClick,
}: KpiCardProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <div
      className={cn(
        'bg-card rounded-xl p-4 border transition-colors animate-fade-up',
        v.border,
        onClick && 'cursor-pointer hover:bg-accent/50',
        className,
      )}
      onClick={onClick}
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
    </div>
  );
}
