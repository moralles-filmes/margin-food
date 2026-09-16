import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Plus, GraduationCap, Star, ChevronRight } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

import { useCan } from '@/permissions/hooks';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  data_admissao: string;
}

interface ChecklistItem {
  texto: string;
  feito: boolean;
  data_conclusao?: string;
}

interface Avaliacao {
  nota: number;
  comentario: string;
  avaliador: string;
  data: string;
}

interface Onboarding {
  id: string;
  colaborador_id: string;
  titulo: string;
  status: string;
  fase_atual: string;
  checklist_admissao: ChecklistItem[];
  checklist_30dias: ChecklistItem[];
  checklist_60dias: ChecklistItem[];
  checklist_90dias: ChecklistItem[];
  avaliacao_30: Avaliacao | null;
  avaliacao_60: Avaliacao | null;
  avaliacao_90: Avaliacao | null;
  mentor_id: string | null;
  observacoes: string;
  concluido_em: string | null;
  created_at: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const DEFAULT_ADMISSAO: ChecklistItem[] = [
  { texto: 'Documentação pessoal entregue', feito: false },
  { texto: 'Exame admissional realizado', feito: false },
  { texto: 'Uniforme entregue', feito: false },
  { texto: 'Crachá / acesso concedido', feito: false },
  { texto: 'Treinamento de segurança alimentar', feito: false },
  { texto: 'Apresentação à equipe', feito: false },
];

const DEFAULT_30: ChecklistItem[] = [
  { texto: 'Domina as tarefas básicas do setor', feito: false },
  { texto: 'Conhece os procedimentos de higiene', feito: false },
  { texto: 'Pontualidade e assiduidade adequadas', feito: false },
  { texto: 'Feedback do mentor registrado', feito: false },
];

const DEFAULT_60: ChecklistItem[] = [
  { texto: 'Opera com autonomia nas tarefas do setor', feito: false },
  { texto: 'Relacionamento com a equipe avaliado', feito: false },
  { texto: 'Conhece cardápio/produtos relevantes', feito: false },
  { texto: 'Avaliação de desempenho parcial', feito: false },
];

const DEFAULT_90: ChecklistItem[] = [
  { texto: 'Desempenho geral satisfatório', feito: false },
  { texto: 'Pode treinar novos colegas', feito: false },
  { texto: 'Decisão de efetivação documentada', feito: false },
  { texto: 'Avaliação final do período de experiência', feito: false },
];

const FASE_LABELS: Record<string, string> = {
  '30dias': '30 Dias', '60dias': '60 Dias', '90dias': '90 Dias'
};

export default function OnboardingSection({
 colaboradores, canManage }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('rh:onboarding:view');
  const { user } = useAuth();
  const [onboardings, setOnboardings] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAvaliacao, setShowAvaliacao] = useState<{ onboardingId: string; fase: string } | null>(null);
  const [avalNota, setAvalNota] = useState(3);
  const [avalComentario, setAvalComentario] = useState('');

  const [formColabId, setFormColabId] = useState('');
  const [formMentorId, setFormMentorId] = useState('');

