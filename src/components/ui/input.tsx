import * as React from "react";

import { cn } from "@/lib/utils";
import { isZeroNumericValue, parseLooseNumber, stripLeadingZeros } from "@/lib/numericInputDisplay";

/**
 * Input numérico usa type="text" + inputMode="decimal" para evitar
 * alterações por scroll e interferência do navegador na digitação.
 *
 * Quando controlado, preserva o texto intermediário equivalente ao valor
 * do pai, permite apagar tudo e mostra zero apenas como placeholder.
 * Remove zeros à esquerda antes de emitir onChange; no blur, volta a
 * exibir o valor do pai. Validação e limites ficam com o consumidor.
 *
 * onBeforeInput filtra caracteres, respeitando step inteiro e min não
 * negativo. Outros tipos mantêm o comportamento original.
 */
/**
 * Enterprise regex: allows valid intermediate numeric states only.
 * Accepts: '', '-', '0', '-0', '12', '12,', '12.', '-12,', '12,3', '12.34'
 * Rejects: '--10', '10-', '1-0', '12,,3', '12..3', '1.2.3', '1,2,3'
 */
const NUMERIC_INTERMEDIATE_RE = /^$|^-?$|^-?\d+([.,]\d*)?$/;

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onBeforeInput, inputMode, ...props }, ref) => {
    const isNumeric = type === "number";
    const isControlledNumeric = isNumeric && props.value !== undefined;
    const [draft, setDraft] = React.useState<string | null>(null);
    const { value, step, min } = props;
    const parentNumber = typeof value === "number"
      ? value
      : typeof value === "string" ? parseLooseNumber(value) : NaN;
    const displayValue = draft !== null
      && (!Number.isFinite(parentNumber) || parseLooseNumber(draft) === parentNumber)
      ? draft
      : isZeroNumericValue(value) || value === "" || value == null ? "" : String(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const normalized = stripLeadingZeros(e.currentTarget.value);
      e.currentTarget.value = normalized;
      setDraft(normalized);
      props.onChange?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setDraft(null);
      props.onBlur?.(e);
    };

    const handleBeforeInput = React.useCallback(
      (e: React.FormEvent<HTMLInputElement>) => {
        if (isNumeric) {
          const ev = e as unknown as InputEvent;
          const data = ev.data;
          // Allow control keys (backspace, delete, etc.) — they have null data
          if (data != null) {
            const input = e.currentTarget;
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? start;
            // Compute what the value would be after this insertion
            const nextValue =
              input.value.slice(0, start) + data + input.value.slice(end);
            const numericPattern = /^\d+$/.test(String(step))
              ? /^$|^-?$|^-?\d+$/
              : NUMERIC_INTERMEDIATE_RE;
            const disallowsNegative = min != null && min !== "" && Number(min) >= 0;
            if (!numericPattern.test(nextValue) || (disallowsNegative && nextValue.includes("-"))) {
              e.preventDefault();
              return;
            }
          }
        }
        // Forward to consumer's handler if provided
        (onBeforeInput as React.FormEventHandler<HTMLInputElement>)?.(e);
      },
      [isNumeric, onBeforeInput, step, min],
    );

    return (
      <input
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : inputMode}
        onBeforeInput={handleBeforeInput}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        placeholder={props.placeholder ?? (isNumeric ? "0" : undefined)}
        {...(isControlledNumeric ? { value: displayValue, onChange: handleChange, onBlur: handleBlur } : {})}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
