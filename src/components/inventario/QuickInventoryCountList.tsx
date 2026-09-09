import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatFixedBR } from '@/lib/formatters';
import { useQuantityNavigation } from '@/hooks/useQuantityNavigation';
import InventoryQuantityInput from './InventoryQuantityInput';

interface CountedItem {
  productId: string;
  nomeProduto: string;
  categoria: string;
  unidadeMedida: string;
  countedQty: string;
  saldoTeorico: number;
}

interface Props {
  items: CountedItem[];
  onChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onComplete: () => void;
  focusProductId?: string | null;
  disabled?: boolean;
}

export default function QuickInventoryCountList({ items, onChange, onRemove, onComplete, focusProductId, disabled }: Props) {
  const { register, focus, next } = useQuantityNavigation();

  useEffect(() => {
    if (focusProductId) focus(focusProductId);
  }, [focusProductId, focus]);

  return (
    <div className="divide-y divide-border">
      {items.map(item => {
        const counted = Number(item.countedQty);
        const valid = item.countedQty !== '' && Number.isFinite(counted) && counted >= 0;
        const difference = valid ? counted - item.saldoTeorico : 0;

        return (
          <div key={item.productId} className="grid min-w-0 grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
            <div className="min-w-0 break-words">
              <p className="text-base font-semibold text-foreground">{item.nomeProduto}</p>
              <div className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                <span>{item.categoria}</span>
                <span>Teórico: {formatFixedBR(item.saldoTeorico, 2)} {item.unidadeMedida}</span>
              </div>
              {difference !== 0 && (
                <Badge className={`mt-1 text-sm ${difference > 0 ? 'bg-success-soft text-success border-success-border' : 'bg-destructive-soft text-destructive border-destructive-border'}`}>
                  {difference > 0 ? '+' : ''}{formatFixedBR(difference, 2)} {item.unidadeMedida}
                </Badge>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm text-muted-foreground">Quantidade ({item.unidadeMedida})</p>
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <InventoryQuantityInput
                    value={item.countedQty} label={`Quantidade de ${item.nomeProduto}`}
                    onValueChange={value => onChange(item.productId, value)}
                    inputRef={input => register(item.productId, input)} disabled={disabled}
                    onNext={() => { if (!next(item.productId, items.map(row => row.productId))) onComplete(); }}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={disabled}
                  aria-label={`Remover ${item.nomeProduto} da contagem`}
                  className="h-12 w-12 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(item.productId)}>
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
