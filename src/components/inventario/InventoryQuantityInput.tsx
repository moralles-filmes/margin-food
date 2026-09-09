import { useId, useRef, useState, type ForwardedRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  label: string;
  onValueChange: (value: string) => void;
  onNext: () => void;
  onSave?: (quantity: number) => Promise<boolean>;
  inputRef?: ForwardedRef<HTMLInputElement>;
  disabled?: boolean;
}

function parseQuantity(value: string) {
  if (!value.trim()) return null;
  const quantity = Number(value.replace(',', '.'));
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

export default function InventoryQuantityInput({ value, label, onValueChange, onNext, onSave, inputRef, disabled }: Props) {
  const errorId = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const pendingSave = useRef<Promise<boolean> | null>(null);
  const advancing = useRef(false);
  const lastSaved = useRef(parseQuantity(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = (): Promise<boolean> => {
    if (pendingSave.current) return pendingSave.current;
    if (disabled) return Promise.resolve(false);
    if (value === '') {
      // Apagar o campo não zera uma contagem já salva.
      if (onSave && lastSaved.current !== null) onValueChange(String(lastSaved.current));
      return Promise.resolve(true);
    }
    const quantity = parseQuantity(value);
    if (quantity === null) {
      setError('Informe uma quantidade válida.');
      return Promise.resolve(false);
    }
    if (!onSave || quantity === lastSaved.current) return Promise.resolve(true);

    setSaving(true);
    setError('');
    pendingSave.current = Promise.resolve().then(async () => {
      try {
        const success = await onSave(quantity);
        if (success) lastSaved.current = quantity;
        else setError('Contagem não salva. Pressione Enter para tentar novamente.');
        return success;
      } catch (cause) {
        console.error('Erro ao salvar contagem:', cause);
        setError('Contagem não salva. Pressione Enter para tentar novamente.');
        return false;
      } finally {
        pendingSave.current = null;
        setSaving(false);
      }
    });
    return pendingSave.current;
  };

  const advance = async () => {
    if (disabled || advancing.current) return;
    advancing.current = true;
    // Captura o foco para não saltar se a pessoa mudar de campo durante o salvamento.
    const focusedInput = input.current;
    try {
      if (await save() && document.activeElement === focusedInput) onNext();
    } finally {
      advancing.current = false;
    }
  };

  return (
    <div className="min-w-0 space-y-1" onBlur={event => {
      if (!advancing.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) void save();
    }}>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          ref={element => {
            input.current = element;
            if (typeof inputRef === 'function') inputRef(element);
            else if (inputRef) inputRef.current = element;
          }}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off"
          value={value} placeholder="0,00" disabled={disabled} readOnly={saving}
          onChange={event => {
            if (/^\d*[.,]?\d*$/.test(event.target.value)) {
              setError('');
              onValueChange(event.target.value.replace(',', '.'));
            }
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void advance();
          }}
          className="h-12 min-w-0 flex-1 bg-secondary text-right text-base md:text-base"
        />
        <Button type="button" variant="outline" size="icon"
          aria-label={`Aumentar ${label.toLocaleLowerCase('pt-BR')} em 1`}
          disabled={disabled || saving || (value !== '' && parseQuantity(value) === null)}
          onPointerDown={event => event.preventDefault()}
          onClick={() => {
            const next = Number(((parseQuantity(value) ?? 0) + 1).toFixed(6));
            if (!Number.isFinite(next)) return;
            setError('');
            onValueChange(String(next));
            input.current?.focus();
          }}
          className="h-12 w-12 shrink-0">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>
      {error && <p id={errorId} role="alert" className="break-words text-sm text-destructive">{error}</p>}
    </div>
  );
}