  const fetchOnboardings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rh_onboarding')
      .select('id, colaborador_id, titulo, status, fase_atual, checklist_admissao, checklist_30dias, checklist_60dias, checklist_90dias, avaliacao_30, avaliacao_60, avaliacao_90, mentor_id, observacoes, concluido_em, created_at')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); setLoading(false); return; }
    const parsed: Onboarding[] = (data || []).map((o) => ({
      ...o,
      checklist_admissao: Array.isArray(o.checklist_admissao) ? o.checklist_admissao as unknown as ChecklistItem[] : [],
      checklist_30dias: Array.isArray(o.checklist_30dias) ? o.checklist_30dias as unknown as ChecklistItem[] : [],
      checklist_60dias: Array.isArray(o.checklist_60dias) ? o.checklist_60dias as unknown as ChecklistItem[] : [],
      checklist_90dias: Array.isArray(o.checklist_90dias) ? o.checklist_90dias as unknown as ChecklistItem[] : [],
      avaliacao_30: o.avaliacao_30 as unknown as Avaliacao | null,
      avaliacao_60: o.avaliacao_60 as unknown as Avaliacao | null,
      avaliacao_90: o.avaliacao_90 as unknown as Avaliacao | null,
    }));
    setOnboardings(parsed);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchOnboardings(); }, [fetchOnboardings]);

  const handleCreate = async () => {
    if (!formColabId) { toast.error('Selecione o colaborador'); return; }
    const { error } = await supabase.from('rh_onboarding').insert(withCompanyId(companyId, [{
      colaborador_id: formColabId,
      mentor_id: formMentorId || null,
      criado_por: user?.id ?? null,
      checklist_admissao: JSON.parse(JSON.stringify(DEFAULT_ADMISSAO)),
      checklist_30dias: JSON.parse(JSON.stringify(DEFAULT_30)),
      checklist_60dias: JSON.parse(JSON.stringify(DEFAULT_60)),
      checklist_90dias: JSON.parse(JSON.stringify(DEFAULT_90)),
    }]));
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Onboarding criado!');
    setShowNew(false);
    setFormColabId('');
    setFormMentorId('');
    fetchOnboardings();
  };

  const handleToggleCheck = async (onbId: string, field: string, idx: number) => {
    const onb = onboardings.find(o => o.id === onbId);
    if (!onb) return;
    const list = [...(onb[field as keyof Pick<Onboarding, 'checklist_admissao' | 'checklist_30dias' | 'checklist_60dias' | 'checklist_90dias'>] as ChecklistItem[])];
    list[idx] = {
      ...list[idx],
      feito: !list[idx].feito,
      data_conclusao: !list[idx].feito ? new Date().toISOString() : undefined,
    };
    // @enterprise-exception: dynamic field name requires JSON cast for Supabase update
    const { error } = await supabase.from('rh_onboarding').update({
      [field]: list,
    } as unknown as import('@/integrations/supabase/types').Database['public']['Tables']['rh_onboarding']['Update']).eq('id', onbId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    fetchOnboardings();
  };

  const handleAvaliacao = async () => {
    if (!showAvaliacao) return;
    const field = `avaliacao_${showAvaliacao.fase.replace('dias', '')}`;
    const avaliacao: Avaliacao = {
      nota: avalNota,
      comentario: avalComentario,
      avaliador: user?.id || '',
      data: new Date().toISOString(),
    };

    // Determine next fase
    const faseMap: Record<string, string> = { '30dias': '60dias', '60dias': '90dias' };
    const nextFase = faseMap[showAvaliacao.fase];

    // @enterprise-exception: dynamic field name requires Record for Supabase update
    const updates: Record<string, unknown> = {
      [field]: avaliacao as unknown as import('@/integrations/supabase/types').Json,
    };
    if (nextFase) {
      updates.fase_atual = nextFase;
    } else {
      updates.status = 'CONCLUIDO';
      updates.concluido_em = new Date().toISOString();
    }

    const { error } = await supabase.from('rh_onboarding')
      .update(updates as import('@/integrations/supabase/types').Database['public']['Tables']['rh_onboarding']['Update'])
      .eq('id', showAvaliacao.onboardingId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Avaliação registrada!');
    setShowAvaliacao(null);
    setAvalNota(3);
    setAvalComentario('');
    fetchOnboardings();
  };

  const getColabNome = (id: string | null) => {
    if (!id) return '—';
    return colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';
  };

  const getProgress = (onb: Onboarding) => {
    const all = [
      ...onb.checklist_admissao,
      ...onb.checklist_30dias,
      ...onb.checklist_60dias,
      ...onb.checklist_90dias,
    ];
    if (all.length === 0) return 0;
    return Math.round((all.filter(c => c.feito).length / all.length) * 100);
  };

  const selected = selectedId ? onboardings.find(o => o.id === selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Detail view
  if (selected) {
    const colab = colaboradores.find(c => c.id === selected.colaborador_id);
    const diasAdmissao = colab ? differenceInDays(new Date(), parseISO(colab.data_admissao)) : 0;
    const progress = getProgress(selected);

    const renderChecklist = (title: string, field: string, items: ChecklistItem[], avaliacao: Avaliacao | null, fase: string) => (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{title}</CardTitle>
            <span className="text-xs text-muted-foreground">{items.filter(i => i.feito).length}/{items.length}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={item.feito}
                onCheckedChange={() => handleToggleCheck(selected.id, field, idx)}
                className="w-3.5 h-3.5"
              />
              <span className={item.feito ? 'line-through text-muted-foreground' : ''}>{item.texto}</span>
            </div>
          ))}
          {avaliacao ? (
            <div className="mt-2 p-2 rounded bg-background-subtle text-xs space-y-1">
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-warning" />
                <span className="font-medium">Nota: {avaliacao.nota}/5</span>
              </div>
              {avaliacao.comentario && <p className="text-muted-foreground">{avaliacao.comentario}</p>}
              <p className="text-muted-foreground">Avaliado em {format(parseISO(avaliacao.data), 'dd/MM/yyyy')}</p>
            </div>
          ) : (
            canManage && fase !== 'admissao' && (
              <Button size="sm" variant="outline" className="h-7 text-xs mt-2 gap-1"
                onClick={() => { setShowAvaliacao({ onboardingId: selected.id, fase }); setAvalNota(3); setAvalComentario(''); }}>
                <Star className="w-3 h-3" /> Avaliar {FASE_LABELS[fase] || fase}
              </Button>
            )
          )}
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setSelectedId(null)}>
          ← Voltar
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{getColabNome(selected.colaborador_id)}</h2>
            <p className="text-xs text-muted-foreground">
              {diasAdmissao} dias desde admissão · Mentor: {getColabNome(selected.mentor_id)} · Fase: {FASE_LABELS[selected.fase_atual] || selected.fase_atual}
            </p>
          </div>
          <Badge variant={selected.status === 'CONCLUIDO' ? 'default' : 'outline'}>
            {selected.status === 'CONCLUIDO' ? 'Concluído' : selected.status === 'CANCELADO' ? 'Cancelado' : 'Em Andamento'}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">{progress}% completo</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {renderChecklist('📋 Admissão', 'checklist_admissao', selected.checklist_admissao, null, 'admissao')}
          {renderChecklist('📅 30 Dias', 'checklist_30dias', selected.checklist_30dias, selected.avaliacao_30, '30dias')}
          {renderChecklist('📅 60 Dias', 'checklist_60dias', selected.checklist_60dias, selected.avaliacao_60, '60dias')}
          {renderChecklist('📅 90 Dias', 'checklist_90dias', selected.checklist_90dias, selected.avaliacao_90, '90dias')}
        </div>

        {/* Avaliação Dialog */}
        <Dialog open={!!showAvaliacao} onOpenChange={(open) => !open && setShowAvaliacao(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Avaliação — {showAvaliacao ? FASE_LABELS[showAvaliacao.fase] : ''}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Nota (1 a 5)</Label>
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Button key={n} size="sm" variant={avalNota >= n ? 'default' : 'outline'}
                      className="w-8 h-8 p-0" onClick={() => setAvalNota(n)}>
                      <Star className={`w-4 h-4 ${avalNota >= n ? 'fill-current' : ''}`} />
                    </Button>
                  ))}
                </div>
              </div>
              <div><Label>Comentário</Label><Textarea value={avalComentario} onChange={e => setAvalComentario(e.target.value)} rows={3} /></div>
              <Button onClick={handleAvaliacao}>Registrar Avaliação</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{onboardings.length} processos de onboarding</p>
        {canManage && (
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Novo Onboarding</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Iniciar Onboarding</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador *</Label>
                  <SearchableSelect
                    value={formColabId}
                    onValueChange={setFormColabId}
                    options={colaboradores.map(c => ({ value: c.id, label: c.nome }))}
                    placeholder="Selecione..."
                    searchPlaceholder="Buscar colaborador..."
                    modal
                    allowClear={false}
                  />
                </div>
                <div>
                  <Label>Mentor (opcional)</Label>
                  <SearchableSelect
                    value={formMentorId}
                    onValueChange={setFormMentorId}
                    options={colaboradores.map(c => ({ value: c.id, label: c.nome }))}
                    placeholder="Selecione..."
                    searchPlaceholder="Buscar mentor..."
                    modal
                  />
                </div>
                <Button onClick={handleCreate}>Criar Onboarding</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {onboardings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhum onboarding em andamento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {onboardings.map(o => {
            const progress = getProgress(o);
            const colab = colaboradores.find(c => c.id === o.colaborador_id);
            const diasAdmissao = colab ? differenceInDays(new Date(), parseISO(colab.data_admissao)) : 0;

            return (
              <Card key={o.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedId(o.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{getColabNome(o.colaborador_id)}</CardTitle>
                    <Badge variant={o.status === 'CONCLUIDO' ? 'default' : 'outline'} className="text-[10px]">
                      {o.status === 'CONCLUIDO' ? 'Concluído' : 'Em Andamento'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">{diasAdmissao} dias · Fase: {FASE_LABELS[o.fase_atual]}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={progress} className="h-1.5" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{progress}% completo</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  {o.mentor_id && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Mentor</span>
                      <span>{getColabNome(o.mentor_id)}</span>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {o.avaliacao_30 && <Star className="w-3 h-3 text-warning fill-warning" />}
                    {o.avaliacao_60 && <Star className="w-3 h-3 text-warning fill-warning" />}
                    {o.avaliacao_90 && <Star className="w-3 h-3 text-warning fill-warning" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
