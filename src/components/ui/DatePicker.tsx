import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDateBR, formatDisplayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

interface PopoverPositioning {
  align?: 'start' | 'center' | 'end';
  /** Portal container — necessário quando o picker abre dentro de um Dialog/Sheet com scroll próprio. */
  container?: HTMLElement | null;
}

interface DatePickerProps extends PopoverPositioning {
  /** Data selecionada, ou `undefined` quando vazio. */
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  /** Override do texto exibido no gatilho — default `formatDisplayBR` (dd/MM/yyyy). */
  formatValue?: (date: Date) => string;
}

/**
 * Popover + Calendar + gatilho estilizado, para telas que já trabalham com `Date`
 * (agenda, ponto, vencimento). Para campos com contrato de string ISO `yyyy-MM-dd`
 * (formulários financeiros/filtros), usar `DateInput`.
 */
export function DatePicker({
  date,
  onDateChange,
  placeholder = 'Selecione a data',
  className,
  disabled,
  align = 'start',
  container,
  id,
  'aria-label': ariaLabel,
  formatValue = formatDisplayBR,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {date ? formatValue(date) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align} container={container}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onDateChange(d);
            setOpen(false);
          }}
          locale={ptBR}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateRangePickerProps extends PopoverPositioning {
  /** Início do período, ISO `yyyy-MM-dd` ou `''`. */
  from: string;
  /** Fim do período, ISO `yyyy-MM-dd` ou `''`. */
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/** Mesma anatomia do `DatePicker`, para campos de intervalo com contrato `from`/`to` ISO. */
export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'Selecione o período',
  className,
  disabled,
  align = 'start',
  container,
  id,
  'aria-label': ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected: DateRange | undefined = from
    ? { from: parseLocalDate(from), to: to ? parseLocalDate(to) : undefined }
    : undefined;

  const label =
    from && to
      ? `${formatDisplayBR(parseLocalDate(from))} — ${formatDisplayBR(parseLocalDate(to))}`
      : from
        ? formatDisplayBR(parseLocalDate(from))
        : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-start text-left font-normal',
            !from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align} container={container}>
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => {
            const nextFrom = range?.from ? formatDateBR(range.from) : '';
            const nextTo = range?.to ? formatDateBR(range.to) : '';
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
