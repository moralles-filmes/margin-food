import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleCheckBig, FileDown, Landmark, Loader2, MinusCircle, RefreshCw, ShieldX, Sigma, Wallet, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/ui/PageHeader';
import KpiCard, { type KpiVariant } from '@/components/ui/KpiCard';
import { todayBR, parseUTCToBR } from '@/lib/datetime';
import { useBordero, isBorderoPermissionError } from '@/hooks/useBordero';
import BorderoPeriodFilter from '@/components/financeiro/bordero/BorderoPeriodFilter';
import BorderoCategoryTable from '@/components/financeiro/bordero/BorderoCategoryTable';
import {
  BORDERO_FINAL_BALANCE_MESSAGE,
  borderoOverdueInPeriod,
  createInitialBorderoFilter,
  formatBorderoMoney,
  resolveBorderoPeriod,
  type BorderoFilterState,
  type BorderoFinalBalanceState,
  type BorderoReport,
} from '@/domain/financeiro/bordero';

export const BORDERO_PAGE_SUBTITLE = 'Despesas do período — já pagas e a vencer — e disponibilidade de caixa.';

const FINAL_STATE_VIEW: Record<BorderoFinalBalanceState, { variant: KpiVariant; icon: typeof CheckCircle2; tag: string }> = {
  positive: { variant: 'success', icon: CheckCircle2, tag: 'Positivo' },
  zero: { variant: 'default', icon: MinusCircle, tag: 'Neutro' },
  negative: { variant: 'danger', icon: AlertTriangle, tag: 'Negativo' },
};

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldX className="w-10 h-10" />
      <p className="font-medium">Acesso restrito</p>
      <p className="text-sm">Você não tem permissão para acessar o Borderô.</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" role="status" aria-label="Carregando borderô">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[108px] w-full rounded-xl" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
    </div>
  );
}

function AccountsDialog({ report, open, onOpenChange }: { report: BorderoReport; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Composição do saldo das contas</DialogTitle>
          <DialogDescription>
            Contas bancárias e caixas ativos de {report.store.name}. Saldo oficial do Financeiro
            (o mesmo de Contas Bancárias), posição de {parseUTCToBR(report.generatedAt)}.
          </DialogDescription>
        </DialogHeader>
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
                  {account.name}
                  {!account.balanceAvailable && <span className="ml-2 text-xs text-warning">(saldo indisponível)</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{account.bank ?? '—'}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatBorderoMoney(account.balanceCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold uppercase tracking-wide">Saldo das contas</TableCell>
              <TableCell className="text-right font-mono font-bold tabular-nums">{formatBorderoMoney(report.totalAccountBalanceCents)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

export default function BorderoSection() {
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

  if (!canView) return <NoAccess />;

  const finalView = report ? FINAL_STATE_VIEW[report.finalBalanceState] : null;
  const overdueInPeriod = report ? borderoOverdueInPeriod(report, todayISO) : { count: 0, amountCents: 0 };
  const showLoading = resolution.ok && (query.isPending || (query.isFetching && !report));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Borderô"
        subtitle={BORDERO_PAGE_SUBTITLE}
        actions={canExport ? (
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={!report || exporting || query.isFetching}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
            {exporting ? 'Gerando…' : 'Exportar PDF'}
          </Button>
        ) : undefined}
      />

      <BorderoPeriodFilter filter={filter} resolution={resolution} todayISO={todayISO} onChange={setFilter} />

      {!resolution.ok ? null : showLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{isBorderoPermissionError(query.error) ? 'Acesso negado' : 'Não foi possível carregar o borderô'}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {isBorderoPermissionError(query.error)
                ? 'Você não tem acesso aos dados financeiros desta unidade.'
                : 'Os valores não foram exibidos para evitar números incorretos. Verifique a conexão e tente novamente.'}
            </p>
            {!isBorderoPermissionError(query.error) && (
              <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : report && finalView ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard
              label="Contas já pagas"
              value={formatBorderoMoney(report.totalPaidCents)}
              sub={`${report.paidCount} despesa(s) paga(s) no período`}
              icon={CircleCheckBig}
              variant="success"
            />
            <KpiCard
              label="Contas a vencer"
              value={formatBorderoMoney(report.totalPayableCents)}
              sub={overdueInPeriod.count > 0
                ? `${report.payableCount} em aberto · ${overdueInPeriod.count} vencida(s)`
                : `${report.payableCount} conta(s) em aberto no período`}
              icon={CalendarClock}
              variant="warning"
            />
            <KpiCard
              label="Total de contas"
              value={formatBorderoMoney(report.totalExpenseCents)}
              sub="Já pagas + a vencer no período"
              icon={Sigma}
              variant="default"
            />
            <KpiCard
              label="Saldo das contas"
              value={formatBorderoMoney(report.totalAccountBalanceCents)}
              sub={`Ver composição (${report.accounts.length} conta${report.accounts.length === 1 ? '' : 's'})`}
              icon={Landmark}
              variant="primary"
              onClick={() => setAccountsOpen(true)}
              ariaLabel="Saldo das contas — ver composição"
            />
            <KpiCard
              label={`Saldo final provisionado · ${finalView.tag}`}
              value={formatBorderoMoney(report.projectedFinalBalanceCents)}
              sub={BORDERO_FINAL_BALANCE_MESSAGE[report.finalBalanceState]}
              icon={finalView.icon}
              variant={finalView.variant}
            />
          </div>

          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Wallet className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              Saldo final provisionado = saldo das contas − contas a vencer (o que já foi pago já saiu do saldo).
              Contas já pagas pela data do pagamento (boletos, conciliação e lançamentos manuais — igual ao Livro
              Razão); contas a vencer pela data de vencimento. A baixa de um boleto nunca é somada duas vezes.
            </span>
          </p>

          {report.overdueBeforePeriod.count > 0 && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Contas vencidas antes do período</AlertTitle>
              <AlertDescription>
                {report.overdueBeforePeriod.count} conta(s) em aberto venceram antes de o período começar
                ({formatBorderoMoney(report.overdueBeforePeriod.amountCents)}) e não compõem este borderô.
              </AlertDescription>
            </Alert>
          )}

          {report.hasUnavailableBalances && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Saldo indisponível em alguma conta</AlertTitle>
              <AlertDescription>
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
