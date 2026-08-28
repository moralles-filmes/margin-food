import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Check, AlertTriangle, Save, Wand2, RotateCcw, ArrowRight, Truck, Coins, TrendingDown, Users, Sparkles } from 'lucide-react';
import { formatMoneyBR } from '@/lib/formatters';
import { mapCotacaoError } from '@/lib/cotacaoErrors';
import {
  buildOptimizerInput, optimizeCotacao, rebuildFromAssignment, SCENARIO_LABELS,
  type ScenarioType, type Scenario,
} from '@/domain/compras/cotacaoOptimizer';
import type { useCotacoesStore } from '@/hooks/useCotacoesStore';
import type { CotacaoItem, CotacaoFornecedor, CotacaoResposta } from '@/types/cotacao';

const ORDER: ScenarioType[] = ['OTIMIZADA_PEDIDO_MINIMO', 'MENOR_PRECO', 'MENOS_FORNECEDORES', 'CUSTO_BENEFICIO'];

interface Props {
  cotacaoId: string;
  itens: CotacaoItem[];
  fornecedores: CotacaoFornecedor[];
  respostas: CotacaoResposta[];
  store: ReturnType<typeof useCotacoesStore>;
  canEdit: boolean;
  onSaved: () => void;
}

export default function CotacaoSugestaoInteligente({ cotacaoId, itens, fornecedores, respostas, store, canEdit, onSaved }: Props) {
  const input = useMemo(() => buildOptimizerInput(itens, fornecedores, respostas), [itens, fornecedores, respostas]);
  const set = useMemo(() => optimizeCotacao(input), [input]);
  const [selectedType, setSelectedType] = useState<ScenarioType>(() => set.recomendado);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [iaText, setIaText] = useState<string | null>(null);
  const [iaLoading, setIaLoading] = useState(false);

  const base = set.scenarios[selectedType];
  const overridden = Object.keys(overrides).length > 0;
  const scenario: Scenario | undefined = useMemo(() => {
    if (!base) return undefined;
    if (!overridden) return base;
    return rebuildFromAssignment(input, { ...base.assignment, ...overrides });
  }, [base, overridden, overrides, input]);

  const itemNome = (id: string) => itens.find(i => i.id === id)?.produto_nome_snapshot ?? id;
  const availForItem = (itemId: string) =>
    fornecedores.filter(f => {
      const q = input.quotes[itemId]?.[f.id];
      return q && q.available && Number.isFinite(q.price);
    });

  const pickScenario = (t: ScenarioType) => { setSelectedType(t); setOverrides({}); };

  const handleSave = async () => {
    if (!scenario || scenario.suppliersUsed === 0) { toast.error('Nenhuma distribuição para salvar'); return; }
    const selecoes = Object.entries(scenario.assignment).map(([itemId, supplierId]) => ({
      cotacao_fornecedor_id: supplierId, cotacao_item_id: itemId,
    }));
    setSaving(true);
    try {
      await store.saveSugestao(cotacaoId, {
        tipo: overridden ? 'MANUAL' : selectedType,
        total_estimado: scenario.totalGeral,
        economia_estimada: scenario.economia,
        dados_json: scenario as unknown,
        selecoes,
      });
      toast.success('Sugestão salva! Cotação em análise.');
      onSaved();
    } catch (err) {
      console.error('[CotacaoSugestaoInteligente.handleSave]', err);
      toast.error(mapCotacaoError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAnalisarIA = async () => {
    setIaLoading(true);
    try {
      const res = await store.runIA({ cotacao_id: cotacaoId, task: 'analise_precos', allow_competitor_context: true });
      if (res?.success && res.text) setIaText(res.text);
      else toast.error(res?.message ?? 'Não foi possível analisar');
    } catch (err: any) {
      console.error('[CotacaoSugestaoInteligente.handleAnalisarIA]', err);
      toast.error(err?.message?.includes('PERMISSION') ? 'Sem permissão para usar a IA' : 'Erro ao analisar com IA');
    } finally {
      setIaLoading(false);
    }
  };

  if (fornecedores.length === 0 || itens.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Adicione itens e fornecedores para gerar sugestões.</p>;
  }
  const anyPrice = respostas.some(r => r.preco_unitario != null);
  if (!anyPrice) {
    return <p className="text-xs text-muted-foreground text-center py-6">Registre preços na aba Respostas para gerar a sugestão.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Seletor de cenários */}
      <div className="grid grid-cols-2 gap-2">
        {ORDER.map(t => {
          const sc = set.scenarios[t];
          if (!sc) return null;
          const active = selectedType === t && !overridden;
          return (
            <button key={t} onClick={() => pickScenario(t)}
              className={`text-left rounded-lg border p-2.5 transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/40'}`}>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                {t === set.recomendado && <Wand2 className="w-3 h-3 text-primary" />}
                {SCENARIO_LABELS[t]}
              </div>
              <div className="text-sm font-bold text-foreground mt-0.5">{formatMoneyBR(sc.totalGeral)}</div>
              <div className="text-[10px] text-muted-foreground">{sc.suppliersUsed} forn. • economia {formatMoneyBR(sc.economia)}</div>
            </button>
          );
        })}
      </div>

      {scenario && (
        <>
          {/* Resumo consolidado */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground"><Coins className="w-3 h-3" /> Total</div>
              <div className="text-sm font-bold text-foreground">{formatMoneyBR(scenario.totalGeral)}</div>
              {scenario.totalFrete > 0 && <div className="text-[9px] text-muted-foreground">+ frete {formatMoneyBR(scenario.totalFrete)}</div>}
            </div>
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground"><TrendingDown className="w-3 h-3" /> Economia</div>
              <div className="text-sm font-bold text-success">{formatMoneyBR(scenario.economia)}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-2">
              <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground"><Users className="w-3 h-3" /> Fornecedores</div>
              <div className="text-sm font-bold text-foreground">{scenario.suppliersUsed}</div>
            </div>
          </div>

          {overridden && (
            <div className="flex items-center justify-between text-[11px] text-warning bg-warning/10 rounded-lg px-2.5 py-1.5">
              <span className="flex items-center gap-1"><Wand2 className="w-3 h-3" /> Ajuste manual aplicado</span>
              <button onClick={() => setOverrides({})} className="flex items-center gap-1 hover:underline"><RotateCcw className="w-3 h-3" /> Restaurar cenário</button>
            </div>
          )}

          {/* Distribuição por fornecedor */}
          <div className="space-y-2">
            {scenario.perSupplier.map(s => (
              <div key={s.supplierId} className="bg-card border border-border rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-foreground truncate">{s.nome}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${s.minOrder <= 0 || s.meetsMin ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                    {s.minOrder <= 0 ? 'sem mínimo' : s.meetsMin ? <><Check className="w-3 h-3" /> bate mínimo</> : <><AlertTriangle className="w-3 h-3" /> abaixo do mínimo</>}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {s.lines.map(l => (
                    <div key={l.itemId} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground truncate">{l.nome} <span className="text-muted-foreground/60">×{l.qty}</span></span>
                      <span className="text-foreground shrink-0">{formatMoneyBR(l.price)} = <span className="font-medium">{formatMoneyBR(l.subtotal)}</span></span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/60 text-[11px]">
                  <span className="text-muted-foreground">
                    Subtotal {formatMoneyBR(s.subtotal)}{s.frete > 0 && <span className="inline-flex items-center gap-0.5 ml-1"><Truck className="w-3 h-3" /> {formatMoneyBR(s.frete)}</span>}
                    {s.minOrder > 0 && <span className="ml-1">• mín. {formatMoneyBR(s.minOrder)}</span>}
                  </span>
                  <span className="font-bold text-foreground">{formatMoneyBR(s.total)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Realocações vs menor preço */}
          {scenario.reallocations.length > 0 && (
            <div className="bg-secondary/40 rounded-lg p-2.5">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Realocações (vs. menor preço)</div>
              <div className="space-y-0.5">
                {scenario.reallocations.map(r => (
                  <div key={r.itemId} className="flex items-center gap-1 text-[11px] text-foreground">
                    <span className="truncate flex-1">{r.nome}: {r.fromNome} <ArrowRight className="w-3 h-3 inline" /> {r.toNome}</span>
                    <span className={`shrink-0 ${r.delta > 0 ? 'text-warning' : 'text-success'}`}>
                      {r.delta > 0 ? '+' : ''}{formatMoneyBR(r.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scenario.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /><span>{w}</span>
            </div>
          ))}
          {scenario.itemsSemResposta.length > 0 && (
            <div className="text-[11px] text-muted-foreground">Sem preço: {scenario.itemsSemResposta.map(i => i.nome).join(', ')}</div>
          )}

          {/* Ajuste manual */}
          {canEdit && (
            <div>
              <button onClick={() => setShowAdjust(v => !v)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> {showAdjust ? 'Ocultar' : 'Ajustar'} fornecedor por item
              </button>
              {showAdjust && (
                <div className="mt-2 space-y-1">
                  {itens.map(it => {
                    const opts = availForItem(it.id);
                    const cur = scenario.assignment[it.id] ?? '';
                    return (
                      <div key={it.id} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 truncate text-foreground">{itemNome(it.id)}</span>
                        <select value={cur} disabled={opts.length === 0}
                          onChange={e => setOverrides(prev => ({ ...prev, [it.id]: e.target.value }))}
                          className="h-7 text-[11px] bg-secondary border border-border rounded px-1 text-foreground max-w-[160px]">
                          {opts.length === 0 && <option value="">sem preço</option>}
                          {opts.map(f => (
                            <option key={f.id} value={f.id}>
                              {f.supplier_nome_snapshot} — {formatMoneyBR(input.quotes[it.id]?.[f.id]?.price ?? 0)}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canEdit && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando…' : 'Salvar sugestão'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Análise com IA (anota — não altera os números do otimizador) */}
      <div className="border-t border-border/60 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" /> Análise com IA
          </span>
          <button onClick={handleAnalisarIA} disabled={iaLoading}
            className="text-[10px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
            <Sparkles className={`w-3 h-3 ${iaLoading ? 'animate-pulse' : ''}`} /> {iaLoading ? 'Analisando…' : iaText ? 'Refazer análise' : 'Analisar preços'}
          </button>
        </div>
        {iaText ? (
          <div className="bg-secondary/40 rounded-lg p-2.5 text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">{iaText}</div>
        ) : (
          <p className="text-[10px] text-muted-foreground">A IA comenta a matriz de preços (não altera os números do otimizador). Requer chave de IA em Configurações → Integrações.</p>
        )}
      </div>
    </div>
  );
}
