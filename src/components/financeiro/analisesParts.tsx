import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MonthNavigator from './MonthNavigator';

/**
 * Peças de apresentação das análises do Financeiro (Redesign V2, Fase 06A). Só JSX com props:
 * nenhuma consulta, estado de dados ou regra.
 */

/** Painel de filtros comum ao DRE e ao DFC: quantidade de meses e mês final, com rótulos visíveis. */
export function DemonstrativoFiltros({ meses, onMesesChange, mes, onMesChange, children }: {
  meses: string;
  onMesesChange: (value: string) => void;
  mes: string;
  onMesChange: (value: string) => void;
  /** Campos extras no mesmo cartão (ex.: centro de custo do DRE/DFC). */
  children?: ReactNode;
}) {
  const mesesId = useId();
  const mesId = useId();
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-summary border bg-card p-4 shadow-card">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={mesesId} className="text-xs text-muted-foreground">Período</Label>
        <Select value={meses} onValueChange={onMesesChange}>
          <SelectTrigger id={mesesId} className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 mês</SelectItem>
            <SelectItem value="3">3 meses</SelectItem>
            <SelectItem value="6">6 meses</SelectItem>
            <SelectItem value="12">12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={mesId} className="text-xs text-muted-foreground">Mês final</Label>
        <MonthNavigator id={mesId} value={mes} onChange={onMesChange} className="max-w-full" />
      </div>
      {children}
    </div>
  );
}
