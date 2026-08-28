import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % options.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + options.length) % options.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = options.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      onChange(options[nextIndex].value);
      buttonRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      className={cn('inline-flex items-center gap-0.5 rounded-lg bg-muted p-1', className)}
    >
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            ref={el => { buttonRefs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-center transition-colors',
              isActive
                ? 'bg-primary-strong text-primary-strong-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
