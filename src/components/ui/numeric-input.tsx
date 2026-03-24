import * as React from "react";
import { cn } from "@/lib/utils";
import { normalizeBRLMoneyToNumber } from "@/lib/money";

/**
 * NumericInput — drop-in replacement for <Input type="number">
 *
 * Keeps raw string state while the user types, so they can freely
 * delete leading zeros, leave the field empty, type partial decimals
 * like "0," or "12.", etc.
 *
 * On blur the value is normalised and the parsed number is emitted.
 * Handles paste of BRL-formatted values like "R$ 1.900,50".
 */

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** Current raw string value (controlled) */
  value: string;
  /** Called on every keystroke with the raw string */
  onValueChange: (raw: string, parsed: number | null) => void;
  /** If true, allows negative numbers */
  allowNegative?: boolean;
  /** Decimal separator for display — always stores with "." internally */
  decimalSeparator?: "." | ",";
  /** Max decimal digits */
  decimals?: number;
  /** Prefix shown before value (e.g. "R$ ") — visual only */
  prefix?: string;
  /** Suffix shown after value (e.g. " kg") — visual only */
  suffix?: string;
}

/** Parse a raw string to number, handling BRL format */
function parseRaw(raw: string): number | null {
  if (!raw || raw === "-" || raw === "," || raw === ".") return null;
  return normalizeBRLMoneyToNumber(raw);
}

/** Normalise on blur: strip leading zeros, limit decimals, use comma as separator */
function normaliseOnBlur(raw: string, decimals: number, sep: string): string {
  if (!raw || raw === "-") return "";
  const n = normalizeBRLMoneyToNumber(raw);
  if (n == null) return "";
  // Format with the appropriate decimal separator
  const fixed = n.toFixed(decimals);
  const parts = fixed.split(".");
  if (parts.length === 2) {
    const decPart = parts[1];
    // Remove trailing zeros beyond what user typed, but keep at least what they had
    const trimmed = decPart.replace(/0+$/, "");
    if (trimmed.length === 0) return parts[0];
    return `${parts[0]}${sep}${decPart}`;
  }
  return parts[0];
}

/** Filter keystroke to only allow valid numeric characters */
function filterInput(
  value: string,
  allowNegative: boolean,
  decimals: number
): string {
  let result = "";
  let hasDecimal = false;
  let decCount = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "-" && allowNegative && i === 0) {
      result += ch;
    } else if ((ch === "." || ch === ",") && !hasDecimal && decimals > 0) {
      hasDecimal = true;
      result += ch;
    } else if (ch >= "0" && ch <= "9") {
      if (hasDecimal) {
        if (decCount < decimals) {
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

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      allowNegative = false,
      decimalSeparator = ",",
      decimals = 2,
      prefix,
      suffix,
      onBlur,
      onFocus,
      onPaste,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = filterInput(e.target.value, allowNegative, decimals);
      onValueChange(raw, parseRaw(raw));
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      // If pasting BRL-formatted value, normalize it
      if (pasted && /[R$\s]/.test(pasted) || (pasted.includes(".") && pasted.includes(","))) {
        e.preventDefault();
        const n = normalizeBRLMoneyToNumber(pasted);
        if (n != null) {
          const raw = n.toFixed(decimals).replace(".", decimalSeparator);
          onValueChange(raw, n);
        }
      }
      onPaste?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      const normalised = normaliseOnBlur(value, decimals, decimalSeparator);
      if (normalised !== value) {
        onValueChange(normalised, parseRaw(normalised));
      }
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    const displayValue = value;

    return (
      <div className="relative">
        {prefix && !focused && value && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onPaste={handlePaste}
          placeholder={placeholder ?? "0"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            prefix && !focused && value ? "pl-10" : "",
            className
          )}
          {...props}
        />
        {suffix && !focused && value && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
NumericInput.displayName = "NumericInput";

/**
 * MoneyInput — convenience wrapper with R$ prefix and 2 decimals
 */
export interface MoneyInputProps
  extends Omit<NumericInputProps, "prefix" | "decimals" | "decimalSeparator" | "allowNegative"> {
  allowNegative?: boolean;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ allowNegative = false, ...props }, ref) => (
    <NumericInput
      ref={ref}
      prefix="R$"
      decimals={2}
      decimalSeparator=","
      allowNegative={allowNegative}
      {...props}
    />
  )
);
MoneyInput.displayName = "MoneyInput";

export { NumericInput, MoneyInput };
