import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { DatePicker } from '@/components/ui/DatePicker';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import MonthNavigator from '@/components/financeiro/MonthNavigator';
import {
  localDateToISO,
  monthOfISO,
  borderoPeriodError,
  shiftBorderoFilter,
  weekBounds,
  formatBorderoPeriod,
  type BorderoFilterState,
  type BorderoPeriodMode,
  type BorderoPeriodResolution,
} from '@/domain/financeiro/bordero';
import { parseLocalDate } from '@/lib/dateUtils';

const MODE_OPTIONS: { value: BorderoPeriodMode; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'custom', label: 'Período' },
];

interface BorderoPeriodFilterProps {
  filter: BorderoFilterState;
  resolution: BorderoPeriodResolution;
  todayISO: string;
  onChange: (next: BorderoFilterState) => void;
}

export default function BorderoPeriodFilter({ filter, resolution, todayISO, onChange }: BorderoPeriodFilterProps) {
  const currentWeekStart = weekBounds(todayISO).start;
  const isCurrentWeek = filter.mode === 'week' && resolution.ok && resolution.period.start === currentWeekStart;
  const isCurrentMonth = filter.mode === 'month' && filter.month === monthOfISO(todayISO);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          options={MODE_OPTIONS}
          value={filter.mode}
          onChange={value => onChange({ ...filter, mode: value as BorderoPeriodMode })}
          className="w-full sm:w-auto"
        />

        {filter.mode === 'week' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(shiftBorderoFilter(filter, -1))}>
              <ChevronLeft className="w-4 h-4" /> Semana anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isCurrentWeek}
              onClick={() => onChange({ ...filter, weekAnchor: todayISO })}
            >
              Semana atual
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(shiftBorderoFilter(filter, 1))}>
              Próxima semana <ChevronRight className="w-4 h-4" />
            </Button>
            <DatePicker
              date={parseLocalDate(filter.weekAnchor)}
              onDateChange={date => { if (date) onChange({ ...filter, weekAnchor: localDateToISO(date) }); }}
              placeholder="Escolher semana"
              aria-label="Escolher semana no calendário"
              className="h-9 w-auto"
              formatValue={() => 'Escolher semana'}
            />
          </div>
        )}

        {filter.mode === 'month' && (
          <div className="flex flex-wrap items-center gap-2">
            <MonthNavigator value={filter.month} onChange={month => onChange({ ...filter, month })} monthsBack={24} monthsForward={12} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isCurrentMonth}
              onClick={() => onChange({ ...filter, month: monthOfISO(todayISO) })}
            >
              Mês atual
            </Button>
          </div>
        )}

        {filter.mode === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="bordero-custom-start" className="text-xs text-muted-foreground">Data inicial</Label>
              <DateInput
                id="bordero-custom-start"
                value={filter.customStart}
                onValueChange={value => onChange({ ...filter, customStart: value })}
                className="h-9 w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bordero-custom-end" className="text-xs text-muted-foreground">Data final</Label>
              <DateInput
                id="bordero-custom-end"
                value={filter.customEnd}
                onValueChange={value => onChange({ ...filter, customEnd: value })}
                className="h-9 w-[160px]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm" aria-live="polite">
        <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
        {resolution.ok ? (
          <p className="text-foreground">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground text-xs mr-1.5">Período:</span>
            <span className="font-semibold" data-testid="bordero-period-label">{formatBorderoPeriod(resolution.period)}</span>
          </p>
        ) : (
          <p className="text-destructive" role="alert">{borderoPeriodError(resolution)}</p>
        )}
      </div>
    </div>
  );
}
