import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Legenda para consumidores de Recharts cru — companheira de `ChartTooltip.tsx` (mesma lógica de
 * `dashedKeys` para distinguir amostra sólida vs tracejada, ver ali o porquê de não depender de
 * `legendType` do Recharts).
 *
 * Uso: `<Legend content={<ChartLegend dashedKeys={['orcado']} />} />` — o Recharts injeta
 * `payload` (um item por série) em runtime.
 */

export interface ChartLegendItem {
  value: React.ReactNode;
  color?: string;
  dataKey?: string | number;
  /** Tipo de ícone do Recharts (`square`/`rect`/`circle`/`line`…) quando a série não é uma linha. */
  type?: string;
}

export interface ChartLegendProps {
  payload?: ChartLegendItem[];
  /** `dataKey`s (ou `value`, se não houver `dataKey`) que devem exibir amostra tracejada. */
  dashedKeys?: Array<string | number>;
  className?: string;
}

export function ChartLegend({ payload, dashedKeys, className }: ChartLegendProps) {
  if (!payload?.length) return null;

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs', className)}>
      {payload.map((item, index) => {
        const key = item.dataKey ?? (typeof item.value === 'string' ? item.value : index);
        const dashed = dashedKeys?.includes(key as string | number) ?? false;
        const isSquare = item.type === 'square' || item.type === 'rect';

        return (
          <div key={String(key)} className="flex items-center gap-1.5 text-muted-foreground">
            {isSquare ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
            ) : (
              <span
                className={cn('h-0 w-3.5 shrink-0 border-t-2', dashed ? 'border-dashed' : 'border-solid')}
                style={{ borderColor: item.color }}
                aria-hidden
              />
            )}
            <span>{item.value}</span>
          </div>
        );
      })}
    </div>
  );
}
