import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { grupoLabel } from '@/domain/financeiro/categoriaGrupo';
import type { PresentationExpenseOutsideGroups } from '@/domain/financeiro/presentation';
import { fmtBRL } from '@/lib/formatters';

const MAX_CATEGORIES = 5;

function reason(item: PresentationExpenseOutsideGroups['categories'][number]): string {
  if (item.categoryId === null) return 'sem categoria';
  if (item.group === null) return 'sem grupo';
  return `${grupoLabel(item.group)} — sem detalhamento`;
}

/**
 * Aviso da despesa que nenhum detalhamento por grupo mostra. Sem ele, categoria
 * sem grupo some do CMV/Pessoal/Operações sem ninguém perceber (R$ 111 mil de
 * CMV do Ren Sushi ficaram fora assim).
 */
export default function PresentationUngroupedExpenseNotice({
  outside,
}: {
  outside: PresentationExpenseOutsideGroups;
}) {
  if (outside.amount === 0) return null;

  const shown = outside.categories.slice(0, MAX_CATEGORIES);
  const hidden = outside.categories.length - shown.length;

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{fmtBRL(outside.amount)} de despesa fora dos detalhamentos</AlertTitle>
      <AlertDescription className="space-y-2 text-foreground">
        <p className="text-xs text-muted-foreground">
          Estas categorias não têm grupo, ou têm um grupo que nenhum detalhamento usa. O valor continua no resultado operacional.
          Ajuste o grupo em Financeiro → Cadastro Base.
        </p>
        <ul className="space-y-1 text-xs">
          {shown.map(item => (
            <li key={item.categoryId ?? item.path.join('›')} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 break-words">
                {item.path.join(' › ')} <span className="text-muted-foreground">({reason(item)})</span>
              </span>
              <span className="whitespace-nowrap font-mono">{fmtBRL(item.amount)}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <p className="text-xs text-muted-foreground">+{hidden} {hidden === 1 ? 'outra categoria' : 'outras categorias'}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
