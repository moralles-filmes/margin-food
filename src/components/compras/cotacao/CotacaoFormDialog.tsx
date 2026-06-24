import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { toast } from 'sonner';
import { Plus, X, Trash2, Package, Building2, Download, PencilLine } from 'lucide-react';
import { includesNormalized } from '@/lib/utils';
import { formatMoneyBR } from '@/lib/formatters';
import { mapCotacaoError } from '@/lib/cotacaoErrors';
import type { useCotacoesStore, CotacaoItemInput, CotacaoFornecedorInput } from '@/hooks/useCotacoesStore';
import type { Cotacao, CotacaoItem, CotacaoFornecedor } from '@/types/cotacao';
import ImportItensDialog from './ImportItensDialog';

interface CotacaoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: ReturnType<typeof useCotacoesStore>;
  /** Quando presente, o diálogo entra em modo edição. */
  editing?: Cotacao | null;
  editingDetail?: { itens: CotacaoItem[]; fornecedores: CotacaoFornecedor[] } | null;
  onSaved?: () => void;
}

const emptyHeader = { titulo: '', observacao: '', dataValidade: '' };

export default function CotacaoFormDialog({ open, onOpenChange, store, editing, editingDetail, onSaved }: CotacaoFormDialogProps) {
  const estoque = useEstoqueGeralStoreContext();
  const salmon = useSalmonStoreContext();

  // Mont fresh por abertura (CotacaoView monta condicionalmente) → baseline do
  // dirty-guard reflete os valores de edição. Inicializa do props no 1º render.
  const [header, setHeader] = useState(() => editing
    ? { titulo: editing.titulo ?? '', observacao: editing.observacao ?? '', dataValidade: editing.data_validade ? editing.data_validade.slice(0, 10) : '' }
    : emptyHeader);
  const [itens, setItens] = useState<CotacaoItemInput[]>(() => (editing ? (editingDetail?.itens ?? []) : []).map(it => ({
    produto_id: it.produto_id,
    produto_nome_snapshot: it.produto_nome_snapshot,
    unidade_snapshot: it.unidade_snapshot,
    purchase_unit_snapshot: it.purchase_unit_snapshot,
    conversion_factor_snapshot: it.conversion_factor_snapshot ?? 1,
    quantidade: Number(it.quantidade) || 0,
    observacao: it.observacao,
  })));
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>(
    () => (editing ? (editingDetail?.fornecedores ?? []) : []).map(f => f.supplier_id).filter(Boolean) as string[],
  );
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Add-item form
  const [addMode, setAddMode] = useState<'catalogo' | 'avulso'>('catalogo');
  const [prodId, setProdId] = useState('');
  const [qty, setQty] = useState('');
  const [avulsoNome, setAvulsoNome] = useState('');
  const [avulsoUnidade, setAvulsoUnidade] = useState('');

  const [supplierQuery, setSupplierQuery] = useState('');

  const produtos = estoque.produtos;
  const activeSuppliers = useMemo(
    () => salmon.suppliers.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name)),
    [salmon.suppliers],
  );

  const productOptions: ProductOption[] = useMemo(
    () => produtos.filter((p: any) => p.ativo).map((p: any) => ({
      id: p.id,
      label: p.nomeProduto,
      sublabel: `(${p.unidadeCompra || p.unidadeMedida || 'UN'})`,
      keywords: p.sku || '',
    })),
    [produtos],
  );

  const dirtySnapshot = useMemo(() => ({ header, itens, selectedSupplierIds }), [header, itens, selectedSupplierIds]);
  const { showConfirm, guardedClose, confirmClose, cancelClose, markClean } = useFormDirtyGuard({
    current: dirtySnapshot,
    onClose: () => onOpenChange(false),
  });

  const addCatalogItem = () => {
    if (!prodId || !qty) { toast.error('Selecione o produto e a quantidade'); return; }
    const p = produtos.find((x: any) => x.id === prodId) as any;
    if (!p) { toast.error('Produto não encontrado'); return; }
    setItens(prev => [...prev, {
      produto_id: p.id,
      produto_nome_snapshot: p.nomeProduto,
      unidade_snapshot: p.unidadeMedida || 'UN',
      purchase_unit_snapshot: p.unidadeCompra || p.unidadeMedida || 'UN',
      conversion_factor_snapshot: p.fatorConversaoPadrao || 1,
      quantidade: parseFloat(qty) || 0,
    }]);
    setProdId(''); setQty('');
  };

  const addAvulsoItem = () => {
    if (!avulsoNome.trim() || !qty) { toast.error('Informe nome e quantidade do item avulso'); return; }
    setItens(prev => [...prev, {
      produto_id: null,
      produto_nome_snapshot: avulsoNome.trim(),
      unidade_snapshot: avulsoUnidade.trim() || 'UN',
      purchase_unit_snapshot: avulsoUnidade.trim() || 'UN',
      conversion_factor_snapshot: 1,
      quantidade: parseFloat(qty) || 0,
    }]);
    setAvulsoNome(''); setAvulsoUnidade(''); setQty('');
  };

  const handleImport = useCallback((imported: CotacaoItemInput[]) => {
    setItens(prev => {
      // dedup por produto_id (mantém o existente)
      const existingProd = new Set(prev.map(i => i.produto_id).filter(Boolean));
      const fresh = imported.filter(i => !i.produto_id || !existingProd.has(i.produto_id));
      return [...prev, ...fresh];
    });
    setImportOpen(false);
    toast.success(`${imported.length} item(ns) importado(s)`);
  }, []);

  const removeItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx));
  const setItemQty = (idx: number, v: string) =>
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: parseFloat(v) || 0 } : it));

  const toggleSupplier = (id: string) =>
    setSelectedSupplierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!header.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    if (itens.length === 0) { toast.error('Adicione ao menos 1 item'); return; }

    const fornecedores: CotacaoFornecedorInput[] = selectedSupplierIds.map(id => {
      const s = salmon.suppliers.find(x => x.id === id);
      return {
        supplier_id: id,
        supplier_nome_snapshot: s?.name ?? 'Fornecedor',
        whatsapp_snapshot: s?.whatsappNumber || null,
        pedido_minimo_snapshot: s?.pedidoMinimoValor ?? 0,
      };
    });

    setSaving(true);
    try {
      const payload = {
        titulo: header.titulo.trim(),
        observacao: header.observacao.trim() || null,
        data_validade: header.dataValidade || null,
        itens,
        fornecedores,
      };
      if (editing) {
        await store.updateCotacao(editing.id, payload, editing.updated_at);
        toast.success('Cotação atualizada!');
      } else {
        const res = await store.createCotacao({ ...payload, origin_type: 'MANUAL' });
        toast.success(`Cotação ${res?.codigo ?? ''} criada!`);
      }
      markClean();
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error('[CotacaoFormDialog.handleSubmit]', err);
      toast.error(mapCotacaoError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) guardedClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar Cotação ${editing.codigo}` : 'Nova Cotação'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-[11px] text-muted-foreground">Título *</Label>
                <Input value={header.titulo} onChange={e => setHeader(h => ({ ...h, titulo: e.target.value }))}
                  placeholder="Ex.: Cotação semanal — Hortifruti" className="bg-secondary border-border text-foreground" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Validade</Label>
                <Input type="date" value={header.dataValidade} onChange={e => setHeader(h => ({ ...h, dataValidade: e.target.value }))}
                  className="bg-secondary border-border text-foreground" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Observação</Label>
                <Input value={header.observacao} onChange={e => setHeader(h => ({ ...h, observacao: e.target.value }))}
                  placeholder="Opcional" className="bg-secondary border-border text-foreground" />
              </div>
            </div>

            {/* Itens */}
            <div className="border-t border-border/60 pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Itens ({itens.length})
                </Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setImportOpen(true)}>
                  <Download className="w-3.5 h-3.5" /> Importar
                </Button>
              </div>

              <div className="flex gap-1 mb-2">
                <Button type="button" size="sm" variant={addMode === 'catalogo' ? 'default' : 'ghost'}
                  className="h-7 text-[11px]" onClick={() => setAddMode('catalogo')}>Catálogo</Button>
                <Button type="button" size="sm" variant={addMode === 'avulso' ? 'default' : 'ghost'}
                  className="h-7 text-[11px] gap-1" onClick={() => setAddMode('avulso')}><PencilLine className="w-3 h-3" /> Avulso</Button>
              </div>

              {addMode === 'catalogo' ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <ProductSearchCombobox options={productOptions} value={prodId} onSelect={setProdId}
                      placeholder="Selecionar produto…" searchPlaceholder="Buscar produto…" modal allowClear />
                  </div>
                  <Input type="number" min={0} step="0.01" value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="Qtd" className="w-20 bg-secondary border-border text-foreground" />
                  <Button type="button" size="sm" className="h-9 gradient-salmon text-primary-foreground border-0" onClick={addCatalogItem}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <Input value={avulsoNome} onChange={e => setAvulsoNome(e.target.value)} placeholder="Nome do item"
                      className="bg-secondary border-border text-foreground" />
                  </div>
                  <Input value={avulsoUnidade} onChange={e => setAvulsoUnidade(e.target.value)} placeholder="UN"
                    className="w-16 bg-secondary border-border text-foreground" />
                  <Input type="number" min={0} step="0.01" value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="Qtd" className="w-20 bg-secondary border-border text-foreground" />
                  <Button type="button" size="sm" className="h-9 gradient-salmon text-primary-foreground border-0" onClick={addAvulsoItem}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-1.5 mt-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-secondary/40 rounded-lg px-2.5 py-1.5">
                    <span className="flex-1 min-w-0 text-xs text-foreground truncate">
                      {it.produto_nome_snapshot}
                      {!it.produto_id && <span className="ml-1 text-[9px] text-muted-foreground">(avulso)</span>}
                    </span>
                    <Input type="number" min={0} step="0.01" value={it.quantidade || ''} onChange={e => setItemQty(idx, e.target.value)}
                      className="w-16 h-7 text-xs bg-card border-border text-foreground" />
                    <span className="text-[10px] text-muted-foreground w-8">{it.purchase_unit_snapshot || it.unidade_snapshot || 'UN'}</span>
                    <button type="button" onClick={() => removeItem(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {itens.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum item adicionado</p>}
              </div>
            </div>

            {/* Fornecedores */}
            <div className="border-t border-border/60 pt-3">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <Building2 className="w-3.5 h-3.5" /> Fornecedores ({selectedSupplierIds.length})
              </Label>
              <Input value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} placeholder="Buscar fornecedor…"
                className="bg-secondary border-border text-foreground mb-2 h-8 text-xs" />
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {activeSuppliers.filter(s => !supplierQuery || includesNormalized(s.name, supplierQuery)).map(s => {
                  const sel = selectedSupplierIds.includes(s.id);
                  return (
                    <button type="button" key={s.id} onClick={() => toggleSupplier(s.id)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 border transition-colors ${sel ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40 hover:border-primary/40'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={sel} readOnly className="accent-primary pointer-events-none" />
                        <span className="text-xs text-foreground truncate">{s.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        mín. {formatMoneyBR(s.pedidoMinimoValor || 0)}{s.whatsappNumber ? ' • zap' : ''}
                      </span>
                    </button>
                  );
                })}
                {activeSuppliers.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2">Nenhum fornecedor ativo</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={guardedClose} disabled={saving}>Cancelar</Button>
            <Button type="button" size="sm" className="gradient-salmon text-primary-foreground border-0" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Salvando…' : editing ? 'Atualizar' : 'Criar cotação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportItensDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImport} />

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </>
  );
}
