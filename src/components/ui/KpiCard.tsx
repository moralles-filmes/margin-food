import { ArrowDown, ArrowUp, LucideIcon, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold';

/**
 * Aparência do card — independente de `variant` (que é o significado do indicador).
 *   default   → card compacto de sempre (nenhum consumidor muda sem passar a prop).
 *   summary   → card branco da família de resumo do Redesign V2 (raio maior, rótulo em caixa normal).
 *   highlight → card azul de destaque: um por grupo, para o indicador principal. Azul é destaque,
 *               não "resultado bom" — `variant` e os tons de cor são ignorados aqui.
 */
export type KpiAppearance = 'default' | 'summary' | 'highlight';

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
  appearance?: KpiAppearance;
  /** cor do valor em `summary` — o consumidor decide; o sinal do número continua sendo o texto */
  valueTone?: 'default' | 'positive' | 'negative';
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
const VALUE_TONE_CLASS: Record<NonNullable<KpiCardProps['valueTone']>, string> = {
  default: 'text-foreground',
  positive: 'text-success',
  negative: 'text-destructive',
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
  appearance = 'default',
  valueTone = 'default',
  className,
  onClick,
  ariaLabel,
}: KpiCardProps) {
  const v = VARIANT_STYLES[variant];
  const DeltaIcon = delta ? DELTA_ICON[delta.direction ?? 'none'] : null;
  const isHighlight = appearance === 'highlight';
  const isCompact = appearance === 'default';
  const secondaryText = isHighlight ? 'text-highlight-muted' : 'text-muted-foreground';

  return (
    <div
      className={cn(
        isCompact && 'bg-card rounded-xl p-4 border transition-colors animate-fade-up',
        appearance === 'summary' && 'bg-card rounded-summary p-5 border shadow-card transition-colors animate-fade-up',
        isHighlight && 'relative isolate overflow-hidden bg-gradient-highlight text-highlight-foreground rounded-summary p-5 border border-transparent shadow-highlight transition-shadow animate-fade-up',
        !isHighlight && v.border,
        onClick && (isHighlight ? 'cursor-pointer hover:shadow-lg' : 'cursor-pointer hover:bg-card-hover'),
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {isHighlight && (
        // Arcos decorativos: atrás do conteúdo, sem evento e sem anúncio ao leitor de tela.
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <span className="absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-highlight-arc" />
          <span className="absolute -bottom-14 -right-6 h-36 w-36 rounded-full bg-highlight-arc" />
        </span>
      )}
      <div className={cn('flex items-start justify-between', isCompact ? 'mb-2' : 'mb-3 gap-3')}>
        <span className={cn(
          // `leading-tight` sempre depois do tamanho: o tailwind-merge descarta o leading que vem antes.
          'font-medium',
          isCompact ? 'text-[11px] uppercase tracking-wider' : 'text-[13px]',
          'leading-tight',
          secondaryText,
        )}>
          {label}
        </span>
        {Icon && (
          <div className={cn(
            'flex items-center justify-center shrink-0',
            isCompact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl',
            isHighlight ? 'bg-highlight-icon' : v.iconBg,
          )}>
            <Icon className={cn('w-4 h-4', isHighlight ? 'text-highlight-foreground' : v.iconColor)} />
          </div>
        )}
      </div>
      <p className={cn(
        'font-bold',
        // Compacto mantém Space Grotesk como sempre; a família V2 usa Inter com algarismos tabulares
        // (em Space Grotesk o `tabular-nums` troca o desenho do "1").
        isCompact ? 'text-xl font-display' : 'text-2xl font-sans tabular-nums tracking-tight',
        'leading-tight',
        isHighlight ? 'text-highlight-foreground' : isCompact ? 'text-foreground' : VALUE_TONE_CLASS[valueTone],
      )}>
        {value}
      </p>
      {sub && (
        <p className={cn(isCompact ? 'text-[11px] mt-1' : 'text-xs mt-1.5', 'leading-tight', secondaryText)}>{sub}</p>
      )}
      {delta && (
        <div className={cn(
          'pt-2 border-t flex items-center justify-between gap-2',
          isCompact ? 'mt-2' : 'mt-3',
          isHighlight ? 'border-highlight-divider' : 'border-border',
        )}>
          <span className={cn(isCompact ? 'text-[11px]' : 'text-xs', 'leading-tight', secondaryText)}>{delta.label}</span>
          <span className={cn(
            'inline-flex items-center gap-0.5 font-semibold',
            isCompact ? 'text-[11px]' : 'text-xs',
            'leading-tight',
            // Sobre o azul, verde/vermelho não têm contraste: a seta e o texto carregam o sentido.
            isHighlight
              ? 'text-highlight-foreground'
              : delta.tone ? DELTA_TONE_CLASS[delta.tone] : 'text-muted-foreground',
          )}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" />}
            {delta.formatted}
          </span>
        </div>
      )}
    </div>
  );
}
