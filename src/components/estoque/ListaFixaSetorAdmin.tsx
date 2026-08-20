/**
 * Admin-only component to manage fixed product lists per sector.
 * Only users with estoque:requisicoes:manage can see/use this.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { includesNormalized } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings2, Plus, Trash2, Search, X, GripVertical, Save, ArrowUp, ArrowDown } from 'lucide-react';
import type { ProdutoExtended } from '@/types/estoque';
import { toRequisitionDisplayProduct } from '@/domain/estoque/requisition';

interface ListaFixa {
  id: string;
  setor: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

interface ListaFixaItem {
  id: string;
  lista_fixa_id: string;
  produto_id: string;
  ordem: number;
  observacao: string;
}

interface Props {
  produtos: ProdutoExtended[];
}

export default function ListaFixaSetorAdmin({ produtos }: Props) {
  const canManage = useCan('estoque:requisicoes:manage');
  const { companyId } = useCompanyId();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [listas, setListas] = useState<ListaFixa[]>([]);
  const [setores, setSetores] = useState<string[]>([]);
  const [selectedSetor, setSelectedSetor] = useState('');
  useEffect(() => {
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('sort_order').order('name')
      .then(({ data }) => {
        const nomes = (data || []).map((s: { name: string }) => s.name);
        setSetores(nomes);
        setSelectedSetor(current => current || nomes[0] || '');
      });
  }, []);
  const [items, setItems] = useState<ListaFixaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Current list for selected sector
  const currentLista = useMemo(() => listas.find(l => l.setor === selectedSetor), [listas, selectedSetor]);

  const loadListas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listas_fixas_setor')
        .select('id, setor, nome, ativo, created_at')
        .order('setor');
      if (error) throw error;
      setListas((data || []) as ListaFixa[]);
    } catch (err) {
      console.error('Erro ao carregar listas fixas:', err);
      toast.error('Erro ao carregar listas fixas');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async (listaId: string) => {
    const { data, error } = await supabase
      .from('listas_fixas_setor_itens')
      .select('id, lista_fixa_id, produto_id, ordem, observacao')
      .eq('lista_fixa_id', listaId)
      .order('ordem');
    if (error) { console.error(error); return; }
    setItems((data || []) as ListaFixaItem[]);
  }, []);

  useEffect(() => { loadListas(); }, [loadListas]);

  useEffect(() => {
    if (currentLista) {
      loadItems(currentLista.id);
    } else {
      setItems([]);
    }
  }, [currentLista, loadItems]);

  // Filtered products for adding (exclude already added)
  const addableProdutos = useMemo(() => {
    const existingIds = new Set(items.map(i => i.produto_id));
    let list = produtos.filter(p => p.ativo && !existingIds.has(p.id));
    if (productSearch.trim()) {
      const term = productSearch.trim();
      list = list.filter(p => includesNormalized(p.nomeProduto, term) || (p.sku && includesNormalized(p.sku, term)));
    }
    return list;
  }, [produtos, items, productSearch]);

  // Create list for sector
  const handleCreateLista = async () => {
    if (!user || !companyId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('listas_fixas_setor')
        .insert({ company_id: companyId, setor: selectedSetor, nome: `Lista ${selectedSetor}`, created_by: user.id })
        .select('id, setor, nome, ativo, created_at')
        .single();
      if (error) throw error;
      setListas(prev => [...prev, data as ListaFixa]);
      toast.success(`Lista criada para ${selectedSetor}`);
    } catch (err: unknown) {
      console.error('[lista-fixa.createLista]', err);
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      if (msg.includes('duplicate')) {
        toast.error('Já existe uma lista para este setor');
      } else {
        toast.error('Erro ao criar lista');
      }
    } finally {
      setSaving(false);
    }
  };

  // Add product to list
  const handleAddProduct = async (produtoId: string) => {
    if (!currentLista || !companyId) return;
    const maxOrdem = items.reduce((max, i) => Math.max(max, i.ordem), 0);
    try {
      const { data, error } = await supabase
        .from('listas_fixas_setor_itens')
        .insert({
          company_id: companyId,
          lista_fixa_id: currentLista.id,
          produto_id: produtoId,
          ordem: maxOrdem + 1,
          observacao: '',
        })
        .select('id, lista_fixa_id, produto_id, ordem, observacao')
        .single();
      if (error) throw error;
      setItems(prev => [...prev, data as ListaFixaItem]);
      toast.success('Produto adicionado');
    } catch (e) {
      console.error('[lista-fixa.addProduct]', e);
      toast.error('Erro ao adicionar produto');
    }
  };

  // Remove product from list
  const handleRemoveProduct = async (itemId: string) => {
    const ok = await confirm({ title: 'Remover item', description: 'Remover este produto da lista fixa?', confirmLabel: 'Remover', variant: 'destructive' });
    if (!ok) return;
    try {
      const { error } = await supabase.from('listas_fixas_setor_itens').delete().eq('id', itemId);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== itemId));
      toast.success('Produto removido');
    } catch (e) {
      console.error('[lista-fixa.removeProduct]', e);
      toast.error('Erro ao remover');
    }
  };

  // Move item up/down
  const handleMove = async (itemId: string, direction: 'up' | 'down') => {
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const newItems = [...items];
    const tempOrdem = newItems[idx].ordem;
    newItems[idx] = { ...newItems[idx], ordem: newItems[swapIdx].ordem };
    newItems[swapIdx] = { ...newItems[swapIdx], ordem: tempOrdem };
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];
    setItems(newItems);

    // Persist reorder
    await Promise.all([
      supabase.from('listas_fixas_setor_itens').update({ ordem: newItems[idx].ordem }).eq('id', newItems[idx].id),
      supabase.from('listas_fixas_setor_itens').update({ ordem: newItems[swapIdx].ordem }).eq('id', newItems[swapIdx].id),
    ]);
  };

  // Toggle ativo
  const handleToggleAtivo = async () => {
    if (!currentLista) return;
    const newAtivo = !currentLista.ativo;
    try {
      const { error } = await supabase
        .from('listas_fixas_setor')
        .update({ ativo: newAtivo, updated_by: user?.id })
        .eq('id', currentLista.id);
      if (error) throw error;
      setListas(prev => prev.map(l => l.id === currentLista.id ? { ...l, ativo: newAtivo } : l));
      toast.success(newAtivo ? 'Lista ativada' : 'Lista desativada');
    } catch (e) {
      console.error('[lista-fixa.toggleAtivo]', e);
      toast.error('Erro ao alterar status');
    }
  };

  const getProdNome = (id: string) => produtos.find(p => p.id === id)?.nomeProduto || id.slice(0, 8);
  const getProdDisplayUnit = (id: string) => {
    const prod = produtos.find(p => p.id === id);
    if (!prod) return 'UN';
    const display = toRequisitionDisplayProduct(prod);
    return display.displayUnitForRequisition || prod.unidadeMedida;
  };

  if (!canManage) return null;

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Gerenciar Listas Fixas por Setor</p>
          <Badge variant="secondary" className="text-[9px]">ADMIN</Badge>
        </div>

        {/* Sector selector */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label className="text-[11px] text-muted-foreground">Setor</Label>
            <Select value={selectedSetor} onValueChange={setSelectedSetor}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setores.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                    {listas.some(l => l.setor === s) && (
                      <Badge variant="outline" className="ml-2 text-[8px]">
                        {listas.find(l => l.setor === s)?.ativo ? '✅' : '⏸️'}
                      </Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentLista ? (
            <div className="flex items-center gap-2 pt-4">
              <Label className="text-[10px] text-muted-foreground">Ativa</Label>
              <Switch checked={currentLista.ativo} onCheckedChange={handleToggleAtivo} />
            </div>
          ) : (
            <Button size="sm" className="mt-4 gap-1.5 text-xs" onClick={handleCreateLista} disabled={saving}>
              <Plus className="w-3.5 h-3.5" /> Criar Lista
            </Button>
          )}
        </div>

        {/* List content */}
        {currentLista ? (
          <div className="space-y-3">
            {/* Existing items */}
            {items.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground font-medium">{items.length} itens na lista</p>
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground w-5 text-center text-[10px]">{idx + 1}</span>
                    <span className="flex-1 text-foreground">{getProdNome(item.produto_id)}</span>
                    <Badge variant="outline" className="text-[9px]">{getProdDisplayUnit(item.produto_id)}</Badge>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => handleMove(item.id, 'up')} disabled={idx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => handleMove(item.id, 'down')} disabled={idx === items.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => handleRemoveProduct(item.id)} className="p-0.5 text-destructive hover:text-destructive/80 ml-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto na lista. Adicione abaixo.</p>
            )}

            {/* Add product */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Adicionar produto à lista</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar produto…"
                  className="pl-8 h-8 text-xs bg-secondary border-border text-foreground"
                />
                {productSearch && (
                  <button type="button" onClick={() => setProductSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {productSearch && (
                <div className="max-h-40 overflow-y-auto space-y-0.5 border border-border rounded-lg p-1">
                  {addableProdutos.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum produto encontrado</p>
                  ) : (
                    addableProdutos.slice(0, 20).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { handleAddProduct(p.id); setProductSearch(''); }}
                        className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-primary/10 text-foreground"
                      >
                        <span>{p.nomeProduto}</span>
                        <Badge variant="outline" className="text-[9px]">{toRequisitionDisplayProduct(p).displayUnitForRequisition || p.unidadeMedida}</Badge>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma lista fixa para <strong>{selectedSetor}</strong>. Clique em "Criar Lista" para começar.
          </p>
        )}
      </div>
      <ConfirmDialog />
    </>
  );
}
