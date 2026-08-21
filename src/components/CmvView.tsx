import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useCan, useModuleAccess } from '@/permissions/hooks';
import { startOfMonth, endOfMonth } from 'date-fns';
import { formatInBR, fmtBRL, parseLocalDate, formatPercentBR } from '@/lib/formatters';
import { formatDateBR } from '@/lib/datetime';

const COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--accent))',
];

function fmt(v: number) {
  return fmtBRL(v);
}

import { AlertTriangle, Calculator, Lightbulb } from 'lucide-react';
import { DecimalInput } from '@/components/ui/decimal-input';
import { toast } from 'sonner';

import CmvFiltersBar from '@/components/cmv/CmvFiltersBar';
import CmvKpis from '@/components/cmv/CmvKpis';
import CmvTabs from '@/components/cmv/CmvTabs';
import CmvMetasDialog from '@/components/cmv/CmvMetasDialog';
import { cacheGet, cacheSet, cacheInvalidate } from '@/components/cmv/cmvCache';
import type { CmvResult, MetaCmv, RankingItem } from '@/components/cmv/types';

export default function CmvView() {
  const { visibleSubtabs } = useModuleAccess('cmv');
  const canEditSemanal = useCan('cmv:semanal:edit');

  // Filters
  const [dataInicio, setDataInicio] = useState(formatDateBR(startOfMonth(new Date())));
  const [dataFim, setDataFim] = useState(formatDateBR(endOfMonth(new Date())));
  const [metodo, setMetodo] = useState<'ledger' | 'inventario'>('ledger');
  const [escopo, setEscopo] = useState<'geral' | 'salmao' | 'tudo'>('tudo');
  const [filterSetor, setFilterSetor] = useState('all');

  // Data
  const [cmvData, setCmvData] = useState<CmvResult | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [meta, setMeta] = useState<MetaCmv | null>(null);
  const [loading, setLoading] = useState(false);
  const [rankingOffset, setRankingOffset] = useState(0);
  const [rankingHasMore, setRankingHasMore] = useState(false);
  const [rankingLoadingMore, setRankingLoadingMore] = useState(false);
  const [rankingTotalCount, setRankingTotalCount] = useState(0);

  // Error states
  const [errorRanking, setErrorRanking] = useState<string | null>(null);
  const [errorMeta, setErrorMeta] = useState<string | null>(null);

  // Meta edit
  const [metaDialog, setMetaDialog] = useState(false);
  const [metaForm, setMetaForm] = useState({ geral: '35', salmao: '15', total: '35', amarelo: '3', vermelho: '6' });

  // Simulation
  const [simDesperdicioReduce, setSimDesperdicioReduce] = useState('');
  const [simCustoReduce, setSimCustoReduce] = useState('');

  const mesAno = useMemo(() => formatInBR(parseLocalDate(dataInicio), 'yyyy-MM'), [dataInicio]);

  const fetchCmv = useCallback(async () => {
    const cacheParams = { data_inicio: dataInicio, data_fim: dataFim, metodo, escopo, setor: filterSetor };
    const cached = cacheGet<CmvResult>('calcular_cmv', cacheParams);
    if (cached) {
      setCmvData(cached);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cmv', {
        body: { action: 'calcular_cmv', data_inicio: dataInicio, data_fim: dataFim, metodo, escopo, setor: filterSetor !== 'all' ? filterSetor : undefined },
      });
      if (error) throw error;
      setCmvData(data);
      cacheSet('calcular_cmv', cacheParams, data, 60);
    } catch (e: any) {
      toast.error('Erro ao calcular CMV: ' + (e.message || ''));
    }
    setLoading(false);
  }, [dataInicio, dataFim, metodo, escopo, filterSetor]);

  const fetchRanking = useCallback(async (offset = 0, append = false) => {
    const cacheParams = { data_inicio: dataInicio, data_fim: dataFim, escopo, offset };
    if (!append) {
      const cached = cacheGet<{ ranking: RankingItem[]; next_offset: number | null; total_count: number }>('get_ranking', cacheParams);
      if (cached) {
        setRanking(cached.ranking);
        setRankingHasMore(cached.next_offset != null);
        setRankingOffset(cached.next_offset ?? cached.ranking.length);
        setRankingTotalCount(cached.total_count);
        setErrorRanking(null);
        return;
      }
    }
    setErrorRanking(null);
    if (offset > 0) setRankingLoadingMore(true);
    try {
      const { data, error } = await supabase.functions.invoke('cmv', {
        body: { action: 'get_ranking_itens', data_inicio: dataInicio, data_fim: dataFim, limit: 20, offset, escopo },
      });
      if (error) throw error;
      const rows = data?.ranking || [];
      if (append) {
        setRanking(prev => [...prev, ...rows]);
      } else {
        setRanking(rows);
        cacheSet('get_ranking', cacheParams, { ranking: rows, next_offset: data?.next_offset, total_count: data?.total_count ?? 0 }, 30);
      }
      setRankingHasMore(data?.next_offset != null);
      setRankingOffset(data?.next_offset ?? offset + rows.length);
      setRankingTotalCount(data?.total_count ?? 0);
    } catch (e: any) {
      const msg = e.message || 'Erro desconhecido';
      setErrorRanking(msg);
      toast.error('Falha ao carregar ranking de itens: ' + msg);
    } finally {
      setRankingLoadingMore(false);
    }
  }, [dataInicio, dataFim, escopo]);

  const loadMoreRanking = useCallback(() => {
    if (rankingHasMore && !rankingLoadingMore) {
      fetchRanking(rankingOffset, true);
    }
  }, [rankingHasMore, rankingLoadingMore, rankingOffset, fetchRanking]);

  const fetchMeta = useCallback(async () => {
    const cacheParams = { mes_ano: mesAno };
    const cached = cacheGet<any>('get_metas', cacheParams);
    if (cached !== null) {
      setMeta(cached._empty ? null : cached);
      setErrorMeta(null);
      return;
    }
    setErrorMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke('cmv', {
        body: { action: 'get_metas', mes_ano: mesAno },
      });
      if (error) throw error;
      const metas = data?.metas || [];
      const result = metas.length > 0 ? metas[0] : null;
      setMeta(result);
      cacheSet('get_metas', cacheParams, result ?? { _empty: true }, 30);
    } catch (e: any) {
      const msg = e.message || 'Erro desconhecido';
      setErrorMeta(msg);
      toast.error('Falha ao carregar metas: ' + msg);
    }
  }, [mesAno]);

  useEffect(() => {
    fetchCmv();
    fetchRanking(0, false);
    fetchMeta();
  }, [fetchCmv, fetchRanking, fetchMeta]);

  const saveMeta_ = async () => {
    try {
      const { error } = await supabase.functions.invoke('cmv', {
        body: {
          action: 'save_meta', mes_ano: mesAno,
          meta_cmv_geral: Number(metaForm.geral), meta_cmv_salmao: Number(metaForm.salmao),
          meta_cmv_total: Number(metaForm.total), alerta_amarelo_percent: Number(metaForm.amarelo),
          alerta_vermelho_percent: Number(metaForm.vermelho),
        },
      });
      if (error) throw error;
      toast.success('Meta salva');
      setMetaDialog(false);
      cacheInvalidate('get_metas');
      cacheInvalidate('calcular_cmv');
      fetchMeta();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar meta');
    }
  };

  const getMetaStatus = (valor: number, metaVal: number) => {
    if (!meta) return 'neutral';
    const diff = valor - metaVal;
    if (diff <= 0) return 'ok';
    if (diff <= meta.alerta_amarelo_percent) return 'warning';
    return 'danger';
  };

  const simResult = useMemo(() => {
    if (!cmvData || cmvData.faturamento <= 0) return null;
    const redDesp = Number(simDesperdicioReduce) || 0;
    const redCusto = Number(simCustoReduce) || 0;
    const newCusto = cmvData.custoTotal * (1 - redDesp / 100) * (1 - redCusto / 100);
    const newCmv = (newCusto / cmvData.faturamento) * 100;
    const economia = cmvData.custoTotal - newCusto;
    return {
      newCmv, 
      economia, 
      newMargem: 100 - newCmv
    };
  }, [cmvData, simDesperdicioReduce, simCustoReduce]);

  const insights = useMemo(() => {
    if (!cmvData) return [];
    const msgs: string[] = [];
    if (cmvData.cmvTotalPct > 35) msgs.push('CMV acima de 35%. Revise itens de maior impacto e porcionamento.');
    if (cmvData.impactoSalmao > 30) msgs.push(`Salmão representa ${cmvData.impactoSalmao}% do custo total. Avaliar consumo por cliente.`);
    if (cmvData.cmvPorCategoria.length > 0) {
      const top = cmvData.cmvPorCategoria[0];
      msgs.push(`Categoria "${top.categoria}" é a maior responsável pelo custo (${top.percentCmv}%).`);
    }
    if (meta && cmvData.cmvTotalPct > meta.meta_cmv_total) {
      msgs.push(`CMV ${formatPercentBR(cmvData.cmvTotalPct)} está acima da meta de ${formatPercentBR(meta.meta_cmv_total)}. Ação recomendada.`);
    }
    return msgs;
  }, [cmvData, meta]);

  const fmt = (v: number) => fmtBRL(v);

  return (
    <div className="space-y-6">
      <CmvFiltersBar
        dataInicio={dataInicio} dataFim={dataFim} metodo={metodo} escopo={escopo}
        filterSetor={filterSetor} loading={loading}
        onDataInicioChange={setDataInicio} onDataFimChange={setDataFim}
        onMetodoChange={setMetodo} onEscopoChange={setEscopo}
        onSetorChange={setFilterSetor} onCalcular={fetchCmv}
      />

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          💡 O faturamento diário agora é gerenciado em <strong>Financeiro → Fechamento de Caixa</strong>. O CMV já puxa automaticamente dessa fonte.
        </CardContent>
      </Card>

      {cmvData && (
        <CmvKpis
          cmvData={cmvData}
          getMetaStatus={getMetaStatus}
          metaGeralVal={meta?.meta_cmv_geral}
          metaSalmaoVal={meta?.meta_cmv_salmao}
          metaTotalVal={meta?.meta_cmv_total}
        />
      )}

      {cmvData && (
        <CmvMetasDialog
          cmvData={cmvData} meta={meta} errorMeta={errorMeta} mesAno={mesAno}
          canEditSemanal={canEditSemanal} metaDialog={metaDialog} metaForm={metaForm}
          onMetaDialogChange={setMetaDialog} onMetaFormChange={setMetaForm}
          onSaveMeta={saveMeta_} onRetryMeta={fetchMeta} getMetaStatus={getMetaStatus}
        />
      )}

      {!cmvData && errorMeta && (
        <CmvMetasDialog
          cmvData={{ faturamento: 0, custoConsumidoGeral: 0, custoConsumidoSalmao: 0, custoTotal: 0, cmvGeralPct: 0, cmvSalmaoPct: 0, cmvTotalPct: 0, margemBruta: 0, impactoSalmao: 0, metodoUsado: 'ledger', eiValor: 0, efValor: 0, totalEntradas: 0, cmvPorCategoria: [], cmvPorSetor: [], cmvSemanal: [] }}
          meta={null} errorMeta={errorMeta} mesAno={mesAno}
          canEditSemanal={canEditSemanal} metaDialog={metaDialog} metaForm={metaForm}
          onMetaDialogChange={setMetaDialog} onMetaFormChange={setMetaForm}
          onSaveMeta={saveMeta_} onRetryMeta={fetchMeta} getMetaStatus={getMetaStatus}
        />
      )}

      {cmvData && (
        <CmvTabs
          cmvData={cmvData} visibleSubtabs={visibleSubtabs}
          ranking={ranking} errorRanking={errorRanking} onRetryRanking={() => fetchRanking(0, false)}
          rankingHasMore={rankingHasMore} rankingLoadingMore={rankingLoadingMore}
          onRankingLoadMore={loadMoreRanking} rankingTotalCount={rankingTotalCount}
        />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-primary" /> CMV Explicado</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length > 0 ? (
              <ul className="space-y-2">
                {insights.map((msg, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Carregue dados para ver insights.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Calculator className="w-4 h-4" /> Simulação Rápida</CardTitle>
            <CardDescription className="text-xs">Simule reduções para ver impacto no CMV</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Reduzir desperdício em (%)</Label>
              <DecimalInput value={simDesperdicioReduce} onValueChange={(raw) => setSimDesperdicioReduce(raw)} maxDecimals={1} placeholder="Ex: 10" />
            </div>
            <div>
              <Label className="text-xs">Reduzir custo Top 5 em (%)</Label>
              <DecimalInput value={simCustoReduce} onValueChange={(raw) => setSimCustoReduce(raw)} maxDecimals={1} placeholder="Ex: 5" />
            </div>
            {simResult && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm"><strong>Novo CMV:</strong> {formatPercentBR(simResult.newCmv)}</p>
                <p className="text-sm"><strong>Economia:</strong> {fmtBRL(simResult.economia)}</p>
                <p className="text-sm"><strong>Nova Margem:</strong> {formatPercentBR(simResult.newMargem)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
