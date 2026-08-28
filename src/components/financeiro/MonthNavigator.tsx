import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatInBR } from '@/lib/datetime';

interface MonthNavigatorProps {
  value: string; // yyyy-MM
  onChange: (value: string) => void;
  monthsBack?: number;
  monthsForward?: number;
  className?: string;
}

// Aritmetica pura em inteiros — evita o bug documentado de `new Date('yyyy-MM-01')`
// (interpretado como UTC, recuando o rotulo um mes no fuso BR).
function shiftMonth(value: string, delta: number): string {
  const [y, m] = value.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

// Primeiro/ultimo dia do mes via rollover do construtor Date local — sem conversao
// de fuso (campos sao lidos no mesmo frame em que foram escritos).
export function monthBounds(value: string): { start: string; end: string } {
  const [y, m] = value.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay)}` };
}

function formatMonthLabel(value: string): string {
  const [y, m] = value.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function MonthNavigator({ value, onChange, monthsBack = 12, monthsForward = 3, className }: MonthNavigatorProps) {
  const currentMonth = formatInBR(new Date(), 'yyyy-MM');
  const options = Array.from({ length: monthsBack + monthsForward + 1 }, (_, i) => shiftMonth(currentMonth, monthsForward - i));
  if (!options.includes(value)) options.unshift(value);

  return (
    <div className={`inline-flex items-center rounded-lg border border-border bg-background-subtle ${className ?? ''}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 hover:bg-surface-hover"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[168px] border-0 border-x border-border rounded-none justify-center gap-1.5 bg-transparent shadow-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(m => <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 hover:bg-surface-hover"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
