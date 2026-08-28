import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PackageX, ClipboardList, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { CotacaoItemInput } from '@/hooks/useCotacoesStore';

const db = supabase as any;

type Source = 'alertas' | 'checklist';

interface ImportRow extends CotacaoItemInput {
  _key: string;
  _label: string;
}

interface ImportItensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (itens: CotacaoItemInput[]) => void;
}

export default function ImportItensDialog({ open, onOpenChange, onImport }: ImportItensDialogProps) {
  const [source, setSource] = useState<Source>('alertas');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (src: Source) => {
    setLoading(true);
    setSelected(new Set());
    try {
      if (src === 'alertas') {
        const { data, error } = await db
          .from('alertas_falta_estoque')
          .select('id, produto_id, produto_nome, quantidade_solicitada, unidade')
          .eq('status', 'PENDENTE')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setRows((data ?? []).map((a: any) => ({
          _key: `a:${a.id}`,
          _label: `${a.produto_nome} — ${Number(a.quantidade_solicitada) || 0} ${a.unidade || 'UN'}`,
          produto_id: a.produto_id ?? null,
          produto_nome_snapshot: a.produto_nome,
          unidade_snapshot: a.unidade || 'UN',
          purchase_unit_snapshot: a.unidade || 'UN',
          conversion_factor_snapshot: 1,
          quantidade: Number(a.quantidade_solicitada) || 0,
        })));
      } else {
        // Checklist (Mercado): itens de pedidos MERCADO/SAZONAL pendentes
        const { data: orders, error: oErr } = await db
          .from('purchase_orders')
          .select('id')
          .in('type', ['MERCADO', 'SAZONAL'])
          .eq('status', 'PENDING')
          .is('deleted_at', null);
        if (oErr) throw oErr;
        const ids = (orders ?? []).map((o: any) => o.id);
        if (ids.length === 0) { setRows([]); return; }
        const { data: items, error: iErr } = await db
          .from('purchase_order_items')
          .select('id, stock_item_id, name_snapshot, unit_snapshot, purchase_unit_snapshot, conversion_factor_snapshot, qty_requested, shopping_status')
          .in('order_id', ids)
          .eq('shopping_status', 'PENDING');
        if (iErr) throw iErr;
        setRows((items ?? []).map((it: any) => ({
          _key: `c:${it.id}`,
          _label: `${it.name_snapshot} — ${Number(it.qty_requested) || 0} ${it.purchase_unit_snapshot || it.unit_snapshot || 'UN'}`,
          produto_id: it.stock_item_id ?? null,
          produto_nome_snapshot: it.name_snapshot,
          unidade_snapshot: it.unit_snapshot || 'UN',
          purchase_unit_snapshot: it.purchase_unit_snapshot || it.unit_snapshot || 'UN',
          conversion_factor_snapshot: Number(it.conversion_factor_snapshot) || 1,
          quantidade: Number(it.qty_requested) || 0,
        })));
      }
    } catch (err: any) {
      console.error('[ImportItensDialog.load]', err);
      toast.error('Erro ao carregar itens para importar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(source);
  }, [open, source, load]);

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(r => r._key)));

  const handleAdd = () => {
    const chosen = rows.filter(r => selected.has(r._key));
    if (chosen.length === 0) { toast.error('Selecione ao menos 1 item'); return; }
    onImport(chosen.map(({ _key, _label, ...item }) => item));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar itens</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 mb-1">
          <Button size="sm" variant={source === 'alertas' ? 'default' : 'ghost'} className="h-8 text-xs gap-1.5 flex-1" onClick={() => setSource('alertas')}>
            <PackageX className="w-3.5 h-3.5" /> Itens em Falta
          </Button>
          <Button size="sm" variant={source === 'checklist' ? 'default' : 'ghost'} className="h-8 text-xs gap-1.5 flex-1" onClick={() => setSource('checklist')}>
            <ClipboardList className="w-3.5 h-3.5" /> Checklist (Mercado)
          </Button>
        </div>

        {rows.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <button type="button" onClick={toggleAll} className="hover:text-foreground underline-offset-2 hover:underline">
              {selected.size === rows.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <span>{selected.size}/{rows.length} selecionado(s)</span>
          </div>
        )}

        <div className="space-y-1 min-h-[120px]">
          {loading ? (
            [0, 1, 2].map(i => <div key={i} className="h-9 bg-secondary/40 rounded-lg animate-pulse" />)
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum item pendente nesta origem.</p>
          ) : (
            rows.map(r => {
              const sel = selected.has(r._key);
              return (
                <button type="button" key={r._key} onClick={() => toggle(r._key)}
                  className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 border text-left transition-colors ${sel ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40 hover:border-primary/40'}`}>
                  <span className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${sel ? 'bg-primary border-primary' : 'border-border'}`}>
                    {sel && <Check className="w-3 h-3 text-primary-foreground" />}
                  </span>
                  <span className="text-xs text-foreground break-words">{r._label}</span>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" size="sm" className="bg-primary-strong text-primary-foreground border-0" onClick={handleAdd} disabled={loading || selected.size === 0}>
            Adicionar {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
