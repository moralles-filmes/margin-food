import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatDecimalBR } from '@/lib/formatters';

/**
 * Tooltip para consumidores de Recharts cru (a maioria dos 22 arquivos que importam `recharts`
 * diretamente, sem passar por `ChartContainer`/`ChartConfig`). Quem já usa `ChartContainer`
 * continua com `ChartTooltipContent` de `ui/chart.tsx` — os dois não se substituem: aquele lê cor
 * e rótulo do `ChartConfig` via contexto, este recebe tudo explícito via prop (não depende de
 * `ChartContainer` estar por perto).
 *
 * Uso: `<Tooltip content={<ChartTooltip valueFormatter={...} dashedKeys={['orcado']} />} />`.
 * O Recharts clona o elemento injetando `active`/`payload`/`label` em runtime.
 */

export interface ChartTooltipPayloadItem {
  dataKey?: string | number;
  name?: React.ReactNode;
  value?: number | string;
  color?: string;
  unit?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: React.ReactNode;
  payload?: ChartTooltipPayloadItem[];
  /** Sobrepõe `label` quando o tooltip precisa de um título diferente do valor bruto do eixo X. */
  title?: React.ReactNode;
  /** Linha secundária opcional abaixo do título (ex.: "Regime de competência"). */
  period?: React.ReactNode;
  /** Unidade aplicada a todo item sem `unit` próprio (ex.: "kg"). */
  unit?: string;
  valueFormatter?: (value: number | string, item: ChartTooltipPayloadItem) => React.ReactNode;
  /** `dataKey`s (ou `name`, se não houver `dataKey`) que devem exibir amostra tracejada. */
  dashedKeys?: Array<string | number>;
  className?: string;
}

export function ChartTooltip({
  active,
  label,
  payload,
  title,
  period,
  unit,
  valueFormatter,
  dashedKeys,
  className,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const heading = title ?? label;

  return (
    <div
      className={cn(
        'min-w-[10rem] rounded-lg border border-chart-tooltip-border bg-chart-tooltip px-3 py-2 text-xs shadow-md',
        className,
      )}
    >
      {heading != null && <div className="font-medium text-chart-tooltip-foreground">{heading}</div>}
      {period != null && <div className="text-muted-foreground">{period}</div>}
      <div className={cn('grid gap-1', (heading != null || period != null) && 'mt-1.5')}>
        {payload.map((item, index) => {
          const key = item.dataKey ?? (typeof item.name === 'string' ? item.name : index);
          const dashed = dashedKeys?.includes(key as string | number) ?? false;
          const displayValue = valueFormatter
            ? valueFormatter(item.value ?? '', item)
            : typeof item.value === 'number'
              ? formatDecimalBR(item.value)
              : item.value;
          const itemUnit = item.unit ?? unit;

          return (
            <div key={String(key)} className="flex items-center gap-2">
              <span
                className={cn('h-0 w-3 shrink-0 border-t-2', dashed ? 'border-dashed' : 'border-solid')}
                style={{ borderColor: item.color }}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{item.name}</span>
              <span className="font-medium tabular-nums text-chart-tooltip-foreground">
                {displayValue}
                {itemUnit ? ` ${itemUnit}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
