import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Loader2, ClipboardCheck, Package, CheckCircle, AlertTriangle, Zap, RotateCcw, Trash2 } from 'lucide-react';
import { fmtBRL, formatFixedBR } from '@/lib/formatters';
import { normalizeSearchText } from '@/lib/utils';

import { useCan } from '@/permissions/hooks';
interface CountedItem {
  productId: string;
  nomeProduto: string;
  categoria: string;
  unidadeMedida: string;
  countedQty: string;
  saldoTeorico: number;
}

interface ProductRow {
  id: string;
  nome_produto: string;
  categoria: string;
  unidade_medida: string;
  sku: string;
}

export default function QuickInventorySection() {
  const canViewRbac = useCan('inventario:rapido:view');
  // Product search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Counted items
  const [countedItems, setCountedItems] = useState<CountedItem[]>([]);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveResult, setSaveResult] = useState<{ total_items: number; adjusted: number; total_impact: number } | null>(null);

  // Categories
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('stock_categories').select('name').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (data) setCategories(data.map((c: any) => c.name));
      });
  }, []);

  // Search products server-side
  const searchProducts = useCallback(async (term: string, cat: string) => {
    if (!term.trim() && !cat) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    let query = supabase
      .from('produtos')
      .select('id, nome_produto, categoria, unidade_medida, sku')
      .eq('ativo', true)
      .order('nome_produto')
      .limit(20);

    if (term.trim()) {
      // Busca accent-insensitive via colunas geradas *_unaccent
      const safeTerm = normalizeSearchText(term.trim()).replace(/[%_\\]/g, '\\$&');
      // eslint-disable-next-line no-restricted-syntax -- coluna *_unaccent já normalizada
      query = query.or(`nome_produto_unaccent.ilike.%${safeTerm}%,sku_unaccent.ilike.%${safeTerm}%`);
    }
    if (cat) {
      query = query.eq('categoria', cat);
    }

    const { data } = await query;
    // Filter out already-counted items
    const countedIds = new Set(countedItems.map(c => c.productId));
    setSearchResults((data || []).filter(p => !countedIds.has(p.id)));
    setSearchLoading(false);
  }, [countedItems]);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(value, categoryFilter), 300);
  }, [searchProducts, categoryFilter]);

  const handleCategoryChange = useCallback((value: string) => {
    const cat = value === 'all' ? '' : value;
    setCategoryFilter(cat);
    searchProducts(searchTerm, cat);
  }, [searchProducts, searchTerm]);

  // Add product to count list
  const addToCount = useCallback(async (product: ProductRow) => {
    // Fetch current saldo
    const { data } = await supabase.rpc('get_saldo_produtos', {
      p_produto_ids: [product.id],
    });
    const saldo = data?.[0]?.saldo ?? 0;

    setCountedItems(prev => [...prev, {
      productId: product.id,
      nomeProduto: product.nome_produto,
      categoria: product.categoria,
      unidadeMedida: product.unidade_medida,
      countedQty: '',
      saldoTeorico: Number(saldo),
    }]);
    // Remove from search results
    setSearchResults(prev => prev.filter(p => p.id !== product.id));
  }, []);

  // Update counted quantity
  const updateCount = useCallback((productId: string, qty: string) => {
    setCountedItems(prev => prev.map(item =>
      item.productId === productId ? { ...item, countedQty: qty } : item
    ));
  }, []);

  // Remove from count
  const removeFromCount = useCallback((productId: string) => {
    setCountedItems(prev => prev.filter(item => item.productId !== productId));
  }, []);

  // Valid items (have a counted quantity)
  const validItems = useMemo(() =>
    countedItems.filter(item => item.countedQty !== '' && Number(item.countedQty) >= 0),
  [countedItems]);

  // Save quick inventory
  const handleSave = async () => {
    if (saving) return;
    if (validItems.length === 0) {
      toast.error('Informe a contagem de pelo menos um item');
      return;
    }

    setSaving(true);
    try {
      const items = validItems.map(item => ({
        product_id: item.productId,
        counted_quantity: Number(item.countedQty),
      }));

      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

      const { data, error } = await supabase.rpc('create_quick_inventory_atomic', {
        p_items: items as any,
        p_observacao: `Inventário Rápido — ${validItems.length} itens`,
        p_idempotency_key: idempotencyKeyRef.current,
      });

      if (error) throw error;
      const result = data as any;
      if (result?.success === false) {
        toast.error(result.message || 'Inventário duplicado');
        setSaving(false);
        return;
      }

      setSaveResult({
        total_items: result.total_items,
        adjusted: result.adjusted,
        total_impact: result.total_impact,
      });
      setSaved(true);
      toast.success(`Inventário rápido registrado! ${result.adjusted} ajuste(s) aplicado(s).`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar inventário rápido');
    }
    setSaving(false);
  };

  // Reset for new count
  const handleNewCount = () => {
    setCountedItems([]);
    setSearchResults([]);
    setSearchTerm('');
    setCategoryFilter('');
    setSaved(false);
    setSaveResult(null);
    idempotencyKeyRef.current = null;
  };

  // Success screen
  if (saved && saveResult) {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-success/30 rounded-xl p-8 text-center animate-fade-up">
          <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground mb-1">Inventário Rápido Registrado!</h3>
          <p className="text-xs text-muted-foreground mb-4">Contagem salva com sucesso e ajustes aplicados automaticamente.</p>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-lg font-bold text-foreground">{saveResult.total_items}</p>
              <p className="text-[10px] text-muted-foreground">Itens contados</p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-lg font-bold text-foreground">{saveResult.adjusted}</p>
              <p className="text-[10px] text-muted-foreground">Ajustes gerados</p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-lg font-bold text-foreground">{fmtBRL(saveResult.total_impact)}</p>
              <p className="text-[10px] text-muted-foreground">Impacto financeiro</p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleNewCount}>
              <RotateCcw className="w-3.5 h-3.5" />
              Fazer Nova Contagem
            </Button>
          </div>
        </div>
      </div>
    );
  }


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-warning" />
          Inventário Rápido
        </h3>
        <p className="text-[10px] text-muted-foreground">
          Conte quantidades rapidamente. Ao salvar, os ajustes de estoque são gerados automaticamente.
        </p>
      </div>

      {/* Search & Add */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <Label className="text-xs font-medium text-foreground">Buscar e adicionar produtos</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Buscar por nome ou SKU..."
              className="pl-9 h-9 text-xs bg-secondary border-border"
            />
          </div>
          <Select value={categoryFilter || 'all'} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-32 h-9 text-xs bg-secondary border-border">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Search Results */}
        {searchLoading && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        )}
        {!searchLoading && searchResults.length > 0 && (
          <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
            {searchResults.map(p => (
              <button
                key={p.id}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-secondary/50 transition-colors text-left"
                onClick={() => addToCount(p)}
              >
                <div className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{p.nome_produto}</span>
                  <span className="text-muted-foreground">{p.categoria}</span>
                </div>
                <Badge variant="outline" className="text-[9px] h-5">{p.unidade_medida}</Badge>
              </button>
            ))}
          </div>
        )}
        {!searchLoading && searchResults.length === 0 && (searchTerm || categoryFilter) && (
          <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum produto encontrado</p>
        )}
      </div>

      {/* Counted Items */}
      {countedItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-secondary/50 border-b border-border">
            <p className="text-xs font-medium text-foreground">
              {countedItems.length} produto(s) na contagem
              {validItems.length > 0 && (
                <span className="text-muted-foreground"> · {validItems.length} com valor informado</span>
              )}
            </p>
          </div>
          <div className="divide-y divide-border">
            {countedItems.map(item => {
              const counted = Number(item.countedQty);
              const hasDiff = item.countedQty !== '' && counted !== item.saldoTeorico;
              const diff = item.countedQty !== '' ? counted - item.saldoTeorico : 0;

              return (
                <div key={item.productId} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{item.nomeProduto}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{item.categoria}</span>
                      <span>·</span>
                      <span>Teórico: {formatFixedBR(item.saldoTeorico, 2)} {item.unidadeMedida}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.countedQty}
                        onChange={e => updateCount(item.productId, e.target.value)}
                        placeholder="0,00"
                        className="h-8 text-xs text-right bg-secondary border-border font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6">{item.unidadeMedida}</span>

                    {hasDiff && (
                      <Badge className={`text-[9px] px-1.5 h-5 ${diff > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                        {diff > 0 ? '+' : ''}{formatFixedBR(diff, 2)}
                      </Badge>
                    )}

                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFromCount(item.productId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {validItems.length > 0 && (
            <div className="px-4 py-2 bg-secondary/30 border-t border-border">
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                {(() => {
                  const diffs = validItems.filter(i => Number(i.countedQty) !== i.saldoTeorico);
                  return (
                    <>
                      <span>{validItems.length} contado(s)</span>
                      <span>{diffs.length} com divergência</span>
                      {diffs.length > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-warning" />
                          {diffs.length} ajuste(s) será(ão) gerado(s)
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {countedItems.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ClipboardCheck className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">Busque e adicione produtos para iniciar a contagem</p>
        </div>
      )}

      {/* Action buttons */}
      {countedItems.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleNewCount}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving || validItems.length === 0}>
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Salvar Contagem ({validItems.length} item{validItems.length !== 1 ? 's' : ''})
          </Button>
        </div>
      )}
    </div>
  );
}
