import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Info, Lightbulb, Maximize2, Minimize2,
  Minus, Search, TrendingDown, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmptyState from '@/components/ui/EmptyState';
import { cn, includesNormalized } from '@/lib/utils';
import {
  achatarCategorias, corCategoriaCss, formatarCentavos, formatarCentavosComSinal, formatarPercentual,
  formatarVariacao, type CmvCategoriaLinha, type CmvInsight, type CmvInsightTipo, type CmvReport,
} from '@/domain/financeiro/cmv';
import { CmvPainel } from './CmvCards';
import { CmvEmpilhadoChart, CmvRanking, LegendaItem } from './cmvCharts';

const GRANULARIDADE_ROTULO = { dia: 'diária', semana: 'semanal', mes: 'mensal' } as const;

const INSIGHT_ICONE: Record<CmvInsightTipo, LucideIcon> = {
  participacao: TrendingUp,
  aumento: TrendingUp,
  reducao: TrendingDown,
  percentual: Info,
  peso: Info,
  pendencia: AlertTriangle,
  fechamento: AlertTriangle,
};

export function CmvInsights({ insights }: { insights: CmvInsight[] }) {
  if (insights.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados suficientes no período para gerar leituras.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {insights.map(insight => {
        const Icone = INSIGHT_ICONE[insight.tipo];
        return (
          <li key={`${insight.tipo}:${insight.texto}`} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              insight.tom === 'alerta' ? 'bg-warning-soft text-warning' : 'bg-primary-soft text-primary-ink',
            )}>
              <Icone className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-sm leading-snug text-foreground">{insight.texto}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground" title="Sem base de comparação">—</span>;
  const Seta = valor > 0 ? ArrowUp : valor < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      <Seta className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      {formatarVariacao(valor)}
    </span>
  );
}

/** Demonstrativo hierárquico de CMV por categoria (não é o DRE contábil). */
export function CmvDemonstrativo({ report, onAbrirCategoria }: {
  report: CmvReport;
  onAbrirCategoria?: (linha: CmvCategoriaLinha) => void;
}) {
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  const [expandirTudo, setExpandirTudo] = useState(false);
  const [busca, setBusca] = useState('');
  const termo = busca.trim();

  const linhas = useMemo(() => achatarCategorias(report.grupos, {
    expandidas,
    expandirTudo,
    filtro: termo ? linha => includesNormalized(linha.nome, termo) || includesNormalized(linha.codigo ?? '', termo) : undefined,
  }), [report.grupos, expandidas, expandirTudo, termo]);

  const alternar = (id: string) => {
    setExpandirTudo(false);
    setExpandidas(atual => {
      const proximo = new Set(expandirTudo ? achatarCategorias(report.grupos, { expandirTudo: true }).filter(l => l.temFilhos).map(l => l.id) : atual);
      if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
      return proximo;
    });
  };

  const total = report.totalCategorias;
  const temFilhos = report.grupos.some(g => g.filhos.length > 0);

  return (
    <CmvPainel
      titulo="Demonstrativo de CMV por categoria"
      acoes={(
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar categoria"
              aria-label="Buscar categoria no demonstrativo" className="h-8 w-48 pl-8 text-sm"
            />
          </div>
          {temFilhos && (
            <Button
              type="button" variant="ghost" size="sm" className="h-8 text-primary-ink"
              onClick={() => { setExpandirTudo(v => !v); setExpandidas(new Set()); }}
            >
              {expandirTudo ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
              {expandirTudo ? 'Recolher todas' : 'Expandir todas'}
            </Button>
          )}
        </div>
      )}
    >
      {report.grupos.length === 0 ? (
        <EmptyState title="Nenhum boleto incluído no CMV neste período" description="Marque os boletos em Contas a Pagar ou revise as pendências de classificação." compact />
      ) : (
        <>
          {termo && (
            <p className="mb-2 text-xs text-muted-foreground">
              A busca filtra apenas as linhas desta tabela. Cards, gráficos e o total abaixo continuam sendo os do período inteiro.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">Demonstrativo de CMV por categoria e subcategoria, período atual e anterior</caption>
              <thead>
                <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Categoria / Subcategoria</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor atual</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor anterior</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Diferença em R$</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Variação %</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium" title="CMV da categoria ÷ CMV total">Participação no CMV</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium" title="CMV da categoria ÷ faturamento do período">% do faturamento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhuma categoria encontrada para “{termo}”.</td></tr>
                )}
                {linhas.map(linha => (
                  <tr key={linha.id} className={cn('border-b border-border', linha.profundidade === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    <th scope="row" className="px-3 py-2 text-left font-[inherit]">
                      <span className="flex items-center gap-2" style={{ paddingLeft: `${linha.profundidade * 20}px` }}>
                        {linha.temFilhos ? (
                          <button
                            type="button" onClick={() => alternar(linha.id)} aria-expanded={linha.expandida}
                            aria-label={`${linha.expandida ? 'Recolher' : 'Expandir'} ${linha.nome}`}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {linha.expandida ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : <span className="w-6 shrink-0" />}
                        {linha.profundidade === 0 && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corCategoriaCss(linha.cor) }} aria-hidden="true" />
                        )}
                        {onAbrirCategoria ? (
                          <button
                            type="button" onClick={() => onAbrirCategoria(linha)}
                            className="truncate rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`Ver boletos de ${linha.nome}`}
                          >
                            {linha.nome}
                          </button>
                        ) : <span className="truncate">{linha.nome}</span>}
                        {!linha.ativo && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">inativa</span>}
                      </span>
                    </th>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarCentavos(linha.atualCentavos)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarCentavos(linha.anteriorCentavos)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarCentavosComSinal(linha.diferencaCentavos)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums"><Variacao valor={linha.variacaoPercentual} /></td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarPercentual(linha.participacao, 1)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{formatarPercentual(linha.pesoFaturamento, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/60 font-bold text-foreground">
                  <th scope="row" className="px-3 py-2.5 text-left">{termo ? 'Total geral do CMV (sem o filtro da busca)' : 'Total do CMV'}</th>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarCentavos(total.atualCentavos)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarCentavos(total.anteriorCentavos)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarCentavosComSinal(total.diferencaCentavos)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums"><Variacao valor={total.variacaoPercentual} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarPercentual(total.participacao, 1)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{formatarPercentual(total.pesoFaturamento, 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Faturamento de referência</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarCentavos(report.faturamento.atual)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total do CMV</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarCentavos(report.cmv.atual)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">% CMV consolidado (CMV ÷ faturamento)</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarPercentual(report.percentual.atual)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Saldo após CMV, antes das demais despesas</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarCentavos(report.saldoAposCmvCentavos)}</dd>
        </div>
      </dl>
    </CmvPainel>
  );
}

export default function CmvAnaliseCategoria({ report, onAbrirCategoria }: {
  report: CmvReport;
  onAbrirCategoria: (linha: CmvCategoriaLinha) => void;
}) {
  const temCmv = report.grupos.some(g => g.atualCentavos !== 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <CmvPainel
          className="xl:col-span-6"
          titulo={`Evolução do CMV por categoria (${GRANULARIDADE_ROTULO[report.granularidade]})`}
          legenda={report.grupos.slice(0, 8).map(g => <LegendaItem key={g.id} cor={corCategoriaCss(g.cor)}>{g.nome}</LegendaItem>)}
        >
          {temCmv ? (
            <div className="h-[26rem]"><CmvEmpilhadoChart serie={report.serie} grupos={report.grupos} /></div>
          ) : <EmptyState title="Sem CMV no período selecionado" compact />}
        </CmvPainel>
        <CmvPainel className="xl:col-span-3" titulo="Ranking de categorias no CMV">
          {temCmv ? <CmvRanking grupos={report.grupos} onAbrirGrupo={onAbrirCategoria} /> : <EmptyState title="Sem categorias no período" compact />}
        </CmvPainel>
        <CmvPainel
          className="bg-primary-soft xl:col-span-3"
          titulo={<span className="inline-flex items-center gap-2 text-primary-ink"><Lightbulb className="h-4 w-4" aria-hidden="true" />Leituras do período</span>}
        >
          <CmvInsights insights={report.insights} />
        </CmvPainel>
      </div>
      <CmvDemonstrativo report={report} onAbrirCategoria={onAbrirCategoria} />
    </div>
  );
}
