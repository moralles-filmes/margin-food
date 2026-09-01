import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, CheckCircle2, Clock, AlertTriangle, ListChecks, Filter, Play, XCircle
} from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';
import { format, parseISO, isPast } from 'date-fns';

import { useCan } from '@/permissions/hooks';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  valor_hora: number | null;
}

interface ChecklistItem {
  texto: string;
  feito: boolean;
}

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string;
  setor: string;
  prioridade: string;
  recorrencia: string;
  responsavel_id: string | null;
  criado_por: string;
  status: string;
  prazo: string | null;
  concluida_em: string | null;
  checklist: ChecklistItem[];
  observacoes: string;
  created_at: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const SETORES = ['cozinha', 'sushi', 'limpeza', 'salao', 'copa'];
const SETOR_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};
const PRIORIDADE_LABELS: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  media: { label: 'Média', color: 'bg-warning-soft text-warning' },
  alta: { label: 'Alta', color: 'bg-warning-soft text-warning border border-warning-border' },
  critica: { label: 'Crítica', color: 'bg-destructive-soft text-destructive' },
};
const STATUS_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  PENDENTE: { label: 'Pendente', icon: Clock },
  EM_ANDAMENTO: { label: 'Em Andamento', icon: Play },
  CONCLUIDA: { label: 'Concluída', icon: CheckCircle2 },
  CANCELADA: { label: 'Cancelada', icon: XCircle },
};

