import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { chavePonto, sementeDaBatida, type BatidaPonto } from '@/domain/rh/idempotencia';
import { mensagemErroEdicaoColaborador } from '@/domain/rh/prontuario';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { useAuth } from '@/contexts/AuthContext';
import { useCan, useModuleAccess } from '@/permissions/hooks';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL, formatDateBR, formatInBR, normalizeBRLMoneyToNumber, todayBR } from '@/lib/formatters';
import { formatDateISO } from '@/lib/datetime';

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))',
];

function fmt(v: number) {
  return fmtBRL(v);
}

import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/DatePicker';
import { DateInput } from '@/components/ui/DateInput';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Clock, Timer, Users, Play, Square, Coffee, CheckCircle2, Calendar as CalendarIcon2, Edit2, CalendarDays, GraduationCap, Palmtree, FileText, XCircle, UserX, Calculator } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
import { sortByName } from '@/lib/sortByName';
import { padronizarTexto } from '@/lib/padronizarTexto';

const PAGE_SIZE = 50;
const COLAB_BATCH_SIZE = 1000;

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
  // Nulos quando a pessoa não tem acesso à remuneração (rh_listar_colaboradores).
  salario: number | null;
  valor_hora: number | null;
  created_at: string;
  remuneracao_visivel?: boolean;
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
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
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
  const { enviando: savingPonto, executar: executarPonto } = useTravaEnvio();
  // Semente da batida em andamento: o retry da mesma batida reaproveita a chave
  // (o servidor devolve o registro já gravado); some depois do sucesso.
  const batidaRef = useRef<BatidaPonto | null>(null);
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
  }, [supabase]);

  // Carrega TODOS os colaboradores (em lotes): as subseções (Escalas, Folha, Férias,
  // Benefícios…) recebem esta lista para seletores e para resolver nomes — uma lista
  // truncada fazia colaboradores sumirem dos selects e aparecerem como "Desconhecido".
  // Vem pela RPC, não pela tabela: a RLS de rh_colaboradores só libera o Prontuário, e a
  // RPC entrega a lista às demais sub-abas sem CPF/contato e, fora de Folha/Custos/
  // Dashboard, sem remuneração.
  const fetchColaboradores = useCallback(async () => {
    const all: Colaborador[] = [];
    for (let from = 0; ; from += COLAB_BATCH_SIZE) {
      const { data, error } = await (supabase.rpc as any)('rh_listar_colaboradores', { p_incluir_inativos: showInativos })
        .order('nome').order('id')
        .range(from, from + COLAB_BATCH_SIZE - 1);
      if (error) { console.error(error); return; }
      all.push(...((data || []) as Colaborador[]));
      if (!data || data.length < COLAB_BATCH_SIZE) break;
    }
    setColaboradores(sortByName(all, c => c.nome));
    if (user) {
      const mine = all.find(c => c.user_id === user.id);
      setMyColaboradorId(mine?.id || null);
    }
  }, [supabase, showInativos, user]);

  const fetchPontos = useCallback(async () => {
    // Coluna `data` é date no Postgres: exige yyyy-MM-dd (datetime), não dd/MM/yyyy (formatters)
    const dateStr = formatDateISO(pontoDate);
    const { data, error } = await supabase.from('rh_ponto_registros').select('id, colaborador_id, data, tipo, hora, metodo, justificativa, aprovado, aprovado_por, status, created_at')
      .eq('data', dateStr)
      .neq('status', 'REJEITADO')
      .order('hora', { ascending: true }).range(0, PAGE_SIZE - 1);
    if (error) { console.error(error); return; }
    setPontos(data || []);
  }, [pontoDate, supabase]);

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
  }, [bhPeriodo, supabase]);

  // Reset pagination on filter change
  useEffect(() => {
    setColaboradores([]);
  }, [showInativos]);

  useEffect(() => {
    setBhPage(0);
    setBancoHoras([]);
  }, [bhPeriodo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchColaboradores(), fetchPontos(), fetchBancoHoras(0), fetchProfiles()]).finally(() => setLoading(false));
  }, [fetchColaboradores, fetchPontos, fetchBancoHoras, fetchProfiles]);

  const handleCreateColab = async () => {
    if (savingColab) return;
    if (!formColab.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingColab(true);
    try {
      const payload: any = {
        nome: padronizarTexto(formColab.nome), email: formColab.email, telefone: formColab.telefone,
        cpf: formColab.cpf, cargo: padronizarTexto(formColab.cargo), funcao: padronizarTexto(formColab.funcao),
        setor: formColab.setor, tipo_contrato: formColab.tipo_contrato,
        carga_horaria_semanal: parseDecimal(formColab.carga_horaria_semanal) ?? 44,
        salario: normalizeBRLMoneyToNumber(formColab.salario) ?? 0,
        valor_hora: normalizeBRLMoneyToNumber(formColab.valor_hora) ?? 0,
        data_admissao: formColab.data_admissao,
        created_by: user?.id,
      };
      if (formColab.user_id) payload.user_id = formColab.user_id;
      const { error } = await supabase.from('rh_colaboradores').insert(withCompanyId(companyId, payload));
      if (error) { toast.error('Erro ao criar colaborador: ' + error.message); return; }
      toast.success('Colaborador criado com sucesso!');
      setShowNewColab(false);
      setFormColab({ nome: '', email: '', telefone: '', cpf: '', cargo: 'Colaborador', funcao: 'Geral', setor: 'salao', tipo_contrato: 'CLT', carga_horaria_semanal: '44', salario: '0', valor_hora: '0', user_id: '', data_admissao: todayBR() });
      fetchColaboradores();
    } finally {
      setSavingColab(false);
    }
  };

  const handleOpenEdit = (c: Colaborador) => {
    // O formulário reenvia CPF e remuneração: abrir com valor mascarado gravaria zero por cima.
    if (c.remuneracao_visivel === false) {
      toast.error('Sem acesso aos dados completos deste colaborador para editar.');
      return;
    }
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
      // Pela RPC, não pela tabela: a RLS de UPDATE só aceita :manage e devolvia 0 linhas
      // sem erro para quem tem :edit — a tela confirmava sem ter gravado nada.
      // Remuneração e usuário vinculado são de :manage (o servidor recusa a mudança):
      // sem ela, volta o valor que veio do banco, sem passar pelo campo de texto.
      const { error } = await (supabase.rpc as any)('rh_atualizar_colaborador', {
        p_id: editingColab.id,
        p_nome: padronizarTexto(editForm.nome), p_email: editForm.email, p_telefone: editForm.telefone,
        p_cpf: editForm.cpf || null, p_cargo: padronizarTexto(editForm.cargo), p_funcao: padronizarTexto(editForm.funcao),
        p_setor: editForm.setor, p_tipo_contrato: editForm.tipo_contrato,
        p_carga_horaria_semanal: parseDecimal(editForm.carga_horaria_semanal) ?? 44,
        p_salario: canManageProntuario ? (normalizeBRLMoneyToNumber(editForm.salario) ?? 0) : editingColab.salario,
        p_valor_hora: canManageProntuario ? (normalizeBRLMoneyToNumber(editForm.valor_hora) ?? 0) : editingColab.valor_hora,
        p_data_admissao: editForm.data_admissao,
        p_user_id: canManageProntuario ? (editForm.user_id || null) : (editingColab.user_id ?? null),
      });
      if (error) { console.error(error); toast.error(mensagemErroEdicaoColaborador(error.message)); return; }
      toast.success('Colaborador atualizado!');
      setShowEditColab(false);
      setEditingColab(null);
      fetchColaboradores();
    } finally {
      setSavingEditColab(false);
    }
  };

  const handleDesativar = async (id: string) => {
    const ok = await confirm({ title: 'Desativar colaborador', description: 'Tem certeza que deseja desativar este colaborador? O histórico será mantido.', confirmLabel: 'Desativar', variant: 'destructive' });
    if (!ok) return;
    // A RLS descarta o UPDATE sem erro para quem não pode: confere a linha devolvida.
    const { data, error } = await supabase.from('rh_colaboradores').update({ status: 'inativo' }).eq('id', id).select('id');
    if (error) { console.error(error); toast.error('Erro: ' + error.message); return; }
    if (!data?.length) { toast.error('Você não tem permissão para desativar colaboradores.'); return; }
    toast.success('Colaborador desativado.');
    fetchColaboradores();
  };

  const handleReativar = async (id: string) => {
    const { data, error } = await supabase.from('rh_colaboradores').update({ status: 'ativo' }).eq('id', id).select('id');
    if (error) { console.error(error); toast.error('Erro: ' + error.message); return; }
    if (!data?.length) { toast.error('Você não tem permissão para reativar colaboradores.'); return; }
    toast.success('Colaborador reativado.');
    fetchColaboradores();
  };

  const handleRegistrarPonto = (tipo: string) => executarPonto(async () => {
    if (!myColaboradorId) {
      toast.error('Seu cadastro de colaborador não foi encontrado. Solicite ao gestor.');
      return;
    }
    const batida = sementeDaBatida(batidaRef.current, tipo);
    batidaRef.current = batida;
    const { data, error } = await supabase.rpc('rh_registrar_ponto', {
      p_colaborador_id: myColaboradorId,
      p_tipo: tipo,
      p_client_request_id: await chavePonto(batida.semente, { colaboradorId: myColaboradorId, tipo, data: todayBR() }),
    });
    if (error) {
      console.error('Erro ao registrar ponto:', error);
      toast.error('Erro ao registrar ponto: ' + error.message);
      return;
    }
    batidaRef.current = null;
    const rotulo = tipo.replace('_', ' ');
    toast.success((data as { idempotente?: boolean } | null)?.idempotente
      ? `${rotulo} já estava registrado.`
      : `${rotulo} registrado!`);
    fetchPontos();
  });

  const handleAprovarPonto = async (pontoId: string) => {
    if (approvingPonto) return;
    const ponto = pontos.find(p => p.id === pontoId);
    if (ponto?.aprovado) { toast.error('Este ponto já foi aprovado.'); return; }
    setApprovingPonto(pontoId);
    try {
      const { error } = await supabase.from('rh_ponto_registros').update({
        aprovado: true, aprovado_por: user?.id, status: 'APROVADO',
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
  const isToday = formatDateISO(pontoDate) === todayBR();

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
          <CurrencyInput className="h-9" value={form.salario} onValueChange={(raw) => setForm(p => ({ ...p, salario: raw }))} showPrefix maxDecimals={2} disabled={isEdit && !canManageProntuario} />
        </div>
        <div>
          <Label>Valor/Hora (R$)</Label>
          <CurrencyInput className="h-9" value={form.valor_hora} onValueChange={(raw) => setForm(p => ({ ...p, valor_hora: raw }))} showPrefix maxDecimals={2} disabled={isEdit && !canManageProntuario} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Data Admissão</Label>
          <DateInput value={form.data_admissao} onValueChange={v => setForm(p => ({ ...p, data_admissao: v }))} />
        </div>
        <div>
          <Label>Vincular Usuário (opcional)</Label>
          <Select value={form.user_id} onValueChange={v => setForm(p => ({ ...p, user_id: v }))} disabled={isEdit && !canManageProntuario}>
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Nenhum</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isEdit && !canManageProntuario && (
        <p className="text-xs text-muted-foreground">Salário, valor/hora e usuário vinculado só podem ser alterados por quem gerencia o Prontuário.</p>
      )}
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
                          {/* Ativar/Desativar alterna ícone+ação conforme status — não é um par edit/delete,
                              mantido manual (TableActions não cobre toggle de estado 1:1). */}
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
            <Card className="bg-primary-soft border-primary-border">
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
            <DatePicker
              date={pontoDate}
              onDateChange={d => d && setPontoDate(d)}
              className="h-8 w-auto text-xs gap-1"
            />
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
                          {/* Editar/Aprovar/Rejeitar é um fluxo de 3 ações, não o par edit/delete de
                              TableActions — mantido manual. */}
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
                      {sortByName(bancoHoras, bh => getColabNome(bh.colaborador_id)).map(bh => (
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
