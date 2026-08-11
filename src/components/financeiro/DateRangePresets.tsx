import { Button } from '@/components/ui/button';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { formatDateBR, todayBR } from '@/lib/datetime'; // CRÍTICO: @/lib/datetime → yyyy-MM-dd (NÃO @/lib/formatters)
import { parseLocalDate } from '@/lib/dateUtils';

interface DateRangePresetsProps {
  from: string;   // yyyy-MM-dd ou ''
  to: string;     // yyyy-MM-dd ou ''
  onChange: (from: string, to: string) => void;
  className?: string;
  /** Oculta os presets "Últimos 7d/30d/90d" — usar quando o filtro de mês navegavel os substitui. */
  hideLastNDays?: boolean;
}

type Preset = {
  label: string;
  from: () => string;
  to: () => string;
  lastNDays?: boolean;
};

function buildPresets(): Preset[] {
  return [
    {
      label: 'Dia',
      from: () => todayBR(),
      to: () => todayBR(),
    },
    {
      label: 'Esta semana',
      from: () => formatDateBR(startOfWeek(parseLocalDate(todayBR()), { weekStartsOn: 1 })),
      to: () => formatDateBR(endOfWeek(parseLocalDate(todayBR()), { weekStartsOn: 1 })),
    },
    {
      label: 'Este mês',
      from: () => formatDateBR(startOfMonth(parseLocalDate(todayBR()))),
      to: () => formatDateBR(endOfMonth(parseLocalDate(todayBR()))),
    },
    {
      label: 'Últimos 7d',
      from: () => formatDateBR(subDays(parseLocalDate(todayBR()), 7)),
      to: () => todayBR(),
      lastNDays: true,
    },
    {
      label: 'Últimos 30d',
      from: () => formatDateBR(subDays(parseLocalDate(todayBR()), 30)),
      to: () => todayBR(),
      lastNDays: true,
    },
    {
      label: 'Últimos 90d',
      from: () => formatDateBR(subDays(parseLocalDate(todayBR()), 90)),
      to: () => todayBR(),
      lastNDays: true,
    },
  ];
}

export default function DateRangePresets({ from, to, onChange, className, hideLastNDays }: DateRangePresetsProps) {
  const presets = buildPresets().filter(p => !hideLastNDays || !p.lastNDays);

  const activeIndex = presets.findIndex(p => p.from() === from && p.to() === to);
  const isCleared = from === '' && to === '';

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {presets.map((preset, idx) => {
        const isActive = activeIndex === idx;
        return (
          <Button
            key={preset.label}
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className={`text-[11px] h-7 px-2.5 whitespace-nowrap ${
              isActive
                ? 'gradient-salmon text-primary-foreground border-0'
                : 'border-border text-muted-foreground'
            }`}
            onClick={() => onChange(preset.from(), preset.to())}
          >
            {preset.label}
          </Button>
        );
      })}
      <span className="w-px h-4 bg-border mx-0.5" />
      <Button
        size="sm"
        variant="ghost"
        className={`text-[11px] h-7 px-2.5 whitespace-nowrap ${
          isCleared ? 'text-primary font-semibold' : 'text-muted-foreground'
        }`}
        onClick={() => onChange('', '')}
      >
        Limpar
      </Button>
    </div>
  );
}
