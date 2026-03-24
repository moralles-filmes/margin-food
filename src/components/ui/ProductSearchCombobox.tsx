/**
 * ─── ProductSearchCombobox ───
 * Reusable searchable combobox for product/item selection.
 * Features: search icon, debounced filtering, keyboard navigation,
 * empty state, clear action, tenant-scoped data.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, X, Check, ChevronsUpDown, Package } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn, normalizeSearchText } from '@/lib/utils';

export interface ProductOption {
  id: string;
  label: string;
  /** Secondary text (SKU, unit, cost) */
  sublabel?: string;
  /** Search keywords beyond label */
  keywords?: string;
}

interface ProductSearchComboboxProps {
  options: ProductOption[];
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** Show clear button when a value is selected */
  allowClear?: boolean;
}

export default function ProductSearchCombobox({
  options,
  value,
  onSelect,
  placeholder = 'Selecionar produto…',
  searchPlaceholder = 'Buscar por nome ou SKU…',
  emptyMessage = 'Nenhum produto encontrado.',
  disabled = false,
  className,
  allowClear = true,
}: ProductSearchComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find(o => o.id === value),
    [options, value],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (id === '__clear__') {
        onSelect('');
      } else {
        onSelect(id);
      }
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-9 text-xs',
            className,
          )}
        >
          {selectedOption ? (
            <span className="flex items-center gap-1.5 truncate">
              <Package className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedOption.label}</span>
              {selectedOption.sublabel && (
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {selectedOption.sublabel}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3 h-3 shrink-0" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command filter={(value, search) => {
            if (!search) return 1;
            return normalizeSearchText(value).includes(normalizeSearchText(search)) ? 1 : 0;
          }}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-xs"
          />
          <CommandList>
            <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            {allowClear && value && (
              <CommandItem
                value="__clear__"
                onSelect={() => handleSelect('__clear__')}
                className="text-xs text-destructive gap-1.5"
              >
                <X className="w-3 h-3" /> Limpar seleção
              </CommandItem>
            )}
            {options.map(opt => (
              <CommandItem
                key={opt.id}
                value={
                  opt.label +
                  (opt.sublabel ? ' ' + opt.sublabel : '') +
                  (opt.keywords ? ' ' + opt.keywords : '')
                }
                onSelect={() => handleSelect(opt.id)}
                className="text-xs gap-1.5"
              >
                <Check
                  className={cn(
                    'w-3 h-3',
                    value === opt.id ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span className="text-[9px] text-muted-foreground">
                      {opt.sublabel}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
