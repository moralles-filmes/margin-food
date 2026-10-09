import type { ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { axisProps, chartValueFormatters, cursorProps, gridProps, makeActiveDot } from '@/lib/chartTheme';
import {
  corCategoriaCss, fatiasDaComposicao, formatarCentavos, formatarPercentual,
  type CmvGrupo, type CmvPontoSerie, type CmvReport,
} from '@/domain/financeiro/cmv';
import { cn } from '@/lib/utils';

// Séries com significado fixo no relatório (mesma leitura na tela e no PDF).
export const CMV_COR_FATURAMENTO = 'hsl(var(--chart-2))';
export const CMV_COR_CMV = 'hsl(var(--chart-1))';
export const CMV_COR_PERCENTUAL = 'hsl(var(--chart-3))';
export const CMV_COR_ANTERIOR = 'hsl(var(--primary-border))';

interface LinhaTooltip {
  cor?: string;
  rotulo: string;
  valor: string;
}

function CaixaTooltip({ titulo, nota, linhas }: { titulo: string; nota?: string | null; linhas: LinhaTooltip[] }) {
  return (
    <div className="min-w-[12rem] rounded-lg border border-chart-tooltip-border bg-chart-tooltip px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-chart-tooltip-foreground">{titulo}</div>
      {nota && <div className="text-muted-foreground">{nota}</div>}
      <div className="mt-1.5 grid gap-1">
        {linhas.map(linha => (
          <div key={linha.rotulo} className="flex items-center gap-2">
            {linha.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: linha.cor }} aria-hidden="true" />}
            <span className="text-muted-foreground">{linha.rotulo}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-chart-tooltip-foreground">{linha.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendaItem({ cor, children, linha }: { cor: string; children: ReactNode; linha?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn('inline-block shrink-0', linha ? 'h-0.5 w-3.5' : 'h-2.5 w-2.5 rounded-full')}
        style={{ backgroundColor: cor }}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

const reais = (centavos: number | null) => (centavos === null ? null : centavos / 100);

function notaDoPonto(ponto: CmvPontoSerie): string | null {
  if (ponto.futuro) return 'Ainda não ocorreu';
  if (ponto.parcial) return 'Faixa parcial (até o corte)';
  return null;
}

/** Faturamento × CMV × % CMV — barras em reais (eixo esquerdo) e linha em % (eixo direito). */
export function CmvEvolucaoChart({ serie }: { serie: CmvPontoSerie[] }) {
  const dados = serie.map(ponto => ({
    rotulo: ponto.bucket.rotulo,
    ponto,
    faturamento: reais(ponto.faturamentoCentavos),
    cmv: reais(ponto.cmvCentavos),
    percentual: ponto.cmvPercentual,
  }));
  const mostrarRotulos = dados.length <= 8;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dados} margin={{ top: 16, right: 4, bottom: 0, left: 0 }} barGap={4}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="rotulo" {...axisProps} interval="equidistantPreserveStart" minTickGap={6} />
        <YAxis yAxisId="valor" {...axisProps} width={64} tickFormatter={chartValueFormatters.moneyCompact} />
        <YAxis
          yAxisId="percentual" orientation="right" {...axisProps} width={44}
          tickFormatter={v => `${Math.round(v)}%`} domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]}
        />
        <Tooltip
          cursor={{ fill: cursorProps.fill }}
          content={({ active, payload }) => {
            const ponto = (payload?.[0]?.payload as { ponto: CmvPontoSerie } | undefined)?.ponto;
            if (!active || !ponto) return null;
            return (
              <CaixaTooltip
                titulo={ponto.bucket.descricao}
                nota={notaDoPonto(ponto)}
                linhas={ponto.futuro ? [] : [
                  { cor: CMV_COR_FATURAMENTO, rotulo: 'Faturamento', valor: ponto.faturamentoCentavos === null ? 'Sem fechamento' : formatarCentavos(ponto.faturamentoCentavos) },
                  { cor: CMV_COR_CMV, rotulo: 'CMV Financeiro', valor: formatarCentavos(ponto.cmvCentavos) },
                  { cor: CMV_COR_PERCENTUAL, rotulo: '% CMV (CMV ÷ faturamento)', valor: formatarPercentual(ponto.cmvPercentual) },
                ]}
              />
            );
          }}
        />
        <Bar yAxisId="valor" dataKey="faturamento" name="Faturamento" fill={CMV_COR_FATURAMENTO} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        <Bar yAxisId="valor" dataKey="cmv" name="CMV Financeiro" fill={CMV_COR_CMV} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        <Line
          yAxisId="percentual" type="monotone" dataKey="percentual" name="% CMV" stroke={CMV_COR_PERCENTUAL}
          strokeWidth={2} dot={{ r: 3, fill: CMV_COR_PERCENTUAL, strokeWidth: 0 }} activeDot={makeActiveDot(CMV_COR_PERCENTUAL)}
          connectNulls={false} isAnimationActive={false}
        >
          {mostrarRotulos && (
            <LabelList
              dataKey="percentual" position="top" offset={8}
              formatter={(v: number | null) => (v === null || v === undefined ? '' : formatarPercentual(v, 1))}
              style={{ fill: CMV_COR_PERCENTUAL, fontSize: 11, fontWeight: 600 }}
            />
          )}
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Evolução do CMV empilhada por grupo de categoria. */
export function CmvEmpilhadoChart({ serie, grupos }: { serie: CmvPontoSerie[]; grupos: CmvGrupo[] }) {
  const dados = serie.map(ponto => {
    const linha: Record<string, unknown> = { rotulo: ponto.bucket.rotulo, ponto };
    for (const grupo of grupos) linha[grupo.id] = ponto.futuro ? null : (ponto.porGrupo[grupo.id] ?? 0) / 100;
    return linha;
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="rotulo" {...axisProps} interval="equidistantPreserveStart" minTickGap={6} />
        <YAxis {...axisProps} width={64} tickFormatter={chartValueFormatters.moneyCompact} />
        <Tooltip
          cursor={{ fill: cursorProps.fill }}
          content={({ active, payload }) => {
            const ponto = (payload?.[0]?.payload as { ponto: CmvPontoSerie } | undefined)?.ponto;
            if (!active || !ponto) return null;
            const linhas = grupos
              .filter(g => (ponto.porGrupo[g.id] ?? 0) !== 0)
              .map(g => ({ cor: corCategoriaCss(g.cor), rotulo: g.nome, valor: formatarCentavos(ponto.porGrupo[g.id]) }));
            return (
              <CaixaTooltip
                titulo={ponto.bucket.descricao}
                nota={notaDoPonto(ponto)}
                linhas={ponto.futuro ? [] : [...linhas, { rotulo: 'Total do CMV', valor: formatarCentavos(ponto.cmvCentavos) }]}
              />
            );
          }}
        />
        {grupos.map((grupo, i) => (
          <Bar
            key={grupo.id} dataKey={grupo.id} name={grupo.nome} stackId="cmv" fill={corCategoriaCss(grupo.cor)}
            maxBarSize={56} isAnimationActive={false} radius={i === grupos.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Período atual × anterior por grupo de categoria. */
export function CmvComparativoChart({ grupos }: { grupos: CmvGrupo[] }) {
  const dados = grupos.map(g => ({ nome: g.nome, grupo: g, atual: g.atualCentavos / 100, anterior: g.anteriorCentavos / 100 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="nome" {...axisProps} interval={0} height={dados.length > 5 ? 56 : 30}
          angle={dados.length > 5 ? -25 : 0} textAnchor={dados.length > 5 ? 'end' : 'middle'}
          tickFormatter={(nome: string) => (nome.length > 14 ? `${nome.slice(0, 13)}…` : nome)}
        />
        <YAxis {...axisProps} width={64} tickFormatter={chartValueFormatters.moneyCompact} />
        <Tooltip
          cursor={{ fill: cursorProps.fill }}
          content={({ active, payload }) => {
            const grupo = (payload?.[0]?.payload as { grupo: CmvGrupo } | undefined)?.grupo;
            if (!active || !grupo) return null;
            return (
              <CaixaTooltip
                titulo={grupo.nome}
                linhas={[
                  { cor: CMV_COR_CMV, rotulo: 'Período atual', valor: formatarCentavos(grupo.atualCentavos) },
                  { cor: CMV_COR_ANTERIOR, rotulo: 'Período anterior', valor: formatarCentavos(grupo.anteriorCentavos) },
                  { rotulo: 'Diferença', valor: formatarCentavos(grupo.diferencaCentavos) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="atual" name="Período atual" fill={CMV_COR_CMV} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="anterior" name="Período anterior" fill={CMV_COR_ANTERIOR} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Composição do CMV: rosca com total no centro e legenda com valor e participação. */
export function CmvComposicao({ report, onAbrirGrupo }: { report: CmvReport; onAbrirGrupo?: (grupo: CmvGrupo) => void }) {
  const total = report.cmv.atual ?? 0;
  const fatias = fatiasDaComposicao(report.grupos, total);
  const grupoPorId = new Map(report.grupos.map(g => [g.id, g]));

  const legenda = (
    <ul className="min-w-0 flex-1 space-y-2.5">
      {fatias.map(fatia => {
        const grupo = grupoPorId.get(fatia.id);
        const conteudo = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corCategoriaCss(fatia.cor) }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left text-foreground" title={fatia.nome}>{fatia.nome}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatarCentavos(fatia.centavos)}</span>
            <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-foreground">{formatarPercentual(fatia.participacao, 1)}</span>
          </>
        );
        return (
          <li key={fatia.id}>
            {grupo && onAbrirGrupo ? (
              <button
                type="button" onClick={() => onAbrirGrupo(grupo)}
                className="flex w-full items-center gap-2 rounded-md text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver despesas de ${fatia.nome}`}
              >
                {conteudo}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (!report.composicaoEmRosca) {
    // Total não positivo ou categoria negativa: fatia de rosca não representa isso.
    const maior = Math.max(1, ...fatias.map(f => Math.abs(f.centavos)));
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Há valores negativos ou total não positivo: a composição é mostrada em barras.</p>
        <ul className="space-y-2">
          {fatias.map(fatia => (
            <li key={fatia.id} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate text-foreground" title={fatia.nome}>{fatia.nome}</span>
              <span className="relative h-3 rounded bg-muted">
                <span
                  className={cn('absolute top-0 h-3 rounded', fatia.centavos < 0 ? 'right-1/2 bg-destructive' : 'left-1/2')}
                  style={{ width: `${(Math.abs(fatia.centavos) / maior) * 50}%`, backgroundColor: fatia.centavos < 0 ? undefined : corCategoriaCss(fatia.cor) }}
                />
              </span>
              <span className="tabular-nums text-foreground">{formatarCentavos(fatia.centavos)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias} dataKey="centavos" nameKey="nome" innerRadius="58%" outerRadius="100%"
              startAngle={90} endAngle={-270} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}
            >
              {fatias.map(fatia => <Cell key={fatia.id} fill={corCategoriaCss(fatia.cor)} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const fatia = payload?.[0]?.payload as { nome: string; centavos: number; participacao: number | null; cor: number | null } | undefined;
                if (!active || !fatia) return null;
                return (
                  <CaixaTooltip
                    titulo={fatia.nome}
                    linhas={[
                      { cor: corCategoriaCss(fatia.cor), rotulo: 'CMV', valor: formatarCentavos(fatia.centavos) },
                      { rotulo: 'Participação no CMV', valor: formatarPercentual(fatia.participacao, 1) },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-base font-bold tabular-nums text-foreground">{formatarCentavos(total)}</span>
          <span className="text-xs text-muted-foreground">Total do CMV</span>
        </div>
      </div>
      {legenda}
    </div>
  );
}

/** Ranking das categorias pela participação no CMV. */
export function CmvRanking({ grupos, onAbrirGrupo }: { grupos: CmvGrupo[]; onAbrirGrupo?: (grupo: CmvGrupo) => void }) {
  const comValor = grupos.filter(g => g.atualCentavos !== 0);
  const maior = Math.max(1, ...comValor.map(g => Math.abs(g.atualCentavos)));
  return (
    <ol className="space-y-3">
      {comValor.map(grupo => {
        const linha = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corCategoriaCss(grupo.cor) }} aria-hidden="true" />
            <span className="w-28 shrink-0 truncate text-left text-sm text-foreground" title={grupo.nome}>{grupo.nome}</span>
            <span className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
              <span
                className="block h-full rounded"
                style={{ width: `${(Math.abs(grupo.atualCentavos) / maior) * 100}%`, backgroundColor: corCategoriaCss(grupo.cor) }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{formatarPercentual(grupo.participacao, 1)}</span>
          </>
        );
        return (
          <li key={grupo.id} title={`${grupo.nome}: ${formatarCentavos(grupo.atualCentavos)}`}>
            {onAbrirGrupo ? (
              <button
                type="button" onClick={() => onAbrirGrupo(grupo)}
                className="flex w-full items-center gap-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver despesas de ${grupo.nome}: ${formatarCentavos(grupo.atualCentavos)}, ${formatarPercentual(grupo.participacao, 1)} do CMV`}
              >
                {linha}
              </button>
            ) : <div className="flex items-center gap-2">{linha}</div>}
          </li>
        );
      })}
    </ol>
  );
}
