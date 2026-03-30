import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn, normalizeSearchText } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import QuickSupplierDialog from '@/components/compras/QuickSupplierDialog';

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
  enableQuickAdd?: boolean;
  /** Set to true when combobox is used inside a Dialog/Sheet */
  modal?: boolean;
}

export default function SupplierCombobox({
  value,
  onValueChange,
  options,
  placeholder = 'Pesquisar fornecedor...',
  className,
  disabled,
  textMode,
  enableQuickAdd = true,
  modal = true,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [tempNewSupplier, setTempNewSupplier] = useState<{ id: string, name: string } | null>(null);

  const selected = useMemo(() => {
    if (textMode) return options.find(o => o.name === value);
    const found = options.find(o => o.id === value);
    if (!found && tempNewSupplier && tempNewSupplier.id === value) return tempNewSupplier;
    return found;
  }, [options, value, textMode, tempNewSupplier]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
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
            <CommandInput 
              placeholder="Buscar fornecedor..." 
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty className="py-2 px-4">
                <p className="text-xs text-muted-foreground mb-2">Nenhum fornecedor encontrado.</p>
                {enableQuickAdd && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full text-xs gap-1 h-8"
                    onClick={() => {
                      setOpen(false);
                      setShowQuickAdd(true);
                    }}
                  >
                    <Plus className="w-3 h-3" /> Cadastrar "{search}"
                  </Button>
                )}
              </CommandEmpty>
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
                        setSearch('');
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                      {opt.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              
              {enableQuickAdd && options.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                        setShowQuickAdd(true);
                      }}
                      className="text-primary font-medium"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Fornecedor
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <QuickSupplierDialog 
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        defaultName={search}
        onSuccess={(name, id) => {
          setTempNewSupplier({ id, name });
          onValueChange(textMode ? name : id);
          setSearch('');
        }}
      />
    </>
  );
}
