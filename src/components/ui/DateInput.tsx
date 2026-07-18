import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';

/**
 * DateInput — `<input type="date">` blindado contra ano com mais de 4 dígitos.
 *
 * Motivo: o widget nativo de data permite digitar/colar anos de 5+ dígitos
 * (ex.: "20026-07-15"), o que gerava datas absurdas gravadas no banco. Aqui:
 *  - `max`/`min` limitam o campo de ano do seletor nativo a 4 dígitos (1000–9999);
 *  - o guard no onChange só propaga valor vazio OU no padrão ISO `YYYY-MM-DD`
 *    com ano de EXATAMENTE 4 dígitos — bloqueando colar/forçar ano fora do range.
 *
 * O valor continua sendo string ISO `yyyy-MM-dd` (mesmo contrato do input nativo);
 * a exibição em dd/MM/yyyy é responsabilidade das telas (formatDisplayBR).
 * O banco tem CHECK constraints equivalentes como backstop final.
 */
export const MIN_DATE_ISO = '1000-01-01';
export const MAX_DATE_ISO = '9999-12-31';

/** true se vazio ou uma data ISO `YYYY-MM-DD` com ano de 4 dígitos. */
export function isValidYearISO(v: string): boolean {
  return v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
}

interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onValueChange, min, max, ...props }, ref) => (
    <Input
      ref={ref}
      type="date"
      value={value}
      min={min ?? MIN_DATE_ISO}
      max={max ?? MAX_DATE_ISO}
      onChange={(e) => {
        const v = e.target.value;
        // Só aceita vazio ou ano de 4 dígitos — descarta "20026-07-15" e afins.
        if (isValidYearISO(v)) onValueChange(v);
      }}
      {...props}
    />
  ),
);
DateInput.displayName = 'DateInput';
