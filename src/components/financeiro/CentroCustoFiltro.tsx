import SearchableSelect from '@/components/ui/SearchableSelect';
import {
  mostrarFiltroCentroCusto,
  opcoesCentroCusto,
  type CentroCustoResumo,
  type NomesCentroCusto,
} from '@/domain/financeiro/centroCusto';

/**
 * Campo "Centro de custo" dos filtros do demonstrativo. Não renderiza nada quando o período não tem
 * valor com centro de custo e nenhum recorte foi escolhido — a tela fica como sem o recurso.
 */
export default function CentroCustoFiltro({ centros, value, onChange, nomes }: {
  centros: CentroCustoResumo[];
  value: string;
  onChange: (value: string) => void;
  nomes: NomesCentroCusto;
}) {
  if (!mostrarFiltroCentroCusto(centros, value)) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Centro de custo</span>
      <SearchableSelect
        value={value}
        onValueChange={onChange}
        options={opcoesCentroCusto(centros, value, nomes)}
        ariaLabel="Centro de custo"
        searchPlaceholder="Buscar centro de custo..."
        emptyMessage="Nenhum centro de custo encontrado."
        allowClear={false}
        className="h-9 w-60 max-w-full"
      />
    </div>
  );
}
