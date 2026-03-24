import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Enhanced Input component.
 *
 * When type="number" is passed, it is automatically converted to
 * type="text" + inputMode="decimal" to avoid native browser quirks
 * (leading-zero lock, cursor jumping, scroll-to-change, etc.).
 *
 * A lightweight onBeforeInput filter blocks non-numeric characters
 * while still allowing the user to freely delete, paste, and edit
 * without the field "snapping back" to 0.
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
            if (!NUMERIC_INTERMEDIATE_RE.test(nextValue)) {
              e.preventDefault();
              return;
            }
          }
        }
        // Forward to consumer's handler if provided
        (onBeforeInput as React.FormEventHandler<HTMLInputElement>)?.(e);
      },
      [isNumeric, onBeforeInput],
    );

    return (
      <input
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : inputMode}
        onBeforeInput={handleBeforeInput}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
