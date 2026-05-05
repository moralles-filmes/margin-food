import { useState, useEffect, useCallback } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCan, useModuleAccess } from '@/permissions/hooks';
import { toast } from 'sonner';
import { formatFixedBR, fmtBRL, formatPercentBR, formatDateBR, formatInBR, todayBR, parseLocalDate } from '@/lib/formatters';

const COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--accent))',
];

function fmt(v: number) {
  return fmtBRL(v);
}

import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  UserPlus, Clock, Timer, Users, Play, Square, Coffee, CheckCircle2,
  AlertTriangle, TrendingUp, Calendar as CalendarIcon2, Edit2, Eye, CalendarDays, GraduationCap, Palmtree, FileText,
  XCircle, Search, MoreHorizontal, UserX, CalendarIcon, Calculator
} from 'lucide-react';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import EscalasSection from '@/components/rh/EscalasSection';
import TarefasSection from '@/components/rh/TarefasSection';
import OnboardingSection from '@/components/rh/OnboardingSection';
import TreinamentoSection from '@/components/rh/TreinamentoSection';
import FeriasAfastamentosSection from '@/components/rh/FeriasAfastamentosSection';
import DocumentosComplianceSection from '@/components/rh/DocumentosComplianceSection';
import FolhaPagamentoSection from '@/components/rh/FolhaPagamentoSection';
import BeneficiosSection from '@/components/rh/BeneficiosSection';
import DashboardRhSection from '@/components/rh/DashboardRhSection';
import SSTSection from '@/components/rh/SSTSection';
import ComunicacaoInternaSection from '@/components/rh/ComunicacaoInternaSection';
import ControleCustosRhSection from '@/components/rh/ControleCustosRhSection';
import GestaoDisciplinarSection from '@/components/rh/GestaoDisciplinarSection';
import { BookOpen, DollarSign, Heart, BarChart3, HardHat, Megaphone, Wallet, ShieldAlert } from 'lucide-react';

const PAGE_SIZE = 50;

type RhSubTab = 'prontuario' | 'ponto' | 'banco-horas' | 'escalas' | 'tarefas' | 'onboarding' | 'treinamento' | 'ferias' | 'documentos' | 'folha' | 'beneficios' | 'dashboard' | 'sst' | 'comunicados' | 'custos' | 'disciplinar';

interface Colaborador {
  id: string;
  user_id: string | null;
  nome: string;
  cpf: string | null;
  telefone: string;
  email: string;
  cargo: string;
  funcao: string;
  setor: string;
  data_admissao: string;
  tipo_contrato: string;
  status: string;
  carga_horaria_semanal: number;
  salario: number;
  valor_hora: number;
  created_at: string;
}

interface PontoRegistro {
  id: string;
  colaborador_id: string;
  data: string;
  tipo: string;
  hora: string;
  metodo: string;
  justificativa: string;
  aprovado: boolean;
  aprovado_por: string | null;
  status?: string;
  created_at: string;
}

interface BancoHoras {
  id: string;
  colaborador_id: string;
  periodo: string;
  horas_trabalhadas: number;
  horas_escaladas: number;
  horas_extras: number;
  banco_horas_saldo: number;
  atrasos_min: number;
  faltas: number;
  dias_trabalhados: number;
}

interface Profile {
  id: string;
  nome: string;
  email: string;
}

const SETORES = ['cozinha', 'sushi', 'limpeza', 'salao', 'copa'];
const CONTRATOS = ['CLT', 'PJ', 'Freelancer', 'Estágio'];
const TIPO_PONTO = ['ENTRADA', 'SAIDA', 'INICIO_INTERVALO', 'FIM_INTERVALO'];

const SETOR_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};

export default function RhView() {
  const { user } = useAuth();
  const { visibleSubtabs, canView } = useModuleAccess('rh');

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Sem Permissão</h2>
        <p className="text-sm text-muted-foreground mt-1">Você não tem acesso ao módulo de RH.</p>
      </div>
    );
  }

  return <RhViewInner visibleSubtabs={visibleSubtabs} user={user} />;
}

