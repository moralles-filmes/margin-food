import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn, normalizeSearchText } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getCategoryCommandValue } from '@/lib/categoriaOptions';

interface CategoryOption {
  id: string;
  nome: string;
  tipo?: string;
  codigo?: string;
  groupLabel?: string;
}

interface CategoryComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: CategoryOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Set to true when combobox is used inside a Dialog/Sheet */
  modal?: boolean;
}

export default function CategoryCombobox({
  value,
  onValueChange,
  options,
  placeholder = 'Pesquisar categoria...',
  className,
  disabled,
  modal = true,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find(o => o.id === value), [options, value]);

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, CategoryOption[]>();
    for (const opt of options) {
      const key = opt.groupLabel || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(opt);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal h-8 text-xs', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected ? (selected.codigo ? `${selected.codigo} — ${selected.nome}` : selected.nome) : placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] max-w-[92vw] p-0" align="start">
        <Command filter={(value, search) => { if (!search) return 1; return normalizeSearchText(value).includes(normalizeSearchText(search)) ? 1 : 0; }}>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            {groupedOptions.map(([groupLabel, opts]) => (
              <CommandGroup key={groupLabel || '__root__'} heading={groupLabel || undefined}>
                {opts.map(opt => (
                  <CommandItem
                    key={opt.id}
                    value={getCategoryCommandValue(opt)}
                    className="items-start"
                    onSelect={() => {
                      onValueChange(opt.id === value ? '' : opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 mt-0.5 h-3 w-3 shrink-0', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="break-words text-xs">
                      {opt.codigo ? `${opt.codigo} — ${opt.nome}` : opt.nome}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
