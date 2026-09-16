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
import { BRLInput } from '@/components/ui/brl-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Landmark, Search, Download, ShieldAlert, FileText } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import TableActions from '@/components/ui/TableActions';
import * as XLSX from '@/lib/safeXlsx';
import { includesNormalized } from '@/lib/utils';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';

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

const TIPO_LABEL: Record<string, string> = {
  corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  caixa_fisico: 'Caixa Físico',
  maquininha: 'Maquininha',
};

const TIPO_OPTIONS = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'caixa_fisico', label: 'Caixa Físico' },
  { value: 'maquininha', label: 'Maquininha' },
];

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
function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-36 mt-1" />
          </CardContent>
        </Card>
      ))}
    </div>
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
  const [saldosNaReferencia, setSaldosNaReferencia] = useState<
    Record<string, { data: string; valor: number }>
  >({});
  const [loading, setLoading] = useState(true);
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
    const { data } = await supabase.rpc('get_all_saldos_contas');
    if (data && Array.isArray(data)) {
      const map: Record<string, number> = {};
      for (const row of data as { conta_id: string; saldo: number }[]) {
        map[row.conta_id] = Number(row.saldo) || 0;
      }
      setSaldos(map);
    }
  }, [supabase]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const { data } = await supabase.from('fin_contas').select(CONTA_FIELDS).eq('ativo', true).order('nome');
    setItems((data as ContaBancaria[] | null) || []);
    setLoading(false);
  }, [canView, supabase]);

  useEffect(() => {
    load().then(() => loadSaldos());
  }, [load, loadSaldos]);

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
    if (saldo !== 0) {
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

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Contas Bancárias & Caixas</h2>
            <p className="text-sm text-muted-foreground">Gerencie suas contas e caixas</p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={saving}>
                <Plus className="w-4 h-4 mr-1" /> Nova Conta
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="w-[180px]">
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

        {/* Cards */}
        {loading ? (
          <SkeletonCards />
        ) : filtered.length === 0 && !search && tipoFiltro === 'ALL' ? (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Landmark className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma conta bancária cadastrada</p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma conta encontrada</p>
              <p className="text-sm mt-1">Tente outro termo de busca ou filtro.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(item => {
              const saldo = saldos[item.id] || 0;
              const saldoBanco = loadSaldoExtrato(item.id);
              const saldoSistemaNaData = saldosNaReferencia[item.id];
              const saldoDivergente = saldoBanco
                && saldoSistemaNaData?.data === saldoBanco.data
                && Math.abs(saldoBanco.valor - saldoSistemaNaData.valor) >= 0.01;
              return (
                <Card key={item.id} className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{item.nome}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="mr-1">{TIPO_LABEL[item.tipo] || item.tipo}</Badge>
                        <TableActions
                          canEditOverride={canEdit}
                          canDeleteOverride={canDelete}
                          onEdit={() => openEdit(item)}
                          onDelete={() => deactivate(item)}
                          hideConfirm={true}
                          isDeleting={saving}
                        />
                      </div>
                    </div>
                    {item.banco && (
                      <CardDescription>
                        {item.banco}
                        {item.agencia && ` | Ag. ${item.agencia}`}
                        {item.numero_conta && ` | CC ${item.numero_conta}`}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {fmtBRL(saldo)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Saldo contabilizado atual (inicial: {fmtBRL(item.saldo_inicial)})
                    </p>
                    {saldoBanco && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Banco confirmado em {formatDateBR(parseLocalDate(saldoBanco.data))}: {fmtBRL(saldoBanco.valor)}
                      </p>
                    )}
                    {saldoDivergente && (
                      <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                        <p className="font-medium text-foreground">
                          Contabilizado na mesma data: {fmtBRL(saldoSistemaNaData.valor)}
                        </p>
                        <p className="text-muted-foreground">
                          Diferença pendente no extrato: {fmtBRL(saldoBanco.valor - saldoSistemaNaData.valor)}.
                        </p>
                      </div>
                    )}
                    <Button variant="link" size="sm" className="px-0 mt-1 h-auto text-xs" onClick={() => {
                      if (onNavigateExtrato) {
                        onNavigateExtrato(item.id);
                      }
                    }}>
                      <FileText className="w-3 h-3 mr-1" /> Ver extrato
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
              <Label>Nome</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Caixa do restaurante" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Banco</Label><Input value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} /></div>
              <div><Label>Agência</Label><Input value={form.agencia} onChange={e => setForm({ ...form, agencia: e.target.value })} /></div>
            </div>
            <div>
              <Label>Número da conta</Label>
              <Input value={form.numero_conta} onChange={e => setForm({ ...form, numero_conta: e.target.value })} />
            </div>
            <div>
              <Label>Saldo Inicial (R$)</Label>
              <BRLInput numericValue={form.saldo_inicial} onNumericChange={v => setForm({ ...form, saldo_inicial: v })} showPrefix />
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
