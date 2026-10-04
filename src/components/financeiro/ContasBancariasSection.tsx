import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL } from '@/lib/money';
import { formatDateBR, parseLocalDate } from '@/lib/formatters';
import { loadSaldoExtrato } from '@/lib/conciliacaoSaldoExtrato';
import { cn } from '@/lib/utils';
import { BRLInput } from '@/components/ui/brl-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import {
  Plus, Landmark, Search, Download, ShieldAlert, Wallet, CreditCard, Pencil, PowerOff, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import * as XLSX from '@/lib/safeXlsx';
import { includesNormalized } from '@/lib/utils';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import {
  TIPO_CONTA_LABEL,
  TIPO_CONTA_OPTIONS,
  composicaoPorTipo,
  conferenciaExtrato,
  contaDadosBancarios,
  somaSaldosContas,
  tipoContaLabel,
} from './contasBancariasView';

// ─── Types ───
interface ContaBancaria {
  id: string;
  nome: string;
  tipo: string;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  saldo_inicial: number;
  ativo: boolean;
  updated_at: string;
}

const CONTA_FIELDS = `
  id, nome, tipo, banco, agencia, numero_conta,
  saldo_inicial, ativo, updated_at
` as const;

const TIPO_LABEL = TIPO_CONTA_LABEL;
const TIPO_OPTIONS = TIPO_CONTA_OPTIONS;

const TIPO_ICON: Record<string, LucideIcon> = {
  corrente: Landmark,
  poupanca: Landmark,
  caixa_fisico: Wallet,
  maquininha: CreditCard,
};

/** Estado do carregamento de `get_all_saldos_contas`: erro nunca vira saldo zero na tela. */
type SaldosStatus = 'loading' | 'ready' | 'error';

// ─── NoAccess ───
function NoAccess() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Acesso negado</p>
        <p className="text-sm mt-1">Você não tem permissão para visualizar contas bancárias.</p>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ───
