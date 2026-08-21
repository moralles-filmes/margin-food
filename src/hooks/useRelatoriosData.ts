import { useState, useEffect, useCallback, useRef } from 'react';
import { PeriodRange } from '@/components/PeriodFilter';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// ── Server-side KPIs (CMV + Estoque) ──
interface ServerKpis {
  faturamento_total: number;
  custo_consumido_total: number;
  custo_salmon: number;
  cmv_geral_percent: number | null;
  cmv_salmon_percent: number | null;
  margem_bruta_percent: number | null;
  impacto_salmon_percent: number | null;
  meta_cmv: number;
  cmv_por_categoria: { categoria: string; custo_consumido: number; percent_do_total: number }[];
  tendencia_cmv_3_meses: { ano: number; mes: number; faturamento: number; custo: number; cmv_percent: number }[];
  valor_total_estoque: number;
  itens_abaixo_minimo_count: number;
  itens_abaixo_minimo_top5: { produto_id: string; nome: string; saldo: number; minimo: number }[];
  maiores_perdas_top5: { produto_id: string; nome: string; perda_kg: number; perda_valor: number }[];
  ruptura_percent: number;
  giro_estoque: number;
  cobertura_semanas: number;
  parado_percent: number;
  parado_count: number;
  total_ativos: number;
  perdas_kg: number;
  perdas_valor: number;
  // Salmon-specific
  salmon_bruto_kg: number;
  salmon_limpo_kg: number;
  salmon_valor_estoque: number;
  salmon_compras_valor: number;
  salmon_compras_kg: number;
}

// ── Server-side Tendência ──
interface TendenciaData {
  custo_por_semana: { label: string; custo: number }[];
  cmv_por_semana: { label: string; faturamento: number; custo: number; cmv: number | null }[];
  comparativo_mes: {
    current: { compras_valor: number; consumo_valor: number; faturamento: number; perdas_valor: number };
    previous: { compras_valor: number; consumo_valor: number; faturamento: number; perdas_valor: number };
  };
  volatilidade: { stddev_salmon: number; stddev_geral: number };
  heatmap_dia_semana: { dow: number; label: string; custo_total: number; consumo_qtd: number; perdas_valor: number }[];
}

// ── Server-side Compras ──
interface ComprasServerFornecedor {
  supplier_name: string;
  total_orders: number;
  total_items: number;
  total_value: number;
  ticket_medio: number;
  freq_semanal: number;
  preco_medio_por_kg: number | null;
  variacao_preco_percent: number | null;
  impacto_financeiro_percent: number;
}

interface ComprasData {
  fonte: string;
  total_compras_periodo: number;
  total_fornecedores_ativos: number;
  fornecedores: ComprasServerFornecedor[];
}

// ── Server-side Score ──
interface ScoreSupplier {
  supplier_id: string;
  supplier_name: string;
  score_total: number;
  confidence: number;
  price_score: number;
  stability_score: number;
  delivery_score: number;
  impact_score: number;
  total_orders: number;
  total_items: number;
  total_value: number;
  avg_unit_cost: number;
  stddev_cost: number;
}

interface ScoreData {
  suppliers: ScoreSupplier[];
  projecao_4_semanas: { week_number: number; week_start: string; projected_cost: number; projected_cmv_percent: number | null; scenario: string }[];
  custo_consumido: number;
  faturamento: number;
  meta_cmv: number;
  avg_weekly_cost: number;
  perdas_valor: number;
}

// ── Server-side Simulation ──
interface SimulationResult {
  novo_cmv_percent: number | null;
  nova_margem_percent: number | null;
  economia_mensal_estimativa: number;
  novo_custo_consumido: number;
  nova_margem_abs: number | null;
  faturamento: number;
  meta_cmv: number;
  projecao_4_semanas: { week_number: number; week_start: string; projected_cost: number; projected_cmv_percent: number | null; scenario: string }[];
  explain: { variavel: string; [key: string]: unknown }[];
}

export interface RelatoriosData {
  // Block 1: CMV (server-side)
  cmvGeral: number | null;
  cmvSalmao: number | null;
  cmvPorCategoria: { categoria: string; cmv: number; custo: number }[];
  margemBruta: number | null;
  impactoSalmao: number | null;
  metaCMV: number;
  tendenciaCMV: { mes: string; cmv: number }[];
  custoConsumido: number;
  faturamento: number;

  // Block 2: Eficiência Estoque (server-side)
  giroEstoque: number;
  coberturaSemanas: number;
  rupturaPercent: number;
  perdasKg: number;
  perdasR$: number;
  valorTotalEstoque: number;
  estoqueParadoPercent: number;
  topMenorGiro: { nome: string; giro: number }[];
  topMaiorPerda: { nome: string; perda: number }[];
  itensAbaixoMinimo: { nome: string; saldo: number; minimo: number }[];
  // Salmon stock
  salmonBrutoKg: number;
  salmonLimpoKg: number;
  salmonValorEstoque: number;
  salmonComprasValor: number;
  salmonComprasKg: number;

