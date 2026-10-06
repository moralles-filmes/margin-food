import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, FileText, Minus, Percent, ShoppingCart, TrendingUp, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  formatarCentavos, formatarCentavosComSinal, formatarPercentual, formatarPontos, formatarVariacao,
  type CmvReport,
} from '@/domain/financeiro/cmv';

/** Painel branco com título, usado por todos os blocos do CMV Financeiro. */
export function CmvPainel({ titulo, acoes, legenda, children, className, id }: {
  titulo: ReactNode;
  acoes?: ReactNode;
  legenda?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        {(legenda || acoes) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {legenda}
            {acoes}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

type Tom = 'positivo' | 'negativo' | 'neutro';
type Estilo = 'sucesso' | 'perigo' | 'aviso' | 'primario' | 'info';

const ESTILOS: Record<Estilo, { fundo: string; icone: string }> = {
  sucesso: { fundo: 'from-success-soft', icone: 'bg-success-soft text-success' },
  perigo: { fundo: 'from-destructive-soft', icone: 'bg-destructive-soft text-destructive' },
  aviso: { fundo: 'from-warning-soft', icone: 'bg-warning-soft text-warning' },
  primario: { fundo: 'from-primary-soft', icone: 'bg-primary-soft text-primary-ink' },
  info: { fundo: 'from-info-soft', icone: 'bg-info-soft text-info' },
};

const TONS: Record<Tom, string> = {
  positivo: 'text-success',
  negativo: 'text-destructive',
  neutro: 'text-foreground',
};

interface IndicadorProps {
  rotulo: string;
  valor: string;
  icone: LucideIcon;
  estilo: Estilo;
  /** Variação já formatada ("+6,8%", "-8,48 p.p."); `null` = sem base de comparação. */
  variacao: string | null;
  direcao: 'sobe' | 'desce' | 'estavel' | null;
  tom: Tom;
  contexto: string;
  rodape: ReactNode;
  /** Explica por que o valor é "—". */
  observacao?: string | null;
}

/**
 * Card de indicador do design aprovado do CMV Financeiro (ícone em contêiner à
 * esquerda, variação e referência anterior abaixo do valor). É a exceção
 * deliberada ao `KpiCard`, cujo layout não comporta as três linhas do mockup.
 */
function CmvIndicadorCard({ rotulo, valor, icone: Icone, estilo, variacao, direcao, tom, contexto, rodape, observacao }: IndicadorProps) {
  const e = ESTILOS[estilo];
  const Seta = direcao === 'sobe' ? ArrowUp : direcao === 'desce' ? ArrowDown : direcao === 'estavel' ? Minus : null;
  return (
    <article className={cn('rounded-2xl border border-border bg-gradient-to-br to-card p-4 shadow-sm', e.fundo)}>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', e.icone)}>
          <Icone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-tight text-foreground">{rotulo}</h3>
          <p className="mt-1 break-words text-2xl font-bold leading-tight tabular-nums text-foreground">{valor}</p>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm">
        {variacao === null ? (
          <span className="text-muted-foreground">Sem base de comparação</span>
        ) : (
          <>
            <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', TONS[tom])}>
              {Seta && <Seta className="h-3.5 w-3.5" aria-hidden="true" />}
              {variacao}
            </span>
            <span className="text-muted-foreground">{contexto}</span>
          </>
        )}
      </p>
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">{rodape}</p>
      {observacao && <p className="mt-1 text-xs text-muted-foreground">{observacao}</p>}
    </article>
  );
}

function direcaoDe(valor: number | null): 'sobe' | 'desce' | 'estavel' | null {
  if (valor === null) return null;
  return valor > 0 ? 'sobe' : valor < 0 ? 'desce' : 'estavel';
}

export function CmvCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="status" aria-label="Carregando indicadores">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
    </div>
  );
}

export default function CmvCards({ report }: { report: CmvReport }) {
  const { faturamento, cmv, percentual, documentos, atual, anterior } = report;
  const semAnterior = anterior.intervalo === null;
  const contexto = 'vs. período anterior';
  const plural = (n: number | null) => (n === null ? '—' : `${n} ${n === 1 ? 'despesa' : 'despesas'}`);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <CmvIndicadorCard
        rotulo="Faturamento"
        valor={formatarCentavos(faturamento.atual)}
        icone={BarChart3}
        estilo="sucesso"
        variacao={faturamento.variacaoPercentual === null ? null : formatarVariacao(faturamento.variacaoPercentual)}
        direcao={direcaoDe(faturamento.variacaoPercentual)}
        tom={(faturamento.variacaoPercentual ?? 0) > 0 ? 'positivo' : (faturamento.variacaoPercentual ?? 0) < 0 ? 'negativo' : 'neutro'}
        contexto={contexto}
        rodape={semAnterior ? '—' : anterior.faturamentoCentavos === null ? 'Anterior: sem fechamento' : formatarCentavos(anterior.faturamentoCentavos)}
        observacao={faturamento.atual === null ? 'Sem fechamento de caixa no período.' : null}
      />
      <CmvIndicadorCard
        rotulo="CMV Financeiro"
        valor={formatarCentavos(cmv.atual)}
        icone={ShoppingCart}
        estilo="perigo"
        variacao={cmv.variacaoPercentual === null ? null : formatarVariacao(cmv.variacaoPercentual)}
        direcao={direcaoDe(cmv.variacaoPercentual)}
        // Custo absoluto maior não é, sozinho, pior desempenho: sem cor de alerta.
        tom="neutro"
        contexto={contexto}
        rodape={semAnterior ? '—' : formatarCentavos(anterior.cmvCentavos)}
      />
      <CmvIndicadorCard
        rotulo="% CMV"
        valor={formatarPercentual(percentual.atual)}
        icone={Percent}
        estilo="aviso"
        variacao={percentual.pontos === null ? null : formatarPontos(percentual.pontos)}
        direcao={direcaoDe(percentual.pontos)}
        tom={(percentual.pontos ?? 0) < 0 ? 'positivo' : (percentual.pontos ?? 0) > 0 ? 'negativo' : 'neutro'}
        contexto={contexto}
        rodape={semAnterior ? '—' : formatarPercentual(percentual.anterior)}
        observacao={percentual.atual === null ? atual.motivoSemPercentual : 'CMV ÷ faturamento do período'}
      />
      <CmvIndicadorCard
        rotulo="Variação do CMV em R$"
        valor={formatarCentavosComSinal(cmv.diferenca)}
        icone={TrendingUp}
        estilo="primario"
        variacao={cmv.variacaoPercentual === null ? null : formatarVariacao(cmv.variacaoPercentual)}
        direcao={direcaoDe(cmv.variacaoPercentual)}
        tom="neutro"
        contexto="no custo"
        rodape={semAnterior ? '—' : (
          <span className="inline-flex flex-wrap items-center gap-1">
            {formatarCentavos(anterior.cmvCentavos)}
            <ArrowRight className="h-3.5 w-3.5" aria-label="para" />
            {formatarCentavos(cmv.atual)}
          </span>
        )}
      />
      <CmvIndicadorCard
        rotulo="Despesas vinculadas ao CMV"
        valor={documentos.atual === null ? '—' : String(documentos.atual)}
        icone={FileText}
        estilo="info"
        variacao={documentos.variacaoPercentual === null ? null : formatarVariacao(documentos.variacaoPercentual)}
        direcao={direcaoDe(documentos.variacaoPercentual)}
        tom="neutro"
        contexto={contexto}
        rodape={semAnterior ? '—' : plural(anterior.documentos)}
        observacao={`${atual.boletos} ${atual.boletos === 1 ? 'boleto' : 'boletos'} · ${atual.lancamentos} ${atual.lancamentos === 1 ? 'lançamento' : 'lançamentos'}`}
      />
    </div>
  );
}