function SkeletonSummary() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0, 1].map(i => (
        <div key={i} className="rounded-summary border bg-card p-5 space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  );
}

function SkeletonAccounts() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-summary border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

interface ContaCardProps {
  conta: ContaBancaria;
  saldo: number;
  saldosStatus: SaldosStatus;
  canEdit: boolean;
  canDelete: boolean;
  saving: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onVerExtrato: () => void;
}

/** Card de uma conta: o saldo é o protagonista; as ações administrativas ficam pequenas no canto. */
function ContaCard({ conta, saldo, saldosStatus, canEdit, canDelete, saving, onEdit, onDeactivate, onVerExtrato }: ContaCardProps) {
  const Icon = TIPO_ICON[conta.tipo] ?? Landmark;
  const titleId = `conta-${conta.id}-nome`;
  const dadosBancarios = contaDadosBancarios(conta);

  return (
    <article aria-labelledby={titleId} className="flex flex-col rounded-summary border bg-card p-5 shadow-card animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 id={titleId} className="break-words font-semibold leading-snug text-foreground">{conta.nome}</h4>
          <p className="text-xs text-muted-foreground">{tipoContaLabel(conta.tipo)}</p>
        </div>
        {(canEdit || canDelete) && (
          <div className="-mr-2 -mt-1 flex shrink-0 items-center">
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
                disabled={saving}
                aria-label={`Editar conta ${conta.nome}`}
                title="Editar conta"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                onClick={onDeactivate}
                disabled={saving}
                aria-label={`Desativar conta ${conta.nome}`}
                title="Desativar conta"
              >
                <PowerOff aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {dadosBancarios && <p className="mt-2 break-words text-xs text-muted-foreground">{dadosBancarios}</p>}

      <div className="mt-4 flex-1 space-y-1">
        <p className="text-[13px] leading-tight text-muted-foreground">Saldo atual no sistema</p>
        {saldosStatus === 'loading' ? (
          <Skeleton className="h-7 w-32" />
        ) : saldosStatus === 'error' ? (
          <p className="text-sm font-medium text-muted-foreground">Saldo indisponível</p>
        ) : (
          <p className={cn(
            'text-2xl font-bold leading-tight tracking-tight tabular-nums break-words',
            saldo < 0 ? 'text-destructive' : 'text-foreground',
          )}>
            {fmtBRL(saldo)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Saldo inicial: <span className="tabular-nums">{fmtBRL(conta.saldo_inicial)}</span></p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <StatusBadge status="ativo" label="Ativa" />
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={onVerExtrato}
          aria-label={`Ver extrato de ${conta.nome}`}
        >
          Ver extrato <ChevronRight aria-hidden="true" className="ml-0.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}

interface ContasBancariasProps {
  onNavigateExtrato?: (contaId: string) => void;
}

export default function ContasBancariasSection({ onNavigateExtrato }: ContasBancariasProps = {}) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const { user } = useAuth();
  const canView = useCan('financeiro:contas:view');
  const canCreate = useCan('financeiro:contas:create');
  const canEdit = useCan('financeiro:contas:edit');
  const canDelete = useCan('financeiro:contas:delete');
  const canExport = useCan('financeiro:contas:export');
  const canViewConciliacao = useCan('financeiro:conciliacao:view');
  const canReconcile = useCan('financeiro:conciliacao:reconcile');
  const canCheckSaldoNaReferencia = canViewConciliacao || canReconcile;

  const [items, setItems] = useState<ContaBancaria[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [saldosStatus, setSaldosStatus] = useState<SaldosStatus>('loading');
  const [saldosNaReferencia, setSaldosNaReferencia] = useState<
    Record<string, { data: string; valor: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('ALL');
  const [form, setForm] = useState({
    nome: '', tipo: 'corrente', banco: '', agencia: '', numero_conta: '', saldo_inicial: 0,
  });

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Load data ───
  const loadSaldos = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_all_saldos_contas');
    if (error) {
      console.error('[ContasBancariasSection.loadSaldos]', error);
      setSaldosStatus('error');
      return;
    }
    if (data && Array.isArray(data)) {
      const map: Record<string, number> = {};
      for (const row of data as { conta_id: string; saldo: number }[]) {
        map[row.conta_id] = Number(row.saldo) || 0;
      }
      setSaldos(map);
    }
    setSaldosStatus('ready');
  }, [supabase]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const { data, error } = await supabase.from('fin_contas').select(CONTA_FIELDS).eq('ativo', true).order('nome');
    if (error) console.error('[ContasBancariasSection.load]', error);
    setLoadError(!!error);
    setItems((data as ContaBancaria[] | null) || []);
    setLoading(false);
  }, [canView, supabase]);

  useEffect(() => {
    load().then(() => loadSaldos());
  }, [load, loadSaldos]);

  const retryLoad = () => {
    setSaldosStatus('loading');
    load().then(() => loadSaldos());
  };

  // O checkpoint bancário pode ser histórico (ex.: 31/08) enquanto o card já
  // mostra movimentos de 01/09. Compara banco e razão sempre na mesma data.
  useEffect(() => {
    let cancelled = false;
    if (!canCheckSaldoNaReferencia) {
      setSaldosNaReferencia({});
      return () => { cancelled = true; };
    }

    const checkpoints = items.flatMap(item => {
      const saldoBanco = loadSaldoExtrato(item.id);
      return saldoBanco ? [{ contaId: item.id, saldoBanco }] : [];
    });

    if (checkpoints.length === 0) {
      setSaldosNaReferencia({});
      return () => { cancelled = true; };
    }

    void Promise.all(checkpoints.map(async ({ contaId, saldoBanco }) => {
      const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', {
        p_conta_id: contaId,
        p_data: saldoBanco.data,
      });
      if (error) {
        console.error('[ContasBancariasSection.saldoNaReferencia]', error);
        return null;
      }
      return { contaId, data: saldoBanco.data, valor: Number(data) || 0 };
    })).then(results => {
      if (cancelled) return;
      const next: Record<string, { data: string; valor: number }> = {};
      for (const result of results) {
        if (result) next[result.contaId] = { data: result.data, valor: result.valor };
      }
      setSaldosNaReferencia(next);
    });

    return () => { cancelled = true; };
  }, [canCheckSaldoNaReferencia, items, saldos, supabase]);

  // Reactive events
  useDataEvent('financeiro:contas', load);
  useDataEvent('financeiro:lancamentos', loadSaldos);
  useDataEvent('financeiro:contas_pagar', loadSaldos);
  useDataEvent('financeiro:contas_receber', loadSaldos);
  useDataEvent('financeiro:conciliacao', loadSaldos);

  // ─── Filtering ───
  const filtered = items.filter(c => {
    const matchSearch = !search || includesNormalized(c.nome, search) || includesNormalized(c.banco || '', search);
    const matchTipo = tipoFiltro === 'ALL' || c.tipo === tipoFiltro;
    return matchSearch && matchTipo;
  });

  // ─── Form ───
  const openEdit = (item: ContaBancaria) => {
    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setForm({
      nome: item.nome,
      tipo: item.tipo,
      banco: item.banco || '',
      agencia: item.agencia || '',
      numero_conta: item.numero_conta || '',
      saldo_inicial: item.saldo_inicial || 0,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({ nome: '', tipo: 'corrente', banco: '', agencia: '', numero_conta: '', saldo_inicial: 0 });
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  // ─── Early return ───
  if (!canView) return <NoAccess />;

  const save = async () => {
    if (saving) return;
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }

    setSaving(true);
    try {
      const payload = {
        nome: form.nome,
        tipo: form.tipo,
        banco: form.banco || null,
        agencia: form.agencia || null,
        numero_conta: form.numero_conta || null,
        saldo_inicial: form.saldo_inicial,
      };

      if (editId) {
        const { error } = await (supabase.rpc as any)('_guarded_update_conta', {
          p_id: editId,
          p_nome: form.nome,
          p_tipo: form.tipo,
          p_banco: form.banco || '',
          p_agencia: form.agencia || '',
          p_numero_conta: form.numero_conta || '',
          p_saldo_inicial: form.saldo_inicial,
          p_expected_updated_at: editUpdatedAt
        });
        if (error) { toast.error(error.message); return; }
        toast.success('Conta atualizada');
      } else {
        const { error } = await supabase.from('fin_contas').insert(withCompanyId(companyId, { ...payload, created_by: user?.id }));
        if (error) { toast.error(error.message); return; }
        toast.success('Conta criada');
      }
      resetForm();
      load();
      loadSaldos();
      emitDataEvent('financeiro:contas');
    } finally {
      setSaving(false);
    }
  };

  // ─── Deactivate with validations ───
  const deactivate = async (item: ContaBancaria) => {
    // Check pending transactions
    const { data: pendingLanc } = await supabase
      .from('fin_lancamentos')
      .select('id')
      .eq('conta_id', item.id)
      .eq('status', 'PENDENTE')
      .limit(1);

    if (pendingLanc && pendingLanc.length > 0) {
      toast.error('Conta possui lançamentos pendentes e não pode ser desativada.');
      return;
    }

    // Check non-zero balance
    const saldo = saldos[item.id] || 0;
    let description = `Tem certeza? A conta "${item.nome}" ficará oculta mas os lançamentos serão preservados.`;
    if (saldosStatus !== 'ready') {
      // Saldo indisponível não é saldo zero: sem ele, o aviso de saldo não pode ser omitido.
      description = `Não foi possível conferir o saldo da conta "${item.nome}" agora. Deseja desativar mesmo assim? Os lançamentos serão preservados.`;
    } else if (saldo !== 0) {
      description = `⚠️ A conta "${item.nome}" possui saldo de ${fmtBRL(saldo)}. Deseja realmente desativar?`;
    }

    const ok = await confirm({
      title: 'Desativar conta',
      description,
      confirmLabel: 'Desativar',
      variant: 'destructive',
    });
    if (!ok) return;

    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_conta', { p_id: item.id });
      if (error) throw error;
      toast.success('Conta desativada com sucesso');
      load();
      emitDataEvent('financeiro:contas');
    } catch (err: unknown) {
      console.error('[ContasBancariasSection.deactivate]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  // ─── Export ───
  const exportExcel = () => {
    const rows = items.map(c => ({
      nome: c.nome,
      tipo: TIPO_LABEL[c.tipo] || c.tipo,
      banco: c.banco || '',
      agencia: c.agencia || '',
      numero_conta: c.numero_conta || '',
      saldo_inicial: c.saldo_inicial,
      saldo_atual: saldos[c.id] || 0,
      ativo: c.ativo ? 'Sim' : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas');
    XLSX.writeFile(wb, 'contas_bancarias.xlsx');
    toast.success('Exportação concluída');
  };

  // ─── Presentation ───
  const hasFilter = !!search || tipoFiltro !== 'ALL';
  const clearFilters = () => { setSearch(''); setTipoFiltro('ALL'); };

  // O destaque soma TODAS as contas ativas carregadas — nunca só as que o filtro deixa visíveis.
  const totalAtivas = somaSaldosContas(items, saldos);
  const contasLabel = (n: number) => `${n} ${n === 1 ? 'conta ativa' : 'contas ativas'}`;
  const totalValue = saldosStatus === 'ready' ? fmtBRL(totalAtivas) : saldosStatus === 'loading' ? '…' : 'Indisponível';
  const totalSub = saldosStatus === 'ready'
    ? `Saldo atual no sistema de ${contasLabel(items.length)}`
    : saldosStatus === 'loading' ? 'Carregando saldos' : 'Saldos indisponíveis';
  const retrySaldos = () => {
    setSaldosStatus('loading');
    loadSaldos();
  };
  const summaryGrid = kpiGridClassFor(longestValueLength([totalValue, String(items.length)]), 2);

  // Conferência com o extrato confirmado na conciliação (mesma data dos dois lados).
  const conferencias = filtered.flatMap(item => {
    const saldoBanco = loadSaldoExtrato(item.id);
    if (!saldoBanco) return [];
    const sistema = saldosNaReferencia[item.id];
    return [{ item, saldoBanco, sistema: sistema?.data === saldoBanco.data ? sistema : undefined }];
  });

  return (
    <>
      <div className="space-y-6">
        <FinScreenHeader
          title="Contas Bancárias & Caixas"
          description="Gerencie suas contas e caixas"
          actions={(
            <>
              {canExport && (
                // Sem os saldos carregados a planilha sairia com saldo 0 em todas as contas.
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportExcel}
                  disabled={saldosStatus !== 'ready'}
                  title={saldosStatus === 'error' ? 'Saldos indisponíveis: carregue os saldos de novo para exportar' : undefined}
                >
                  <Download className="w-4 h-4 mr-1" /> Excel
                </Button>
              )}
              {canCreate && (
                <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={saving}>
                  <Plus className="w-4 h-4 mr-1" /> Nova Conta
                </Button>
              )}
            </>
          )}
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nome ou banco"
              aria-label="Buscar conta por nome ou banco"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os tipos</SelectItem>
              {TIPO_OPTIONS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-6">
            <SkeletonSummary />
            <SkeletonAccounts />
          </div>
        ) : loadError ? (
          <ErrorState
            title="Não foi possível carregar as contas"
            description="Verifique a conexão e tente novamente."
            onRetry={retryLoad}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Nenhuma conta ativa"
            description="Cadastre uma conta ou caixa para acompanhar os saldos."
          />
        ) : (
          <>
            <FinKpiGrid className={summaryGrid}>
              <KpiCard
                appearance="highlight"
                icon={Wallet}
                label="Saldo somado das contas ativas"
                value={totalValue}
                sub={totalSub}
              />
              <KpiCard
                appearance="summary"
                icon={Landmark}
                label="Contas ativas"
                value={String(items.length)}
                sub={composicaoPorTipo(items)}
              />
            </FinKpiGrid>
            {saldosStatus === 'error' && (
              <ErrorState compact title="Não foi possível carregar os saldos" onRetry={retrySaldos} />
            )}

            <FinSectionGroup
              id="contas-da-unidade"
              title="Contas da unidade"
              caption={hasFilter ? `Mostrando ${filtered.length} de ${items.length}` : contasLabel(items.length)}
            >
              {filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nenhuma conta encontrada"
                  description="Tente outro termo de busca ou tipo."
                  actionLabel="Limpar filtros"
                  onAction={clearFilters}
                />
              ) : (
                <div className="[container-type:inline-size]">
                  <div className="grid grid-cols-1 gap-4 [@container(min-width:40rem)]:grid-cols-2 [@container(min-width:62rem)]:grid-cols-3">
                    {filtered.map(item => (
                      <ContaCard
                        key={item.id}
                        conta={item}
                        saldo={saldos[item.id] || 0}
                        saldosStatus={saldosStatus}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        saving={saving}
                        onEdit={() => openEdit(item)}
                        onDeactivate={() => deactivate(item)}
                        onVerExtrato={() => {
                          if (onNavigateExtrato) {
                            onNavigateExtrato(item.id);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </FinSectionGroup>

            {conferencias.length > 0 && (
              <section aria-labelledby="saldo-na-referencia" className="rounded-summary border bg-card p-5 shadow-card space-y-4">
                <div className="space-y-1">
                  <h3 id="saldo-na-referencia" className="text-base font-semibold leading-tight text-foreground">Saldo na referência</h3>
                  <p className="text-sm text-muted-foreground">
                    {canCheckSaldoNaReferencia ? 'Extrato e sistema comparados na mesma data' : 'Saldo confirmado no extrato do banco'}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Data de referência</TableHead>
                      <TableHead className="text-right">Saldo do extrato</TableHead>
                      {canCheckSaldoNaReferencia && <TableHead className="text-right">Sistema na mesma data</TableHead>}
                      {canCheckSaldoNaReferencia && <TableHead className="text-right">Diferença</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conferencias.map(({ item, saldoBanco, sistema }) => {
                      const conferencia = sistema ? conferenciaExtrato(saldoBanco.valor, sistema.valor) : null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.nome}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">{formatDateBR(parseLocalDate(saldoBanco.data))}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtBRL(saldoBanco.valor)}</TableCell>
                          {canCheckSaldoNaReferencia && (
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{sistema ? fmtBRL(sistema.valor) : '—'}</TableCell>
                          )}
                          {canCheckSaldoNaReferencia && (
                            <TableCell className="text-right">
                              {conferencia ? (
                                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                  <span className="whitespace-nowrap tabular-nums">{fmtBRL(conferencia.diferenca)}</span>
                                  <StatusBadge
                                    status={conferencia.confere ? 'success' : 'warning'}
                                    label={conferencia.confere ? 'Confere' : 'Pendente'}
                                  />
                                </span>
                              ) : '—'}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <FinNote>O saldo atual do card pode incluir movimentos posteriores à data de referência.</FinNote>
              </section>
            )}
          </>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) guardedClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Conta' : 'Nova Conta / Caixa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="conta-form-nome">Nome</Label>
              <Input id="conta-form-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Caixa do restaurante" />
            </div>
            <div>
              <Label htmlFor="conta-form-tipo">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger id="conta-form-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="conta-form-banco">Banco</Label><Input id="conta-form-banco" value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} /></div>
              <div><Label htmlFor="conta-form-agencia">Agência</Label><Input id="conta-form-agencia" value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} /></div>
            </div>
            <div>
              <Label htmlFor="conta-form-numero">Número da conta</Label>
              <Input id="conta-form-numero" value={form.numero_conta} onChange={e => setForm({ ...form, numero_conta: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="conta-form-saldo-inicial">Saldo Inicial (R$)</Label>
              <BRLInput id="conta-form-saldo-inicial" numericValue={form.saldo_inicial} onNumericChange={v => setForm({ ...form, saldo_inicial: v })} showPrefix />
            </div>
            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </>
  );
}
