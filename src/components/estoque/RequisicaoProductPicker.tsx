import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { includesNormalized } from '@/lib/utils';
import { toRequisitionDisplayProduct } from '@/domain/estoque/requisition';
import type { ProdutoExtended } from '@/types/estoque';

export interface ManualRequisitionItem {
  produtoId: string;
  quantidade: number;
  unidade: string;
}

export type RequisitionPickerProduct = Pick<ProdutoExtended, 'id' | 'ativo' | 'nomeProduto' | 'sku' | 'unidadeCompra' | 'unidadeMedida'>;

interface Props {
  produtos: RequisitionPickerProduct[];
  onAdd: (item: ManualRequisitionItem) => void;
}

export default function RequisicaoProductPicker({ produtos, onAdd }: Props) {
  const searchId = useId();
  const quantityId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const products = useMemo(() => produtos.filter(product => product.ativo).map(product => ({
    product,
    display: toRequisitionDisplayProduct(product),
  })), [produtos]);
  const hasSearch = search.trim().length > 0;
  const results = products.filter(({ product }) =>
    includesNormalized(product.nomeProduto, search.trim()) || includesNormalized(product.sku || '', search.trim()),
  );
  const selected = products.find(({ product }) => product.id === productId);
  const parsedQuantity = Number(quantity.replace(',', '.'));
  const canAdd = !!selected?.display.hasValidPurchaseUnit && Number.isFinite(parsedQuantity) && parsedQuantity > 0;

  useEffect(() => {
    if (productId) quantityRef.current?.focus();
  }, [productId]);

  const selectProduct = (id: string) => {
    setProductId(id);
    setQuantity('');
  };

  const addItem = () => {
    if (!canAdd || !selected?.display.displayUnitForRequisition) return;
    onAdd({ produtoId: productId, quantidade: parsedQuantity, unidade: selected.display.displayUnitForRequisition });
    // Após adicionar, mantenha o teclado na quantidade do próximo resultado válido.
    const currentIndex = results.findIndex(({ product }) => product.id === productId);
    const next = hasSearch ? results.slice(currentIndex + 1).find(({ display }) => display.hasValidPurchaseUnit) : undefined;
    setProductId(next?.product.id || '');
    setQuantity('');
    if (!next) searchRef.current?.focus();
  };

  return (
    <div className="min-w-0 space-y-3">
      <Label htmlFor={searchId} className="text-sm text-muted-foreground">Adicionar produto</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          ref={searchRef}
          value={search}
          onChange={event => { setSearch(event.target.value); selectProduct(''); }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              const first = results.find(({ display }) => display.hasValidPurchaseUnit);
              if (hasSearch && first) selectProduct(first.product.id);
            }
          }}
          placeholder="Nome ou SKU"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 pl-10 pr-12 text-base md:text-base bg-secondary border-border"
        />
        {search && (
          <Button type="button" variant="ghost" size="icon" aria-label="Limpar busca de produtos"
            className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2"
            onClick={() => { setSearch(''); selectProduct(''); searchRef.current?.focus(); }}>
            <X />
          </Button>
        )}
      </div>

      {hasSearch ? (
        <div className="space-y-2">
          <p role="status" className="text-sm text-muted-foreground">{results.length} produto(s) encontrado(s)</p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1" aria-label="Resultados da busca">
            {results.length === 0 && <p className="p-3 text-base text-muted-foreground">Nenhum produto encontrado.</p>}
            {results.map(({ product, display }) => (
              <button key={product.id} type="button" disabled={!display.hasValidPurchaseUnit}
                aria-pressed={productId === product.id}
                onClick={() => selectProduct(product.id)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-md p-3 text-left disabled:opacity-50 ${productId === product.id ? 'bg-primary-soft' : 'hover:bg-surface-hover'}`}>
                <div className="min-w-0 flex-1 break-words">
                  <p className="text-base font-medium text-foreground">{product.nomeProduto}</p>
                  <p className="text-sm text-muted-foreground">{display.displayUnitForRequisition || display.issueMessage}</p>
                </div>
                {productId === product.id && <Check className="h-5 w-5 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <SearchableSelect value={productId} onValueChange={selectProduct} allowClear={false}
          options={products.filter(({ display }) => display.hasValidPurchaseUnit).map(({ product, display }) => ({
            value: product.id, label: `${product.nomeProduto} • ${display.displayUnitForRequisition}`,
          }))}
          placeholder="Produtos" ariaLabel="Produtos" searchPlaceholder="Buscar por nome"
          className="h-auto min-h-12 min-w-0 whitespace-normal text-base [&>span]:whitespace-normal [&>span]:text-left [&>span]:break-words [&>span]:overflow-visible"
        />
      )}

      {selected && hasSearch && <p className="break-words text-base font-medium text-foreground">{selected.product.nomeProduto} • {selected.display.displayUnitForRequisition}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-32 space-y-1">
          <Label htmlFor={quantityId} className="text-sm text-muted-foreground">Quantidade desejada</Label>
          <Input id={quantityId} ref={quantityRef} type="text" inputMode="decimal" enterKeyHint="next"
            autoComplete="off" placeholder="0" value={quantity}
            onChange={event => {
              if (/^\d*[.,]?\d*$/.test(event.target.value)) setQuantity(event.target.value);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addItem(); }
            }}
            disabled={!selected?.display.hasValidPurchaseUnit}
            className="h-12 text-base md:text-base bg-secondary border-border"
          />
        </div>
        <Button type="button" aria-label="Adicionar produto à requisição" title="Adicionar produto à requisição"
          onClick={addItem} disabled={!canAdd} className="h-12 w-12 shrink-0 p-0"><Plus className="!h-6 !w-6" /></Button>
      </div>
      <p className="text-sm text-muted-foreground">Use + ou Enter/OK para adicionar e seguir para o próximo produto.</p>
    </div>
  );
}
