import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { normalizePresentationHistoryYears } from '@/domain/financeiro/presentation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PresentationHistoryYearsSelectorProps {
  years: readonly number[];
  onChange: (years: readonly number[]) => void;
}

export default function PresentationHistoryYearsSelector({
  years,
  onChange,
}: PresentationHistoryYearsSelectorProps) {
  const [draftYear, setDraftYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const atLimit = years.length >= 3;

  const addYear = () => {
    try {
      const year = Number(draftYear);
      const normalized = normalizePresentationHistoryYears([...years, year]);
      setError(null);
      setDraftYear('');
      onChange(normalized);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ano inválido.');
    }
  };

  const removeYear = (year: number) => {
    if (years.length <= 1) return;
    setError(null);
    onChange(normalizePresentationHistoryYears(years.filter(selected => selected !== year)));
  };

  return (
    <div className="space-y-3" aria-describedby="presentation-history-years-help">
      <div className="flex flex-wrap gap-2" role="list" aria-label="Anos selecionados para o histórico">
        {years.map(year => (
          <span
            key={year}
            role="listitem"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-primary/35 bg-primary/10 pl-3 pr-1 text-sm font-semibold text-primary"
          >
            {year}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary"
              disabled={years.length === 1}
              onClick={() => removeYear(year)}
              aria-label={`Remover ${year} do histórico`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          max="9999"
          value={draftYear}
          disabled={atLimit}
          onChange={event => setDraftYear(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addYear();
            }
          }}
          aria-label="Ano para adicionar ao histórico"
          aria-invalid={Boolean(error)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addYear}
          disabled={atLimit || draftYear.length === 0}
          aria-label="Adicionar ano ao histórico"
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Adicionar
        </Button>
      </div>
      <p id="presentation-history-years-help" className="text-xs text-muted-foreground" aria-live="polite">
        {atLimit ? 'Limite de 3 anos atingido. Remova um ano para escolher outro.' : `${years.length} de 3 anos selecionados.`}
      </p>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
