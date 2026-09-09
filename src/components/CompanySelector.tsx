import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { AccessibleCompany } from '@/lib/companySelection';

export function CompanySelector({ companies, value, onChange, compact = false, label = 'Unidade' }: {
  companies: readonly AccessibleCompany[]; value: string; onChange: (companyId: string) => void; compact?: boolean; label?: string;
}) {
  const current = companies.find(company => company.id === value);
  if (companies.length < 2) return compact ? null : <span className="truncate text-xs">{current?.nome ?? 'Unidade'}</span>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={`${label}: ${current?.nome ?? 'Selecionar'}`} title={current?.nome}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {compact ? <Building2 className="h-5 w-5" /> : <span className="truncate">{current?.nome}</span>}
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
