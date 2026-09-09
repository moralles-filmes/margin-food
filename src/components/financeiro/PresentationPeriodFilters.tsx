import { useState, type ReactNode } from 'react';
import { Building2, CalendarDays, Filter, Loader2 } from 'lucide-react';
import type {
  AvailablePeriodBounds,
  PresentationPeriodFilter,
  PresentationPeriodPreset,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateBR, parseLocalDate } from '@/lib/formatters';
import {
  presentationFilterFromDraft,
  type PresentationFilterDraft,
} from '@/lib/presentationFilters';
import { cn } from '@/lib/utils';
import PresentationHistoryYearsSelector from '@/components/financeiro/PresentationHistoryYearsSelector';

interface PresentationPeriodFiltersProps {
  initialDraft: PresentationFilterDraft;
  availableBounds?: AvailablePeriodBounds;
  unitName?: string | null;
  companySelector?: ReactNode;
  localUnitOverride?: boolean;
  granularity: TimeSeriesGranularity;
  rankingLimit: number;
  historyYears: readonly number[];
  isFetching: boolean;
  onApply: (filter: PresentationPeriodFilter) => void;
  onGranularityChange: (value: TimeSeriesGranularity) => void;
  onRankingLimitChange: (value: number) => void;
  onHistoryYearsChange: (years: readonly number[]) => void;
}

type QuickPreset = Extract<PresentationPeriodPreset, 'month' | 'month-range' | 'year' | 'all-time'>;

const QUICK_PRESETS: Array<{ value: QuickPreset; label: string }> = [
  { value: 'month', label: 'Mês' },
  { value: 'month-range', label: 'Meses' },
  { value: 'year', label: 'Ano' },
  { value: 'all-time', label: 'Total' },
];

