import { useMemo, useState } from 'react';
import { AlertTriangle, Ban, CalendarDays, ChevronLeft, ChevronRight, Download, Info, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/ui/PageHeader';
import { DateRangePicker } from '@/components/ui/DatePicker';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useCan } from '@/permissions';
import { todayBR } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import {
  deslocarFiltro, filtroPadrao, formatarIntervalo, intervaloAnterior, intervaloDoModo, tituloDoFiltro,
  trocarModo, validarFiltro, type CmvCategoriaLinha, type CmvFiltro, type CmvModo,
} from '@/domain/financeiro/cmv';
import {
  CMV_SEM_CATEGORIA_UUID, isCmvIndisponivel, isCmvPermissionError, useCmvReport, type CmvSituacao,
} from '@/hooks/useCmvFinanceiro';
import CmvCards, { CmvCardsSkeleton } from './CmvCards';
import CmvVisaoGeral from './CmvVisaoGeral';
import CmvAnaliseCategoria from './CmvAnaliseCategoria';
import CmvComparativo from './CmvComparativo';
import CmvRegrasVinculo from './CmvRegrasVinculo';
import CmvBoletosDialog, { type CmvBoletosAlvo } from './CmvBoletosDialog';
import CmvExportSheet from './CmvExportSheet';

type Aba = 'visao' | 'categorias' | 'comparativo' | 'regras';

const MODOS: { value: CmvModo; label: string }[] = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'periodo', label: 'Período' },
];

const ABAS: { value: Aba; label: string }[] = [
  { value: 'visao', label: 'Visão Geral' },
  { value: 'categorias', label: 'Análise por Categoria' },
  { value: 'comparativo', label: 'Comparativo' },
];

const ATALHO_ATUAL: Record<Exclude<CmvModo, 'periodo'>, string> = {
  semanal: 'Semana atual',
  quinzenal: 'Quinzena atual',
  mensal: 'Mês atual',
};

const SITUACAO_TITULO: Record<CmvSituacao, string> = {
  incluido: 'Boletos incluídos no CMV',
  fora: 'Boletos fora do CMV',
  pendente: 'Boletos pendentes de classificação',
  sem_competencia: 'Boletos sem data de competência',
  todos: 'Lançamentos e classificação no CMV',
};

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="mr-2 h-5 w-5" /> Acesso negado
    </div>
  );
}

function ConteudoSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando CMV Financeiro">
      <CmvCardsSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-[340px] rounded-2xl xl:col-span-7" />
        <Skeleton className="h-[340px] rounded-2xl xl:col-span-5" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-[320px] rounded-2xl xl:col-span-4" />
        <Skeleton className="h-[320px] rounded-2xl xl:col-span-5" />
        <Skeleton className="h-[320px] rounded-2xl xl:col-span-3" />
      </div>
    </div>
  );
}

