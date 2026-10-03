import EmptyState from '@/components/ui/EmptyState';
import {
  formatarCentavos, formatarCentavosComSinal, formatarIntervalo, formatarPercentual, formatarPontos,
  formatarVariacao, type CmvCategoriaLinha, type CmvLado, type CmvReport,
} from '@/domain/financeiro/cmv';
import { CmvPainel } from './CmvCards';
import { CmvDemonstrativo } from './CmvAnaliseCategoria';
import { CMV_COR_ANTERIOR, CMV_COR_CMV, CmvComparativoChart, LegendaItem } from './cmvCharts';

function fechamento(lado: CmvLado): string {
  if (lado.intervalo === null) return '—';
  return `${lado.diasComFechamento} de ${lado.dias}`;
}

/** Atual × anterior com os mesmos totais, critérios e intervalos dos cards. */
export default function CmvComparativo({ report, onAbrirCategoria }: {
  report: CmvReport;
  onAbrirCategoria: (linha: CmvCategoriaLinha) => void;
}) {
  const { atual, anterior, faturamento, cmv, percentual, boletos } = report;
  const linhas: { rotulo: string; atual: string; anterior: string; diferenca: string; variacao: string }[] = [
    {
      rotulo: 'Faturamento (Fechamento de Caixa)',
      atual: formatarCentavos(faturamento.atual), anterior: formatarCentavos(faturamento.anterior),
      diferenca: formatarCentavosComSinal(faturamento.diferenca), variacao: formatarVariacao(faturamento.variacaoPercentual),
    },
    {
      rotulo: 'CMV Financeiro',
      atual: formatarCentavos(cmv.atual), anterior: formatarCentavos(cmv.anterior),
      diferenca: formatarCentavosComSinal(cmv.diferenca), variacao: formatarVariacao(cmv.variacaoPercentual),
    },
    {
      rotulo: '% CMV (CMV ÷ faturamento)',
      atual: formatarPercentual(percentual.atual), anterior: formatarPercentual(percentual.anterior),
      diferenca: formatarPontos(percentual.pontos), variacao: '—',
    },
    {
      rotulo: 'Saldo após CMV, antes das demais despesas',
      atual: formatarCentavos(report.saldoAposCmvCentavos),
      anterior: formatarCentavos(anterior.faturamentoCentavos === null ? null : anterior.faturamentoCentavos - anterior.cmvCentavos),
      diferenca: formatarCentavosComSinal(
        report.saldoAposCmvCentavos === null || anterior.faturamentoCentavos === null
          ? null
          : report.saldoAposCmvCentavos - (anterior.faturamentoCentavos - anterior.cmvCentavos),
      ),
      variacao: '—',
    },
    {
      rotulo: 'Boletos vinculados ao CMV',
      atual: boletos.atual === null ? '—' : String(boletos.atual), anterior: boletos.anterior === null ? '—' : String(boletos.anterior),
      diferenca: boletos.diferenca === null ? '—' : `${boletos.diferenca > 0 ? '+' : ''}${boletos.diferenca}`,
      variacao: formatarVariacao(boletos.variacaoPercentual),
    },
    { rotulo: 'Dias no intervalo comparado', atual: String(atual.dias), anterior: String(anterior.dias), diferenca: '—', variacao: '—' },
    { rotulo: 'Dias com fechamento de caixa', atual: fechamento(atual), anterior: fechamento(anterior), diferenca: '—', variacao: '—' },
  ];

  const pares = report.serie.map((ponto, i) => ({ ponto, anterior: report.serieAnterior[i] ?? null }));
  const extras = report.serieAnterior.slice(report.serie.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <CmvPainel className="xl:col-span-7" titulo="Resumo comparativo">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Indicadores do período atual e do anterior</caption>
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Indicador</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Atual<span className="block font-normal">{atual.intervalo ? formatarIntervalo(atual.intervalo) : '—'}</span>
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Anterior<span className="block font-normal">{anterior.intervalo ? formatarIntervalo(anterior.intervalo) : '—'}</span>
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Diferença</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Variação %</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(linha => (
                  <tr key={linha.rotulo} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{linha.rotulo}</th>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-foreground">{linha.atual}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{linha.anterior}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-foreground">{linha.diferenca}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-foreground">{linha.variacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CmvPainel>
        <CmvPainel
          className="xl:col-span-5"
          titulo="CMV por categoria — atual × anterior"
          legenda={(
            <>
              <LegendaItem cor={CMV_COR_CMV}>Período atual</LegendaItem>
              <LegendaItem cor={CMV_COR_ANTERIOR}>Período anterior</LegendaItem>
            </>
          )}
        >
          {report.grupos.length > 0 ? (
            <div className="h-72"><CmvComparativoChart grupos={report.grupos.slice(0, 10)} /></div>
          ) : <EmptyState title="Sem categorias para comparar" compact />}
        </CmvPainel>
      </div>

      <CmvPainel titulo="Detalhamento por faixa do período">
        <p className="mb-3 text-xs text-muted-foreground">
          Cada faixa do período atual ao lado da faixa de mesma posição no período anterior. Faixa sem fechamento aparece como “Sem fechamento”, não como zero.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Faturamento, CMV e percentual por faixa, atual e anterior</caption>
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">Faixa atual</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Faturamento</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">CMV</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">% CMV</th>
                <th scope="col" className="border-l border-border px-3 py-2 text-left font-medium">Faixa anterior</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Faturamento</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">CMV</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">% CMV</th>
              </tr>
            </thead>
            <tbody>
              {pares.map(({ ponto, anterior: ant }) => (
                <tr key={ponto.bucket.inicio} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    {ponto.bucket.descricao}
                    {ponto.parcial && <span className="ml-1 text-xs font-normal text-muted-foreground">(parcial)</span>}
                  </th>
                  {ponto.futuro ? (
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Ainda não ocorreu</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{ponto.faturamentoCentavos === null ? <span className="text-muted-foreground">Sem fechamento</span> : formatarCentavos(ponto.faturamentoCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarCentavos(ponto.cmvCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarPercentual(ponto.cmvPercentual)}</td>
                    </>
                  )}
                  <td className="border-l border-border px-3 py-2 text-left text-muted-foreground">{ant ? ant.bucket.descricao : '—'}</td>
                  {!ant || ant.futuro ? (
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">{ant ? 'Fora do trecho comparado' : '—'}</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{ant.faturamentoCentavos === null ? 'Sem fechamento' : formatarCentavos(ant.faturamentoCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatarCentavos(ant.cmvCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatarPercentual(ant.cmvPercentual)}</td>
                    </>
                  )}
                </tr>
              ))}
              {extras.map(ant => (
                <tr key={`ant:${ant.bucket.inicio}`} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">—</th>
                  <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="border-l border-border px-3 py-2 text-left text-muted-foreground">{ant.bucket.descricao}</td>
                  {ant.futuro ? (
                    <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Fora do trecho comparado</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{ant.faturamentoCentavos === null ? 'Sem fechamento' : formatarCentavos(ant.faturamentoCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatarCentavos(ant.cmvCentavos)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatarPercentual(ant.cmvPercentual)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CmvPainel>

      <CmvDemonstrativo report={report} onAbrirCategoria={onAbrirCategoria} />
    </div>
  );
}
