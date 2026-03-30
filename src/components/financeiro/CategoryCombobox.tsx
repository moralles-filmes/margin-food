import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn, normalizeSearchText } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CategoryOption {
  id: string;
  nome: string;
  tipo?: string;
  codigo?: string;
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
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command filter={(value, search) => { if (!search) return 1; return normalizeSearchText(value).includes(normalizeSearchText(search)) ? 1 : 0; }}>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.id}
                  value={opt.codigo ? `${opt.codigo} ${opt.nome}` : opt.nome}
                  onSelect={() => {
                    onValueChange(opt.id === value ? '' : opt.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-3 w-3', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate text-xs">
                    {opt.codigo ? `${opt.codigo} — ${opt.nome}` : opt.nome}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
