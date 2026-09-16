import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Palmtree, Stethoscope, FileWarning,
  CheckCircle2, XCircle, Clock, CalendarDays, AlertTriangle
} from 'lucide-react';
import { format, parseISO, differenceInBusinessDays, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';

import { useCan } from '@/permissions/hooks';
import { sortByName } from '@/lib/sortByName';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  data_admissao: string;
}

interface FeriaAfastamento {
  id: string;
  colaborador_id: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  dias_uteis: number;
  motivo: string;
  observacoes: string;
  solicitado_por: string;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
}

interface FeriasSaldo {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo: string;
  dias_direito: number;
  dias_gozados: number;
  dias_vendidos: number;
  dias_restantes: number;
  vencimento: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const TIPOS = [
  { value: 'ferias', label: 'Férias', icon: Palmtree, color: 'text-primary' },
  { value: 'atestado', label: 'Atestado Médico', icon: Stethoscope, color: 'text-warning' },
  { value: 'licenca_medica', label: 'Licença Médica', icon: Stethoscope, color: 'text-destructive' },
  { value: 'licenca_maternidade', label: 'Licença Maternidade', icon: Stethoscope, color: 'text-destructive' },
  { value: 'falta_justificada', label: 'Falta Justificada', icon: FileWarning, color: 'text-warning' },
  { value: 'falta_injustificada', label: 'Falta Injustificada', icon: FileWarning, color: 'text-destructive' },
  { value: 'folga_compensatoria', label: 'Folga Compensatória', icon: CalendarDays, color: 'text-success' },
];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SOLICITADO: { label: 'Solicitado', variant: 'outline' },
  APROVADO: { label: 'Aprovado', variant: 'default' },
  REJEITADO: { label: 'Rejeitado', variant: 'destructive' },
  EM_ANDAMENTO: { label: 'Em Andamento', variant: 'secondary' },
  CONCLUIDO: { label: 'Concluído', variant: 'default' },
  CANCELADO: { label: 'Cancelado', variant: 'destructive' },
};

