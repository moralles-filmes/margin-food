import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface RequisitionQuantityRow {
  id: string;
  name: string;
  unit: string | null;
  issue: string | null;
  observation?: string;
}

export interface RequisicaoQuantityListHandle {
  /** Foca a quantidade da primeira linha preenchível; false quando não há nenhuma. */
  focusFirst: () => boolean;
}

interface Props {
  rows: RequisitionQuantityRow[];
  quantities: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onComplete: () => void;
}

const isFillable = (row: RequisitionQuantityRow) => !!row.unit && !row.issue;

const RequisicaoQuantityList = forwardRef<RequisicaoQuantityListHandle, Props>(function RequisicaoQuantityList(
  { rows, quantities, onChange, onComplete },
  ref,
) {
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const focusRow = (id: string) => {
    const input = inputs.current.get(id);
    input?.focus();
    input?.select();
    input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  useImperativeHandle(ref, () => ({
    focusFirst: () => {
      const first = rows.find(isFillable);
      if (!first) return false;
      focusRow(first.id);
      return true;
    },
  }), [rows]);

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.id} className={`grid min-w-0 grid-cols-1 items-center gap-3 rounded-lg p-3 sm:grid-cols-[minmax(0,1fr)_10rem] ${row.issue ? 'border border-warning-border bg-warning-soft' : 'bg-background-subtle'}`}>
          <div className="min-w-0 break-words">
            <p className="text-base font-medium text-foreground">{row.name}</p>
            <p className={`text-sm ${row.issue ? 'text-warning' : 'text-muted-foreground'}`}>{row.issue || row.unit}</p>
            {row.observation && <p className="text-sm text-muted-foreground">{row.observation}</p>}
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`fixed-quantity-${row.id}`} className="text-sm text-muted-foreground">Quantidade{row.unit ? ` (${row.unit})` : ''}</Label>
            <Input id={`fixed-quantity-${row.id}`} aria-label={`Quantidade de ${row.name}`}
              ref={input => { if (input) inputs.current.set(row.id, input); else inputs.current.delete(row.id); }}
              type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off"
              value={quantities[row.id] || ''} placeholder="0" disabled={!!row.issue || !row.unit}
              onChange={event => {
                if (/^\d*[.,]?\d*$/.test(event.target.value)) onChange(row.id, event.target.value.replace(',', '.'));
              }}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                const next = rows.slice(index + 1).find(isFillable);
                if (next) focusRow(next.id);
                else onComplete();
              }}
              className="h-12 w-full min-w-0 text-base md:text-base bg-background border-border text-foreground"
            />
          </div>
        </div>
      ))}
    </div>
  );
});

export default RequisicaoQuantityList;
