import * as React from "react";
import { cn } from "@/lib/utils";
import { normalizeBRLMoneyToNumber, formatNumberToBRL } from "@/lib/money";

/**
 * BRLInput — drop-in replacement for `<Input>` on R$ / decimal fields.
 *
 * Keeps a raw string internally so the user can type "14,90" without
 * the comma being swallowed. Parses to number on blur and calls
 * `onNumericChange` with the result.
 *
 * Usage:
 *   <BRLInput
 *     numericValue={form.valor}
 *     onNumericChange={v => setForm({...form, valor: v})}
 *     showPrefix          // ← shows "R$ " before the value on blur
 *   />
 */
export interface BRLInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** The numeric value from state */
  numericValue: number | null | undefined;
  /** Called with the parsed number (0 if empty/invalid) on blur */
  onNumericChange: (value: number) => void;
  /** If true, show "R$ " prefix when not focused */
  showPrefix?: boolean;
}

const BRLInput = React.forwardRef<HTMLInputElement, BRLInputProps>(
  ({ className, numericValue, onNumericChange, showPrefix, onBlur, onFocus, placeholder, ...props }, ref) => {
    const [raw, setRaw] = React.useState(() =>
      numericValue ? formatNumberToBRL(numericValue) : ""
    );
    const [focused, setFocused] = React.useState(false);

    // Sync from parent when not focused (e.g. form reset)
    React.useEffect(() => {
      if (!focused) {
        setRaw(numericValue ? formatNumberToBRL(numericValue) : "");
      }
    }, [numericValue, focused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setRaw(e.target.value);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      const parsed = normalizeBRLMoneyToNumber(raw);
      const val = parsed ?? 0;
      onNumericChange(val);
      // Format the display — always show formatted value including zero
      setRaw(formatNumberToBRL(val));
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    const displayPrefix = showPrefix && !focused && raw ? "R$" : "";

    return (
      <div className="relative">
        {displayPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            R$
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder ?? "0,00"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            displayPrefix ? "pl-10" : "",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
BRLInput.displayName = "BRLInput";

/**
 * CurrencyInput — same API as DecimalInput (string value) but formats as BRL on blur.
 *
 * Use this for monetary fields where the parent state is string-based.
 * On blur: "5000" → "5.000,00", with optional R$ prefix.
 * On submit: use parseDecimal() or normalizeBRLMoneyToNumber() to get the number.
 *
 * Usage:
 *   <CurrencyInput
 *     value={form.salario}
 *     onValueChange={(raw) => setForm({...form, salario: raw})}
 *     showPrefix         // shows "R$ "
 *   />
 */
export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** Current raw string value (controlled) */
  value: string;
  /** Called with formatted string on change/blur */
  onValueChange: (raw: string, parsed: number | null) => void;
  /** If true, show "R$ " prefix when not focused */
  showPrefix?: boolean;
  /** Max decimal places (default 2) */
  maxDecimals?: number;
}

function filterCurrencyInput(value: string, maxDecimals: number): string {
  let result = "";
  let hasDecimal = false;
  let decCount = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "-" && i === 0) {
      result += ch;
    } else if ((ch === "." || ch === ",") && !hasDecimal && maxDecimals > 0) {
      hasDecimal = true;
      result += ch;
    } else if (ch >= "0" && ch <= "9") {
      if (hasDecimal) {
        if (decCount < maxDecimals) {
          result += ch;
          decCount++;
        }
      } else {
        result += ch;
      }
    }
  }
  return result;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      showPrefix,
      maxDecimals = 2,
      onBlur,
      onFocus,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = filterCurrencyInput(e.target.value, maxDecimals);
      onValueChange(raw, normalizeBRLMoneyToNumber(raw));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      if (value) {
        const n = normalizeBRLMoneyToNumber(value);
        if (n != null) {
          // Format with thousand separators: 5000 → "5.000,00"
          const formatted = formatNumberToBRL(n, maxDecimals);
          if (formatted !== value) {
            onValueChange(formatted, n);
          }
        } else if (value !== "") {
          onValueChange("", null);
        }
      }
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    const displayPrefix = showPrefix && !focused && value;

    return (
      <div className="relative">
        {displayPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            R$
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder ?? "0,00"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            displayPrefix ? "pl-10" : "",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { BRLInput, CurrencyInput };
