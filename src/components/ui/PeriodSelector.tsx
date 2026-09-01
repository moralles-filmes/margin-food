import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { FilterField } from '@/components/ui/FilterBar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateISO } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

interface PeriodSelectorProps {
  /** Rótulo pequeno acima do valor — default "Período". */
  label?: string;
  /** Valor já formatado para exibição (ex.: "Agosto 2026", "01/08 — 15/08"). */
  value: React.ReactNode;
  /** Início do período, ISO `yyyy-MM-dd` ou `''`. */
  from: string;
  /** Fim do período, ISO `yyyy-MM-dd` ou `''`. */
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  /** Portal container — necessário dentro de `Dialog`/`Sheet`. */
  container?: HTMLElement | null;
}

/**
 * Campo "Período" do mockup 01 (Barra de filtros): `FilterField` como gatilho +
 * popover com `Calendar` em modo intervalo. Componente novo desta fase — adoção
 * tela a tela fica para as Fases 7-9, junto com os demais filtros dos dashboards.
 */
export function PeriodSelector({ label = 'Período', value, from, to, onChange, className, container }: PeriodSelectorProps) {
  const [open, setOpen] = React.useState(false);

  const selected: DateRange | undefined = from
    ? { from: parseLocalDate(from), to: to ? parseLocalDate(to) : undefined }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterField icon={CalendarIcon} label={label} value={value} className={className} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" container={container}>
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => {
            const nextFrom = range?.from ? formatDateISO(range.from) : '';
            const nextTo = range?.to ? formatDateISO(range.to) : '';
            onChange(nextFrom, nextTo);
            if (nextFrom && nextTo) setOpen(false);
          }}
          locale={ptBR}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