export default function FeriasAfastamentosSection({
 colaboradores, canManage }: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('rh:ferias:view');
  const { user } = useAuth();
  const [registros, setRegistros] = useState<FeriaAfastamento[]>([]);
  const [saldos, setSaldos] = useState<FeriasSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [viewMode, setViewMode] = useState<'lista' | 'calendario'>('lista');
  const [calMonth, setCalMonth] = useState(new Date());

  const [form, setForm] = useState({
    colaborador_id: '', tipo: 'ferias', data_inicio: '', data_fim: '', motivo: '', observacoes: '',
  });
  const [dateInicio, setDateInicio] = useState<Date | undefined>();
  const [dateFim, setDateFim] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const [{ data: rData }, { data: sData }] = await Promise.all([
        supabase.from('rh_ferias_afastamentos').select('id, colaborador_id, tipo, status, data_inicio, data_fim, dias_uteis, motivo, observacoes, solicitado_por, aprovado_por, aprovado_em, created_at').order('data_inicio', { ascending: false })
          .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1),
        supabase.from('rh_ferias_saldo').select('id, colaborador_id, periodo_aquisitivo, dias_direito, dias_gozados, dias_vendidos, dias_restantes, vencimento'),
      ]);
      const newItems = (rData || []) as FeriaAfastamento[];
      if (append) {
        setRegistros(prev => [...prev, ...newItems]);
      } else {
        setRegistros(newItems);
      }
      setHasMore(newItems.length === PAGE_SIZE);
      setSaldos((sData || []) as FeriasSaldo[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calcDiasUteis = (inicio: Date, fim: Date) => {
    return Math.max(differenceInBusinessDays(fim, inicio) + 1, 1);
  };

  const handleCreate = async () => {
    if (saving) return;
    if (!form.colaborador_id || !dateInicio || !dateFim) {
      toast.error('Preencha colaborador e datas'); return;
    }
    if (dateFim < dateInicio) {
      toast.error('Data fim deve ser após data início'); return;
    }
    setSaving(true);
    const dias = calcDiasUteis(dateInicio, dateFim);
    try {
      const { error } = await supabase.from('rh_ferias_afastamentos').insert(withCompanyId(companyId, {
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        data_inicio: format(dateInicio, 'yyyy-MM-dd'),
        data_fim: format(dateFim, 'yyyy-MM-dd'),
        dias_uteis: dias,
        motivo: form.motivo,
        observacoes: form.observacoes,
        solicitado_por: user?.id ?? null,
      }));
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Solicitação registrada!');
      setShowNew(false);
      setForm({ colaborador_id: '', tipo: 'ferias', data_inicio: '', data_fim: '', motivo: '', observacoes: '' });
      setDateInicio(undefined);
      setDateFim(undefined);
      setPage(0);
      fetchData(0);
    } catch (e) {
      console.error(e);
      toast.error('Erro inesperado');
    } finally {
      setSaving(false);
    }
  };

  const handleAprovar = async (id: string) => {
    if (approvingId) return;
    const registro = registros.find(r => r.id === id);
    if (!registro) { toast.error('Registro não encontrado'); return; }
    if (registro.status !== 'SOLICITADO') { toast.error('Solicitação já processada.'); return; }
    setApprovingId(id);
    try {
      if (registro.tipo === 'ferias') {
        const { error } = await supabase.rpc('aprovar_ferias', {
          p_registro_id: id,
          p_aprovado_por: user?.id,
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
      } else {
        const { error } = await supabase.from('rh_ferias_afastamentos').update({
          status: 'APROVADO',
          aprovado_por: user?.id,
        }).eq('id', id).eq('status', 'SOLICITADO');
        if (error) { toast.error('Erro: ' + error.message); return; }
      }
      toast.success('Solicitação aprovada!');
      fetchData(0);
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejeitar = async (id: string) => {
    if (rejectingId) return;
    setRejectingId(id);
    try {
      const { error } = await supabase.from('rh_ferias_afastamentos').update({
        status: 'REJEITADO',
        aprovado_por: user?.id,
      }).eq('id', id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Solicitação rejeitada.');
      fetchData(0);
    } finally {
      setRejectingId(null);
    }
  };

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';
  const getTipoConfig = (tipo: string) => TIPOS.find(t => t.value === tipo) || TIPOS[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats
  const pendentes = registros.filter(r => r.status === 'SOLICITADO').length;
  const aprovados = registros.filter(r => r.status === 'APROVADO' || r.status === 'EM_ANDAMENTO').length;
  const emAndamento = registros.filter(r => {
    if (r.status !== 'APROVADO' && r.status !== 'EM_ANDAMENTO') return false;
    const hoje = new Date();
    try {
      return isWithinInterval(hoje, { start: parseISO(r.data_inicio), end: parseISO(r.data_fim) });
    } catch { return false; }
  }).length;
  const saldoVencendo = saldos.filter(s => {
    try {
      const venc = parseISO(s.vencimento);
      const diff = differenceInBusinessDays(venc, new Date());
      return diff <= 60 && s.dias_restantes > 0;
    } catch { return false; }
  }).length;

  // Calendar data
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const approvedRegistros = registros.filter(r => r.status === 'APROVADO' || r.status === 'EM_ANDAMENTO' || r.status === 'CONCLUIDO');

  const getDayRegistros = (day: Date) => {
    return approvedRegistros.filter(r => {
      try {
        return isWithinInterval(day, { start: parseISO(r.data_inicio), end: parseISO(r.data_fim) });
      } catch { return false; }
    });
  };

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pendentes" value={pendentes} icon={Clock} variant={pendentes > 0 ? 'warning' : 'default'} />
        <KpiCard label="Aprovados" value={aprovados} icon={CheckCircle2} variant="success" />
        <KpiCard label="Ausentes Hoje" value={emAndamento} icon={CalendarDays} variant="primary" />
        <KpiCard label="Férias Vencendo" value={saldoVencendo} icon={AlertTriangle} variant={saldoVencendo > 0 ? 'danger' : 'default'} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button size="sm" variant={viewMode === 'lista' ? 'default' : 'outline'} onClick={() => setViewMode('lista')} className="h-8 text-xs gap-1">
            <Clock className="w-3.5 h-3.5" /> Lista
          </Button>
          <Button size="sm" variant={viewMode === 'calendario' ? 'default' : 'outline'} onClick={() => setViewMode('calendario')} className="h-8 text-xs gap-1">
            <CalendarDays className="w-3.5 h-3.5" /> Calendário
          </Button>
        </div>
        {canManage && (
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Nova Solicitação</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Solicitação de Férias/Afastamento</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Início *</Label>
                    <DatePicker date={dateInicio} onDateChange={setDateInicio} className="h-10" />
                  </div>
                  <div>
                    <Label>Data Fim *</Label>
                    <DatePicker date={dateFim} onDateChange={setDateFim} className="h-10" />
                  </div>
                </div>
                {dateInicio && dateFim && dateFim >= dateInicio && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {calcDiasUteis(dateInicio, dateFim)} dias úteis
                  </p>
                )}
                <div><Label>Motivo</Label><Input value={form.motivo} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} /></div>
                <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>
                <Button onClick={handleCreate} disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Registrar Solicitação'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Calendar View */}
      {viewMode === 'calendario' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}>←</Button>
              <CardTitle className="text-base">{format(calMonth, 'MMMM yyyy', { locale: ptBR })}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}>→</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px text-center">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {/* Empty cells for alignment */}
              {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {monthDays.map(day => {
                const dayRegs = getDayRegistros(day);
                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                return (
                  <div key={day.toISOString()} className={cn(
                    "p-1 min-h-[48px] rounded text-xs border border-transparent",
                    isToday && "bg-primary-soft border-primary-border",
                    dayRegs.length > 0 && "bg-background-subtle"
                  )}>
                    <div className="font-medium text-[10px]">{format(day, 'd')}</div>
                    {dayRegs.slice(0, 2).map(r => {
                      const tipo = getTipoConfig(r.tipo);
                      return (
                        <div key={r.id} className={cn("text-[8px] truncate", tipo.color)}>
                          {getColabNome(r.colaborador_id).split(' ')[0]}
                        </div>
                      );
                    })}
                    {dayRegs.length > 2 && <div className="text-[8px] text-muted-foreground">+{dayRegs.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List View */}
      {viewMode === 'lista' && (
        <>
          {/* Pending approvals */}
          {canManage && pendentes > 0 && (
            <Card className="border-warning-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-warning">
                  <Clock className="w-4 h-4" /> Aguardando Aprovação ({pendentes})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {registros.filter(r => r.status === 'SOLICITADO').map(r => {
                  const tipo = getTipoConfig(r.tipo);
                  const TipoIcon = tipo.icon;
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-2 rounded bg-background-subtle">
                      <TipoIcon className={cn("w-4 h-4 shrink-0", tipo.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{getColabNome(r.colaborador_id)}</p>
                        <p className="text-xs text-muted-foreground">
                          {tipo.label} · {format(parseISO(r.data_inicio), 'dd/MM/yyyy')} a {format(parseISO(r.data_fim), 'dd/MM/yyyy')} · {r.dias_uteis} dias
                        </p>
                        {r.motivo && <p className="text-xs text-muted-foreground truncate">{r.motivo}</p>}
                      </div>
                      {/* Aprovar/Rejeitar é um fluxo de decisão, não o par edit/delete — TableActions não se aplica. */}
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-success" onClick={() => handleAprovar(r.id)}>
                          <CheckCircle2 className="w-3 h-3" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleRejeitar(r.id)}>
                          <XCircle className="w-3 h-3" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* All records table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Histórico de Férias e Afastamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {registros.length === 0 ? (
                <div className="text-center py-8">
                  <Palmtree className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Colaborador</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Período</TableHead>
                        <TableHead className="text-xs">Dias</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registros.map(r => {
                        const tipo = getTipoConfig(r.tipo);
                        const status = STATUS_CONFIG[r.status] || STATUS_CONFIG.SOLICITADO;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs font-medium">{getColabNome(r.colaborador_id)}</TableCell>
                            <TableCell className="text-xs">
                              <span className={cn("flex items-center gap-1", tipo.color)}>
                                <tipo.icon className="w-3 h-3" /> {tipo.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {format(parseISO(r.data_inicio), 'dd/MM/yyyy')} — {format(parseISO(r.data_fim), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell className="text-xs">{r.dias_uteis}</TableCell>
                            <TableCell>
                              <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saldo de férias */}
          {saldos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Palmtree className="w-4 h-4" /> Saldo de Férias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Colaborador</TableHead>
                        <TableHead className="text-xs">Período</TableHead>
                        <TableHead className="text-xs">Direito</TableHead>
                        <TableHead className="text-xs">Gozados</TableHead>
                        <TableHead className="text-xs">Restantes</TableHead>
                        <TableHead className="text-xs">Vencimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortByName(saldos, s => getColabNome(s.colaborador_id)).map(s => {
                        const vencProximo = (() => {
                          try {
                            return differenceInBusinessDays(parseISO(s.vencimento), new Date()) <= 60;
                          } catch { return false; }
                        })();
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs font-medium">{getColabNome(s.colaborador_id)}</TableCell>
                            <TableCell className="text-xs">{s.periodo_aquisitivo}</TableCell>
                            <TableCell className="text-xs">{s.dias_direito}</TableCell>
                            <TableCell className="text-xs">{s.dias_gozados}</TableCell>
                            <TableCell className="text-xs font-semibold">{s.dias_restantes}</TableCell>
                            <TableCell className={cn("text-xs", vencProximo && "text-destructive font-semibold")}>
                              {format(parseISO(s.vencimento), 'dd/MM/yyyy')}
                              {vencProximo && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
