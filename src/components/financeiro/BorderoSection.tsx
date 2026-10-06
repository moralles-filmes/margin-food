import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleCheckBig, FileDown, Landmark, Loader2, MinusCircle, Sigma, CalendarClock } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useCan } from '@/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import KpiCard, { type KpiVariant } from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { todayBR, parseUTCToBR } from '@/lib/datetime';
import { useBordero, isBorderoPermissionError } from '@/hooks/useBordero';
import BorderoPeriodFilter from '@/components/financeiro/bordero/BorderoPeriodFilter';
import BorderoCategoryTable from '@/components/financeiro/bordero/BorderoCategoryTable';
import {
  BORDERO_FINAL_BALANCE_MESSAGE,
  borderoOverdueInPeriod,
  createInitialBorderoFilter,
  formatBorderoMoney,
  formatBorderoPeriod,
  resolveBorderoPeriod,
  type BorderoFilterState,
  type BorderoFinalBalanceState,
  type BorderoReport,
} from '@/domain/financeiro/bordero';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { useRetornoFoco } from './useRetornoFoco';
import { useConteinerEstreito } from './useConteinerEstreito';

export const BORDERO_PAGE_SUBTITLE = 'Despesas do período — já pagas e a vencer — e disponibilidade de caixa.';

const FINAL_STATE_VIEW: Record<BorderoFinalBalanceState, { variant: KpiVariant; icon: typeof CheckCircle2; tag: string }> = {
  positive: { variant: 'success', icon: CheckCircle2, tag: 'Positivo' },
  zero: { variant: 'default', icon: MinusCircle, tag: 'Neutro' },
  negative: { variant: 'danger', icon: AlertTriangle, tag: 'Negativo' },
};

/** Mesma grade dos cards carregados, para a página não saltar. */
const GRADE_CARREGANDO = kpiGridClassFor(12, 3);

function LoadingState() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando borderô">
      <FinKpiGrid className={GRADE_CARREGANDO}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} aria-hidden="true" className="space-y-3 rounded-summary border bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </FinKpiGrid>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} aria-hidden="true" className="h-9 w-full" />)}
      </div>
    </div>
  );
}