export default function CmvFinanceiroSection() {
  const canView = useCan('financeiro:cmv:view');
  const canExport = useCan('financeiro:cmv:export');
  const canManage = useCan('financeiro:cmv:manage');
  const canPagarView = useCan('financeiro:pagar:view');
  const canPagarEdit = useCan('financeiro:pagar:edit');
  const scope = useCompanyScope();
  const { profile } = useAuth();
  const companyId = scope?.companyId ?? profile?.company_id;

  const hoje = useMemo(() => todayBR(), []);
  // Sempre abre na semana corrente e na Visão Geral; o filtro vale para todas as abas.
  const [filtro, setFiltro] = useState<CmvFiltro>(() => filtroPadrao(hoje));
  const [aba, setAba] = useState<Aba>('visao');
  const [alvo, setAlvo] = useState<CmvBoletosAlvo | null>(null);
  const [exportando, setExportando] = useState(false);
  const [avisosAbertos, setAvisosAbertos] = useState(false);

  const erroFiltro = validarFiltro(filtro);
  const query = useCmvReport({ companyId, filtro, enabled: canView });
  const report = query.data;
  const anterior = useMemo(() => (erroFiltro ? null : intervaloAnterior(filtro)), [filtro, erroFiltro]);

  if (!canView) return <NoAccess />;

  const carregando = !erroFiltro && (query.isPending || (query.isFetching && !report));
  const indisponivel = query.isError && isCmvIndisponivel(query.error);

  const faixaDoRelatorio = report?.janelas.efetivoAtual ?? (erroFiltro ? null : { inicio: filtro.inicio, fim: filtro.fim });

  const abrirCategoria = (linha: CmvCategoriaLinha) => {
    if (!faixaDoRelatorio) return;
    setAlvo({
      titulo: `Boletos de origem — ${linha.nome}`,
      descricao: `Linhas de rateio incluídas no CMV, com competência em ${formatarIntervalo(faixaDoRelatorio)}.`,
      inicio: faixaDoRelatorio.inicio,
      fim: faixaDoRelatorio.fim,
      situacao: 'incluido',
      categoriaId: linha.id === '__total__' ? null : (linha.categoriaId ?? CMV_SEM_CATEGORIA_UUID),
      // A linha "(lançado direto)" mostra só o valor da própria categoria; o detalhe usa o mesmo recorte.
      soDireto: linha.id.startsWith('direto:'),
    });
  };

  const abrirLista = (situacao: CmvSituacao, escopo: 'geral' | 'periodo' = 'periodo') => {
    const semPeriodo = escopo === 'geral' || situacao === 'sem_competencia' || !faixaDoRelatorio;
    setAlvo({
      titulo: SITUACAO_TITULO[situacao],
      descricao: situacao === 'sem_competencia'
        ? 'Sem data de competência o boleto não entra em nenhum período. Informe a competência em Contas a Pagar.'
        : semPeriodo
          ? 'Todos os boletos da unidade com esta situação, de qualquer competência.'
          : `Competência em ${formatarIntervalo(faixaDoRelatorio!)}.`,
      inicio: semPeriodo ? null : faixaDoRelatorio!.inicio,
      fim: semPeriodo ? null : faixaDoRelatorio!.fim,
      situacao,
      categoriaId: null,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="CMV Financeiro"
        subtitle="Custo das mercadorias pelos boletos de Contas a Pagar (competência) sobre o faturamento do Fechamento de Caixa."
        actions={canExport ? (
          <Button type="button" variant="outline" onClick={() => setExportando(true)} disabled={!report || query.isFetching}>
            <Download className="mr-2 h-4 w-4" />Exportar
          </Button>
        ) : undefined}
      />

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Tipo de período" className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          {MODOS.map(modo => {
            const ativo = filtro.modo === modo.value;
            return (
              <button
                key={modo.value} type="button" role="radio" aria-checked={ativo}
                onClick={() => setFiltro(atual => trocarModo(atual, modo.value, hoje))}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  ativo ? 'bg-primary-strong text-primary-strong-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {modo.label}
              </button>
            );
          })}
        </div>

        {filtro.modo === 'periodo' ? (
          <DateRangePicker
            from={filtro.inicio} to={filtro.fim} aria-label="Período de competência" className="h-10 w-auto min-w-[16rem]"
            onChange={(inicio, fim) => setFiltro({ modo: 'periodo', inicio, fim })}
          />
        ) : (
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFiltro(f => deslocarFiltro(f, -1))} aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="inline-flex items-center gap-2 px-2 text-sm font-medium tabular-nums text-foreground" aria-live="polite">
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {tituloDoFiltro(filtro)}
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFiltro(f => deslocarFiltro(f, 1))} aria-label="Próximo período">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {filtro.modo !== 'periodo' && (
          <Button
            type="button" variant="outline" size="sm" className="h-10"
            disabled={hoje >= filtro.inicio && hoje <= filtro.fim}
            onClick={() => setFiltro({ modo: filtro.modo, ...intervaloDoModo(filtro.modo as Exclude<CmvModo, 'periodo'>, hoje) })}
          >
            {ATALHO_ATUAL[filtro.modo as Exclude<CmvModo, 'periodo'>]}
          </Button>
        )}

        <p className="ml-auto text-sm text-muted-foreground">
          Comparar com: <span className="font-medium text-foreground">período anterior</span>
          {anterior && <span className="tabular-nums"> · {formatarIntervalo(anterior)}</span>}
        </p>
      </div>

      {erroFiltro && (!filtro.inicio || !filtro.fim) && (
        <p className="text-sm text-muted-foreground" role="status">Selecione a data inicial e a data final do período.</p>
      )}
      {erroFiltro && filtro.inicio && filtro.fim && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Período inválido</AlertTitle>
          <AlertDescription>{erroFiltro}</AlertDescription>
        </Alert>
      )}

      {/* ── Estados ── */}
      {erroFiltro ? null : carregando ? (
        <ConteudoSkeleton />
      ) : indisponivel ? (
        <Alert>
          <Info />
          <AlertTitle>CMV Financeiro ainda não ativado neste ambiente</AlertTitle>
          <AlertDescription>A estrutura do relatório ainda não foi publicada no banco de dados. Nenhum dado foi alterado.</AlertDescription>
        </Alert>
      ) : query.isError || !report ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{isCmvPermissionError(query.error) ? 'Acesso negado' : 'Não foi possível carregar o CMV Financeiro'}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {isCmvPermissionError(query.error)
                ? 'Você não tem acesso ao CMV Financeiro desta unidade.'
                : 'Os valores não foram exibidos para evitar números incorretos. Verifique a conexão e tente novamente.'}
            </p>
            {!isCmvPermissionError(query.error) && (
              <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
                <RefreshCw className="mr-1 h-4 w-4" />Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {report.avisos.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-warning-border bg-warning-soft px-3 py-2.5" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <ul id="cmv-avisos" className="min-w-0 flex-1 space-y-1 text-sm text-warning">
                {(avisosAbertos ? report.avisos : report.avisos.slice(0, 1)).map(aviso => (
                  <li key={`${aviso.tipo}:${aviso.texto}`}>{aviso.texto}</li>
                ))}
              </ul>
              {report.avisos.length > 1 && (
                <Button
                  type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-warning hover:bg-warning-soft"
                  aria-expanded={avisosAbertos} aria-controls="cmv-avisos" onClick={() => setAvisosAbertos(v => !v)}
                >
                  {avisosAbertos ? 'Mostrar menos' : `Ver os ${report.avisos.length} avisos`}
                </Button>
              )}
            </div>
          )}

          <div className={cn('space-y-4 transition-opacity', query.isFetching && 'opacity-60')} aria-busy={query.isFetching}>
            <CmvCards report={report} />

            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border">
              <div role="tablist" aria-label="Seções do CMV Financeiro" className="flex flex-wrap">
                {ABAS.map(item => (
                  <button
                    key={item.value} type="button" role="tab" id={`cmv-aba-${item.value}`} aria-selected={aba === item.value}
                    aria-controls="cmv-painel" onClick={() => setAba(item.value)}
                    className={cn(
                      '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      aba === item.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button" role="tab" id="cmv-aba-regras" aria-selected={aba === 'regras'} aria-controls="cmv-painel"
                onClick={() => setAba('regras')}
                className={cn(
                  '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  aba === 'regras' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Info className="h-4 w-4" aria-hidden="true" />Regras de vínculo
              </button>
            </div>

            <div id="cmv-painel" role="tabpanel" aria-labelledby={`cmv-aba-${aba}`}>
              {aba === 'visao' && <CmvVisaoGeral report={report} onAbrirCategoria={abrirCategoria} onAbrirLista={abrirLista} />}
              {aba === 'categorias' && <CmvAnaliseCategoria report={report} onAbrirCategoria={abrirCategoria} />}
              {aba === 'comparativo' && <CmvComparativo report={report} onAbrirCategoria={abrirCategoria} />}
              {aba === 'regras' && (
                <CmvRegrasVinculo
                  companyId={companyId}
                  canManage={canManage}
                  canRevisar={canManage}
                  pendentesGeral={report.pendentesGeral}
                  semCompetencia={report.semCompetencia}
                  onAbrirLista={abrirLista}
                />
              )}
            </div>
          </div>
        </>
      )}

      <CmvBoletosDialog
        alvo={alvo}
        onClose={() => setAlvo(null)}
        companyId={companyId}
        canClassificar={canManage || canPagarEdit}
        canLote={canManage}
        canAbrirBoleto={canPagarView}
      />
      {report && canExport && <CmvExportSheet open={exportando} onOpenChange={setExportando} report={report} />}
    </div>
  );
}
