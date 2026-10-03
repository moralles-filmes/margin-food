import { ArrowDown, ArrowUp, BarChart3, FileText, Info, Lightbulb, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/ui/EmptyState';
import { formatDateTimeBR } from '@/lib/datetime';
import {
  corCategoriaCss, formatarCentavos, formatarIntervalo, formatarPercentual, formatarVariacao,
  type CmvCategoriaLinha, type CmvReport,
} from '@/domain/financeiro/cmv';
import type { CmvSituacao } from '@/hooks/useCmvFinanceiro';
import { CmvPainel } from './CmvCards';
import {
  CMV_COR_ANTERIOR, CMV_COR_CMV, CMV_COR_FATURAMENTO, CMV_COR_PERCENTUAL,
  CmvComparativoChart, CmvComposicao, CmvEvolucaoChart, LegendaItem,
} from './cmvCharts';

export function CmvTabelaResumo({ report, onAbrirCategoria }: {
  report: CmvReport;
  onAbrirCategoria?: (linha: CmvCategoriaLinha) => void;
}) {
  const total = report.totalCategorias;
  const variacao = (valor: number | null) => {
    if (valor === null) return <span className="text-muted-foreground" title="Sem base de comparação">—</span>;
    const Seta = valor > 0 ? ArrowUp : valor < 0 ? ArrowDown : Minus;
    return (
      <span className="inline-flex items-center justify-end gap-0.5">
        <Seta className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{formatarVariacao(valor)}
      </span>
    );
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-[13px]">
        <caption className="sr-only">CMV por categoria financeira, período atual e anterior</caption>
        <thead>
          <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
            <th scope="col" className="px-2 py-2 text-left font-medium">Categoria</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Valor atual</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Valor anterior</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Variação</th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title="CMV da categoria ÷ CMV total">Participação</th>
          </tr>
        </thead>
        <tbody>
          {report.grupos.map(grupo => (
            <tr key={grupo.id} className="border-b border-border">
              <th scope="row" className="px-2 py-2 text-left font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corCategoriaCss(grupo.cor) }} aria-hidden="true" />
                  {onAbrirCategoria ? (
                    <button
                      type="button" onClick={() => onAbrirCategoria(grupo)} title={`Ver boletos de ${grupo.nome}`}
                      className="truncate rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {grupo.nome}
                    </button>
                  ) : <span className="truncate">{grupo.nome}</span>}
                </span>
              </th>
              <td className="px-2 py-2 whitespace-nowrap text-right tabular-nums text-foreground">{formatarCentavos(grupo.atualCentavos)}</td>
              <td className="px-2 py-2 whitespace-nowrap text-right tabular-nums text-muted-foreground">{formatarCentavos(grupo.anteriorCentavos)}</td>
              <td className="px-2 py-2 whitespace-nowrap text-right tabular-nums text-foreground">{variacao(grupo.variacaoPercentual)}</td>
              <td className="px-2 py-2 whitespace-nowrap text-right tabular-nums text-foreground">{formatarPercentual(grupo.participacao, 1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/60 font-bold text-foreground">
            <th scope="row" className="px-2 py-2.5 text-left">Total</th>
            <td className="px-2 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarCentavos(total.atualCentavos)}</td>
            <td className="px-2 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarCentavos(total.anteriorCentavos)}</td>
            <td className="px-2 py-2.5 whitespace-nowrap text-right tabular-nums">{variacao(total.variacaoPercentual)}</td>
            <td className="px-2 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarPercentual(total.participacao, 1)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ItemSobre({ icone: Icone, titulo, children }: { icone: typeof Info; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-primary-ink">{titulo}</h3>
        <div className="mt-0.5 text-sm leading-snug text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function CmvSobreOsDados({ report, onAbrirLista }: {
  report: CmvReport;
  onAbrirLista: (situacao: CmvSituacao) => void;
}) {
  const { atual, janelas } = report;
  const pendencia = (rotulo: string, titulos: number, centavos: number, situacao: CmvSituacao) => (
    <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <span>{rotulo}: <strong className="font-semibold text-foreground">{titulos}</strong> ({formatarCentavos(centavos)})</span>
      {titulos > 0 && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-primary-ink" onClick={() => onAbrirLista(situacao)}>
          Ver boletos
        </Button>
      )}
    </li>
  );
  return (
    <CmvPainel titulo={<span className="inline-flex items-center gap-2 text-primary-ink"><Info className="h-4 w-4" aria-hidden="true" />Sobre os dados</span>}>
      <div className="space-y-4">
        <ItemSobre icone={FileText} titulo="CMV Financeiro">
          Soma das categorias marcadas para o CMV nos boletos de Contas a Pagar, pela <strong className="font-semibold text-foreground">data de competência</strong>. Pagamento e vencimento não mudam o período.
        </ItemSobre>
        <ItemSobre icone={BarChart3} titulo="Faturamento">
          Faturamento bruto registrado no <strong className="font-semibold text-foreground">Fechamento de Caixa</strong>
          {atual.intervalo && <> — {atual.diasComFechamento} de {atual.dias} {atual.dias === 1 ? 'dia' : 'dias'} com fechamento</>}.
        </ItemSobre>
        <dl className="space-y-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
          <div>
            <dt className="inline">Intervalo apurado: </dt>
            <dd className="inline font-medium text-foreground">{janelas.efetivoAtual ? formatarIntervalo(janelas.efetivoAtual) : 'período ainda não iniciado'}</dd>
          </div>
          <div>
            <dt className="inline">Comparado com: </dt>
            <dd className="inline font-medium text-foreground">{janelas.efetivoAnterior ? formatarIntervalo(janelas.efetivoAnterior) : '—'}</dd>
          </div>
          <div>
            <dt className="inline">Última atualização: </dt>
            <dd className="inline font-medium text-foreground">{report.geradoEm ? formatDateTimeBR(new Date(report.geradoEm)) : '—'}</dd>
          </div>
        </dl>
        <div className="border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-foreground">Qualidade da apuração</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm text-muted-foreground">
            {pendencia('Pendentes de classificação no período', atual.pendentes.titulos, atual.pendentes.centavos, 'pendente')}
            {pendencia('Fora do CMV no período', atual.fora.titulos, atual.fora.centavos, 'fora')}
            {pendencia('Sem competência (fora de qualquer período)', report.semCompetencia.titulos, report.semCompetencia.centavos, 'sem_competencia')}
          </ul>
        </div>
        <p className="flex gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Mantenha os boletos com categoria, competência e a resposta do CMV preenchidas para um indicador mais preciso.</span>
        </p>
      </div>
    </CmvPainel>
  );
}

export default function CmvVisaoGeral({ report, onAbrirCategoria, onAbrirLista }: {
  report: CmvReport;
  onAbrirCategoria: (linha: CmvCategoriaLinha) => void;
  onAbrirLista: (situacao: CmvSituacao) => void;
}) {
  const temSerie = report.serie.some(p => !p.futuro && ((p.cmvCentavos ?? 0) !== 0 || p.faturamentoCentavos !== null));
  const temCmv = report.grupos.some(g => g.atualCentavos !== 0);
  const temComparativo = report.grupos.length > 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <CmvPainel
          className="xl:col-span-7"
          titulo="Faturamento × CMV × % CMV"
          legenda={(
            <>
              <LegendaItem cor={CMV_COR_FATURAMENTO}>Faturamento (R$)</LegendaItem>
              <LegendaItem cor={CMV_COR_CMV}>CMV Financeiro (R$)</LegendaItem>
              <LegendaItem cor={CMV_COR_PERCENTUAL} linha>% CMV (eixo direito)</LegendaItem>
            </>
          )}
        >
          {temSerie ? (
            <div className="h-72"><CmvEvolucaoChart serie={report.serie} /></div>
          ) : <EmptyState title="Sem faturamento nem CMV no período selecionado" compact />}
        </CmvPainel>
        <CmvPainel className="xl:col-span-5" titulo="Composição do CMV por categoria">
          {temCmv ? <CmvComposicao report={report} onAbrirGrupo={onAbrirCategoria} /> : <EmptyState title="Nenhum boleto incluído no CMV neste período" compact />}
        </CmvPainel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3.3fr)_minmax(0,5.6fr)_minmax(0,3.1fr)]">
        <CmvPainel
          titulo="Comparativo de CMV — período atual × anterior"
          legenda={(
            <>
              <LegendaItem cor={CMV_COR_CMV}>Período atual</LegendaItem>
              <LegendaItem cor={CMV_COR_ANTERIOR}>Período anterior</LegendaItem>
            </>
          )}
        >
          {temComparativo ? (
            <div className="h-80"><CmvComparativoChart grupos={report.grupos.slice(0, 8)} /></div>
          ) : <EmptyState title="Sem categorias para comparar" compact />}
        </CmvPainel>
        <CmvPainel titulo="CMV por categoria financeira">
          {temComparativo ? <CmvTabelaResumo report={report} onAbrirCategoria={onAbrirCategoria} /> : <EmptyState title="Sem categorias no período" compact />}
        </CmvPainel>
        <CmvSobreOsDados report={report} onAbrirLista={onAbrirLista} />
      </div>
    </div>
  );
}
