import { Skeleton } from '@/components/ui/skeleton';
import { FinKpiGrid } from './finV2Layout';

/**
 * Peças de apresentação compartilhadas por Contas a Pagar e Contas a Receber (Redesign V2, Fase 05A).
 * Só JSX com props: nenhuma consulta, estado de dados ou regra.
 */

/** Skeleton da lista, anunciado ao leitor de tela. */
export function ListaCarregando({ estreito, texto }: { estreito: boolean; texto: string }) {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{texto}</span>
      {Array.from({ length: estreito ? 4 : 5 }).map((_, i) => (
        <Skeleton key={i} aria-hidden="true" className={estreito ? 'h-24 w-full rounded-lg' : 'h-11 w-full rounded-md'} />
      ))}
    </div>
  );
}

/** Skeleton dos cards do resumo, com a mesma grade dos cards carregados (a página não salta). */
export function ResumoCarregando({ cards, className }: { cards: number; className: string }) {
  return (
    <FinKpiGrid className={className}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} aria-hidden="true" className="space-y-3 rounded-summary border bg-card p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </FinKpiGrid>
  );
}
