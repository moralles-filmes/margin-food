import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, normalizeSearchText } from '@/lib/utils';
import type { AccessibleCompany } from '@/lib/companySelection';

/**
 * `inline`: texto com chevron (Apresentação Sócios e uso legado).
 * `card`: cartão da loja no alto da sidebar expandida.
 * `compact`: ícone da loja na sidebar recolhida.
 */
export type CompanySelectorAppearance = 'inline' | 'card' | 'compact';

/** A partir deste número de unidades autorizadas o menu ganha busca local. */
export const COMPANY_SEARCH_THRESHOLD = 8;

// Estado neutro, não um dado do modelo: AccessibleCompany só tem id e nome (D06).
const ACTIVE_LABEL = 'Unidade ativa';

interface CompanySelectorProps {
  companies: readonly AccessibleCompany[];
  value: string;
  onChange: (companyId: string) => void;
  appearance?: CompanySelectorAppearance;
  label?: string;
  /** Só no cartão: esconde o ícone quando a sidebar está estreita, para o nome caber. */
  showIcon?: boolean;
}

export function CompanySelector({ appearance = 'inline', ...props }: CompanySelectorProps) {
  if (appearance === 'inline') return <InlineCompanySelector {...props} />;
  return <SidebarCompanySelector {...props} compact={appearance === 'compact'} />;
}

function InlineCompanySelector({ companies, value, onChange, label = 'Unidade' }: Omit<CompanySelectorProps, 'appearance'>) {
  const current = companies.find(company => company.id === value);
  if (companies.length < 2) return <span className="truncate text-xs">{current?.nome ?? 'Unidade'}</span>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={`${label}: ${current?.nome ?? 'Selecionar'}`} title={current?.nome}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="truncate">{current?.nome}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
      {companies.map(company => <DropdownMenuItem key={company.id} onSelect={() => onChange(company.id)}>
        <Check className={`mr-2 h-4 w-4 ${company.id === value ? 'visible' : 'invisible'}`} /><span>{company.nome}</span>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

const cardSurface = 'border border-sidebar-card-border bg-sidebar-card';
// Ícone direto no cartão, sem moldura, como no recorte aprovado.
const cardIcon = 'h-5 w-5 shrink-0 text-sidebar-foreground';

function SidebarCompanySelector({ companies, value, onChange, label = 'Trocar unidade', compact, showIcon = true }: Omit<CompanySelectorProps, 'appearance'> & { compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(value);
  const listRef = useRef<HTMLDivElement>(null);
  // Uma troca já pedida e ainda não refletida em `value` bloqueia cliques repetidos.
  // Zera também quando a lista muda: se a troca foi recusada sem mudar `value`, o seletor não fica travado.
  const pending = useRef<string | null>(null);
  useEffect(() => { pending.current = null; }, [value, companies]);

  const current = companies.find(company => company.id === value);
  const name = current?.nome ?? 'Unidade';
  const searchable = companies.length >= COMPANY_SEARCH_THRESHOLD;

  if (companies.length < 2) {
    // Uma só unidade: bloco informativo, sem menu de troca.
    if (compact) return <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={`Unidade: ${name}`} className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-primary-ink', cardSurface)}>
          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>;
    return <div title={name} className={cn('flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5', cardSurface)}>
      {showIcon && <Building2 aria-hidden="true" className={cardIcon} />}
      <span className="min-w-0 flex-1">
        <span className="sr-only">Unidade: </span>
        <span className="block line-clamp-2 break-words text-[13.5px] font-semibold leading-tight text-sidebar-hover-foreground">{name}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{ACTIVE_LABEL}</span>
      </span>
    </div>;
  }

  const select = (companyId: string) => {
    setOpen(false);
    if (companyId === value || pending.current) return;
    pending.current = companyId;
    onChange(companyId);
  };

  const trigger = compact
    ? <button type="button" aria-label={`${label}: ${name}`}
        className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-primary-ink transition-colors hover:bg-sidebar-card-hover', cardSurface)}>
        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    : <button type="button" title={name} aria-label={`${label}: ${name}`}
        className={cn('group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-card-hover', cardSurface)}>
        {showIcon && <Building2 aria-hidden="true" className={cardIcon} />}
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 break-words text-[13.5px] font-semibold leading-tight text-sidebar-hover-foreground">{name}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{ACTIVE_LABEL}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </button>;

  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setHighlighted(value); }}>
    {compact
      ? <Tooltip>
          <TooltipTrigger asChild><PopoverTrigger asChild>{trigger}</PopoverTrigger></TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
    <PopoverContent
      align="start"
      side={compact ? 'right' : 'bottom'}
      sideOffset={6}
      collisionPadding={12}
      className="w-[--radix-popover-trigger-width] min-w-[15rem] max-w-[calc(100vw-1.5rem)] rounded-xl p-0"
      onOpenAutoFocus={event => {
        // Sem campo de busca o foco vai para a lista, que responde às setas e ao Enter.
        if (searchable) return;
        event.preventDefault();
        listRef.current?.focus();
      }}
    >
      <Command
        loop
        // O cmdk nomeia o campo de busca por um <label> próprio; aria-label no campo é ignorado.
        label="Buscar unidade"
        value={highlighted}
        onValueChange={setHighlighted}
        filter={(_value, search, keywords) => {
          if (!search) return 1;
          return normalizeSearchText((keywords ?? []).join(' ')).includes(normalizeSearchText(search)) ? 1 : 0;
        }}
        className="rounded-xl"
      >
        {searchable && <CommandInput placeholder="Buscar unidade" />}
        <CommandList ref={listRef} label="Unidades autorizadas" className="max-h-72 p-1 focus-visible:outline-none">
          <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
          {companies.map(company => {
            const isCurrent = company.id === value;
            return <CommandItem key={company.id} value={company.id} keywords={[company.nome]} onSelect={() => select(company.id)}
              className="cursor-pointer gap-3 rounded-lg px-2 py-2">
              <Building2 aria-hidden="true" className={cn('h-4 w-4 shrink-0', isCurrent ? 'text-primary-ink' : 'text-muted-foreground')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block break-words leading-tight', isCurrent ? 'font-semibold text-primary-ink' : 'font-medium text-foreground')}>{company.nome}</span>
                {isCurrent && <span className="mt-0.5 block text-xs text-muted-foreground">{ACTIVE_LABEL}</span>}
              </span>
              <Check aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-primary-ink', isCurrent ? 'visible' : 'invisible')} />
            </CommandItem>;
          })}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
