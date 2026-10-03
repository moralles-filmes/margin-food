import * as React from "react";
import { cn } from "@/lib/utils";
import { isZeroNumericValue } from "@/lib/numericInputDisplay";

/**
 * PercentInput — input for percentage values with % suffix.
 *
 * Accepts both "," and "." as decimal separator.
 * Shows "%" suffix when not focused and value is present.
 * Always uses 2 decimal places on blur for consistency.
 *
 * Usage:
 *   <PercentInput
 *     value={form.taxa}
 *     onValueChange={(raw, parsed) => setForm({...form, taxa: raw})}
 *   />
 */
export interface PercentInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** Current raw string value (controlled) */
  value: string;
  /** Called on every keystroke with the raw string and parsed number */
  onValueChange: (raw: string, parsed: number | null) => void;
  /** Max decimal digits (default 2) */
  maxDecimals?: number;
  /** Allow negative (default false) */
  allowNegative?: boolean;
  showZero?: boolean;
}

function parsePercent(raw: string): number | null {
  if (!raw || raw === "-" || raw === "," || raw === ".") return null;
  const normalised = raw.replace(",", ".");
  const n = parseFloat(normalised);
  return isNaN(n) ? null : n;
}

function filterPercentInput(value: string, allowNegative: boolean, maxDecimals: number): string {
  let result = "";
  let hasDecimal = false;
  let decCount = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "-" && allowNegative && i === 0) {
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

const PercentInput = React.forwardRef<HTMLInputElement, PercentInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      allowNegative = false,
      maxDecimals = 2,
      showZero = false,
      onBlur,
      onFocus,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const lastTypedRef = React.useRef<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = filterPercentInput(e.target.value, allowNegative, maxDecimals);
      lastTypedRef.current = raw;
      onValueChange(raw, parsePercent(raw));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      if (value) {
        const n = parsePercent(value);
        if (n != null) {
          // Always format with fixed decimal places and comma separator
          const fixed = n.toFixed(maxDecimals);
          const display = fixed.replace(".", ",");
          if (display !== value) {
            onValueChange(display, n);
          }
        } else if (value !== "") {
          onValueChange("", null);
        }
      }
      lastTypedRef.current = null;
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    const displayValue = !showZero && isZeroNumericValue(value) && value !== lastTypedRef.current ? "" : value;

    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder ?? "0,00"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            !focused && displayValue ? "pr-8" : "",
            className
          )}
          {...props}
        />
        {!focused && displayValue && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            %
          </span>
        )}
      </div>
    );
  }
);
PercentInput.displayName = "PercentInput";

export { PercentInput, parsePercent };
