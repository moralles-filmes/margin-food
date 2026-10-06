import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Peças de layout do Redesign V2 compartilhadas pelas telas do Financeiro a partir da Fase 04A
 * (mesmo desenho do cabeçalho, dos grupos e das notas do Dashboard da Fase 03).
 */

/** Cabeçalho de conteúdo da tela: título, descrição e ações (que quebram para baixo em tela estreita). */
export function FinScreenHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-2xl">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Grupo rotulado (h3 em caixa alta, divisória e legenda à direita), como os grupos de cards do Dashboard. */
export function FinSectionGroup({ id, title, caption, children, className }: {
  id: string;
  title: string;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <div aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-border sm:block" />
        {caption && <p className="ml-auto text-xs text-muted-foreground sm:ml-0">{caption}</p>}
      </div>
      {children}
    </section>
  );
}

/** Grade de cards que segue a largura do próprio grupo (container query) — classe de `kpiGridClassFor`. */
export function FinKpiGrid({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className="[container-type:inline-size]">
      <div className={className}>{children}</div>
    </div>
  );
}

/** Nota explicativa curta abaixo de um grupo. */
export function FinNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs text-muted-foreground', className)}>
      <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
