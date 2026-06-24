import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Save, Ban } from 'lucide-react';
import { mapCotacaoError } from '@/lib/cotacaoErrors';
import type { useCotacoesStore, CotacaoRespostaInput, CotacaoFornecedorMetaInput } from '@/hooks/useCotacoesStore';
import type { CotacaoItem, CotacaoFornecedor, CotacaoResposta } from '@/types/cotacao';

interface Cell { preco: string; disp: boolean }

interface CotacaoRespostasMatrixProps {
  cotacaoId: string;
  itens: CotacaoItem[];
  fornecedores: CotacaoFornecedor[];
  respostas: CotacaoResposta[];
  store: ReturnType<typeof useCotacoesStore>;
  canEdit: boolean;
  onSaved: () => void;
}

const cellKey = (fornId: string, itemId: string) => `${fornId}|${itemId}`;

export default function CotacaoRespostasMatrix({ cotacaoId, itens, fornecedores, respostas, store, canEdit, onSaved }: CotacaoRespostasMatrixProps) {
  const [cells, setCells] = useState<Record<string, Cell>>(() => {
    const m: Record<string, Cell> = {};
    respostas.forEach(r => {
      m[cellKey(r.cotacao_fornecedor_id, r.cotacao_item_id)] = {
        preco: r.preco_unitario != null ? String(r.preco_unitario) : '',
        disp: r.disponivel,
      };
    });
    return m;
  });
  const [meta, setMeta] = useState<Record<string, { frete: string; prazo: string; condicao: string }>>(() => {
    const m: Record<string, { frete: string; prazo: string; condicao: string }> = {};
    fornecedores.forEach(f => {
      m[f.id] = {
        frete: f.frete ? String(f.frete) : '',
        prazo: f.prazo_entrega_dias != null ? String(f.prazo_entrega_dias) : '',
        condicao: f.condicao_pagamento ?? '',
      };
    });
    return m;
  });
  const [saving, setSaving] = useState(false);

  const getCell = (fornId: string, itemId: string): Cell => cells[cellKey(fornId, itemId)] ?? { preco: '', disp: true };
  const setPreco = (fornId: string, itemId: string, preco: string) =>
    setCells(prev => ({ ...prev, [cellKey(fornId, itemId)]: { preco, disp: prev[cellKey(fornId, itemId)]?.disp ?? true } }));
  const toggleDisp = (fornId: string, itemId: string) =>
    setCells(prev => {
      const k = cellKey(fornId, itemId);
      const cur = prev[k] ?? { preco: '', disp: true };
      return { ...prev, [k]: { ...cur, disp: !cur.disp } };
    });
  const setMetaField = (fornId: string, field: 'frete' | 'prazo' | 'condicao', v: string) =>
    setMeta(prev => ({ ...prev, [fornId]: { ...prev[fornId], [field]: v } }));

  const handleSave = async () => {
    const respostasPayload: CotacaoRespostaInput[] = [];
    fornecedores.forEach(f => itens.forEach(it => {
      const c = getCell(f.id, it.id);
      // envia só células preenchidas ou marcadas indisponível
      if (c.preco !== '' || c.disp === false) {
        respostasPayload.push({
          cotacao_fornecedor_id: f.id,
          cotacao_item_id: it.id,
          preco_unitario: c.preco === '' ? null : c.preco,
          disponivel: c.disp,
        });
      }
    }));
    const metaPayload: CotacaoFornecedorMetaInput[] = fornecedores.map(f => ({
      cotacao_fornecedor_id: f.id,
      frete: meta[f.id]?.frete ?? '',
      prazo_entrega_dias: meta[f.id]?.prazo ?? '',
      condicao_pagamento: meta[f.id]?.condicao || null,
    }));

    setSaving(true);
    try {
      const res = await store.saveRespostas(cotacaoId, respostasPayload, metaPayload);
      toast.success(`Respostas salvas (${res?.upserts ?? respostasPayload.length})`);
      onSaved();
    } catch (err) {
      console.error('[CotacaoRespostasMatrix.handleSave]', err);
      toast.error(mapCotacaoError(err));
    } finally {
      setSaving(false);
    }
  };

  const colWidth = useMemo(() => Math.max(120, Math.min(180, 520 / Math.max(1, fornecedores.length))), [fornecedores.length]);

  if (fornecedores.length === 0 || itens.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Adicione itens e fornecedores (editando a cotação) para registrar preços.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Meta por fornecedor */}
      <div className="space-y-1.5">
        {fornecedores.map(f => (
          <div key={f.id} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-24 shrink-0 truncate text-foreground" title={f.supplier_nome_snapshot}>{f.supplier_nome_snapshot}</span>
            <Input value={meta[f.id]?.frete ?? ''} onChange={e => setMetaField(f.id, 'frete', e.target.value)} disabled={!canEdit}
              type="number" min={0} step="0.01" placeholder="frete R$" className="h-7 text-[11px] bg-secondary border-border w-20" />
            <Input value={meta[f.id]?.prazo ?? ''} onChange={e => setMetaField(f.id, 'prazo', e.target.value)} disabled={!canEdit}
              type="number" min={0} placeholder="prazo d" className="h-7 text-[11px] bg-secondary border-border w-16" />
            <Input value={meta[f.id]?.condicao ?? ''} onChange={e => setMetaField(f.id, 'condicao', e.target.value)} disabled={!canEdit}
              placeholder="pagamento" className="h-7 text-[11px] bg-secondary border-border flex-1 min-w-0" />
          </div>
        ))}
      </div>

      {/* Matriz itens × fornecedores */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/60">
              <th className="text-left font-medium text-muted-foreground px-2 py-1.5 sticky left-0 bg-secondary/60 min-w-[140px]">Item</th>
              {fornecedores.map(f => (
                <th key={f.id} className="text-center font-medium text-foreground px-2 py-1.5 truncate" style={{ minWidth: colWidth }}>
                  {f.supplier_nome_snapshot}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map(it => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-2 py-1 sticky left-0 bg-card">
                  <div className="text-foreground truncate max-w-[140px]" title={it.produto_nome_snapshot}>{it.produto_nome_snapshot}</div>
                  <div className="text-[10px] text-muted-foreground">{Number(it.quantidade) || 0} {it.purchase_unit_snapshot || it.unidade_snapshot || 'UN'}</div>
                </td>
                {fornecedores.map(f => {
                  const c = getCell(f.id, it.id);
                  return (
                    <td key={f.id} className="px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <Input
                          value={c.disp ? c.preco : ''}
                          onChange={e => setPreco(f.id, it.id, e.target.value)}
                          disabled={!canEdit || !c.disp}
                          type="number" min={0} step="0.01"
                          placeholder={c.disp ? `R$/${it.purchase_unit_snapshot || it.unidade_snapshot || 'un'}` : '—'}
                          className={`h-7 text-xs bg-secondary border-border text-right ${!c.disp ? 'opacity-50' : ''}`}
                        />
                        <button type="button" onClick={() => canEdit && toggleDisp(f.id, it.id)} disabled={!canEdit}
                          title={c.disp ? 'Marcar indisponível' : 'Marcar disponível'}
                          className={`p-1 rounded shrink-0 ${!c.disp ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:bg-secondary'}`}>
                          <Ban className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando…' : 'Salvar respostas'}
          </Button>
        </div>
      )}
    </div>
  );
}
