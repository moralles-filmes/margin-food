import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterFieldProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  /** Cor do container do ícone — `primary` (padrão) ou `neutral` para campos sem ênfase. */
  tone?: 'primary' | 'neutral';
}

/**
 * Gatilho de filtro no padrão do mockup: ícone em container tint + label pequeno acima +
 * valor bold abaixo + chevron. Usar como filho de `PopoverTrigger`/`DropdownMenuTrigger`
 * (`asChild`) ou standalone com `onClick` próprio — é um `<button>` real nos dois casos.
 */
export const FilterField = React.forwardRef<HTMLButtonElement, FilterFieldProps>(
  ({ icon: Icon, label, value, tone = 'primary', className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors',
        'hover:border-border-strong hover:bg-surface-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card',
        'data-[state=open]:border-primary-border data-[state=open]:bg-primary-soft',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          tone === 'primary' ? 'bg-primary-soft text-primary-ink' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
      </span>
      <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  ),
);
FilterField.displayName = 'FilterField';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/** Fileira de filtros (card branco, borda fina, cantos ~12px) — ver mockup 01 "Barra de filtros". */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
