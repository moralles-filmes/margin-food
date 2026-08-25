import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DecimalInput — for quantities, percentages, measurements.
 *
 * Accepts both "," and "." as decimal separator.
 * Does NOT accept currency symbols or thousand separators.
 * Normalises "," → "." internally.
 */

export interface DecimalInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: string;
  onValueChange: (raw: string, parsed: number | null) => void;
  maxDecimals?: number;
  allowNegative?: boolean;
  suffix?: string;
}

function parseDecimal(raw: string): number | null {
  if (!raw || raw === "-" || raw === "," || raw === ".") return null;
  const normalised = raw.replace(",", ".");
  const n = parseFloat(normalised);
  return isNaN(n) ? null : n;
}

function filterDecimalInput(value: string, allowNegative: boolean, maxDecimals: number): string {
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

const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      allowNegative = false,
      maxDecimals = 2,
      suffix,
      onBlur,
      onFocus,
      placeholder,
      ...props
    },
    ref
  ) => {
    const [raw, setRaw] = React.useState(value);
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) setRaw(value);
    }, [value, focused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextRaw = filterDecimalInput(e.target.value, allowNegative, maxDecimals);
      setRaw(nextRaw);
      onValueChange(nextRaw, parseDecimal(nextRaw));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      if (raw) {
        const n = parseDecimal(raw);
        if (n != null) {
          // Normalise: remove trailing zeros, use comma as display separator
          const fixed = n.toFixed(maxDecimals);
          const trimmed = fixed.replace(/\.?0+$/, "");
          const display = trimmed.replace(".", ",");
          setRaw(display);
          onValueChange(display, n);
        } else {
          setRaw("");
          onValueChange("", null);
        }
      } else if (value !== "") {
        onValueChange("", null);
      }
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    return (
      <div className="relative">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder ?? "0"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className
          )}
          {...props}
        />
        {suffix && !focused && raw && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
DecimalInput.displayName = "DecimalInput";

export { DecimalInput, parseDecimal };
