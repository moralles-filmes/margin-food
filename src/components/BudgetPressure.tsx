import { useMemo } from 'react';
import { SalmonEntry, MetaCompraMensal } from '@/types/salmon';
import { todayBR, fmtBRL, formatPercentBR, formatDecimalBR, parseLocalDate } from '@/lib/formatters';
import { getWeeksOfMonth, WeekDef } from './WeeklyBreakdown';
import { Gauge, Activity, ShieldAlert, BarChart3, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const fmtR = (v: number) => fmtBRL(v);

export interface PressureConfig {
  historicoMesesBase: number;       // default 6
  limitForaPadraoPercent: number;   // default 0.15
  limiteConsistenciaBaixa: number;  // default 0.55
  limitePressaoAmarela: number;     // default 1.00
  limitePressaoVermelha: number;    // default 1.15
}

const DEFAULT_CONFIG: PressureConfig = {
  historicoMesesBase: 6,
  limitForaPadraoPercent: 0.15,
  limiteConsistenciaBaixa: 0.55,
  limitePressaoAmarela: 1.00,
  limitePressaoVermelha: 1.15,
};

export interface PressureAnalysis {
  // Historical profile
  historicoSuficiente: boolean;
  mesesUsados: number;
  perfilHistorico: number[]; // percentual per week (W1..W5)
  perfilHistAcum: number[];  // cumulative

  // Pressure
  semanaAtual: number; // 1-based index
  gastoAteSemana: number;
  esperadoAjustado: number;
  pressaoAjustada: number;
  pressaoStatus: 'saudavel' | 'pressionado' | 'critico';

  // Behavior change
  perfilAtual: number[];
  deltas: number[];
  desvioTotal: number;
  foraDoPadrao: boolean;
  maiorDesvioSemana: { label: string; delta: number } | null;

  // Consistency
  indiceConsistencia: number;
  consistenciaStatus: 'alta' | 'media' | 'baixa';

  // Burst risk
  projecaoHist: number;
  projecaoTend: number;
  projecaoFinal: number;
  risco: number;
  riscoStatus: 'baixo' | 'medio' | 'alto';

  metaValor: number;
  gastoMes: number;
  semanasNoMes: number;
}

function getMonthGastoPerWeek(entries: SalmonEntry[], year: number, month: number): { weeks: WeekDef[]; gastos: number[]; total: number } {
  const weeks = getWeeksOfMonth(year, month);
  const gastos = weeks.map(w => {
    return entries.reduce((sum, e) => {
      const d = parseLocalDate(e.date);
      if (d.getFullYear() === year && d.getMonth() === month - 1) {
        const day = d.getDate();
        if (day >= w.startDay && day <= w.endDay) return sum + e.totalValue;
      }
      return sum;
    }, 0);
  });
  return { weeks, gastos, total: gastos.reduce((s, g) => s + g, 0) };
}

function getPreviousMonths(targetMonth: string, count: number): string[] {
  const [year, month] = targetMonth.split('-').map(Number);
  const result: string[] = [];
  let y = year, m = month;
  for (let i = 0; i < count; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    result.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return result;
}

export function calcBudgetPressure(
  entries: SalmonEntry[],
  targetMonth: string,
  metaValor: number,
  config: PressureConfig = DEFAULT_CONFIG,
  extraValue = 0,
  extraWeek?: number, // 1-based week index for simulation
): PressureAnalysis {
  const [year, month] = targetMonth.split('-').map(Number);
  const currentMonthData = getMonthGastoPerWeek(entries, year, month);
  const semanasNoMes = currentMonthData.weeks.length;
  
  // Add extra value for simulation
  const gastos = [...currentMonthData.gastos];
  if (extraValue > 0 && extraWeek && extraWeek >= 1 && extraWeek <= gastos.length) {
    gastos[extraWeek - 1] += extraValue;
  }
  const gastoMes = gastos.reduce((s, g) => s + g, 0);

  // Determine current week
  const todayStr = todayBR(); // yyyy-MM-dd in BR timezone
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const isCurrentMonth = tY === year && tM === month;
  const currentDay = isCurrentMonth ? tD : (new Date(tY, tM - 1, tD) > new Date(year, month, 0) ? 999 : 0);
  
  let semanaAtual = 1;
  for (let i = 0; i < currentMonthData.weeks.length; i++) {
    if (currentDay >= currentMonthData.weeks[i].startDay) semanaAtual = i + 1;
  }

  // Historical profile (last X months)
  const prevMonths = getPreviousMonths(targetMonth, config.historicoMesesBase);
  const monthProfiles: number[][] = [];
  
  for (const pm of prevMonths) {
    const [py, pmm] = pm.split('-').map(Number);
    const mData = getMonthGastoPerWeek(entries, py, pmm);
    if (mData.total > 0) {
      // Normalize to 5 weeks (pad with 0 if needed)
      const profile = Array(5).fill(0);
      for (let i = 0; i < mData.gastos.length; i++) {
        profile[i] = mData.gastos[i] / mData.total;
      }
      monthProfiles.push(profile);
    }
  }

  const historicoSuficiente = monthProfiles.length >= 2;
  const mesesUsados = monthProfiles.length;

  // Average historical profile
  const perfilHistorico = Array(5).fill(0);
  if (mesesUsados > 0) {
    for (let w = 0; w < 5; w++) {
      perfilHistorico[w] = monthProfiles.reduce((s, p) => s + p[w], 0) / mesesUsados;
    }
  }

  // Cumulative historical profile
  const perfilHistAcum = Array(5).fill(0);
  let acum = 0;
  for (let w = 0; w < 5; w++) {
    acum += perfilHistorico[w];
    perfilHistAcum[w] = acum;
  }

  // Gasto acumulado até semana atual
  const gastoAteSemana = gastos.slice(0, semanaAtual).reduce((s, g) => s + g, 0);

  // Pressão ajustada
  const esperadoAjustado = historicoSuficiente && metaValor > 0
    ? metaValor * perfilHistAcum[semanaAtual - 1]
    : (metaValor > 0 ? metaValor * (semanaAtual / semanasNoMes) : 0); // fallback linear

  const pressaoAjustada = esperadoAjustado > 0 ? gastoAteSemana / esperadoAjustado : 0;
  const pressaoStatus: 'saudavel' | 'pressionado' | 'critico' =
    pressaoAjustada >= config.limitePressaoVermelha ? 'critico'
      : pressaoAjustada >= config.limitePressaoAmarela ? 'pressionado' : 'saudavel';

  // Behavior change detection
  const perfilAtual = Array(5).fill(0);
  if (gastoMes > 0) {
    for (let w = 0; w < Math.min(semanaAtual, gastos.length); w++) {
      perfilAtual[w] = gastos[w] / gastoMes;
    }
  }

  const deltas = Array(5).fill(0);
  for (let w = 0; w < semanaAtual && w < 5; w++) {
    deltas[w] = perfilAtual[w] - perfilHistorico[w];
  }

  const desvioTotal = deltas.slice(0, semanaAtual).reduce((s, d) => s + Math.abs(d), 0);
  const foraDoPadrao = historicoSuficiente && desvioTotal >= config.limitForaPadraoPercent;

  // Find largest deviation week
  let maiorDesvioSemana: { label: string; delta: number } | null = null;
  if (historicoSuficiente) {
    let maxAbs = 0;
    for (let w = 0; w < semanaAtual && w < 5; w++) {
      if (Math.abs(deltas[w]) > maxAbs) {
        maxAbs = Math.abs(deltas[w]);
        maiorDesvioSemana = { label: `W${w + 1}`, delta: deltas[w] };
      }
    }
  }

  // Consistency index
  const maxDesvio = 2 * (semanaAtual / semanasNoMes);
  const indiceConsistencia = historicoSuficiente
    ? Math.max(0, 1 - Math.min(1, desvioTotal / Math.max(maxDesvio, 0.01)))
    : -1; // -1 means N/A

  const consistenciaStatus: 'alta' | 'media' | 'baixa' =
    indiceConsistencia >= 0.75 ? 'alta'
      : indiceConsistencia >= config.limiteConsistenciaBaixa ? 'media' : 'baixa';

  // Burst risk prediction
  const perfilHistAcumAtual = perfilHistAcum[semanaAtual - 1] || 0.01;
  const projecaoHist = perfilHistAcumAtual > 0.01 ? gastoMes / perfilHistAcumAtual : gastoMes;
  
  const mediaSemanalAtual = gastoMes / Math.max(1, semanaAtual);
  const projecaoTend = mediaSemanalAtual * semanasNoMes;

  const pesoHist = historicoSuficiente && indiceConsistencia >= 0 ? indiceConsistencia : 0;
  const pesoTend = historicoSuficiente && indiceConsistencia >= 0 ? 1 - indiceConsistencia : 1;
  const projecaoFinal = (projecaoHist * pesoHist) + (projecaoTend * pesoTend);

  const risco = metaValor > 0 ? projecaoFinal / metaValor : 0;
  const riscoStatus: 'baixo' | 'medio' | 'alto' =
    risco > 1.05 ? 'alto' : risco >= 0.95 ? 'medio' : 'baixo';

  return {
    historicoSuficiente, mesesUsados, perfilHistorico, perfilHistAcum,
    semanaAtual, gastoAteSemana, esperadoAjustado, pressaoAjustada, pressaoStatus,
    perfilAtual, deltas, desvioTotal, foraDoPadrao, maiorDesvioSemana,
    indiceConsistencia, consistenciaStatus,
    projecaoHist, projecaoTend, projecaoFinal, risco, riscoStatus,
    metaValor, gastoMes, semanasNoMes,
  };
}

// ── UI Component ──

interface Props {
  entries: SalmonEntry[];
  targetMonth: string;
  metas?: MetaCompraMensal[];
  config?: PressureConfig;
  categoria?: string;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = {
    saudavel: 'bg-success/15 text-success border-success/30',
    pressionado: 'bg-warning/15 text-warning border-warning/30',
    critico: 'bg-destructive/15 text-destructive border-destructive/30',
    baixo: 'bg-success/15 text-success border-success/30',
    medio: 'bg-warning/15 text-warning border-warning/30',
    alto: 'bg-destructive/15 text-destructive border-destructive/30',
    alta: 'bg-success/15 text-success border-success/30',
    media: 'bg-warning/15 text-warning border-warning/30',
    baixa: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${colors[status] || ''}`}>
      {label}
    </span>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3 h-3 text-muted-foreground/60 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-[10px]">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full bg-secondary overflow-hidden flex-1">
      <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BudgetPressure({ entries, targetMonth, metas, config, categoria = 'salmao' }: Props) {
  const meta = metas?.find(m => m.mesAno === targetMonth && m.categoria === categoria);
  const metaValor = meta?.metaValorCompra || 0;
  const cfg = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

  const analysis = useMemo(
    () => calcBudgetPressure(entries, targetMonth, metaValor, cfg),
    [entries, targetMonth, metaValor, cfg]
  );

  if (metaValor <= 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-center space-y-2 animate-fade-up">
        <ShieldAlert className="w-6 h-6 text-muted-foreground/40 mx-auto" />
        <p className="text-xs text-muted-foreground">Configure a meta mensal para calcular a pressão orçamentária.</p>
      </div>
    );
  }

  const pressaoLabels = { saudavel: '🟢 Saudável', pressionado: '🟡 Pressionado', critico: '🔴 Crítico' };
  const riscoLabels = { baixo: '🟢 Baixo', medio: '🟡 Médio', alto: '🔴 Alto' };
  const consistLabels = { alta: '🟢 Alta', media: '🟡 Média', baixa: '🔴 Baixa' };

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Card 1: Pressão Ajustada */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1">Pressão Orçamentária</p>
          <InfoTooltip text="Compara seu gasto acumulado até a semana atual com o esperado com base no seu padrão histórico de distribuição semanal." />
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] text-muted-foreground">Gasto até W{analysis.semanaAtual}</p>
            <p className="text-base font-display font-bold text-foreground">{fmtR(analysis.gastoAteSemana)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              Esperado {analysis.historicoSuficiente ? '(histórico)' : '(linear)'}
            </p>
            <p className="text-base font-display font-bold text-foreground">{fmtR(analysis.esperadoAjustado)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold font-display ${
            analysis.pressaoStatus === 'critico' ? 'text-destructive'
              : analysis.pressaoStatus === 'pressionado' ? 'text-warning' : 'text-success'
          }`}>
            {formatDecimalBR(analysis.pressaoAjustada * 100, 0)}%
          </span>
          <MiniBar value={analysis.pressaoAjustada} max={config?.limitePressaoVermelha || 1.15}
            color={analysis.pressaoStatus === 'critico' ? 'bg-destructive' : analysis.pressaoStatus === 'pressionado' ? 'bg-warning' : 'bg-success'} />
          <StatusBadge status={analysis.pressaoStatus} label={pressaoLabels[analysis.pressaoStatus]} />
        </div>

        {!analysis.historicoSuficiente && (
          <p className="text-[10px] text-warning italic">⚠️ Histórico insuficiente ({analysis.mesesUsados} mês(es)). Usando distribuição linear como fallback.</p>
        )}
      </div>

      {/* Card 2: Mudança de Comportamento */}
      {analysis.historicoSuficiente && (
        <div className={`rounded-xl border p-4 space-y-2 ${
          analysis.foraDoPadrao
            ? 'bg-warning/5 border-warning/30'
            : 'bg-success/5 border-success/30'
        }`}>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1">Padrão de Comportamento</p>
            <InfoTooltip text="Compara a distribuição de compras por semana deste mês com a média dos últimos meses." />
          </div>

          {analysis.foraDoPadrao ? (
            <>
              <p className="text-[11px] text-warning font-bold">⚠️ Esse mês está fora do seu padrão histórico.</p>
              {analysis.maiorDesvioSemana && (
                <p className="text-[10px] text-muted-foreground">
                  {analysis.maiorDesvioSemana.delta > 0
                    ? `Você concentrou mais compras em ${analysis.maiorDesvioSemana.label} do que o normal (+${formatDecimalBR(analysis.maiorDesvioSemana.delta * 100, 0)}pp)`
                    : `Você reduziu compras em ${analysis.maiorDesvioSemana.label} em relação ao padrão (${formatDecimalBR(analysis.maiorDesvioSemana.delta * 100, 0)}pp)`
                  }
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-success font-medium">✅ Padrão dentro do esperado.</p>
          )}

          <p className="text-[10px] text-muted-foreground">Desvio acumulado: {formatPercentBR(analysis.desvioTotal)} (limite: {formatPercentBR(cfg.limitForaPadraoPercent)})</p>
        </div>
      )}

      {/* Card 3: Consistência Mensal */}
      {analysis.historicoSuficiente && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1">Consistência do Mês</p>
            <InfoTooltip text="Mede o quão parecido o padrão de compras deste mês está com o seu histórico. 1.0 = idêntico." />
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold font-display ${
              analysis.consistenciaStatus === 'alta' ? 'text-success'
                : analysis.consistenciaStatus === 'media' ? 'text-warning' : 'text-destructive'
            }`}>
              {formatDecimalBR(analysis.indiceConsistencia * 100, 0)}%
            </span>
            <MiniBar value={analysis.indiceConsistencia} max={1}
              color={analysis.consistenciaStatus === 'alta' ? 'bg-success' : analysis.consistenciaStatus === 'media' ? 'bg-warning' : 'bg-destructive'} />
            <StatusBadge status={analysis.consistenciaStatus} label={consistLabels[analysis.consistenciaStatus]} />
          </div>

          <p className="text-[10px] text-muted-foreground">
            {analysis.consistenciaStatus === 'alta'
              ? 'Mês consistente com seu padrão histórico.'
              : 'Mês com comportamento atípico em relação ao histórico.'}
          </p>
        </div>
      )}

      {/* Card 4: Risco de Estouro */}
      <div className={`rounded-xl border p-4 space-y-3 ${
        analysis.riscoStatus === 'alto' ? 'bg-destructive/5 border-destructive/30'
          : analysis.riscoStatus === 'medio' ? 'bg-warning/5 border-warning/30'
            : 'bg-card border-border'
      }`}>
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex-1">Risco de Estouro</p>
          <InfoTooltip text="Previsão combinando seu padrão histórico com a tendência atual. Pesos ajustados pela consistência do mês." />
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] text-muted-foreground">Projeção final</p>
            <p className={`text-base font-display font-bold ${
              analysis.riscoStatus === 'alto' ? 'text-destructive' : analysis.riscoStatus === 'medio' ? 'text-warning' : 'text-foreground'
            }`}>{fmtR(analysis.projecaoFinal)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Meta</p>
            <p className="text-base font-display font-bold text-foreground">{fmtR(metaValor)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold font-display ${
              analysis.riscoStatus === 'alto' ? 'text-destructive' : analysis.riscoStatus === 'medio' ? 'text-warning' : 'text-success'
            }`}>{formatDecimalBR(analysis.risco * 100, 0)}%</span>
            <StatusBadge status={analysis.riscoStatus} label={riscoLabels[analysis.riscoStatus]} />
          </div>
          <span className={`text-[10px] font-medium ${analysis.projecaoFinal <= metaValor ? 'text-success' : 'text-destructive'}`}>
            {analysis.projecaoFinal <= metaValor
              ? `Sobra ${fmtR(metaValor - analysis.projecaoFinal)}`
              : `Estoura ${fmtR(analysis.projecaoFinal - metaValor)}`}
          </span>
        </div>

        {analysis.historicoSuficiente && (
          <div className="text-[9px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
            <p>Cenário histórico: {fmtR(analysis.projecaoHist)} (peso {formatDecimalBR(analysis.indiceConsistencia * 100, 0)}%)</p>
            <p>Cenário tendência: {fmtR(analysis.projecaoTend)} (peso {formatDecimalBR((1 - analysis.indiceConsistencia) * 100, 0)}%)</p>
          </div>
        )}

        <p className="text-[9px] text-muted-foreground italic">
          Baseado no seu histórico ({analysis.mesesUsados} mês(es)) e no comportamento deste mês.
        </p>
      </div>
    </div>
  );
}
