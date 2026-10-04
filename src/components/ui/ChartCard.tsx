import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';

/**
 * Moldura padrão para todo gráfico do sistema — título, período/unidade no subtítulo, ações,
 * legenda, corpo com altura responsiva e os estados carregando/vazio/erro (nunca renderiza o
 * gráfico com dado fictício, e erro nunca vira gráfico vazio). Adoção tela a tela nas fases de
 * módulo do Redesign V2.
 */

export interface ChartCardProps {
  title: React.ReactNode;
  /** Período, unidade ou regime do gráfico (ex.: "Últimos 6 meses · R$"). */
  subtitle?: React.ReactNode;
  /** Slot de ações no canto direito do header (ex.: `SegmentedControl`, `Select "Exibir por"`). */
  actions?: React.ReactNode;
  /** Amostra de série (ex.: `ChartLegend`), renderizada acima do corpo do gráfico. */
  legend?: React.ReactNode;
  /** Resumo/nota abaixo do gráfico — o que é importante não pode ficar só no hover. */
  footer?: React.ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Falha de carregamento — tem precedência sobre `isEmpty`. */
  error?: boolean;
  errorTitle?: string;
  errorDescription?: string;
  onRetry?: () => void;
  retrying?: boolean;
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
  footer,
  loading = false,
  isEmpty = false,
  emptyIcon,
  emptyTitle = 'Sem dados no período selecionado',
  emptyDescription,
  error = false,
  errorTitle = 'Não foi possível carregar o gráfico',
  errorDescription,
  onRetry,
  retrying,
  height,
  className,
  children,
}: ChartCardProps) {
  const showBody = !loading && !error && !isEmpty;

  return (
    <Card className={cn('rounded-summary', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5">
        <div className="min-w-0 space-y-1">
          <CardTitle className="leading-tight">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0">
        {legend && showBody && legend}
        <figure
          aria-label={typeof title === 'string' ? title : undefined}
          aria-busy={loading || undefined}
          className={cn('m-0 w-full', showBody || loading ? height ?? 'aspect-video' : 'min-h-40')}
        >
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : error ? (
            <ErrorState
              compact
              className="border-0"
              title={errorTitle}
              description={errorDescription}
              onRetry={onRetry}
              retrying={retrying}
            />
          ) : isEmpty ? (
            <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} compact className="border-0" />
          ) : (
            children
          )}
        </figure>
        {footer && showBody && <div className="text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}