function RhViewInner({ visibleSubtabs, user }: {
  visibleSubtabs: string[]; user: any;
}) {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreateProntuario = useCan('rh:prontuario:create');
  const canEditProntuario = useCan('rh:prontuario:edit');
  const canManageProntuario = useCan('rh:prontuario:manage');
  const canCreatePonto = useCan('rh:ponto:create');
  const canManagePonto = useCan('rh:ponto:manage');
  const canApprovePonto = useCan('rh:ponto:approve');
  const canManageBH = useCan('rh:banco-horas:manage');
  const canReconcileBH = useCan('rh:banco-horas:reconcile');
  const canManageFolha = useCan('rh:folha:manage');

  // Derived flags for sub-section components
  const canManage = canManageProntuario || canEditProntuario;
  const canPonto = canCreatePonto;

  // Map subtab keys to UI tab IDs (mural = comunicados in UI)
  const SUBTAB_TO_TAB: Record<string, RhSubTab> = {
    'prontuario': 'prontuario', 'escalas': 'escalas', 'tarefas': 'tarefas',
    'onboarding': 'onboarding', 'treinamento': 'treinamento', 'ferias': 'ferias',
    'documentos': 'documentos', 'folha': 'folha', 'beneficios': 'beneficios',
    'dashboard': 'dashboard', 'custos': 'custos', 'sst': 'sst',
    'disciplinar': 'disciplinar', 'mural': 'comunicados', 'ponto': 'ponto',
    'banco-horas': 'banco-horas',
  };
  const visibleTabIds = visibleSubtabs.map(k => SUBTAB_TO_TAB[k]).filter(Boolean);
  const defaultTab = visibleTabIds[0] || 'prontuario';

  const [subTab, setSubTab] = usePersistedTab<RhSubTab>('app:tab:rh', defaultTab);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [colabPage, setColabPage] = useState(0);
  const [colabHasMore, setColabHasMore] = useState(true);
  const [pontos, setPontos] = useState<PontoRegistro[]>([]);
  const [bancoHoras, setBancoHoras] = useState<BancoHoras[]>([]);
  const [bhPage, setBhPage] = useState(0);
  const [bhHasMore, setBhHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showNewColab, setShowNewColab] = useState(false);
  const [myColaboradorId, setMyColaboradorId] = useState<string | null>(null);
  const [showInativos, setShowInativos] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Double-click protection
  const [savingColab, setSavingColab] = useState(false);
  const [savingEditColab, setSavingEditColab] = useState(false);
  const [savingPonto, setSavingPonto] = useState(false);
  const [approvingPonto, setApprovingPonto] = useState<string | null>(null);
  const [rejectingPonto, setRejectingPonto] = useState<string | null>(null);
  const [savingEditPonto, setSavingEditPonto] = useState(false);

  // Edit modal state
  const [editingColab, setEditingColab] = useState<Colaborador | null>(null);
  const [showEditColab, setShowEditColab] = useState(false);

  // Ponto date filter
  const [pontoDate, setPontoDate] = useState<Date>(new Date());

  // Banco de horas calc
  const [calculandoBH, setCalculandoBH] = useState(false);
  const [bhPeriodo, setBhPeriodo] = useState(formatInBR(new Date(), 'yyyy-MM'));

  // New colaborador form
  const [formColab, setFormColab] = useState({
    nome: '', email: '', telefone: '', cpf: '', cargo: 'Colaborador', funcao: 'Geral',
    setor: 'salao', tipo_contrato: 'CLT', carga_horaria_semanal: '44', salario: '0', valor_hora: '0',
    user_id: '', data_admissao: todayBR(),
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    nome: '', email: '', telefone: '', cpf: '', cargo: '', funcao: '',
    setor: '', tipo_contrato: '', carga_horaria_semanal: '44', salario: '0', valor_hora: '0',
    user_id: '', data_admissao: '',
  });

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.rpc('list_profiles_minimal', { p_search: '', p_limit: 200 });
    setProfiles((data || []) as Profile[]);
  }, []);

  const fetchColaboradores = useCallback(async (page = 0, append = false) => {
    let query = supabase.from('rh_colaboradores').select('id, user_id, nome, cpf, telefone, email, cargo, funcao, setor, data_admissao, tipo_contrato, status, carga_horaria_semanal, salario, valor_hora, created_at, adicional_noturno_percent').order('nome')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (!showInativos) query = query.eq('status', 'ativo');
    const { data, error } = await query;
    if (error) { console.error(error); return; }
    const newData = data || [];
    if (append) {
      setColaboradores(prev => [...prev, ...newData]);
    } else {
      setColaboradores(newData);
    }
    setColabHasMore(newData.length === PAGE_SIZE);
    if (user && !append) {
      const mine = newData.find(c => c.user_id === user.id);
      setMyColaboradorId(mine?.id || null);
    }
  }, [user, showInativos]);

  const fetchPontos = useCallback(async () => {
    const dateStr = formatDateBR(pontoDate);
    const { data, error } = await supabase.from('rh_ponto_registros').select('id, colaborador_id, data, tipo, hora, metodo, justificativa, aprovado, aprovado_por, status, created_at')
      .eq('data', dateStr)
      .neq('status', 'REJEITADO')
      .order('hora', { ascending: true }).range(0, PAGE_SIZE - 1);
    if (error) { console.error(error); return; }
    setPontos(data || []);
  }, [pontoDate]);

  const fetchBancoHoras = useCallback(async (page = 0, append = false) => {
    const { data, error } = await supabase.from('rh_banco_horas').select('id, colaborador_id, periodo, horas_trabalhadas, horas_escaladas, horas_extras, banco_horas_saldo, atrasos_min, faltas, dias_trabalhados').eq('periodo', bhPeriodo)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) { console.error(error); return; }
    const newData = data || [];
    if (append) {
      setBancoHoras(prev => [...prev, ...newData]);
    } else {
      setBancoHoras(newData);
    }
    setBhHasMore(newData.length === PAGE_SIZE);
  }, [bhPeriodo]);

  // Reset pagination on filter change
  useEffect(() => {
    setColabPage(0);
    setColaboradores([]);
  }, [showInativos]);

  useEffect(() => {
    setBhPage(0);
    setBancoHoras([]);
  }, [bhPeriodo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchColaboradores(0), fetchPontos(), fetchBancoHoras(0), fetchProfiles()]).finally(() => setLoading(false));
  }, [fetchColaboradores, fetchPontos, fetchBancoHoras, fetchProfiles]);

  const handleCreateColab = async () => {
    if (savingColab) return;
    if (!formColab.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingColab(true);
    try {
      const payload: any = {
        nome: formColab.nome, email: formColab.email, telefone: formColab.telefone,
        cpf: formColab.cpf, cargo: formColab.cargo, funcao: formColab.funcao,
        setor: formColab.setor, tipo_contrato: formColab.tipo_contrato,
        carga_horaria_semanal: parseDecimal(formColab.carga_horaria_semanal) ?? 44,
        salario: parseDecimal(formColab.salario) ?? 0,
        valor_hora: parseDecimal(formColab.valor_hora) ?? 0,
        data_admissao: formColab.data_admissao,
        created_by: user?.id,
      };
      if (formColab.user_id) payload.user_id = formColab.user_id;
      const { error } = await supabase.from('rh_colaboradores').insert(payload);
      if (error) { toast.error('Erro ao criar colaborador: ' + error.message); return; }
      toast.success('Colaborador criado com sucesso!');
      setShowNewColab(false);
      setFormColab({ nome: '', email: '', telefone: '', cpf: '', cargo: 'Colaborador', funcao: 'Geral', setor: 'salao', tipo_contrato: 'CLT', carga_horaria_semanal: '44', salario: '0', valor_hora: '0', user_id: '', data_admissao: todayBR() });
      fetchColaboradores(0);
    } finally {
      setSavingColab(false);
    }
  };

  const handleOpenEdit = (c: Colaborador) => {
    setEditingColab(c);
    setEditForm({
      nome: c.nome, email: c.email, telefone: c.telefone, cpf: c.cpf || '',
      cargo: c.cargo, funcao: c.funcao, setor: c.setor, tipo_contrato: c.tipo_contrato,
      carga_horaria_semanal: String(c.carga_horaria_semanal), salario: String(c.salario), valor_hora: String(c.valor_hora),
      user_id: c.user_id || '', data_admissao: c.data_admissao,
    });
    setShowEditColab(true);
  };

  const handleUpdateColab = async () => {
    if (savingEditColab) return;
    if (!editingColab) return;
    if (!editForm.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingEditColab(true);
    try {
      const payload: any = {
        nome: editForm.nome, email: editForm.email, telefone: editForm.telefone,
        cpf: editForm.cpf || null, cargo: editForm.cargo, funcao: editForm.funcao,
        setor: editForm.setor, tipo_contrato: editForm.tipo_contrato,
        carga_horaria_semanal: parseDecimal(editForm.carga_horaria_semanal) ?? 44,
        salario: parseDecimal(editForm.salario) ?? 0,
        valor_hora: parseDecimal(editForm.valor_hora) ?? 0,
        data_admissao: editForm.data_admissao,
        user_id: editForm.user_id || null,
      };
      const { error } = await supabase.from('rh_colaboradores').update(payload).eq('id', editingColab.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Colaborador atualizado!');
      setShowEditColab(false);
      setEditingColab(null);
      fetchColaboradores(0);
    } finally {
      setSavingEditColab(false);
    }
  };

  const handleDesativar = async (id: string) => {
    const ok = await confirm({ title: 'Desativar colaborador', description: 'Tem certeza que deseja desativar este colaborador? O histórico será mantido.', confirmLabel: 'Desativar', variant: 'destructive' });
    if (!ok) return;
    const { error } = await supabase.from('rh_colaboradores').update({ status: 'inativo' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Colaborador desativado.');
    fetchColaboradores(0);
  };

  const handleReativar = async (id: string) => {
    const { error } = await supabase.from('rh_colaboradores').update({ status: 'ativo' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Colaborador reativado.');
    fetchColaboradores(0);
  };

  const handleRegistrarPonto = async (tipo: string) => {
    if (savingPonto) return;
    if (!myColaboradorId) {
      toast.error('Seu cadastro de colaborador não foi encontrado. Solicite ao gestor.');
      return;
    }
    setSavingPonto(true);
    try {
      const { error } = await supabase.from('rh_ponto_registros').insert({
        colaborador_id: myColaboradorId,
        tipo,
        data: todayBR(),
        hora: new Date().toISOString(),
        metodo: 'app',
        created_by: user?.id,
      });
      if (error) { toast.error('Erro ao registrar ponto: ' + error.message); return; }
      toast.success(`${tipo.replace('_', ' ')} registrado!`);
      fetchPontos();
    } finally {
      setSavingPonto(false);
    }
  };

  const handleAprovarPonto = async (pontoId: string) => {
    if (approvingPonto) return;
    const ponto = pontos.find(p => p.id === pontoId);
    if (ponto?.aprovado) { toast.error('Este ponto já foi aprovado.'); return; }
    setApprovingPonto(pontoId);
    try {
      const { error } = await supabase.from('rh_ponto_registros').update({
        aprovado: true, aprovado_por: user?.id,
      }).eq('id', pontoId).eq('aprovado', false);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Ponto aprovado!');
      fetchPontos();
    } finally {
      setApprovingPonto(null);
    }
  };

  const handleRejeitarPonto = async (pontoId: string) => {
    if (rejectingPonto) return;
    const ok = await confirm({ title: 'Rejeitar ponto', description: 'Tem certeza que deseja rejeitar este registro de ponto?', confirmLabel: 'Rejeitar', variant: 'destructive' });
    if (!ok) return;
    setRejectingPonto(pontoId);
    try {
      const { data, error } = await supabase.rpc('reject_ponto_record', {
        p_id: pontoId,
        p_reason: 'Rejeitado pelo gestor',
      });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Ponto rejeitado.');
      fetchPontos();
    } finally {
      setRejectingPonto(null);
    }
  };

  const [editingPonto, setEditingPonto] = useState<PontoRegistro | null>(null);
  const [editPontoHora, setEditPontoHora] = useState('');
  const [editPontoJustificativa, setEditPontoJustificativa] = useState('');

  const handleEditPonto = (p: PontoRegistro) => {
    if (p.aprovado) {
      toast.error('Não é possível editar um ponto já aprovado.');
      return;
    }
    setEditingPonto(p);
    setEditPontoHora(format(parseISO(p.hora), 'HH:mm'));
    setEditPontoJustificativa(p.justificativa || '');
  };

  const handleSaveEditPonto = async () => {
    if (savingEditPonto) return;
    if (!editingPonto) return;
    setSavingEditPonto(true);
    try {
      const [h, m] = editPontoHora.split(':').map(Number);
      const newDate = parseISO(editingPonto.hora);
      newDate.setHours(h, m, 0, 0);
      const { error } = await supabase.from('rh_ponto_registros').update({
        hora: newDate.toISOString(),
        justificativa: editPontoJustificativa || null,
      }).eq('id', editingPonto.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Ponto atualizado!');
      setEditingPonto(null);
      fetchPontos();
    } finally {
      setSavingEditPonto(false);
    }
  };

  const handleCalcularBancoHoras = async () => {
    if (calculandoBH) return;
    setCalculandoBH(true);
    try {
      const { data, error } = await supabase.functions.invoke('rh', {
        body: { action: 'calcular_banco_horas', periodo: bhPeriodo },
      });
      if (error) { toast.error('Erro ao calcular: ' + error.message); return; }
      if (data?.error) { toast.error('Erro: ' + data.error); return; }
      toast.success(`Banco de horas calculado! ${data?.results?.length || 0} colaboradores processados.`);
      fetchBancoHoras(0);
    } catch (e: any) {
      toast.error('Erro inesperado: ' + (e.message || 'Falha'));
    } finally {
      setCalculandoBH(false);
    }
  };

  const meusPontos = pontos.filter(p => p.colaborador_id === myColaboradorId);
  const todosAprovados = pontos.filter(p => !p.aprovado);
  const isToday = formatDateBR(pontoDate) === todayBR();

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TAB_META: { id: RhSubTab; subtabKey: string; label: string; icon: typeof Users }[] = [
    { id: 'prontuario', subtabKey: 'prontuario', label: 'Prontuário', icon: Users },
    { id: 'escalas', subtabKey: 'escalas', label: 'Escalas', icon: CalendarDays },
    { id: 'tarefas', subtabKey: 'tarefas', label: 'Tarefas', icon: CalendarIcon2 },
    { id: 'onboarding', subtabKey: 'onboarding', label: 'Onboarding', icon: GraduationCap },
    { id: 'treinamento', subtabKey: 'treinamento', label: 'Treinamento', icon: BookOpen },
    { id: 'ferias', subtabKey: 'ferias', label: 'Férias', icon: Palmtree },
    { id: 'documentos', subtabKey: 'documentos', label: 'Documentos', icon: FileText },
    { id: 'folha', subtabKey: 'folha', label: 'Folha', icon: DollarSign },
    { id: 'beneficios', subtabKey: 'beneficios', label: 'Benefícios', icon: Heart },
    { id: 'dashboard', subtabKey: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'custos', subtabKey: 'custos', label: 'Custos', icon: Wallet },
    { id: 'sst', subtabKey: 'sst', label: 'SST', icon: HardHat },
    { id: 'disciplinar', subtabKey: 'disciplinar', label: 'Disciplinar', icon: ShieldAlert },
    { id: 'comunicados', subtabKey: 'mural', label: 'Mural', icon: Megaphone },
    { id: 'ponto', subtabKey: 'ponto', label: 'Ponto', icon: Clock },
    { id: 'banco-horas', subtabKey: 'banco-horas', label: 'Banco de Horas', icon: Timer },
  ];
  const availableTabs = TAB_META.filter(t => visibleSubtabs.includes(t.subtabKey));
  const availableItems = availableTabs.map(t => ({ id: t.id, label: t.label, icon: t.icon }));
  const effectiveSubTab: RhSubTab = availableItems.some(i => i.id === subTab) ? subTab : (availableItems[0]?.id ?? 'prontuario');

  const renderColabForm = (form: typeof formColab, setForm: typeof setFormColab, isEdit: boolean) => (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
        <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Telefone</Label><Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></div>
        <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} /></div>
        <div><Label>Função</Label><Input value={form.funcao} onChange={e => setForm(p => ({ ...p, funcao: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Setor</Label>
          <Select value={form.setor} onValueChange={v => setForm(p => ({ ...p, setor: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SETORES.map(s => <SelectItem key={s} value={s}>{SETOR_LABELS[s] || s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contrato</Label>
          <Select value={form.tipo_contrato} onValueChange={v => setForm(p => ({ ...p, tipo_contrato: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONTRATOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Carga Horária Semanal</Label>
          <DecimalInput className="h-9" value={form.carga_horaria_semanal} onValueChange={(raw) => setForm(p => ({ ...p, carga_horaria_semanal: raw }))} maxDecimals={0} suffix="h" />
        </div>
        <div>
          <Label>Salário (R$)</Label>
          <CurrencyInput className="h-9" value={form.salario} onValueChange={(raw) => setForm(p => ({ ...p, salario: raw }))} showPrefix maxDecimals={2} />
        </div>
        <div>
          <Label>Valor/Hora (R$)</Label>
          <CurrencyInput className="h-9" value={form.valor_hora} onValueChange={(raw) => setForm(p => ({ ...p, valor_hora: raw }))} showPrefix maxDecimals={2} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Data Admissão</Label>
          <Input type="date" value={form.data_admissao} onChange={e => setForm(p => ({ ...p, data_admissao: e.target.value }))} />
        </div>
        <div>
          <Label>Vincular Usuário (opcional)</Label>
          <Select value={form.user_id} onValueChange={v => setForm(p => ({ ...p, user_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Nenhum</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <><div className="space-y-4">
      <SubmoduleSwitcher items={availableItems} value={effectiveSubTab} onChange={id => setSubTab(id as RhSubTab)} />

        {/* ── PRONTUÁRIO ── */}
        {effectiveSubTab === 'prontuario' && <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{colaboradores.length} colaboradores</span>
              <div className="flex items-center gap-1.5 text-xs">
                <Switch checked={showInativos} onCheckedChange={setShowInativos} />
                <span>Mostrar inativos</span>
              </div>
            </div>
            {(canCreateProntuario || canManageProntuario) && (
              <Dialog open={showNewColab} onOpenChange={setShowNewColab}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5 h-8"><UserPlus className="w-3.5 h-3.5" /> Novo Colaborador</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Novo Colaborador</DialogTitle></DialogHeader>
                  {renderColabForm(formColab, setFormColab, false)}
                  <Button onClick={handleCreateColab} disabled={savingColab} className="w-full mt-2">
                    {savingColab ? 'Salvando...' : 'Criar Colaborador'}
                  </Button>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Cargo</TableHead>
                      <TableHead className="text-xs">Setor</TableHead>
                      <TableHead className="text-xs">Contrato</TableHead>
                      <TableHead className="text-xs text-right">Salário</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colaboradores.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-medium">{c.nome}</TableCell>
                        <TableCell className="text-xs">{c.cargo}</TableCell>
                        <TableCell className="text-xs">{SETOR_LABELS[c.setor] || c.setor}</TableCell>
                        <TableCell className="text-xs">{c.tipo_contrato}</TableCell>
                        <TableCell className="text-xs text-right">{fmtBRL(c.salario)}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">
                            {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(canEditProntuario || canManageProntuario) && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEdit(c)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            )}
                            {canManageProntuario && c.status === 'ativo' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDesativar(c.id)}>
                                <UserX className="w-3 h-3" />
                              </Button>
                            )}
                            {canManageProntuario && c.status === 'inativo' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => handleReativar(c.id)}>
                                <CheckCircle2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {colabHasMore && (
                <div className="p-2 text-center">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { const next = colabPage + 1; setColabPage(next); fetchColaboradores(next, true); }}>
                    Carregar mais...
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit dialog */}
          <Dialog open={showEditColab} onOpenChange={o => { setShowEditColab(o); if (!o) setEditingColab(null); }}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Editar Colaborador</DialogTitle></DialogHeader>
              {renderColabForm(editForm, setEditForm, true)}
              <Button onClick={handleUpdateColab} disabled={savingEditColab} className="w-full mt-2">
                {savingEditColab ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogContent>
          </Dialog>
        </div>}

        {/* ── PONTO ── */}
        {effectiveSubTab === 'ponto' && <div className="space-y-4 mt-4">
          {/* My quick punch */}
          {myColaboradorId && isToday && canPonto && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-3">
                <p className="text-xs font-medium mb-2">Registrar Ponto</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1 h-8" onClick={() => handleRegistrarPonto('ENTRADA')} disabled={savingPonto}>
                    <Play className="w-3 h-3" /> Entrada
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleRegistrarPonto('INICIO_INTERVALO')} disabled={savingPonto}>
                    <Coffee className="w-3 h-3" /> Intervalo
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => handleRegistrarPonto('FIM_INTERVALO')} disabled={savingPonto}>
                    <Coffee className="w-3 h-3" /> Fim Intervalo
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1 h-8" onClick={() => handleRegistrarPonto('SAIDA')} disabled={savingPonto}>
                    <Square className="w-3 h-3" /> Saída
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Date filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Data:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {formatDateBR(pontoDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={pontoDate} onSelect={d => d && setPontoDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Ponto table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Registros — {formatDateBR(pontoDate)}</CardTitle>
            </CardHeader>
            <CardContent>
              {pontos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro nesta data.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Colaborador</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Hora</TableHead>
                      <TableHead className="text-xs">Método</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pontos.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{getColabNome(p.colaborador_id)}</TableCell>
                        <TableCell className="text-xs">{p.tipo.replace('_', ' ')}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(p.hora), 'HH:mm')}</TableCell>
                        <TableCell className="text-xs">{p.metodo}</TableCell>
                        <TableCell>
                          <Badge variant={p.aprovado ? 'default' : 'outline'} className="text-[10px]">
                            {p.aprovado ? 'Aprovado' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {canManagePonto && !p.aprovado && (
                              <>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditPonto(p)} title="Editar">
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-success" onClick={() => handleAprovarPonto(p.id)} disabled={!!approvingPonto} title="Aprovar">
                                  <CheckCircle2 className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRejeitarPonto(p.id)} disabled={!!rejectingPonto} title="Rejeitar">
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Edit ponto modal */}
          <Dialog open={!!editingPonto} onOpenChange={o => { if (!o) setEditingPonto(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Editar Ponto</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={editPontoHora} onChange={e => setEditPontoHora(e.target.value)} />
                </div>
                <div>
                  <Label>Justificativa</Label>
                  <Textarea value={editPontoJustificativa} onChange={e => setEditPontoJustificativa(e.target.value)} rows={2} />
                </div>
                <Button onClick={handleSaveEditPonto} disabled={savingEditPonto}>
                  {savingEditPonto ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>}

        {/* ── BANCO DE HORAS ── */}
        {effectiveSubTab === 'banco-horas' && <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Período:</Label>
              <Input type="month" value={bhPeriodo} onChange={e => setBhPeriodo(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            {canReconcileBH && (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleCalcularBancoHoras} disabled={calculandoBH}>
                <Calculator className="w-3.5 h-3.5" />
                {calculandoBH ? 'Calculando...' : 'Calcular Banco de Horas'}
              </Button>
            )}
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Banco de Horas — {bhPeriodo}</CardTitle>
            </CardHeader>
            <CardContent>
              {bancoHoras.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado. Calcule o banco de horas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Colaborador</TableHead>
                        <TableHead className="text-xs text-right">Trabalhadas</TableHead>
                        <TableHead className="text-xs text-right">Escaladas</TableHead>
                        <TableHead className="text-xs text-right">Extras</TableHead>
                        <TableHead className="text-xs text-right">Saldo</TableHead>
                        <TableHead className="text-xs text-right">Faltas</TableHead>
                        <TableHead className="text-xs text-right">Dias</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bancoHoras.map(bh => (
                        <TableRow key={bh.id}>
                          <TableCell className="text-xs font-medium">{getColabNome(bh.colaborador_id)}</TableCell>
                          <TableCell className="text-xs text-right">{bh.horas_trabalhadas}h</TableCell>
                          <TableCell className="text-xs text-right">{bh.horas_escaladas}h</TableCell>
                          <TableCell className="text-xs text-right text-success">{bh.horas_extras}h</TableCell>
                          <TableCell className={cn("text-xs text-right font-medium", bh.banco_horas_saldo >= 0 ? "text-success" : "text-destructive")}>
                            {bh.banco_horas_saldo > 0 ? '+' : ''}{bh.banco_horas_saldo}h
                          </TableCell>
                          <TableCell className="text-xs text-right">{bh.faltas}</TableCell>
                          <TableCell className="text-xs text-right">{bh.dias_trabalhados}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {bhHasMore && (
                <div className="p-2 text-center">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { const next = bhPage + 1; setBhPage(next); fetchBancoHoras(next, true); }}>
                    Carregar mais...
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>}

        {/* ── SUB-COMPONENTS ── */}
        {effectiveSubTab === 'escalas' && <EscalasSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'tarefas' && <TarefasSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'onboarding' && <OnboardingSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'treinamento' && <TreinamentoSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'ferias' && <FeriasAfastamentosSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'documentos' && <DocumentosComplianceSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'folha' && <FolhaPagamentoSection colaboradores={colaboradores} canManage={canManageFolha} />}
        {effectiveSubTab === 'beneficios' && <BeneficiosSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'dashboard' && <DashboardRhSection colaboradores={colaboradores} />}
        {effectiveSubTab === 'custos' && <ControleCustosRhSection colaboradores={colaboradores} />}
        {effectiveSubTab === 'sst' && <SSTSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'disciplinar' && <GestaoDisciplinarSection colaboradores={colaboradores} canManage={canManage} />}
        {effectiveSubTab === 'comunicados' && <ComunicacaoInternaSection canManage={canManage} />}
    </div>
      <ConfirmDialog />
    </>
  );
}
