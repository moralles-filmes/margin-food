import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, ChevronDown } from 'lucide-react';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { formatDisplayBR, formatInBR, todayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

export type PeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

interface PeriodFilterProps {
  onChange: (range: PeriodRange) => void;
  current: PeriodRange;
}

function getRange(type: PeriodType, customStart?: Date, customEnd?: Date): PeriodRange {
  const now = parseLocalDate(todayBR());
  switch (type) {
    case 'day':
      return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }), label: 'Esta Semana' };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now), label: formatInBR(now, 'MMMM yyyy') };
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now), label: String(now.getFullYear()) };
    case 'custom':
      return { 
        start: customStart || startOfMonth(now), 
        end: customEnd || endOfDay(now), 
        label: `${formatDisplayBR(customStart || now)} - ${formatDisplayBR(customEnd || now)}` 
      };
  }
}

export function getDefaultRange(): PeriodRange {
  return getRange('month');
}



export function filterByPeriod<T extends { date: string }>(items: T[], range: PeriodRange): T[] {
  return items.filter(item => {
    const d = parseLocalDate(item.date);
    return d >= range.start && d <= range.end;
  });
}

export default function PeriodFilter({ onChange, current }: PeriodFilterProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const periods: { type: PeriodType; label: string }[] = [
    { type: 'day', label: 'Dia' },
    { type: 'week', label: 'Semana' },
    { type: 'month', label: 'Mês' },
    { type: 'year', label: 'Ano' },
    { type: 'custom', label: 'Período' },
  ];

  const handleSelect = (type: PeriodType) => {
    if (type === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    onChange(getRange(type));
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onChange(getRange('custom', new Date(customStart + 'T00:00:00'), new Date(customEnd + 'T23:59:59')));
      setShowCustom(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {periods.map(p => (
          <Button
            key={p.type}
            size="sm"
            variant={current.label === getRange(p.type).label || (p.type === 'custom' && showCustom) ? 'default' : 'outline'}
            className={`text-[11px] h-7 px-2.5 whitespace-nowrap ${
              current.label === getRange(p.type).label || (p.type === 'custom' && showCustom) 
                ? 'gradient-salmon text-primary-foreground border-0' 
                : 'border-border text-muted-foreground'
            }`}
            onClick={() => handleSelect(p.type)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      
      {showCustom && (
        <div className="flex items-center gap-2 animate-scale-in">
          <Input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="h-8 text-xs bg-secondary border-border text-foreground"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="h-8 text-xs bg-secondary border-border text-foreground"
          />
          <Button size="sm" className="h-8 text-xs gradient-salmon text-primary-foreground border-0" onClick={handleCustomApply}>OK</Button>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Calendar className="w-3 h-3" />
        <span>{formatDisplayBR(current.start)} a {formatDisplayBR(current.end)}</span>
      </div>
    </div>
  );
}
