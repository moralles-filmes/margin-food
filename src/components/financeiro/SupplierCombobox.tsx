import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn, normalizeSearchText } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SupplierOption {
  id: string;
  name: string;
}

interface SupplierComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SupplierOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** If true, the value is a text string (legacy), not a UUID */
  textMode?: boolean;
}

export default function SupplierCombobox({
  value,
  onValueChange,
  options,
  placeholder = 'Pesquisar fornecedor...',
  className,
  disabled,
  textMode,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (textMode) return options.find(o => o.name === value);
    return options.find(o => o.id === value);
  }, [options, value, textMode]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected?.name || value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command filter={(value, search) => { if (!search) return 1; return normalizeSearchText(value).includes(normalizeSearchText(search)) ? 1 : 0; }}>
          <CommandInput placeholder="Buscar fornecedor..." />
          <CommandList>
            <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => {
                const isSelected = textMode ? value === opt.name : value === opt.id;
                return (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => {
                      const newVal = textMode ? opt.name : opt.id;
                      onValueChange(isSelected ? '' : newVal);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    {opt.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
