import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Send, ArrowRightLeft, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { format, addDays, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { fmtBRL } from '@/lib/formatters';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

import { useCan } from '@/permissions/hooks';
const SETORES = ['cozinha', 'sushi', 'limpeza', 'salao', 'copa'];
const SETOR_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};
const DIA_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  funcao: string;
  valor_hora: number;
  carga_horaria_semanal: number;
}

interface Escala {
  id: string;
  semana_inicio: string;
  setor: string;
  status: string;
  custo_projetado: number;
  observacoes: string;
}

interface EscalaSlot {
  id: string;
  escala_id: string;
  colaborador_id: string;
  dia: string;
  hora_inicio: string;
  hora_fim: string;
  funcao: string;
  tipo: string;
  observacao: string;
}

interface TrocaTurno {
  id: string;
  slot_original_id: string;
  solicitante_id: string;
  substituto_id: string | null;
  motivo: string;
  status: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

export default function EscalasSection({
 colaboradores, canManage }: Props) {
  const supabase = useSupabase();
  const canViewRbac = useCan('rh:escalas:view');
  const { user, profile } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [setor, setSetor] = useState('salao');
  const [escala, setEscala] = useState<Escala | null>(null);
  const [slots, setSlots] = useState<EscalaSlot[]>([]);
  const [trocas, setTrocas] = useState<TrocaTurno[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [showTroca, setShowTroca] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');

  // Slot form
  const [slotForm, setSlotForm] = useState({
    colaborador_id: '', hora_inicio: '08:00', hora_fim: '16:00', funcao: 'Geral', tipo: 'TRABALHO', observacao: ''
  });

  // Troca form
  const [trocaForm, setTrocaForm] = useState({ slot_id: '', substituto_id: '', motivo: '' });

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const colabsSetor = colaboradores.filter(c => c.setor === setor);

  const fetchEscala = useCallback(async () => {
    setLoading(true);
    const { data: escalaData } = await supabase
      .from('rh_escalas')
      .select('id, setor, semana_inicio, status, custo_projetado, observacoes, created_at, created_by')
      .eq('company_id', profile?.company_id ?? '')
      .eq('semana_inicio', weekStartStr)
      .eq('setor', setor)
      .maybeSingle();

    setEscala(escalaData);

    if (escalaData) {
      const { data: slotsData } = await supabase
        .from('rh_escala_slots')
        .select('id, escala_id, colaborador_id, dia, hora_inicio, hora_fim, funcao, tipo, observacao')
        .eq('escala_id', escalaData.id)
        .order('hora_inicio');
      setSlots(slotsData || []);

      const slotIds = (slotsData || []).map(s => s.id);
      if (slotIds.length > 0) {
        const { data: trocasData } = await supabase
          .from('rh_trocas_turno')
          .select('id, slot_original_id, solicitante_id, substituto_id, motivo, status')
          .in('slot_original_id', slotIds);
        setTrocas(trocasData || []);
      } else {
        setTrocas([]);
      }
    } else {
      setSlots([]);
      setTrocas([]);
    }
    setLoading(false);
  }, [supabase, profile?.company_id, weekStartStr, setor]);

  useEffect(() => { fetchEscala(); }, [fetchEscala]);

  const [savingEscala, setSavingEscala] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);

  const handleCreateEscala = async () => {
    if (savingEscala) return;
    setSavingEscala(true);
    try {
      const { data, error } = await supabase.from('rh_escalas').insert({
        semana_inicio: weekStartStr,
        setor,
        created_by: user?.id,
        company_id: profile?.company_id,
      }).select().single();
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Escala criada!');
      setEscala(data);
    } finally {
      setSavingEscala(false);
    }
  };

  const handlePublicar = async () => {
    if (!escala) return;
    // Calculate projected cost
    let custoTotal = 0;
    for (const slot of slots) {
      if (slot.tipo !== 'TRABALHO') continue;
      const colab = colaboradores.find(c => c.id === slot.colaborador_id);
      if (!colab || !colab.valor_hora) continue;
      const [hi, mi] = slot.hora_inicio.split(':').map(Number);
      const [hf, mf] = slot.hora_fim.split(':').map(Number);
      const horas = (hf * 60 + mf - hi * 60 - mi) / 60;
      custoTotal += horas * colab.valor_hora;
    }

    const { error } = await supabase.from('rh_escalas').update({
      status: 'PUBLICADA',
      publicada_em: new Date().toISOString(), // timestamptz — UTC is correct
      publicada_por: user?.id,
      custo_projetado: Math.round(custoTotal * 100) / 100,
    }).eq('id', escala.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Escala publicada!');
    fetchEscala();
  };

  const handleAddSlot = async () => {
    if (savingSlot) return;
    if (!escala || !slotForm.colaborador_id || !selectedDay) {
      toast.error('Preencha todos os campos'); return;
    }
    setSavingSlot(true);
    try {
      const { error } = await supabase.from('rh_escala_slots').insert({
        escala_id: escala.id,
        colaborador_id: slotForm.colaborador_id,
        dia: selectedDay,
        hora_inicio: slotForm.hora_inicio,
        hora_fim: slotForm.hora_fim,
        funcao: slotForm.funcao,
        tipo: slotForm.tipo,
        observacao: slotForm.observacao,
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Turno adicionado!');
      setShowAddSlot(false);
      setSlotForm({ colaborador_id: '', hora_inicio: '08:00', hora_fim: '16:00', funcao: 'Geral', tipo: 'TRABALHO', observacao: '' });
      fetchEscala();
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    const ok = await confirm({
      title: 'Remover turno',
      description: 'Tem certeza que deseja remover este turno da escala?',
      confirmLabel: 'Remover',
      variant: 'destructive',
    });
    if (!ok) return;

    const { error } = await supabase.from('rh_escala_slots').delete().eq('id', slotId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Turno removido');
    fetchEscala();
  };

  const handleAprovarTroca = async (trocaId: string, aprovado: boolean) => {
    const { error } = await supabase.from('rh_trocas_turno').update({
      status: aprovado ? 'APROVADA' : 'REJEITADA',
      aprovado_por: user?.id,
      aprovado_em: new Date().toISOString(),
    }).eq('id', trocaId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(aprovado ? 'Troca aprovada!' : 'Troca rejeitada');
    fetchEscala();
  };

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || '—';

  // Custo projetado calculation
  const custoProjetadoAtual = slots.reduce((total, slot) => {
    if (slot.tipo !== 'TRABALHO') return total;
    const colab = colaboradores.find(c => c.id === slot.colaborador_id);
    if (!colab?.valor_hora) return total;
    const [hi, mi] = slot.hora_inicio.split(':').map(Number);
    const [hf, mf] = slot.hora_fim.split(':').map(Number);
    const horas = (hf * 60 + mf - hi * 60 - mi) / 60;
    return total + horas * colab.valor_hora;
  }, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {format(weekStart, "dd/MM", { locale: ptBR })} — {format(addDays(weekStart, 6), "dd/MM/yyyy", { locale: ptBR })}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Select value={setor} onValueChange={setSetor}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{SETORES.map(s => <SelectItem key={s} value={s}>{SETOR_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>

        {escala && (
          <Badge variant={escala.status === 'PUBLICADA' ? 'default' : 'outline'} className="text-xs">
            {escala.status}
          </Badge>
        )}

        {canManage && !escala && (
          <Button size="sm" onClick={handleCreateEscala} disabled={savingEscala} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> {savingEscala ? 'Criando...' : 'Criar Escala'}</Button>
        )}
        {canManage && escala && escala.status === 'RASCUNHO' && (
          <Button size="sm" onClick={handlePublicar} className="gap-1.5"><Send className="w-3.5 h-3.5" /> Publicar</Button>
        )}
      </div>

      {/* Cost projection card */}
      {escala && slots.length > 0 && (
        <Card>
          <CardContent className="py-3 flex items-center gap-4">
            <DollarSign className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Custo projetado da semana</p>
              <p className="text-lg font-bold text-foreground">
                {fmtBRL(custoProjetadoAtual)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">{slots.filter(s => s.tipo === 'TRABALHO').length} turnos</p>
              <p className="text-xs text-muted-foreground">{new Set(slots.map(s => s.colaborador_id)).size} colaboradores</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly grid */}
      {escala ? (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header */}
            <div className="grid grid-cols-8 gap-1 mb-1">
              <div className="text-xs font-medium text-muted-foreground p-2">Colaborador</div>
              {weekDays.map((day, i) => (
                <div key={i} className="text-center p-2">
                  <p className="text-[10px] font-medium text-muted-foreground">{DIA_LABELS[day.getDay()]}</p>
                  <p className="text-xs font-bold">{format(day, 'dd')}</p>
                </div>
              ))}
            </div>

            {/* Rows per colaborador */}
            {colabsSetor.map(colab => (
              <div key={colab.id} className="grid grid-cols-8 gap-1 mb-1">
                <div className="flex items-center text-xs font-medium p-2 truncate bg-background-subtle rounded">
                  {colab.nome}
                </div>
                {weekDays.map((day, i) => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const daySlots = slots.filter(s => s.colaborador_id === colab.id && s.dia === dayStr);
                  return (
                    <div key={i} className="min-h-[60px] border border-border rounded p-1 relative group">
                      {daySlots.map(slot => (
                        <div
                          key={slot.id}
                          className={`text-[10px] rounded px-1 py-0.5 mb-0.5 ${
                            slot.tipo === 'TRABALHO' ? 'bg-primary-soft text-primary-ink border border-primary-border' :
                            slot.tipo === 'FOLGA' ? 'bg-muted text-muted-foreground' :
                            'bg-warning-soft text-warning border border-warning-border'
                          }`}
                        >
                          {slot.tipo === 'TRABALHO' ? `${slot.hora_inicio.slice(0,5)}–${slot.hora_fim.slice(0,5)}` : slot.tipo}
                          {canManage && escala.status === 'RASCUNHO' && (
                            <button onClick={() => handleDeleteSlot(slot.id)} className="ml-1 text-destructive hover:text-destructive">×</button>
                          )}
                        </div>
                      ))}
                      {canManage && escala.status === 'RASCUNHO' && (
                        <button
                          onClick={() => { setSelectedDay(dayStr); setSlotForm(p => ({ ...p, colaborador_id: colab.id })); setShowAddSlot(true); }}
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-primary-soft rounded transition-opacity"
                        >
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {colabsSetor.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador neste setor.</p>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma escala para esta semana/setor.</p>
            {canManage && <p className="text-xs text-muted-foreground mt-1">Clique em "Criar Escala" para começar.</p>}
          </CardContent>
        </Card>
      )}

      {/* Trocas pendentes */}
      {canManage && trocas.filter(t => t.status === 'PENDENTE').length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-warning" /> Trocas de Turno Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Substituto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trocas.filter(t => t.status === 'PENDENTE').map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{getColabNome(t.solicitante_id)}</TableCell>
                    <TableCell className="text-xs">{t.substituto_id ? getColabNome(t.substituto_id) : '—'}</TableCell>
                    <TableCell className="text-xs">{t.motivo}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAprovarTroca(t.id, true)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Sim
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => handleAprovarTroca(t.id, false)}>
                          <XCircle className="w-3 h-3 mr-1" /> Não
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Add Slot */}
      <Dialog open={showAddSlot} onOpenChange={setShowAddSlot}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Turno</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={slotForm.colaborador_id} onValueChange={v => setSlotForm(p => ({ ...p, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{colabsSetor.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Início</Label><Input type="time" value={slotForm.hora_inicio} onChange={e => setSlotForm(p => ({ ...p, hora_inicio: e.target.value }))} /></div>
              <div><Label>Fim</Label><Input type="time" value={slotForm.hora_fim} onChange={e => setSlotForm(p => ({ ...p, hora_fim: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={slotForm.tipo} onValueChange={v => setSlotForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRABALHO">Trabalho</SelectItem>
                  <SelectItem value="FOLGA">Folga</SelectItem>
                  <SelectItem value="FERIAS">Férias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Função</Label><Input value={slotForm.funcao} onChange={e => setSlotForm(p => ({ ...p, funcao: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddSlot} className="w-full">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
