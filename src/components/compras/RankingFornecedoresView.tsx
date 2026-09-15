import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { includesNormalized } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fmtBRL, formatDateBR, normalizeBRLMoneyToNumber } from '@/lib/formatters';
import { Crown, Award, Medal, Search, Plus, Inbox, ArrowUp, BarChart3, Loader2, ChevronDown } from 'lucide-react';

import { useCan } from '@/permissions/hooks';
import { sortByName } from '@/lib/sortByName';
const CATEGORIAS = ['Bebidas', 'Cozinha', 'Descartáveis', 'Embalagens', 'Hortifruti', 'Limpeza', 'Oriental', 'Peixe', 'Proteínas', 'Outros'];
const PAGE_SIZE = 20;

interface RankingRow {
  supplier_id: string;
  supplier_uuid: string | null;
  supplier_name: string;
  avg_unit_cost: number;
  min_unit_cost: number;
  max_unit_cost: number;
  last_price: number;
  last_updated_at: string;
  items_count: number;
  rank_position: number;
  has_more: boolean;
}

type RankingTab = 'cheapest' | 'expensive' | 'by-item' | 'by-category';

export default function RankingFornecedoresView() {
  const supabase = useSupabase();
  const canViewRbac = useCan('compras:ranking:view');
  const canEditPrices = useCan('compras:fornecedores:edit');
  const requestGeneration = useRef(0);
  const active = useRef(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    active.current = true;
    const requests = requestGeneration;
    return () => { active.current = false; requests.current++; };
  }, [supabase]);
  const { user } = useAuth();
  const { produtos } = useEstoqueGeralStoreContext();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<RankingTab>('cheapest');
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchItem, setSearchItem] = useState('');

  // Add price modal
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [priceForm, setPriceForm] = useState({ supplier_id: '', stock_item_id: '', unit_cost: '', purchase_unit: '' });

  const fetchRanking = useCallback(async (offset = 0, append = false) => {
    if (!canViewRbac) return;
    const generation = ++requestGeneration.current;
    if (offset === 0) setLoading(true); else setLoadingMore(true);

    const sortMap: Record<RankingTab, string> = { cheapest: 'cheapest', expensive: 'expensive', 'by-item': 'cheapest', 'by-category': 'cheapest' };
    const stockItemId = tab === 'by-item' && selectedItem ? selectedItem : null;
    const category = tab === 'by-category' && selectedCategory ? selectedCategory : null;

    const { data, error } = await supabase.rpc('get_supplier_ranking', {
      p_stock_item_id: stockItemId,
      p_category: category,
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_sort: sortMap[tab] || 'cheapest',
    });

    if (!active.current || generation !== requestGeneration.current) return;
    if (error) { console.error(error); setLoading(false); setLoadingMore(false); return; }
    const result = (data || []) as unknown as RankingRow[];
    setHasMore(result.length === PAGE_SIZE);

    if (append) setRows(prev => [...prev, ...result]);
    else setRows(result);

    setLoading(false);
    setLoadingMore(false);
  }, [tab, selectedItem, selectedCategory, supabase, canViewRbac]);

  useEffect(() => {
    if (user) fetchRanking();
  }, [user, fetchRanking]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore) fetchRanking(rows.length, true);
  }, [hasMore, loadingMore, rows.length, fetchRanking]);

  const handleAddPrice = async () => {
    if (!canEditPrices || saving) return;
    if (!priceForm.supplier_id || !priceForm.stock_item_id || !priceForm.unit_cost) {
      toast.error('Preencha todos os campos'); return;
    }
    const parsedCost = normalizeBRLMoneyToNumber(priceForm.unit_cost);
    if (parsedCost === null || parsedCost <= 0) {
      toast.error('Custo inválido'); return;
    }
    const prod = produtos.find(p => p.id === priceForm.stock_item_id);

    setSaving(true);
    // Nome é entrada de cadastro; a RPC usa o UUID retornado no preço, na mesma transação.
    const { error } = await supabase.rpc('upsert_supplier_price', {
      p_name: priceForm.supplier_id,
      p_stock_item_id: priceForm.stock_item_id,
      p_purchase_unit: priceForm.purchase_unit || prod?.unidadeCompra || 'UN',
      p_unit_cost: parsedCost,
    });
    if (!active.current) return;
    setSaving(false);
    if (error) { console.error('Erro ao registrar preço', error); toast.error('Erro: ' + error.message); return; }
    toast.success('Preço salvo!');
    setShowAddPrice(false);
    setPriceForm({ supplier_id: '', stock_item_id: '', unit_cost: '', purchase_unit: '' });
    fetchRanking();
  };

  const getProdName = (id: string) => produtos.find(p => p.id === id)?.nomeProduto || id.slice(0, 8);

  const filteredProducts = useMemo(() => {
    return sortByName(produtos.filter(p => p.ativo && includesNormalized(p.nomeProduto, searchItem)), p => p.nomeProduto).slice(0, 30);
  }, [produtos, searchItem]);

  const tabs: { id: RankingTab; label: string; icon: typeof Crown }[] = [
    { id: 'cheapest', label: 'Mais Barato', icon: Crown },
    { id: 'expensive', label: 'Mais Caro', icon: ArrowUp },
    { id: 'by-item', label: 'Por Item', icon: Search },
    { id: 'by-category', label: 'Por Categoria', icon: BarChart3 },
  ];

  const renderRankIcon = (idx: number) => {
    if (idx === 0) return <Crown className="w-4 h-4 text-warning" />;
    if (idx === 1) return <Award className="w-4 h-4 text-muted-foreground" />;
    if (idx === 2) return <Medal className="w-4 h-4 text-primary" />;
    return <span className="text-xs text-muted-foreground font-bold w-4 text-center">{idx + 1}</span>;
  };

  const needsFilter = (tab === 'by-item' && !selectedItem) || (tab === 'by-category' && !selectedCategory);


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Top Fornecedores</p>
          <p className="text-[10px] text-muted-foreground">Ranking de preços por fornecedor e item</p>
        </div>
        {canEditPrices && <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowAddPrice(true)}>
          <Plus className="w-3.5 h-3.5" /> Cadastrar Preço
        </Button>}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 flex-wrap pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
              <Icon className="w-3 h-3" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters for by-item / by-category */}
      {tab === 'by-item' && (
        <div>
          <Label className="text-xs">Selecione um item</Label>
          <Input value={searchItem} onChange={e => setSearchItem(e.target.value)} placeholder="Buscar produto..." className="text-sm mb-1" />
          {searchItem && (
            <div className="border rounded-lg max-h-32 overflow-y-auto">
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => { setSelectedItem(p.id); setSearchItem(''); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/80 ${selectedItem === p.id ? 'bg-primary/10' : ''}`}>
                  {p.nomeProduto} <span className="text-muted-foreground">({p.unidadeCompra || p.unidadeMedida})</span>
                </button>
              ))}
            </div>
          )}
          {selectedItem && <Badge variant="outline" className="text-[10px] mt-1">{getProdName(selectedItem)}</Badge>}
        </div>
      )}

      {tab === 'by-category' && (
        <div>
          <Label className="text-xs">Selecione uma categoria</Label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Categoria..." /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : needsFilter ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          {tab === 'by-item' ? 'Selecione um item para ver o ranking.' : 'Selecione uma categoria para ver o ranking.'}
        </p>
      ) : rows.length === 0 ? (
        <div className="bg-secondary/50 rounded-xl p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">Ainda não há preços por fornecedor</p>
          <p className="text-[10px] text-muted-foreground mb-3">Registre preços em recebimentos ou cadastre manualmente.</p>
          {canEditPrices && <Button size="sm" variant="outline" onClick={() => setShowAddPrice(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar preços
          </Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.supplier_id + '-' + i} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              {renderRankIcon(i)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{r.supplier_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {r.items_count} {Number(r.items_count) === 1 ? 'item' : 'itens'} com preço
                  {r.last_updated_at && ` • ${formatDateBR(new Date(r.last_updated_at))}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">{fmtBRL(r.avg_unit_cost)}</p>
                <p className="text-[9px] text-muted-foreground">média/item</p>
                {Number(r.min_unit_cost) !== Number(r.max_unit_cost) && (
                  <p className="text-[8px] text-muted-foreground">
                    {fmtBRL(r.min_unit_cost)} – {fmtBRL(r.max_unit_cost)}
                  </p>
                )}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-1.5 text-xs">
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add Price Dialog */}
      <Dialog open={showAddPrice} onOpenChange={setShowAddPrice}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Cadastrar Preço</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fornecedor *</Label>
              <Input value={priceForm.supplier_id} onChange={e => setPriceForm(f => ({ ...f, supplier_id: e.target.value }))} placeholder="Nome do fornecedor" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Produto *</Label>
              <SearchableSelect
                value={priceForm.stock_item_id}
                onValueChange={v => {
                  const prod = produtos.find(p => p.id === v);
                  setPriceForm(f => ({ ...f, stock_item_id: v, purchase_unit: prod?.unidadeCompra || prod?.unidadeMedida || 'UN' }));
                }}
                options={produtos.filter(p => p.ativo).map(p => ({ value: p.id, label: `${p.nomeProduto} (${p.unidadeCompra || p.unidadeMedida})` }))}
                placeholder="Selecione..."
                searchPlaceholder="Buscar produto..."
                className="text-sm"
                modal
                allowClear={false}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Unidade Compra</Label>
                <Input value={priceForm.purchase_unit} onChange={e => setPriceForm(f => ({ ...f, purchase_unit: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Custo (R$) *</Label>
                <CurrencyInput
                  value={priceForm.unit_cost}
                  onValueChange={(raw) => setPriceForm(f => ({ ...f, unit_cost: raw }))}
                  maxDecimals={2}
                  showPrefix
                  placeholder="0,00"
                  className="text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddPrice(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAddPrice} disabled={saving || !canEditPrices}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