function AccountsDialog({ report, open, onOpenChange }: { report: BorderoReport; open: boolean; onOpenChange: (open: boolean) => void }) {
  // Aberto pelo card (sem DialogTrigger): o foco volta ao card ao fechar (D49).
  const retornoFoco = useRetornoFoco();
  const [contasRef, estreito] = useConteinerEstreito(480);
  const situacao = (available: boolean) => (available ? null : <StatusBadge status="warning" label="Saldo indisponível" />);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" {...retornoFoco}>
        <DialogHeader>
          <DialogTitle>Composição do saldo das contas</DialogTitle>
          <DialogDescription>
            Contas bancárias e caixas ativos de {report.store.name}. Saldo oficial do Financeiro
            (o mesmo de Contas Bancárias), posição de {parseUTCToBR(report.generatedAt)}.
          </DialogDescription>
        </DialogHeader>
        <div ref={contasRef}>
          {estreito ? (
            <div className="space-y-2">
              {report.accounts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">Nenhuma conta bancária ativa.</p>
              ) : (
                <ul aria-label="Contas" className="divide-y rounded-lg border">
                  {report.accounts.map(account => (
                    <li key={account.id} className="space-y-1 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium text-foreground">{account.name}</p>
                          <p className="text-xs text-muted-foreground">{account.bank ?? '—'}</p>
                        </div>
                        <p className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">{formatBorderoMoney(account.balanceCents)}</p>
                      </div>
                      {situacao(account.balanceAvailable)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
                <span className="text-sm font-bold uppercase tracking-wide text-foreground">Saldo das contas</span>
                <span className="whitespace-nowrap font-bold tabular-nums text-foreground">{formatBorderoMoney(report.totalAccountBalanceCents)}</span>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">Nenhuma conta bancária ativa.</TableCell>
                  </TableRow>
                ) : report.accounts.map(account => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      <span className="mr-2">{account.name}</span>
                      {situacao(account.balanceAvailable)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{account.bank ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBorderoMoney(account.balanceCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold uppercase tracking-wide">Saldo das contas</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-bold tabular-nums">{formatBorderoMoney(report.totalAccountBalanceCents)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
        {report.hasUnavailableBalances && (
          <FinNote>Conta com saldo indisponível entra no total como R$0,00 até o saldo ser calculado.</FinNote>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BorderoSection() {
  const toast = useScopedToast();
  const canView = useCan('financeiro:relatorio-socios:view');
  const canExport = useCan('financeiro:relatorio-socios:export');
  const scope = useCompanyScope();
  const { profile } = useAuth();
  const companyId = scope?.companyId ?? profile?.company_id;

  const todayISO = useMemo(() => todayBR(), []);
  const [filter, setFilter] = useState<BorderoFilterState>(() => createInitialBorderoFilter(todayISO));
  const resolution = useMemo(() => resolveBorderoPeriod(filter), [filter]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useBordero({
    companyId,
    period: resolution.ok ? resolution.period : null,
    enabled: canView,
  });
  const report = query.data;

  const handleExport = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const { exportBorderoPdf } = await import('@/lib/borderoPdfExport');
      exportBorderoPdf(report, { mode: filter.mode });
      toast.success('PDF do borderô gerado.');
    } catch (error) {
      console.error('[Borderô] Falha ao gerar PDF:', error);
      toast.error('Não foi possível gerar o PDF do borderô.');
    } finally {
      setExporting(false);
    }
  };

  if (!canView) return <AccessDenied description="Você não tem permissão para acessar o Borderô." />;

  const finalView = report ? FINAL_STATE_VIEW[report.finalBalanceState] : null;
  const overdueInPeriod = report ? borderoOverdueInPeriod(report, todayISO) : { count: 0, amountCents: 0 };
  const showLoading = resolution.ok && (query.isPending || (query.isFetching && !report));
  const valores = report ? [
    formatBorderoMoney(report.totalPaidCents),
    formatBorderoMoney(report.totalPayableCents),
    formatBorderoMoney(report.totalExpenseCents),
    formatBorderoMoney(report.totalAccountBalanceCents),
    formatBorderoMoney(report.projectedFinalBalanceCents),
  ] : [];
  const resumoGrid = kpiGridClassFor(longestValueLength(valores), 3);
  // O saldo final é a conclusão do borderô: destaque azul quando cobre as contas; negativo fica em
  // card branco com cor de perigo, porque sobre o azul o vermelho não tem contraste (D16/D43).
  const finalNegativo = report?.finalBalanceState === 'negative';

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Borderô"
        description={BORDERO_PAGE_SUBTITLE}
        actions={canExport ? (
          // Com a leitura em erro, o PDF sairia com a última carga boa enquanto a tela mostra o erro (D43/D59).
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={!report || exporting || query.isFetching || query.isError}>
            {exporting ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <FileDown aria-hidden="true" className="w-4 h-4 mr-1" />}
            {exporting ? 'Gerando…' : 'Exportar PDF'}
          </Button>
        ) : undefined}
      />

      <BorderoPeriodFilter filter={filter} resolution={resolution} todayISO={todayISO} onChange={setFilter} />

      {!resolution.ok ? null : showLoading ? (
        <LoadingState />
      ) : query.isError ? (
        isBorderoPermissionError(query.error) ? (
          <AccessDenied title="Acesso negado" description="Você não tem acesso aos dados financeiros desta unidade." />
        ) : (
          <ErrorState
            title="Não foi possível carregar o borderô"
            description="Os valores não foram exibidos para evitar números incorretos. Verifique a conexão e tente novamente."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )
      ) : report && finalView ? (
        <>
          <FinSectionGroup
            id="bordero-resumo"
            title="Resumo do período"
            caption={`${formatBorderoPeriod(report.period)}${query.isFetching ? ' · atualizando…' : ''}`}
          >
            <FinKpiGrid className={resumoGrid}>
              <KpiCard
                appearance="summary"
                label="Contas já pagas"
                value={valores[0]}
                sub={`${report.paidCount} despesa(s) paga(s) no período`}
                icon={CircleCheckBig}
                variant="success"
              />
              <KpiCard
                appearance="summary"
                label="Contas a vencer"
                value={valores[1]}
                sub={overdueInPeriod.count > 0
                  ? `${report.payableCount} em aberto · ${overdueInPeriod.count} vencida(s)`
                  : `${report.payableCount} conta(s) em aberto no período`}
                icon={CalendarClock}
                variant="warning"
              />
              <KpiCard
                appearance="summary"
                label="Total de contas"
                value={valores[2]}
                sub="Já pagas + a vencer no período"
                icon={Sigma}
                variant="default"
              />
              <KpiCard
                appearance="summary"
                label="Saldo das contas"
                value={valores[3]}
                sub={`Ver composição (${report.accounts.length} conta${report.accounts.length === 1 ? '' : 's'})`}
                icon={Landmark}
                variant="primary"
                onClick={() => setAccountsOpen(true)}
                ariaLabel="Saldo das contas — ver composição"
              />
              <KpiCard
                appearance={finalNegativo ? 'summary' : 'highlight'}
                label={`Saldo final provisionado · ${finalView.tag}`}
                value={valores[4]}
                sub={BORDERO_FINAL_BALANCE_MESSAGE[report.finalBalanceState]}
                icon={finalView.icon}
                variant={finalView.variant}
                valueTone={finalNegativo ? 'negative' : 'default'}
              />
            </FinKpiGrid>

            <FinNote>
              Saldo final provisionado = saldo das contas − contas a vencer (o que já foi pago já saiu do saldo).
              Contas já pagas pela data do pagamento (boletos, conciliação e lançamentos manuais — igual ao Livro
              Razão); contas a vencer pela data de vencimento. A baixa de um boleto nunca é somada duas vezes.
            </FinNote>
          </FinSectionGroup>

          {report.overdueBeforePeriod.count > 0 && (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Contas vencidas antes do período</AlertTitle>
              <AlertDescription className="text-foreground">
                {report.overdueBeforePeriod.count} conta(s) em aberto venceram antes de o período começar
                ({formatBorderoMoney(report.overdueBeforePeriod.amountCents)}) e não compõem este borderô.
              </AlertDescription>
            </Alert>
          )}

          {report.hasUnavailableBalances && (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Saldo indisponível em alguma conta</AlertTitle>
              <AlertDescription className="text-foreground">
                Uma ou mais contas ativas ainda não têm saldo calculado e foram consideradas como R$0,00. Veja a composição do saldo.
              </AlertDescription>
            </Alert>
          )}

          <BorderoCategoryTable report={report} todayISO={todayISO} />

          <AccountsDialog report={report} open={accountsOpen} onOpenChange={setAccountsOpen} />
        </>
      ) : null}
    </div>
  );
}