  // Block 3: Inteligência Compras (server-side)
  fornecedorStats: {
    nome: string;
    ticketMedio: number;
    freqSemanal: number;
    precoMedio: number;
    variacaoPreco: number;
    competitividade: number;
    economiaPotencial: number;
    impactoFinanceiro: number;
  }[];

  // Block 4: Tendência (server-side)
  custoSemanal: { semana: string; custo: number }[];
  cmvSemanal: { semana: string; cmv: number }[];
  comparativoMes: { label: string; atual: number; anterior: number }[];
  volatilidade: number;
  heatmapDiaSemana: { dia: string; valor: number }[];

  // Block 5: Score (server-side)
  scoreSuppliers: ScoreSupplier[];
  projecao4Semanas: number;
  projecaoAlerta: boolean;
  projecaoSemanas: { week_number: number; projected_cost: number; projected_cmv_percent: number | null; scenario: string }[];

  // Block 5b: Simulation (server-side)
  simulationResult: SimulationResult | null;
  simulationLoading: boolean;
  simulationError: string | null;
  runSimulation: (params: { reduzir_perdas_percent?: number; reduzir_consumo_percent?: number; target_cmv_percent?: number }) => void;

  // Loading/error
  serverLoading: boolean;
  serverError: string | null;
  tendenciaLoading: boolean;
  tendenciaError: string | null;
  comprasLoading: boolean;
  comprasError: string | null;
  scoreLoading: boolean;
  scoreError: string | null;
}

