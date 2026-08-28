import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

/**
 * Card padrão para todo gráfico do sistema — título, ações (segmented/select do mockup 04),
 * legenda, corpo do gráfico com altura responsiva, e os estados vazio/carregando (nunca renderiza
 * o gráfico com dado fictício). Adoção é tela a tela nas Fases 7/8 — este componente só existe
 * pronto para uso a partir desta fase.
 */

export interface ChartCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Slot de ações no canto direito do header (ex.: `SegmentedControl`, `Select "Exibir por"`). */
  actions?: React.ReactNode;
  /** Amostra de série (ex.: `ChartLegend`), renderizada acima do corpo do gráfico. */
  legend?: React.ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Altura do corpo do gráfico como classe Tailwind (ex.: `"h-[320px]"`). Default: `aspect-video`
   * (responsivo, mesmo comportamento de `ChartContainer` em `ui/chart.tsx`) — sobrescrever quando
   * o card tiver uma altura fixa definida pelo layout da tela.
   */
  height?: string;
  className?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  legend,
  loading = false,
  isEmpty = false,
  emptyIcon,
  emptyTitle = 'Sem dados no período selecionado',
  emptyDescription,
  height,
  className,
  children,
}: ChartCardProps) {
  const showBody = !loading && !isEmpty;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="space-y-3">
        {legend && showBody && legend}
        <div className={cn('w-full', height ?? 'aspect-video')}>
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} compact />
            </div>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}
