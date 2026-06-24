import { useMemo } from 'react';
import { formatMoneyBR } from '@/lib/formatters';
import { TrendingDown, Users, Coins, AlertTriangle, Check } from 'lucide-react';
import type { CotacaoItem, CotacaoFornecedor, CotacaoResposta } from '@/types/cotacao';

interface CotacaoComparativoTableProps {
  itens: CotacaoItem[];
  fornecedores: CotacaoFornecedor[];
  respostas: CotacaoResposta[];
}

interface CellInfo { price: number | null; unavailable: boolean }

export default function CotacaoComparativoTable({ itens, fornecedores, respostas }: CotacaoComparativoTableProps) {
  const data = useMemo(() => {
    // lookup: respostas[fornId|itemId]
    const map = new Map<string, CotacaoResposta>();
    respostas.forEach(r => map.set(`${r.cotacao_fornecedor_id}|${r.cotacao_item_id}`, r));

    const cellOf = (fornId: string, itemId: string): CellInfo => {
      const r = map.get(`${fornId}|${itemId}`);
      if (!r) return { price: null, unavailable: false };
      if (r.disponivel === false) return { price: null, unavailable: true };
      return { price: r.preco_unitario != null ? Number(r.preco_unitario) : null, unavailable: false };
    };

    const subtotal: Record<string, number> = {};
    fornecedores.forEach(f => { subtotal[f.id] = 0; });

    let totalRecomendado = 0;
    let economia = 0;
    const itemsSemResposta: string[] = [];

    const rows = itens.map(it => {
      const qty = Number(it.quantidade) || 0;
      const prices = fornecedores.map(f => ({ fornId: f.id, ...cellOf(f.id, it.id) }));
      const available = prices.filter(p => p.price != null) as { fornId: string; price: number; unavailable: boolean }[];
      const min = available.length ? Math.min(...available.map(p => p.price)) : null;
      const max = available.length ? Math.max(...available.map(p => p.price)) : null;
      const bestFornId = min != null ? available.find(p => p.price === min)!.fornId : null;
      if (bestFornId != null && min != null) {
        subtotal[bestFornId] += min * qty;
        totalRecomendado += min * qty;
        if (max != null) economia += (max - min) * qty;
      } else {
        itemsSemResposta.push(it.produto_nome_snapshot);
      }
      const variacao = (min != null && max != null && min > 0) ? ((max - min) / min) * 100 : 0;
      return { it, qty, prices, min, max, bestFornId, variacao };
    });

    const suppliersUsed = fornecedores.filter(f => subtotal[f.id] > 0).length;
    return { rows, subtotal, totalRecomendado, economia, suppliersUsed, itemsSemResposta };
  }, [itens, fornecedores, respostas]);

  if (fornecedores.length === 0 || itens.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Sem itens/fornecedores para comparar.</p>;
  }

  const hasAnyPrice = data.totalRecomendado > 0;

  return (
    <div className="space-y-3">
      {/* Resumo consolidado */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Coins className="w-3 h-3" /> Total recomendado</div>
          <div className="text-sm font-bold text-foreground">{formatMoneyBR(data.totalRecomendado)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><TrendingDown className="w-3 h-3" /> Economia est.</div>
          <div className="text-sm font-bold text-success">{formatMoneyBR(data.economia)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Users className="w-3 h-3" /> Fornecedores</div>
          <div className="text-sm font-bold text-foreground">{data.suppliersUsed}</div>
        </div>
      </div>

      {!hasAnyPrice && (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhum preço registrado ainda — preencha a aba Respostas.</p>
      )}

      {/* Tabela comparativa */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/60">
              <th className="text-left font-medium text-muted-foreground px-2 py-1.5 sticky left-0 bg-secondary/60 min-w-[130px]">Item</th>
              {fornecedores.map(f => (
                <th key={f.id} className="text-right font-medium text-foreground px-2 py-1.5 min-w-[90px] truncate">{f.supplier_nome_snapshot}</th>
              ))}
              <th className="text-right font-medium text-muted-foreground px-2 py-1.5 min-w-[60px]">Var.</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.it.id} className="border-t border-border">
                <td className="px-2 py-1 sticky left-0 bg-card">
                  <div className="text-foreground truncate max-w-[130px]" title={row.it.produto_nome_snapshot}>{row.it.produto_nome_snapshot}</div>
                  <div className="text-[10px] text-muted-foreground">{row.qty} {row.it.purchase_unit_snapshot || row.it.unidade_snapshot || 'UN'}</div>
                </td>
                {row.prices.map(p => {
                  const isBest = row.bestFornId === p.fornId && p.price != null;
                  return (
                    <td key={p.fornId} className={`text-right px-2 py-1 ${isBest ? 'bg-success/10 font-semibold text-success' : 'text-foreground'}`}>
                      {p.unavailable ? <span className="text-destructive text-[10px]">indisp.</span>
                        : p.price == null ? <span className="text-muted-foreground/50">—</span>
                        : formatMoneyBR(p.price)}
                    </td>
                  );
                })}
                <td className="text-right px-2 py-1 text-muted-foreground">
                  {row.variacao > 0 ? `${row.variacao.toFixed(0)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/40">
              <td className="px-2 py-1.5 sticky left-0 bg-secondary/40 font-medium text-foreground">Subtotal (melhor)</td>
              {fornecedores.map(f => (
                <td key={f.id} className="text-right px-2 py-1.5 font-semibold text-foreground">{formatMoneyBR(data.subtotal[f.id])}</td>
              ))}
              <td />
            </tr>
            <tr className="bg-secondary/40">
              <td className="px-2 py-1 sticky left-0 bg-secondary/40 text-[10px] text-muted-foreground">Pedido mínimo</td>
              {fornecedores.map(f => {
                const sub = data.subtotal[f.id];
                const min = Number(f.pedido_minimo_snapshot) || 0;
                const used = sub > 0;
                const meets = sub >= min;
                return (
                  <td key={f.id} className="text-right px-2 py-1 text-[10px]">
                    {min > 0 ? (
                      <span className={`inline-flex items-center gap-0.5 ${!used ? 'text-muted-foreground/50' : meets ? 'text-success' : 'text-warning'}`}>
                        {used && (meets ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />)}
                        {formatMoneyBR(min)}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {data.itemsSemResposta.length > 0 && (
        <div className="flex items-start gap-2 text-[11px] text-warning bg-warning/10 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Sem preço: {data.itemsSemResposta.slice(0, 6).join(', ')}{data.itemsSemResposta.length > 6 ? `… (+${data.itemsSemResposta.length - 6})` : ''}</span>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Subtotal assume compra de cada item no fornecedor mais barato disponível. A sugestão inteligente com pedido mínimo e realocação chega na Fase 4.
      </p>
    </div>
  );
}