const MONTH_NAMES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function useRelatoriosData(period: PeriodRange): RelatoriosData {
  // Server-side KPIs
  const [serverKpis, setServerKpis] = useState<ServerKpis | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  // Server-side Tendência
  const [tendenciaData, setTendenciaData] = useState<TendenciaData | null>(null);
  const [tendenciaLoading, setTendenciaLoading] = useState(true);
  const [tendenciaError, setTendenciaError] = useState<string | null>(null);

  // Server-side Compras
  const [comprasData, setComprasData] = useState<ComprasData | null>(null);
  const [comprasLoading, setComprasLoading] = useState(true);
  const [comprasError, setComprasError] = useState<string | null>(null);

  // Server-side Score
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Server-side Simulation
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const pStart = format(period.start, 'yyyy-MM-dd');
  const pEnd = format(period.end, 'yyyy-MM-dd');

  // Fetch all 4 RPCs in parallel when period changes
  useEffect(() => {
    let cancelled = false;

    setServerLoading(true);
    setServerError(null);
    setTendenciaLoading(true);
    setTendenciaError(null);
    setComprasLoading(true);
    setComprasError(null);
    setScoreLoading(true);
    setScoreError(null);
    setSimulationResult(null);

    // KPIs (guarded wrapper)
    supabase.rpc('_relatorios_kpis_guarded' as any, { p_start: pStart, p_end: pEnd })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) { setServerError(error.message); } else { setServerKpis(data as unknown as ServerKpis); }
        setServerLoading(false);
      });

    // Tendência (guarded wrapper)
    supabase.rpc('_relatorios_tendencia_guarded' as any, { p_start: pStart, p_end: pEnd })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) { setTendenciaError(error.message); } else { setTendenciaData(data as unknown as TendenciaData); }
        setTendenciaLoading(false);
      });

    // Compras (guarded wrapper)
    supabase.rpc('_relatorios_compras_guarded' as any, { p_start: pStart, p_end: pEnd })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) { setComprasError(error.message); } else { setComprasData(data as unknown as ComprasData); }
        setComprasLoading(false);
      });

    // Score (guarded wrapper)
    supabase.rpc('_relatorios_score_guarded' as any, { p_start: pStart, p_end: pEnd })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) { setScoreError(error.message); } else { setScoreData(data as unknown as ScoreData); }
        setScoreLoading(false);
      });

    return () => { cancelled = true; };
  }, [pStart, pEnd]);

  // Simulation callback with debounce ref
  const simTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSimulation = useCallback((params: { reduzir_perdas_percent?: number; reduzir_consumo_percent?: number; target_cmv_percent?: number }) => {
    if (simTimerRef.current) clearTimeout(simTimerRef.current);
    simTimerRef.current = setTimeout(() => {
      setSimulationLoading(true);
      setSimulationError(null);
      supabase.rpc('_simulate_relatorios_guarded' as any, {
        p_start: pStart,
        p_end: pEnd,
        p_params: params,
      }).then(({ data, error }) => {
        if (error) { setSimulationError(error.message); } else { setSimulationResult(data as unknown as SimulationResult); }
        setSimulationLoading(false);
      });
    }, 400);
  }, [pStart, pEnd]);

  const sk = serverKpis;
  const td = tendenciaData;
  const sd = scoreData;

  const custoSemanal = (td?.custo_por_semana ?? []).map(w => ({ semana: w.label, custo: w.custo }));
  const cmvSemanal = (td?.cmv_por_semana ?? []).map(w => ({ semana: w.label, cmv: w.cmv ?? 0 }));
  const comparativoMes = td ? [
    { label: 'Compras', atual: td.comparativo_mes.current.compras_valor, anterior: td.comparativo_mes.previous.compras_valor },
    { label: 'Consumo', atual: td.comparativo_mes.current.consumo_valor, anterior: td.comparativo_mes.previous.consumo_valor },
    { label: 'Faturamento', atual: td.comparativo_mes.current.faturamento, anterior: td.comparativo_mes.previous.faturamento },
    { label: 'Perda R$', atual: td.comparativo_mes.current.perdas_valor, anterior: td.comparativo_mes.previous.perdas_valor },
  ] : [];
  const volatilidade = td?.volatilidade?.stddev_geral ?? 0;
  const heatmapDiaSemana = (td?.heatmap_dia_semana ?? []).map(h => ({ dia: h.label, valor: h.custo_total }));

  // Map compras fornecedores to fornecedorStats shape
  const fornecedorStats = (comprasData?.fornecedores ?? []).map(f => ({
    nome: f.supplier_name,
    ticketMedio: f.ticket_medio,
    freqSemanal: f.freq_semanal,
    precoMedio: f.preco_medio_por_kg ?? 0,
    variacaoPreco: f.variacao_preco_percent ?? 0,
    competitividade: 0,
    economiaPotencial: 0,
    impactoFinanceiro: f.total_value,
  }));

  // Projection from score data
  const projecao4Semanas = (sd?.projecao_4_semanas ?? []).reduce((s, w) => s + (w.projected_cost ?? 0), 0);
  const projecaoAlerta = (sd?.meta_cmv ?? 35) > 0 && sd?.projecao_4_semanas?.some(w => w.projected_cmv_percent != null && w.projected_cmv_percent > (sd?.meta_cmv ?? 35));

  return {
    cmvGeral: sk?.cmv_geral_percent ?? null,
    cmvSalmao: sk?.cmv_salmon_percent ?? null,
    cmvPorCategoria: (sk?.cmv_por_categoria ?? []).map(c => ({ categoria: c.categoria, custo: c.custo_consumido, cmv: c.percent_do_total })),
    margemBruta: sk?.margem_bruta_percent ?? null,
    impactoSalmao: sk?.impacto_salmon_percent ?? null,
    metaCMV: sk?.meta_cmv ?? 35,
    tendenciaCMV: (sk?.tendencia_cmv_3_meses ?? []).map(t => ({ mes: MONTH_NAMES[t.mes] || `M${t.mes}`, cmv: t.cmv_percent })),
    custoConsumido: sk?.custo_consumido_total ?? 0,
    faturamento: sk?.faturamento_total ?? 0,
    giroEstoque: sk?.giro_estoque ?? 0,
    coberturaSemanas: sk?.cobertura_semanas ?? 0,
    rupturaPercent: sk?.ruptura_percent ?? 0,
    perdasKg: sk?.perdas_kg ?? 0,
    'perdasR$': sk?.perdas_valor ?? 0,
    valorTotalEstoque: sk?.valor_total_estoque ?? 0,
    estoqueParadoPercent: sk?.parado_percent ?? 0,
    topMenorGiro: [],
    topMaiorPerda: (sk?.maiores_perdas_top5 ?? []).map(p => ({ nome: p.nome, perda: p.perda_valor })),
    itensAbaixoMinimo: (sk?.itens_abaixo_minimo_top5 ?? []).map(i => ({ nome: i.nome, saldo: i.saldo, minimo: i.minimo })),
    salmonBrutoKg: sk?.salmon_bruto_kg ?? 0,
    salmonLimpoKg: sk?.salmon_limpo_kg ?? 0,
    salmonValorEstoque: sk?.salmon_valor_estoque ?? 0,
    salmonComprasValor: sk?.salmon_compras_valor ?? 0,
    salmonComprasKg: sk?.salmon_compras_kg ?? 0,
    fornecedorStats,
    custoSemanal, cmvSemanal, comparativoMes, volatilidade, heatmapDiaSemana,
    scoreSuppliers: sd?.suppliers ?? [],
    projecao4Semanas,
    projecaoAlerta: projecaoAlerta ?? false,
    projecaoSemanas: sd?.projecao_4_semanas ?? [],
    simulationResult,
    simulationLoading,
    simulationError,
    runSimulation,
    serverLoading, serverError, tendenciaLoading, tendenciaError, comprasLoading, comprasError, scoreLoading, scoreError,
  };
}