function isGranularity(value: string): value is TimeSeriesGranularity {
  return value === 'day' || value === 'month' || value === 'year';
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function PresentationPeriodFilters({
  initialDraft,
  availableBounds,
  unitName,
  companySelector,
  localUnitOverride,
  granularity,
  rankingLimit,
  historyYears,
  isFetching,
  onApply,
  onGranularityChange,
  onRankingLimitChange,
  onHistoryYearsChange,
}: PresentationPeriodFiltersProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [validationError, setValidationError] = useState<string | null>(null);

  const applyDraft = (nextDraft: PresentationFilterDraft) => {
    try {
      const filter = presentationFilterFromDraft(nextDraft, availableBounds);
      setValidationError(null);
      onApply(filter);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Período inválido.');
    }
  };

  const selectQuickPreset = (kind: QuickPreset) => {
    const nextDraft = { ...draft, kind };
    setDraft(nextDraft);
    applyDraft(nextDraft);
  };

  const boundsLabel = availableBounds
    ? `${formatDateBR(parseLocalDate(availableBounds.minDate))} a ${formatDateBR(parseLocalDate(availableBounds.maxDate))}`
    : 'Histórico sendo identificado';

  return (
    <section aria-label="Filtros da apresentação" className="rounded-xl border border-border/80 bg-card/70 p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:max-w-[660px]">
          <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border/80 bg-background/45 px-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">Período</p>
              {draft.kind === 'month' ? (
                <Input
                  aria-label="Mês da apresentação"
                  type="month"
                  value={draft.month}
                  onChange={event => setDraft(current => ({ ...current, month: event.target.value }))}
                  onBlur={() => applyDraft(draft)}
                  className="h-7 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
                />
              ) : null}
              {draft.kind === 'month-range' ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label="Mês inicial"
                    type="month"
                    value={draft.startMonth}
                    onChange={event => setDraft(current => ({ ...current, startMonth: event.target.value }))}
                    className="h-7 min-w-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input
                    aria-label="Mês final"
                    type="month"
                    value={draft.endMonth}
                    onChange={event => setDraft(current => ({ ...current, endMonth: event.target.value }))}
                    onBlur={() => applyDraft(draft)}
                    className="h-7 min-w-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                  />
                </div>
              ) : null}
              {draft.kind === 'year' ? (
                <Input
                  aria-label="Ano da apresentação"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="9999"
                  value={draft.year}
                  onChange={event => setDraft(current => ({ ...current, year: event.target.value }))}
                  onBlur={() => applyDraft(draft)}
                  className="h-7 border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0"
                />
              ) : null}
              {draft.kind === 'all-time' ? (
                <p className="truncate text-sm font-medium text-foreground">{boundsLabel}</p>
              ) : null}
              {draft.kind === 'year-to-date' ? (
                <p className="truncate text-sm font-medium text-foreground">Acumulado de {draft.year}</p>
              ) : null}
              {draft.kind === 'custom' ? (
                <p className="truncate text-sm font-medium text-foreground">
                  {formatDateBR(parseLocalDate(draft.customStart))} — {formatDateBR(parseLocalDate(draft.customEnd))}
                </p>
              ) : null}
            </div>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-label="Atualizando" /> : null}
          </div>

          <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border/80 bg-background/45 px-3">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">Unidade</p>
              <div className="truncate text-sm font-medium text-foreground">{companySelector ?? unitName ?? 'Unidade atual'}</div>
              {localUnitOverride ? <p className="text-[11px] text-muted-foreground">Somente nesta apresentação</p> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/80 bg-background/45 p-1" role="group" aria-label="Modo do período">
            {QUICK_PRESETS.map(preset => {
              const active = draft.kind === preset.value;
              return (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={active}
                  disabled={preset.value === 'all-time' && !availableBounds}
                  onClick={() => selectQuickPreset(preset.value)}
                  className={cn(
                    'h-9 rounded-md px-4 text-xs sm:text-sm',
                    active && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground',
                  )}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-11">
                <Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Mais filtros
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,420px)] space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Filtros avançados</h3>
                <p className="text-xs text-muted-foreground">Histórico disponível: {boundsLabel}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="presentation-granularity" label="Série temporal">
                  <Select
                    value={granularity}
                    onValueChange={(value) => {
                      if (isGranularity(value)) onGranularityChange(value);
                    }}
                  >
                    <SelectTrigger id="presentation-granularity"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Diária</SelectItem>
                      <SelectItem value="month">Mensal</SelectItem>
                      <SelectItem value="year">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="presentation-ranking-limit" label="Itens no ranking">
                  <Select value={String(rankingLimit)} onValueChange={value => onRankingLimitChange(Number(value))}>
                    <SelectTrigger id="presentation-ranking-limit"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[5, 10, 15, 20].map(limit => (
                        <SelectItem key={limit} value={String(limit)}>{limit} itens</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="rounded-lg border border-border/70 p-3">
                <p className="mb-1 text-xs font-semibold text-foreground">Histórico de faturamento e despesas</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Selecione de um a três anos distintos para os históricos mensais de Faturamento e Despesas do DFC.
                </p>
                <PresentationHistoryYearsSelector
                  years={historyYears}
                  onChange={onHistoryYearsChange}
                />
              </div>

              <div className="rounded-lg border border-border/70 p-3">
                <p className="mb-2 text-xs font-semibold text-foreground">Período personalizado</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field id="presentation-custom-start" label="Data inicial">
                    <DateInput
                      id="presentation-custom-start"
                      value={draft.customStart}
                      onValueChange={v => setDraft(current => ({ ...current, customStart: v }))}
                    />
                  </Field>
                  <Field id="presentation-custom-end" label="Data final">
                    <DateInput
                      id="presentation-custom-end"
                      value={draft.customEnd}
                      onValueChange={v => setDraft(current => ({ ...current, customEnd: v }))}
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => {
                    const nextDraft = { ...draft, kind: 'custom' as const };
                    setDraft(nextDraft);
                    applyDraft(nextDraft);
                  }}
                >
                  Aplicar personalizado
                </Button>
              </div>

              <div className="rounded-lg border border-border/70 p-3">
                <p className="mb-2 text-xs font-semibold text-foreground">Acumulado no ano (YTD)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field id="presentation-ytd-year" label="Ano">
                    <Input
                      id="presentation-ytd-year"
                      type="number"
                      min="1"
                      max="9999"
                      value={draft.year}
                      onChange={event => setDraft(current => ({ ...current, year: event.target.value }))}
                    />
                  </Field>
                  <Field id="presentation-through" label="Acumulado até">
                    <DateInput
                      id="presentation-through"
                      value={draft.through}
                      onValueChange={v => setDraft(current => ({ ...current, through: v }))}
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => {
                    const nextDraft = { ...draft, kind: 'year-to-date' as const };
                    setDraft(nextDraft);
                    applyDraft(nextDraft);
                  }}
                >
                  Aplicar acumulado
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {validationError ? <p className="mt-2 text-sm text-destructive" role="alert">{validationError}</p> : null}
    </section>
  );
}
