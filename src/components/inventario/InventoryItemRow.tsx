import { useEffect, useState } from 'react';
import type { InventarioItem } from '@/hooks/useInventarioStore';
import { Badge } from '@/components/ui/badge';
import { TableRow, TableCell } from '@/components/ui/table';
import StatusBadge from '@/components/ui/StatusBadge';
import InventoryQuantityInput from './InventoryQuantityInput';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { decomposeStockLayers, formatStockLayers } from '@/lib/unitConversions';

export default function InventoryItemRow({ item, canCount, onSave, onNext, inputRef, classColor }: {
  item: InventarioItem;
  canCount: boolean;
  onSave: (val: number) => Promise<boolean>;
  onNext: () => void;
  inputRef: (input: HTMLInputElement | null) => void;
  classColor: (c: string) => string;
}) {
  const unidade = item.produtos?.unidade_medida ?? 'UN';
  const unidadeCompra = item.produtos?.unidade_compra || unidade;
  const fator = item.produtos?.fator_conversao_padrao || 1;
  const hasDual = unidadeCompra.toUpperCase() !== unidade.toUpperCase() && fator !== 1;

  // Convert base-unit values to purchase units for display (same as EstoqueGeralView)
  const teoricoBase = Number(item.saldo_teorico);
  const teoricoLayers = decomposeStockLayers(teoricoBase, fator, unidadeCompra, unidade);

  // contagem_fisica is stored in base units — convert to purchase units for display
  const fisicaBase = item.contagem_fisica !== null ? Number(item.contagem_fisica) : null;
  const fisicaLayers = fisicaBase !== null ? decomposeStockLayers(fisicaBase, fator, unidadeCompra, unidade) : null;

  // Input state in purchase units (user types in purchase unit, we convert on save)
  const toDisplayVal = (baseVal: number | null) => {
    if (baseVal === null) return '';
    if (!hasDual) return String(baseVal);
    return String(parseFloat((baseVal / fator).toFixed(4)));
  };

  const [value, setValue] = useState(toDisplayVal(item.contagem_fisica));
  useEffect(() => {
    setValue(item.contagem_fisica === null ? '' : String(hasDual
      ? Number((Number(item.contagem_fisica) / fator).toFixed(4))
      : item.contagem_fisica));
  }, [item.contagem_fisica, hasDual, fator]);

  const nome = item.produtos?.nome_produto || 'Item sem nome';
  // diferenca_qtd is in base units from backend — convert to purchase units for display
  const difPurchase = hasDual ? Number(item.diferenca_qtd) / fator : Number(item.diferenca_qtd);

  return (
    <TableRow className="grid grid-cols-2 gap-3 p-3 md:table-row md:p-0">
      <TableCell className="col-span-2 min-w-0 p-0 md:px-3 md:py-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="break-words text-base text-foreground font-medium">{nome}</span>
            <Badge className="text-xs bg-primary-soft text-primary-ink border-primary-border font-mono px-1 py-0">
              {unidadeCompra}
            </Badge>
          </div>
          {hasDual && (
            <p className="text-sm text-muted-foreground mt-0.5">
              1 {unidadeCompra} = {fator} {unidade}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="min-w-0 p-0 text-muted-foreground md:px-3 md:py-2.5 md:text-right">
        <span className="mb-1 block text-xs md:hidden">Teórico</span>
        {teoricoLayers.hasLayers ? formatStockLayers(teoricoLayers) : `${teoricoBase.toFixed(1)} ${unidade}`}
      </TableCell>
      <TableCell className="col-span-2 row-start-2 min-w-0 p-0 md:px-3 md:py-2.5 md:text-right">
        <span className="mb-1 block text-sm text-muted-foreground md:hidden">Quantidade física ({unidadeCompra})</span>
        {canCount ? (
          <div className="md:min-w-44">
            <InventoryQuantityInput value={value} onValueChange={setValue}
              label={`Quantidade de ${nome}`} inputRef={inputRef} onNext={onNext}
              onSave={quantity => onSave(hasDual ? Number((quantity * fator).toFixed(4)) : quantity)} />
          </div>
        ) : (
          <span>
            {fisicaLayers !== null
              ? (fisicaLayers.hasLayers ? formatStockLayers(fisicaLayers) : `${(fisicaBase!).toFixed(1)}`)
              : '—'}
          </span>
        )}
      </TableCell>
      <TableCell className={`min-w-0 p-0 font-bold md:px-3 md:py-2.5 md:text-right ${difPurchase < 0 ? 'text-destructive' : difPurchase > 0 ? 'text-success' : 'text-muted-foreground'}`}>
        <span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">Diferença</span>
        {item.contagem_fisica !== null ? `${difPurchase >= 0 ? '+' : ''}${parseFloat(difPurchase.toFixed(2))} ${unidadeCompra}` : '—'}
      </TableCell>
      <TableCell className={`min-w-0 p-0 md:px-3 md:py-2.5 md:text-right ${classColor(item.classificacao)}`}>
        <span className="mb-1 block text-xs text-muted-foreground md:hidden">Diferença (%)</span>
        {item.contagem_fisica !== null ? formatPercentBR(Number(item.diferenca_percent)) : '—'}
      </TableCell>
      <TableCell className={`min-w-0 p-0 font-bold md:px-3 md:py-2.5 md:text-right ${Number(item.impacto_financeiro) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
        <span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">Impacto (R$)</span>
        {item.contagem_fisica !== null ? fmtBRL(Number(item.impacto_financeiro)) : '—'}
      </TableCell>
      <TableCell className="col-span-2 min-w-0 p-0 md:px-3 md:py-2.5 md:text-center">
        {item.contagem_fisica !== null && (
          <StatusBadge
            status={item.classificacao === 'CRITICO' ? 'danger' : item.classificacao === 'ALERTA' ? 'warning' : 'success'}
            label={item.classificacao}
            size="xs"
          />
        )}
      </TableCell>
    </TableRow>
  );
}
