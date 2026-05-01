import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useInventarioStore, Inventario, InventarioItem, AuditLog } from '@/hooks/useInventarioStore';
import { useAuth } from '@/contexts/AuthContext';
import { useCan, useModuleAccess } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ClipboardCheck, Plus, ArrowLeft, Search, AlertTriangle, CheckCircle, TrendingDown, TrendingUp,
  BarChart3, Lock, Loader2, ShieldAlert, Users, Clock, FileText, Flame, Shield, Eye,
  MoreVertical, Pencil, Trash2, RotateCcw, UserPlus, UserMinus, Settings, Zap
} from 'lucide-react';
import { todayBR, formatDisplayBR, formatInBR, parseUTCToBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { decomposeStockLayers, formatStockLayers } from '@/lib/unitConversions';
import { supabase } from '@/integrations/supabase/client';
import QuickInventorySection from './QuickInventorySection';
import InventarioDashboardView from './inventario/InventarioDashboardView';
import InventarioAuditView from './inventario/InventarioAuditView';
import { narrowRows } from '@/lib/guards';
import { includesNormalized } from '@/lib/utils';

type SubView = 'list' | 'create' | 'detail' | 'dashboard' | 'audit' | 'conferentes' | 'rapido';

/** Maps internal tipo values to display labels (backward-compatible) */
const tipoDisplayLabel = (tipo: string) => {
  switch (tipo) {
    case 'completo': return 'Inventário Estoques';
    case 'parcial': return 'Inventário Parcial';
    case 'ciclico': return 'Inventário Cíclico';
    default: return tipo;
  }
};

export default function InventarioView() {
  const store = useInventarioStore();
  const { } = useAuth();
  const { visibleSubtabs } = useModuleAccess('inventario');

  // Granular permission gates
  const canViewList = useCan('inventario:lista:view');
  const canCreate = useCan('inventario:criar:create');
  const canEditDetail = useCan('inventario:detalhe:edit');
  const canCloseDetail = useCan('inventario:detalhe:close');
  const canDeleteList = useCan('inventario:lista:delete');
  const canViewDashboard = useCan('inventario:dashboard:view');
  const canViewAudit = useCan('inventario:auditoria:view');
  const canApproveAudit = useCan('inventario:auditoria:approve');
  const canEditAudit = useCan('inventario:auditoria:edit');
  const canManageConferentes = useCan('inventario:conferentes:manage');
  const canViewConferentes = useCan('inventario:conferentes:view');

  const [subView, setSubView] = useState<SubView>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('');
  const [filterLocal, setFilterLocal] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [turnoFilter, setTurnoFilter] = useState('');
  const [justificativa, setJustificativa] = useState('');

  // Reopen / Delete modals
  const [reopenTarget, setReopenTarget] = useState<Inventario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Inventario | null>(null);
  const [actionJustificativa, setActionJustificativa] = useState('');
  const [confirmText, setConfirmText] = useState('');

  // Double-click protection
  const [savingFinalize, setSavingFinalize] = useState(false);
  const [savingApprove, setSavingApprove] = useState(false);

  // Partial finalization confirmation dialog
  const [showPartialConfirm, setShowPartialConfirm] = useState(false);

  // Create form
  const [formTipo, setFormTipo] = useState('completo');
  const [formData, setFormData] = useState(todayBR());
  const [formHora, setFormHora] = useState(formatInBR(new Date(), 'HH:mm'));
  const [formTurno, setFormTurno] = useState('');
  const [formCategorias, setFormCategorias] = useState('');
  const [formObs, setFormObs] = useState('');

  useEffect(() => {
    store.loadList();
    store.loadTurnos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (subView === 'create' && store.turnos.length === 0) {
      store.loadTurnos();
    }
  }, [subView, store.turnos.length, store.loadTurnos]);

  useEffect(() => {
    setSearchTerm('');
    setFilterCategoria('');
    setFilterLocal('');
  }, [store.currentInventario?.id]);

  const handleCreate = async () => {
    if (!formTurno) { return; }
    const inv = await store.createInventario({
      tipo: formTipo,
      data: formData,
      hora: formHora,
      turno_id: formTurno,
      categorias: formTipo === 'parcial' ? formCategorias.split(',').map(c => c.trim()).filter(Boolean) : [],
      observacao: formObs,
    });
    if (inv) setSubView('list');
  };

  const handleOpenDetail = async (inv: Inventario) => {
    await store.loadInventario(inv.id);
    setSubView('detail');
  };

  const handleOpenDashboard = async () => {
    await store.loadDashboard();
    setSubView('dashboard');
  };

  const handleFinalizar = async () => {
    if (savingFinalize) return;
    if (!store.currentInventario) return;
    // Check if partial — show confirmation dialog
    const itens = store.currentItens;
    const totalItens = itens.length;
    const contados = itens.filter(i => i.contagem_fisica !== null).length;
    if (contados < totalItens && !showPartialConfirm) {
      setShowPartialConfirm(true);
      return;
    }
    setShowPartialConfirm(false);
    try {
      setSavingFinalize(true);
      const inv = store.currentInventario;
      const result = await store.finalizar(inv.id, justificativa || undefined);
      if (result?.blocked) {
        // Inventory was blocked - UI will refresh to show SOB_ANALISE
      }
    } catch (error: any) {
      console.error('Erro ao finalizar inventário:', error);
      toast.error(error?.message || 'Erro ao finalizar inventário');
    } finally {
      setSavingFinalize(false);
    }
  };

  const handleAprovar = async () => {
    if (savingApprove) return;
    try {
      if (!store.currentInventario || !justificativa) return;
      setSavingApprove(true);
      await store.aprovarAnalise(store.currentInventario.id, justificativa);
      setJustificativa('');
    } catch (error: any) {
      console.error('Erro ao aprovar inventário:', error);
      toast.error(error?.message || 'Erro ao aprovar inventário');
    } finally {
      setSavingApprove(false);
    }
  };

  const handleReopen = async () => {
    try {
      if (!reopenTarget || actionJustificativa.length < 10) return;
      await store.reopenInventario(reopenTarget.id, actionJustificativa);
      setReopenTarget(null);
      setActionJustificativa('');
      setConfirmText('');
      if (subView === 'detail') {
        await store.loadInventario(reopenTarget.id);
      }
    } catch (error: any) {
      console.error('Erro ao reabrir inventário:', error);
      toast.error(error?.message || 'Erro ao reabrir inventário');
    }
  };

  const handleDelete = async () => {
    try {
      if (!deleteTarget || actionJustificativa.length < 10 || confirmText !== 'EXCLUIR') return;
      await store.deleteInventario(deleteTarget.id, actionJustificativa);
      setDeleteTarget(null);
      setActionJustificativa('');
      setConfirmText('');
      setSubView('list');
    } catch (error: any) {
      console.error('Erro ao excluir inventário:', error);
      toast.error(error?.message || 'Erro ao excluir inventário');
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      RASCUNHO: 'bg-muted text-muted-foreground',
      EM_CONTAGEM: 'bg-primary/10 text-primary',
      EM_REVISAO: 'bg-warning/10 text-warning',
      SOB_ANALISE: 'bg-destructive/10 text-destructive',
      FINALIZADO: 'bg-success/10 text-success',
    };
    const labels: Record<string, string> = {
      RASCUNHO: 'Rascunho', EM_CONTAGEM: 'Em Contagem', EM_REVISAO: 'Em Revisão',
      SOB_ANALISE: '🔒 Sob Análise', FINALIZADO: 'Finalizado',
    };
    return <Badge className={`${colors[status] || ''} text-[10px]`}>{labels[status] || status}</Badge>;
  };

  const riskBadge = (score: number) => {
    if (score > 60) return <Badge className="bg-destructive/10 text-destructive text-[9px] gap-1"><Flame className="w-3 h-3" />Alto Risco</Badge>;
    if (score > 30) return <Badge className="bg-warning/10 text-warning text-[9px] gap-1"><AlertTriangle className="w-3 h-3" />Atenção</Badge>;
    return <Badge className="bg-success/10 text-success text-[9px] gap-1"><Shield className="w-3 h-3" />Seguro</Badge>;
  };

  const classColor = (c: string) => c === 'CRITICO' ? 'text-destructive' : c === 'ALERTA' ? 'text-warning' : 'text-success';

  // ===== LIST VIEW =====
  // ===== QUICK INVENTORY VIEW =====
  if (subView === 'rapido') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setSubView('list')}>
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
        </div>
        <QuickInventorySection />
      </div>
    );
  }

  // ===== LIST VIEW =====
  if (subView === 'list') {
    const filtered = store.inventarios.filter(inv => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (turnoFilter && inv.turno_id !== turnoFilter) return false;
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-foreground">🧾 Inventário</h2>
            <p className="text-xs text-muted-foreground">Controle de inventário geral</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canViewDashboard && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleOpenDashboard}>
                <BarChart3 className="w-3.5 h-3.5" /> Dashboard
              </Button>
            )}
            {canManageConferentes && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { store.loadConferentes(); setSubView('conferentes'); }}>
                <Settings className="w-3.5 h-3.5" /> Conferentes
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSubView('rapido')}>
                <Zap className="w-3.5 h-3.5" /> Inventário Rápido
              </Button>
            )}
            {canCreate && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setSubView('create')}>
                <Plus className="w-3.5 h-3.5" /> Novo Inventário
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="RASCUNHO">Rascunho</SelectItem>
              <SelectItem value="EM_CONTAGEM">Em Contagem</SelectItem>
              <SelectItem value="EM_REVISAO">Em Revisão</SelectItem>
              <SelectItem value="SOB_ANALISE">Sob Análise</SelectItem>
              <SelectItem value="FINALIZADO">Finalizado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={turnoFilter} onValueChange={v => setTurnoFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs bg-secondary border-border"><SelectValue placeholder="Turno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {store.turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {store.loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <ClipboardCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum inventário encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => (
              <div
                key={inv.id}
                className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <button onClick={() => handleOpenDetail(inv)} className="flex items-center gap-3 flex-1 text-left">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      inv.status === 'SOB_ANALISE' ? 'bg-destructive/10' :
                      inv.status === 'FINALIZADO' ? 'bg-success/10' : 'bg-primary/10'
                    }`}>
                      {inv.status === 'SOB_ANALISE' ? <ShieldAlert className="w-4 h-4 text-destructive" /> :
                       inv.status === 'FINALIZADO' ? <Lock className="w-4 h-4 text-success" /> :
                       <ClipboardCheck className="w-4 h-4 text-primary" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{tipoDisplayLabel(inv.tipo)}</p>
                        {inv.turnos && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{inv.turnos.nome}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{formatDisplayBR(parseLocalDate(inv.data))} às {inv.hora?.slice(0, 5)}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {inv.flag_risco && inv.flag_risco !== '' && riskBadge(Number(inv.score_risco))}
                    {inv.status === 'FINALIZADO' && (
                      <div className="text-right">
                        <p className="text-xs font-bold text-foreground">{Number(inv.acuracia_percent).toFixed(1)}%</p>
                        <p className="text-[9px] text-muted-foreground">Acurácia</p>
                      </div>
                    )}
                    {statusBadge(inv.status)}
                    {(canEditAudit || canDeleteList) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => e.stopPropagation()}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDetail(inv)}>
                            <Eye className="w-3.5 h-3.5 mr-2" /> Ver detalhes
                          </DropdownMenuItem>
                          {canEditAudit && inv.status === 'FINALIZADO' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setReopenTarget(inv); setActionJustificativa(''); setConfirmText(''); }}>
                              <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reabrir / Editar
                            </DropdownMenuItem>
                          )}
                          {canDeleteList && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(inv); setActionJustificativa(''); setConfirmText(''); }}>
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {store.hasMore && !store.loading && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => store.loadList({ status_filter: statusFilter, turno_filter: turnoFilter }, true)}>
              Carregar mais
            </Button>
          </div>
        )}

        {/* Reopen Modal */}
        <Dialog open={!!reopenTarget} onOpenChange={(open) => { if (!open) setReopenTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <RotateCcw className="w-5 h-5 text-warning" /> Reabrir Inventário
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {reopenTarget?.status === 'FINALIZADO'
                  ? '⚠️ Este inventário está FINALIZADO. Reabri-lo irá REVERTER todos os ajustes de estoque aplicados no fechamento. O saldo teórico será recalculado.'
                  : 'O inventário será reaberto para nova contagem.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Justificativa (mín. 10 caracteres)</Label>
                <Textarea value={actionJustificativa} onChange={e => setActionJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da reabertura..." className="text-xs" rows={2} maxLength={500} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setReopenTarget(null)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5 bg-warning hover:bg-warning/90 text-warning-foreground"
                onClick={handleReopen} disabled={actionJustificativa.length < 10 || store.loading}>
                {store.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Confirmar Reabertura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Modal */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Excluir Inventário
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {deleteTarget?.status === 'FINALIZADO'
                  ? '🚨 ATENÇÃO: Este inventário está FINALIZADO. Excluí-lo irá REVERTER todos os ajustes de estoque. Esta ação é IRREVERSÍVEL.'
                  : '⚠️ O inventário e todos os seus itens serão excluídos permanentemente.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Justificativa (mín. 10 caracteres)</Label>
                <Textarea value={actionJustificativa} onChange={e => setActionJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da exclusão..." className="text-xs" rows={2} maxLength={500} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Digite <strong className="text-destructive">EXCLUIR</strong> para confirmar</Label>
                <Input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                  placeholder="EXCLUIR" className="text-xs" maxLength={10} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="gap-1.5"
                onClick={handleDelete} disabled={actionJustificativa.length < 10 || confirmText !== 'EXCLUIR' || store.loading}>
                {store.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Excluir Permanentemente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ===== CREATE VIEW =====
  if (subView === 'create') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSubView('list')}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-display font-bold text-foreground">Novo Inventário</h2>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={formTipo} onValueChange={setFormTipo}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completo">📦 Inventário Estoques</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Turno *</Label>
              <Select value={formTurno} onValueChange={setFormTurno}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                <SelectContent>
                  {store.turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome} ({t.hora_inicio}–{t.hora_fim})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">Data</Label><Input type="date" value={formData} onChange={e => setFormData(e.target.value)} className="bg-secondary border-border" /></div>
            <div><Label className="text-xs text-muted-foreground">Hora</Label><Input type="time" value={formHora} onChange={e => setFormHora(e.target.value)} className="bg-secondary border-border" /></div>
          </div>
          {/* Categories field removed — parcial type no longer available for creation */}
          <div><Label className="text-xs text-muted-foreground">Observação</Label><Input value={formObs} onChange={e => setFormObs(e.target.value)} className="bg-secondary border-border" maxLength={500} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSubView('list')}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={store.loading || store.savingCreate || !formTurno}>
              {(store.loading || store.savingCreate) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Criar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== DETAIL VIEW =====
  if (subView === 'detail' && store.currentInventario) {
    const inv = store.currentInventario;
    const itens = store.currentItens;
    const isFinalizado = inv.status === 'FINALIZADO';
    const isSobAnalise = inv.status === 'SOB_ANALISE';

    const categoriaOptions = Array.from(
      new Set(itens.map(i => i.produtos?.categoria).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const localOptions = Array.from(
      new Set(itens.map(i => i.produtos?.local_estoque).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const filteredItems = itens.filter(i => {
      const nome = i.produtos?.nome_produto || '';
      if (searchTerm && !includesNormalized(nome, searchTerm)) return false;
      if (filterCategoria && i.produtos?.categoria !== filterCategoria) return false;
      if (filterLocal && i.produtos?.local_estoque !== filterLocal) return false;
      return true;
    });

    const totalItens = itens.length;
    const contados = itens.filter(i => i.contagem_fisica !== null).length;
    const criticos = itens.filter(i => i.classificacao === 'CRITICO').length;
    const alertas = itens.filter(i => i.classificacao === 'ALERTA').length;
    const driftTotal = itens.reduce((s, i) => s + Number(i.impacto_financeiro), 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSubView('list')}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="flex-1">
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              {tipoDisplayLabel(inv.tipo)}
              {isFinalizado && <Lock className="w-4 h-4 text-success" />}
              {isSobAnalise && <ShieldAlert className="w-4 h-4 text-destructive" />}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{formatDisplayBR(parseLocalDate(inv.data))}</span>
              {inv.turnos && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{inv.turnos.nome}</span>}
              {statusBadge(inv.status)}
              {inv.score_risco > 0 && riskBadge(inv.score_risco)}
            </div>
          </div>
          <div className="flex gap-2">
            {canEditAudit && isFinalizado && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setReopenTarget(inv); setActionJustificativa(''); setConfirmText(''); }}>
                <RotateCcw className="w-3.5 h-3.5" /> Reabrir
              </Button>
            )}
            {canDeleteList && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => { setDeleteTarget(inv); setActionJustificativa(''); setConfirmText(''); }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            )}
            {canViewAudit && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSubView('audit')}>
                <FileText className="w-3.5 h-3.5" /> Auditoria
              </Button>
            )}
          </div>
        </div>

        {/* SOB_ANALISE Alert */}
        {isSobAnalise && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> 🔒 Inventário Bloqueado — Análise Obrigatória
            </p>
            <p className="text-[11px] text-destructive/80">{inv.sob_analise_motivo}</p>
            {canApproveAudit && (
              <div className="space-y-2">
                <Label className="text-xs text-destructive">Justificativa para aprovação (mín. 10 chars)</Label>
                <Textarea
                  value={justificativa}
                  onChange={e => setJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da aprovação..."
                  className="bg-card border-destructive/30 text-foreground text-xs"
                  rows={2}
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs" onClick={handleAprovar} disabled={justificativa.length < 10 || savingApprove}>
                    {savingApprove ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />} Aprovar e Liberar
                  </Button>
                  {canCloseDetail && (
                    <Button size="sm" className="gap-1.5 text-xs bg-success hover:bg-success/90 text-success-foreground"
                      onClick={handleFinalizar} disabled={justificativa.length < 10 || savingFinalize}>
                      {savingFinalize ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Aprovar e Finalizar
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!canApproveAudit && (
              <p className="text-[11px] text-destructive/70">Aguardando aprovação de um administrador.</p>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard label="Itens" value={`${contados}/${totalItens}`} />
          {(isFinalizado || isSobAnalise) && (
            <>
              <KPICard label="Acurácia" value={formatPercentBR(Number(inv.acuracia_percent))} color="text-success" />
              <KPICard label="Drift Total" value={fmtBRL(driftTotal)} color={driftTotal < 0 ? 'text-destructive' : 'text-success'} />
            </>
          )}
          <KPICard label="Críticos" value={String(criticos)} color="text-destructive" />
          <KPICard label="Alertas" value={String(alertas)} color="text-warning" />
        </div>

        {/* Score de Risco */}
        {isFinalizado && inv.score_risco > 0 && (
          <div className={`rounded-xl p-4 border ${inv.score_risco > 60 ? 'bg-destructive/5 border-destructive/20' : inv.score_risco > 30 ? 'bg-accent/5 border-accent/20' : 'bg-success/5 border-success/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-5 h-5 ${inv.score_risco > 60 ? 'text-destructive' : inv.score_risco > 30 ? 'text-warning' : 'text-success'}`} />
                <div>
                  <p className="text-xs font-semibold text-foreground">Score de Risco Operacional</p>
                  <p className="text-[10px] text-muted-foreground">{inv.flag_risco || 'Sem flag'}</p>
                </div>
              </div>
              <p className={`text-2xl font-display font-bold ${inv.score_risco > 60 ? 'text-destructive' : inv.score_risco > 30 ? 'text-warning' : 'text-success'}`}>
                {inv.score_risco}
              </p>
            </div>
          </div>
        )}

        {/* Assign Conferente */}
        {!isFinalizado && !isSobAnalise && canViewConferentes && (
          <AssignConferenteSection
            conferentes={store.conferentes}
            currentConferenteId={(inv as Inventario & { conferente_user_id?: string | null }).conferente_user_id ?? null}
            onAssign={(userId) => store.assignConferente(inv.id, userId)}
            onLoadConferentes={store.loadConferentes}
          />
        )}

        {/* Actions */}
        {!isFinalizado && !isSobAnalise && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
              {canEditDetail && inv.status === 'RASCUNHO' && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => store.updateStatus(inv.id, 'EM_CONTAGEM')}>
                  Iniciar Contagem
                </Button>
              )}
              {canEditDetail && inv.status === 'EM_CONTAGEM' && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => store.updateStatus(inv.id, 'EM_REVISAO')}>
                  Enviar para Revisão
                </Button>
              )}
              {canCloseDetail && (inv.status === 'EM_REVISAO' || inv.status === 'EM_CONTAGEM') && (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs bg-success hover:bg-success/90 text-success-foreground"
                  onClick={handleFinalizar}
                  disabled={savingFinalize}
                >
                  {savingFinalize ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Finalizar
                </Button>
              )}
              {!canCloseDetail && (inv.status === 'EM_REVISAO' || inv.status === 'EM_CONTAGEM') && (
                <span className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Você não possui permissão para finalizar
                </span>
              )}
            </div>
            {/* Informational count progress */}
            {canCloseDetail && (inv.status === 'EM_REVISAO' || inv.status === 'EM_CONTAGEM') && contados < totalItens && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                Itens conferidos: {contados} de {totalItens} — Você pode finalizar agora ou continuar contando.
              </p>
            )}
            {inv.status === 'RASCUNHO' && (
              <p className="text-[11px] text-muted-foreground italic">
                Inicie a contagem para habilitar a finalização.
              </p>
            )}
          </div>
        )}

        {/* Partial finalization confirmation dialog */}
        <Dialog open={showPartialConfirm} onOpenChange={(open) => { if (!open) setShowPartialConfirm(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <AlertTriangle className="w-5 h-5 text-warning" /> Itens não contados
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Este inventário possui <strong>{contados}</strong> de <strong>{totalItens}</strong> itens conferidos.
                Os itens não contados manterão o saldo atual de estoque.
                <br /><br />
                Deseja finalizar mesmo assim?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setShowPartialConfirm(false)}>
                Continuar contagem
              </Button>
              <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
                onClick={handleFinalizar} disabled={savingFinalize}>
                {savingFinalize ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Finalizar inventário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Search + filtros */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar produto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-secondary border-border" maxLength={200} />
          </div>
          <SearchableSelect
            value={filterCategoria}
            onValueChange={setFilterCategoria}
            options={categoriaOptions.map(c => ({ value: c, label: c }))}
            placeholder="Categoria"
            searchPlaceholder="Buscar categoria..."
            emptyMessage="Nenhuma categoria"
            className="sm:w-48 bg-secondary border-border"
          />
          <SearchableSelect
            value={filterLocal}
            onValueChange={setFilterLocal}
            options={localOptions.map(l => ({ value: l, label: l }))}
            placeholder="Local"
            searchPlaceholder="Buscar local..."
            emptyMessage="Nenhum local"
            className="sm:w-48 bg-secondary border-border"
          />
        </div>
        {(searchTerm || filterCategoria || filterLocal) && (
          <p className="text-[11px] text-muted-foreground -mt-1">
            Exibindo {filteredItems.length} de {itens.length} produtos
          </p>
        )}

        {/* Items table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 text-muted-foreground font-medium">Produto</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Teórico</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Físico</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Dif</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">%</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">R$</th>
                  <th className="text-center p-3 text-muted-foreground font-medium">Class.</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <ItemRow key={item.id} item={item}
                    canCount={canEditDetail && !isFinalizado && !isSobAnalise && inv.status !== 'RASCUNHO'}
                    onSave={(val) => store.updateContagem(item.id, val)} classColor={classColor} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deviation Analysis */}
        {isFinalizado && itens.filter(i => i.classificacao !== 'NORMAL').length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-warning" /> Análise de Desvio
            </p>
            <div className="space-y-2">
              {itens.filter(i => i.classificacao === 'CRITICO').map(i => (
                <div key={i.id} className="flex items-center justify-between bg-destructive/5 rounded-lg p-2.5">
                  <span className="text-xs text-foreground font-medium">{i.produtos?.nome_produto || 'Item'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive font-bold">{formatPercentBR(Number(i.diferenca_percent))}</span>
                    <span className="text-[10px] text-destructive">{fmtBRL(Number(i.impacto_financeiro))}</span>
                  </div>
                </div>
              ))}
              {itens.filter(i => i.classificacao === 'ALERTA').map(i => (
                <div key={i.id} className="flex items-center justify-between bg-accent/5 rounded-lg p-2.5">
                  <span className="text-xs text-foreground font-medium">{i.produtos?.nome_produto || 'Item'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-warning font-bold">{formatPercentBR(Number(i.diferenca_percent))}</span>
                    <span className="text-[10px] text-warning">{fmtBRL(Number(i.impacto_financeiro))}</span>
                  </div>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Recomendações</p>
                {itens.filter(i => Number(i.diferenca_qtd) < 0 && i.classificacao !== 'NORMAL').slice(0, 5).map(i => (
                  <p key={i.id} className="text-[11px] text-muted-foreground">
                    ⚠️ Revisar baixa de <strong className="text-foreground">{i.produtos?.nome_produto}</strong> (falta {Math.abs(Number(i.diferenca_qtd)).toFixed(1)})
                  </p>
                ))}
                {itens.filter(i => Number(i.diferenca_qtd) > 0 && i.classificacao !== 'NORMAL').slice(0, 5).map(i => (
                  <p key={i.id} className="text-[11px] text-muted-foreground">
                    📦 Possível entrada não registrada de <strong className="text-foreground">{i.produtos?.nome_produto}</strong> (+{Number(i.diferenca_qtd).toFixed(1)})
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reopen Modal (detail view) */}
        <Dialog open={!!reopenTarget} onOpenChange={(open) => { if (!open) setReopenTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <RotateCcw className="w-5 h-5 text-warning" /> Reabrir Inventário
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {reopenTarget?.status === 'FINALIZADO'
                  ? '⚠️ Este inventário está FINALIZADO. Reabri-lo irá REVERTER todos os ajustes de estoque aplicados no fechamento. O saldo teórico será recalculado.'
                  : 'O inventário será reaberto para nova contagem.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Justificativa (mín. 10 caracteres)</Label>
                <Textarea value={actionJustificativa} onChange={e => setActionJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da reabertura..." className="text-xs" rows={2} maxLength={500} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setReopenTarget(null)}>Cancelar</Button>
              <Button size="sm" className="gap-1.5 bg-warning hover:bg-warning/90 text-warning-foreground"
                onClick={handleReopen} disabled={actionJustificativa.length < 10 || store.loading}>
                {store.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Confirmar Reabertura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Modal (detail view) */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Excluir Inventário
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {deleteTarget?.status === 'FINALIZADO'
                  ? '🚨 ATENÇÃO: Este inventário está FINALIZADO. Excluí-lo irá REVERTER todos os ajustes de estoque. Esta ação é IRREVERSÍVEL.'
                  : '⚠️ O inventário e todos os seus itens serão excluídos permanentemente.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Justificativa (mín. 10 caracteres)</Label>
                <Textarea value={actionJustificativa} onChange={e => setActionJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da exclusão..." className="text-xs" rows={2} maxLength={500} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Digite <strong className="text-destructive">EXCLUIR</strong> para confirmar</Label>
                <Input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                  placeholder="EXCLUIR" className="text-xs" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="gap-1.5"
                onClick={handleDelete} disabled={actionJustificativa.length < 10 || confirmText !== 'EXCLUIR' || store.loading}>
                {store.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Excluir Permanentemente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ===== AUDIT VIEW =====
  if (subView === 'audit') {
    return <InventarioAuditView auditLogs={store.auditLogs} onBack={() => setSubView('detail')} />;
  }

  // ===== CONFERENTES VIEW =====
  if (subView === 'conferentes') {
    return (
      <ConferentesManagementView
        conferentes={store.conferentes}
        loading={store.loading}
        canManage={canManageConferentes}
        onAdd={store.addConferente}
        onRemove={store.removeConferente}
        onBack={() => setSubView('list')}
      />
    );
  }

  // ===== DASHBOARD VIEW =====
  if (subView === 'dashboard') {
    return (
      <InventarioDashboardView
        dashboard={store.dashboard}
        onBack={() => setSubView('list')}
        onOpenDetail={handleOpenDetail}
      />
    );
  }

  return null;
}

// ===== Helper Components =====

function KPICard({ label, value, color, large }: { label: string; value: string; color?: string; large?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`${large ? 'text-2xl' : 'text-lg'} font-display font-bold ${color || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function ItemRow({ item, canCount, onSave, classColor }: {
  item: InventarioItem;
  canCount: boolean;
  onSave: (val: number) => Promise<any>;
  classColor: (c: string) => string;
}) {
  const unidade = item.produtos?.unidade_medida ?? 'UN';
  const unidadeCompra = item.produtos?.unidade_compra || unidade;
  const fator = item.produtos?.fator_conversao_padrao || 1;
  const hasDual = unidadeCompra.toUpperCase() !== unidade.toUpperCase() && fator !== 1;

  // Convert base-unit values to purchase units for display (same as EstoqueGeralView)
  const teoricoBase = Number(item.saldo_teorico);
  const teoricoLayers = decomposeStockLayers(teoricoBase, fator, unidadeCompra, unidade);

  // contagem_fisica is stored in base units — convert to purchase units for display
  const fisicaBase = item.contagem_fisica !== null ? Number(item.contagem_fisica) : null;
  const fisicaLayers = fisicaBase !== null ? decomposeStockLayers(fisicaBase, fator, unidadeCompra, unidade) : null;

  // Input state in purchase units (user types in purchase unit, we convert on save)
  const toDisplayVal = (baseVal: number | null) => {
    if (baseVal === null) return '';
    if (!hasDual) return String(baseVal);
    return String(parseFloat((baseVal / fator).toFixed(4)));
  };

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toDisplayVal(item.contagem_fisica));

  const handleBlur = async () => {
    const displayPrev = toDisplayVal(item.contagem_fisica);
    if (value === '' || value === displayPrev) { setEditing(false); return; }
    const parsed = parseFloat(value.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) { setEditing(false); return; }
    // Convert purchase units back to base units before saving
    const baseVal = hasDual ? parseFloat((parsed * fator).toFixed(4)) : parsed;
    await onSave(baseVal);
    setEditing(false);
  };

  const nome = item.produtos?.nome_produto || 'Item sem nome';
  // diferenca_qtd is in base units from backend — convert to purchase units for display
  const difPurchase = hasDual ? Number(item.diferenca_qtd) / fator : Number(item.diferenca_qtd);

  return (
    <tr className="border-b border-border/30 hover:bg-muted/20">
      <td className="p-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground font-medium">{nome}</span>
            <Badge className="text-[9px] bg-primary/10 text-primary font-mono px-1 py-0">
              {unidadeCompra}
            </Badge>
          </div>
          {hasDual && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              1 {unidadeCompra} = {fator} {unidade}
            </p>
          )}
        </div>
      </td>
      <td className="p-3 text-right text-muted-foreground">
        {teoricoLayers.hasLayers ? formatStockLayers(teoricoLayers) : `${teoricoBase.toFixed(1)} ${unidade}`}
      </td>
      <td className="p-3 text-right">
        {canCount && !editing ? (
          <button onClick={() => setEditing(true)} className="text-primary underline cursor-pointer">
            {fisicaLayers !== null
              ? (fisicaLayers.hasLayers ? formatStockLayers(fisicaLayers) : `${(fisicaBase!).toFixed(1)}`)
              : '—'}
          </button>
        ) : canCount && editing ? (
          <DecimalInput value={value} onValueChange={(raw) => setValue(raw)} onBlur={handleBlur}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleBlur(); }} autoFocus className="w-20 h-7 text-xs text-right ml-auto bg-secondary border-border" />
        ) : (
          <span>
            {fisicaLayers !== null
              ? (fisicaLayers.hasLayers ? formatStockLayers(fisicaLayers) : `${(fisicaBase!).toFixed(1)}`)
              : '—'}
          </span>
        )}
      </td>
      <td className={`p-3 text-right font-bold ${difPurchase < 0 ? 'text-destructive' : difPurchase > 0 ? 'text-success' : 'text-muted-foreground'}`}>
        {item.contagem_fisica !== null ? `${difPurchase >= 0 ? '+' : ''}${parseFloat(difPurchase.toFixed(2))} ${unidadeCompra}` : '—'}
      </td>
      <td className={`p-3 text-right ${classColor(item.classificacao)}`}>
        {item.contagem_fisica !== null ? formatPercentBR(Number(item.diferenca_percent)) : '—'}
      </td>
      <td className={`p-3 text-right font-bold ${Number(item.impacto_financeiro) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
        {item.contagem_fisica !== null ? fmtBRL(Number(item.impacto_financeiro)) : '—'}
      </td>
      <td className="p-3 text-center">
        {item.contagem_fisica !== null && (
          <Badge className={`text-[9px] ${item.classificacao === 'CRITICO' ? 'bg-destructive/10 text-destructive' : item.classificacao === 'ALERTA' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
            {item.classificacao}
          </Badge>
        )}
      </td>
    </tr>
  );
}

// ===== Conferentes Management View =====
function ConferentesManagementView({ conferentes, loading, canManage, onAdd, onRemove, onBack }: {
  conferentes: { id: string; user_id: string; nome: string; created_at: string }[];
  loading: boolean;
  canManage: boolean;
  onAdd: (userId: string) => Promise<void>;
  onRemove: (conferenteId: string) => Promise<void>;
  onBack: () => void;
}) {
  const [profiles, setProfiles] = useState<{ id: string; nome: string; email: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  useEffect(() => {
    const loadProfiles = async () => {
      setLoadingProfiles(true);
      try {
        const { data } = await supabase.rpc('list_profiles_minimal');
        setProfiles(narrowRows(data, (r: Record<string, unknown>) => ({ id: String(r.id), nome: String(r.nome ?? ''), email: String(r.email ?? '') })));
      } catch { /* ignore */ }
      setLoadingProfiles(false);
    };
    loadProfiles();
  }, []);

  const existingUserIds = new Set(conferentes.map(c => c.user_id));
  const availableProfiles = profiles.filter(p => !existingUserIds.has(p.id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    await onAdd(selectedUserId);
    setSelectedUserId('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Conferentes do Inventário
          </h2>
          <p className="text-xs text-muted-foreground">Gerencie quem pode ser atribuído para conferir e finalizar inventários</p>
        </div>
      </div>

      {/* Add new conferente */}
      {canManage && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Adicionar Conferente</p>
          <div className="flex gap-2">
            <SearchableSelect
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              options={availableProfiles.map(p => ({ value: p.id, label: p.nome || p.email }))}
              placeholder={loadingProfiles ? 'Carregando...' : 'Selecione um usuário'}
              searchPlaceholder="Buscar usuário..."
              className="flex-1 bg-secondary border-border text-xs"
              allowClear={false}
            />
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleAdd} disabled={!selectedUserId || loading}>
              <UserPlus className="w-3.5 h-3.5" /> Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Current conferentes */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-foreground mb-3">Conferentes Ativos ({conferentes.length})</p>
        {conferentes.length === 0 ? (
          <div className="text-center py-6">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum conferente cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conferentes.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{c.nome}</p>
                    <p className="text-[10px] text-muted-foreground">Adicionado em {parseUTCToBR(c.created_at)}</p>
                  </div>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onRemove(c.id)}>
                    <UserMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Assign Conferente Section (in detail view) =====
function AssignConferenteSection({ conferentes, currentConferenteId, onAssign, onLoadConferentes }: {
  conferentes: { id: string; user_id: string; nome: string }[];
  currentConferenteId: string | null;
  onAssign: (userId: string) => Promise<void>;
  onLoadConferentes: () => Promise<void>;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (conferentes.length === 0) onLoadConferentes();
  }, []);

  const currentConferente = conferentes.find(c => c.user_id === currentConferenteId);

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    await onAssign(selectedUserId);
    setSelectedUserId('');
    setAssigning(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Users className="w-4 h-4 text-primary" /> Conferente Responsável
      </p>
      {currentConferenteId && currentConferente ? (
        <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-2.5">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">{currentConferente.nome}</span>
          <Badge className="text-[9px] bg-primary/10 text-primary">Atribuído</Badge>
        </div>
      ) : (
        <div className="flex gap-2">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="flex-1 bg-secondary border-border text-xs">
              <SelectValue placeholder={conferentes.length === 0 ? 'Nenhum conferente cadastrado' : 'Selecione um conferente'} />
            </SelectTrigger>
            <SelectContent>
              {conferentes.map(c => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5 text-xs" onClick={handleAssign} disabled={!selectedUserId || assigning || conferentes.length === 0}>
            {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Atribuir
          </Button>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Ao atribuir, o status mudará para "Em Revisão" e o conferente receberá uma notificação.
      </p>
    </div>
  );
}