export default function TarefasSection({
 colaboradores, canManage }: Props) {
  const canViewRbac = useCan('rh:tarefas:view');
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filterSetor, setFilterSetor] = useState<string>('todos');
  const [filterStatus, setFilterStatus] = useState<string>('ativas');

  const [form, setForm] = useState({
    titulo: '', descricao: '', setor: 'salao', prioridade: 'media',
    recorrencia: 'unica', responsavel_id: '', prazo: '', observacoes: '',
    checklistText: '',
  });

  const [savingTarefa, setSavingTarefa] = useState(false);
  const [tarefaPage, setTarefaPage] = useState(0);
  const [tarefaHasMore, setTarefaHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchTarefas = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    const { data, error } = await supabase
      .from('rh_tarefas')
      .select('id, titulo, descricao, setor, prioridade, recorrencia, responsavel_id, criado_por, status, prazo, concluida_em, checklist, observacoes, created_at')
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (error) { console.error(error); setLoading(false); return; }
    const parsed: Tarefa[] = (data || []).map((t) => ({
      ...t,
      checklist: Array.isArray(t.checklist) ? (t.checklist as unknown as ChecklistItem[]) : [],
    }));
    if (append) {
      setTarefas(prev => [...prev, ...parsed]);
    } else {
      setTarefas(parsed);
    }
    setTarefaHasMore(parsed.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTarefas(); }, [fetchTarefas]);

  const handleCreate = async () => {
    if (savingTarefa) return;
    if (!form.titulo.trim()) { toast.error('Título é obrigatório'); return; }
    setSavingTarefa(true);
    try {
      const checklist: ChecklistItem[] = form.checklistText
        .split('\n')
        .filter(l => l.trim())
        .map(l => ({ texto: l.trim(), feito: false }));

      const { error } = await supabase.from('rh_tarefas').insert({
        titulo: form.titulo,
        descricao: form.descricao,
        setor: form.setor,
        prioridade: form.prioridade,
        recorrencia: form.recorrencia,
        responsavel_id: form.responsavel_id || null,
        criado_por: user?.id ?? null,
        prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        checklist: checklist as unknown as import('@/integrations/supabase/types').Json[],
        observacoes: form.observacoes,
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Tarefa criada!');
      setShowNew(false);
      setForm({ titulo: '', descricao: '', setor: 'salao', prioridade: 'media', recorrencia: 'unica', responsavel_id: '', prazo: '', observacoes: '', checklistText: '' });
      setTarefaPage(0);
      fetchTarefas(0);
    } finally {
      setSavingTarefa(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'CONCLUIDA') {
      updates.concluida_em = new Date().toISOString();
      updates.concluida_por = user?.id;
    }
    const { error } = await supabase.from('rh_tarefas')
      .update(updates as import('@/integrations/supabase/types').Database['public']['Tables']['rh_tarefas']['Update'])
      .eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Tarefa ${newStatus === 'CONCLUIDA' ? 'concluída' : 'atualizada'}!`);
    fetchTarefas();
  };

  const handleToggleChecklist = async (tarefaId: string, idx: number) => {
    const tarefa = tarefas.find(t => t.id === tarefaId);
    if (!tarefa) return;
    const newChecklist = [...tarefa.checklist];
    newChecklist[idx] = { ...newChecklist[idx], feito: !newChecklist[idx].feito };
    const { error } = await supabase.from('rh_tarefas').update({
      checklist: newChecklist as unknown as import('@/integrations/supabase/types').Json[],
    }).eq('id', tarefaId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    fetchTarefas();
  };

  const getColabNome = (id: string | null) => {
    if (!id) return '—';
    return colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';
  };

  // Filters
  const filtered = tarefas.filter(t => {
    if (filterSetor !== 'todos' && t.setor !== filterSetor) return false;
    if (filterStatus === 'ativas' && (t.status === 'CONCLUIDA' || t.status === 'CANCELADA')) return false;
    if (filterStatus === 'concluidas' && t.status !== 'CONCLUIDA') return false;
    return true;
  });

  // Stats
  const pendentes = tarefas.filter(t => t.status === 'PENDENTE').length;
  const emAndamento = tarefas.filter(t => t.status === 'EM_ANDAMENTO').length;
  const concluidas = tarefas.filter(t => t.status === 'CONCLUIDA').length;
  const atrasadas = tarefas.filter(t => t.prazo && isPast(parseISO(t.prazo)) && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pendentes" value={pendentes} icon={Clock} />
        <KpiCard label="Em Andamento" value={emAndamento} icon={Play} variant="primary" />
        <KpiCard label="Concluídas" value={concluidas} icon={CheckCircle2} variant="success" />
        <KpiCard label="Atrasadas" value={atrasadas} icon={AlertTriangle} variant={atrasadas > 0 ? 'danger' : 'default'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterSetor} onValueChange={setFilterSetor}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Setores</SelectItem>
            {SETORES.map(s => <SelectItem key={s} value={s}>{SETOR_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Ativas</SelectItem>
            <SelectItem value="concluidas">Concluídas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canManage && (
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Nova Tarefa</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Limpar câmara fria" /></div>
                <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Setor</Label>
                    <Select value={form.setor} onValueChange={v => setForm(p => ({ ...p, setor: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SETORES.map(s => <SelectItem key={s} value={s}>{SETOR_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Recorrência</Label>
                    <Select value={form.recorrencia} onValueChange={v => setForm(p => ({ ...p, recorrencia: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unica">Única</SelectItem>
                        <SelectItem value="diaria">Diária</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Select value={form.responsavel_id} onValueChange={v => setForm(p => ({ ...p, responsavel_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Prazo</Label><Input type="datetime-local" value={form.prazo} onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))} /></div>
                <div>
                  <Label>Checklist (um item por linha)</Label>
                  <Textarea value={form.checklistText} onChange={e => setForm(p => ({ ...p, checklistText: e.target.value }))} rows={3} placeholder={"Verificar temperatura\nHigienizar bancada\nRepor insumos"} />
                </div>
                <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>
                <Button onClick={handleCreate} disabled={savingTarefa} className="w-full">{savingTarefa ? 'Salvando...' : 'Criar Tarefa'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Task List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(t => {
            const prio = PRIORIDADE_LABELS[t.prioridade] || PRIORIDADE_LABELS.media;
            const statusInfo = STATUS_LABELS[t.status] || STATUS_LABELS.PENDENTE;
            const StatusIcon = statusInfo.icon;
            const isAtrasada = t.prazo && isPast(parseISO(t.prazo)) && t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA';
            const checkDone = t.checklist.filter(c => c.feito).length;
            const checkTotal = t.checklist.length;

            return (
              <Card key={t.id} className={`hover:shadow-md transition-shadow ${isAtrasada ? 'border-destructive-border' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight">{t.titulo}</CardTitle>
                    <Badge className={`text-[10px] shrink-0 ${prio.color}`}>{prio.label}</Badge>
                  </div>
                  <CardDescription className="text-xs line-clamp-2">{t.descricao || 'Sem descrição'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Setor</span>
                    <Badge variant="secondary" className="text-[10px]">{SETOR_LABELS[t.setor] || t.setor}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Responsável</span>
                    <span className="font-medium">{getColabNome(t.responsavel_id)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1">
                      <StatusIcon className={`w-3 h-3 ${t.status === 'CONCLUIDA' ? 'text-success' : isAtrasada ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <span className={isAtrasada ? 'text-destructive font-medium' : ''}>{statusInfo.label}</span>
                    </div>
                  </div>
                  {t.prazo && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Prazo</span>
                      <span className={isAtrasada ? 'text-destructive font-medium' : ''}>
                        {format(parseISO(t.prazo), "dd/MM/yyyy HH:mm")}
                        {isAtrasada && <AlertTriangle className="w-3 h-3 inline ml-1 text-destructive" />}
                      </span>
                    </div>
                  )}
                  {t.recorrencia !== 'unica' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Recorrência</span>
                      <Badge variant="outline" className="text-[10px]">{t.recorrencia === 'diaria' ? 'Diária' : 'Semanal'}</Badge>
                    </div>
                  )}

                  {/* Checklist */}
                  {checkTotal > 0 && (
                    <div className="space-y-1 pt-1 border-t">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1"><ListChecks className="w-3 h-3" /> Checklist</span>
                        <span className="font-medium">{checkDone}/{checkTotal}</span>
                      </div>
                      <div className="space-y-0.5 max-h-24 overflow-y-auto">
                        {t.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={item.feito}
                              onCheckedChange={() => handleToggleChecklist(t.id, idx)}
                              className="w-3.5 h-3.5"
                            />
                            <span className={item.feito ? 'line-through text-muted-foreground' : ''}>{item.texto}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA' && (
                    <div className="flex gap-1.5 pt-2">
                      {t.status === 'PENDENTE' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1" onClick={() => handleUpdateStatus(t.id, 'EM_ANDAMENTO')}>
                          <Play className="w-3 h-3" /> Iniciar
                        </Button>
                      )}
                      <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={() => handleUpdateStatus(t.id, 'CONCLUIDA')}>
                        <CheckCircle2 className="w-3 h-3" /> Concluir
                      </Button>
                      {canManage && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleUpdateStatus(t.id, 'CANCELADA')}>
                          <XCircle className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
