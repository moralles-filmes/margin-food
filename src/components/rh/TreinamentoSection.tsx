import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Award, ChevronRight, Users, GraduationCap, FileText, Video, HelpCircle, BookOpen, CheckCircle2 } from 'lucide-react';
import KpiCard from '@/components/ui/KpiCard';

import { useCan } from '@/permissions/hooks';
import { sortByName } from '@/lib/sortByName';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
}

interface QuizPergunta {
  pergunta: string;
  opcoes: string[];
  resposta_correta: number;
}

interface Modulo {
  titulo: string;
  descricao: string;
  tipo: 'leitura' | 'video' | 'quiz';
  conteudo: string;
  quiz_perguntas?: QuizPergunta[];
}

interface Trilha {
  id: string;
  titulo: string;
  descricao: string;
  setor: string;
  obrigatoria: boolean;
  modulos: Modulo[];
  carga_horaria_min: number;
  ativo: boolean;
  created_at: string;
}

interface ModuloConcluido {
  modulo_idx: number;
  concluido_em: string;
  quiz_nota?: number;
}

interface Progresso {
  id: string;
  trilha_id: string;
  colaborador_id: string;
  modulos_concluidos: ModuloConcluido[];
  status: string;
  certificado_emitido: boolean;
  nota_final: number;
  concluido_em: string | null;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const SETORES = ['geral', 'cozinha', 'sushi', 'limpeza', 'salao', 'copa'];
const SETOR_LABELS: Record<string, string> = {
  geral: 'Geral', cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};
const TIPO_ICONS = { leitura: FileText, video: Video, quiz: HelpCircle };

export default function TreinamentoSection({
 colaboradores, canManage }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('rh:treinamento:view');
  const { user } = useAuth();
  const [trilhas, setTrilhas] = useState<Trilha[]>([]);
  const [progressos, setProgressos] = useState<Progresso[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedTrilha, setSelectedTrilha] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [assignColabId, setAssignColabId] = useState('');

  // New trilha form
  const [form, setForm] = useState({
    titulo: '', descricao: '', setor: 'geral', obrigatoria: false, carga_horaria_min: 30,
  });
  const [formModulos, setFormModulos] = useState<Modulo[]>([]);
  const [newModulo, setNewModulo] = useState<Modulo>({
    titulo: '', descricao: '', tipo: 'leitura', conteudo: '',
  });

  // Quiz state
  const [quizActive, setQuizActive] = useState<{ trilhaId: string; moduloIdx: number } | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: tData }, { data: pData }] = await Promise.all([
        supabase.from('rh_trilhas_treinamento').select('id, titulo, descricao, setor, obrigatoria, modulos, carga_horaria_min, ativo, created_at').order('created_at', { ascending: false }),
        supabase.from('rh_progresso_treinamento').select('id, trilha_id, colaborador_id, modulos_concluidos, status, certificado_emitido, nota_final, concluido_em'),
      ]);
      setTrilhas((tData || []).map((t) => ({ ...t, modulos: Array.isArray(t.modulos) ? t.modulos as unknown as Modulo[] : [] } as Trilha)));
      setProgressos((pData || []).map((p) => ({ ...p, modulos_concluidos: Array.isArray(p.modulos_concluidos) ? p.modulos_concluidos as unknown as ModuloConcluido[] : [] } as Progresso)));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateTrilha = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const { error } = await supabase.from('rh_trilhas_treinamento').insert(withCompanyId(companyId, {
        titulo: form.titulo,
        descricao: form.descricao,
        setor: form.setor,
        obrigatoria: form.obrigatoria,
        modulos: formModulos as unknown as import('@/integrations/supabase/types').Json[],
        carga_horaria_min: form.carga_horaria_min,
        criado_por: user?.id ?? null,
      }));
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Trilha criada!');
      setShowNew(false);
      setForm({ titulo: '', descricao: '', setor: 'geral', obrigatoria: false, carga_horaria_min: 30 });
      setFormModulos([]);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erro inesperado');
    }
  };

  const handleAddModulo = () => {
    if (!newModulo.titulo.trim()) { toast.error('Título do módulo obrigatório'); return; }
    setFormModulos(prev => [...prev, { ...newModulo }]);
    setNewModulo({ titulo: '', descricao: '', tipo: 'leitura', conteudo: '' });
  };

  const handleAssign = async () => {
    if (!showAssign || !assignColabId) return;
    try {
      const { error } = await supabase.from('rh_progresso_treinamento').insert(withCompanyId(companyId, {
        trilha_id: showAssign,
        colaborador_id: assignColabId,
      }));
      if (error) {
        if (error.message.includes('duplicate')) { toast.error('Colaborador já está inscrito'); return; }
        toast.error('Erro: ' + error.message); return;
      }
      toast.success('Colaborador inscrito!');
      setShowAssign(null);
      setAssignColabId('');
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erro inesperado');
    }
  };

  const handleCompleteModulo = async (trilhaId: string, moduloIdx: number, quizNota?: number) => {
    const prog = progressos.find(p => p.trilha_id === trilhaId);
    if (!prog) return;
    const trilha = trilhas.find(t => t.id === trilhaId);
    if (!trilha) return;

    const newConcluidos: ModuloConcluido[] = [
      ...prog.modulos_concluidos,
      { modulo_idx: moduloIdx, concluido_em: new Date().toISOString(), quiz_nota: quizNota },
    ];

    const allDone = newConcluidos.length >= trilha.modulos.length;
    const avgNota = newConcluidos.filter(m => m.quiz_nota !== undefined).length > 0
      ? newConcluidos.filter(m => m.quiz_nota !== undefined).reduce((s, m) => s + (m.quiz_nota || 0), 0) / newConcluidos.filter(m => m.quiz_nota !== undefined).length
      : 0;

    try {
      const { error } = await supabase.from('rh_progresso_treinamento').update({
        modulos_concluidos: newConcluidos as unknown as import('@/integrations/supabase/types').Json[],
        status: allDone ? 'CONCLUIDO' : 'EM_ANDAMENTO',
        nota_final: Math.round(avgNota * 10) / 10,
        concluido_em: allDone ? new Date().toISOString() : null,
        certificado_emitido: allDone,
      }).eq('id', prog.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      if (allDone) toast.success('🎉 Trilha concluída! Certificado emitido.');
      else toast.success('Módulo concluído!');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitQuiz = () => {
    if (!quizActive) return;
    const trilha = trilhas.find(t => t.id === quizActive.trilhaId);
    if (!trilha) return;
    const modulo = trilha.modulos[quizActive.moduloIdx];
    if (!modulo?.quiz_perguntas) return;

    let acertos = 0;
    modulo.quiz_perguntas.forEach((q, i) => {
      if (quizAnswers[i] === q.resposta_correta) acertos++;
    });
    const nota = Math.round((acertos / modulo.quiz_perguntas.length) * 100);
    toast.info(`Resultado: ${acertos}/${modulo.quiz_perguntas.length} (${nota}%)`);
    handleCompleteModulo(quizActive.trilhaId, quizActive.moduloIdx, nota);
    setQuizActive(null);
    setQuizAnswers({});
  };

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';

  const selected = selectedTrilha ? trilhas.find(t => t.id === selectedTrilha) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Quiz view
  if (quizActive) {
    const trilha = trilhas.find(t => t.id === quizActive.trilhaId);
    const modulo = trilha?.modulos[quizActive.moduloIdx];
    if (!modulo?.quiz_perguntas) return null;

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => { setQuizActive(null); setQuizAnswers({}); }}>← Voltar</Button>
        <h2 className="text-lg font-semibold flex items-center gap-2"><HelpCircle className="w-5 h-5" /> Quiz: {modulo.titulo}</h2>
        <div className="space-y-4">
          {modulo.quiz_perguntas.map((q, qi) => (
            <Card key={qi}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{qi + 1}. {q.pergunta}</CardTitle></CardHeader>
              <CardContent>
                <RadioGroup value={quizAnswers[qi]?.toString()} onValueChange={v => setQuizAnswers(prev => ({ ...prev, [qi]: Number(v) }))}>
                  {q.opcoes.map((op, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <RadioGroupItem value={oi.toString()} id={`q${qi}-o${oi}`} />
                      <Label htmlFor={`q${qi}-o${oi}`} className="text-sm cursor-pointer">{op}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>
          ))}
          <Button onClick={handleSubmitQuiz} className="w-full">Enviar Respostas</Button>
        </div>
      </div>
    );
  }

  // Detail view
  if (selected) {
    const trilhaProgressos = sortByName(progressos.filter(p => p.trilha_id === selected.id), p => getColabNome(p.colaborador_id));

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setSelectedTrilha(null)}>← Voltar</Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{selected.titulo}</h2>
            <p className="text-xs text-muted-foreground">
              {SETOR_LABELS[selected.setor]} · {selected.modulos.length} módulos · {selected.carga_horaria_min}min
              {selected.obrigatoria && <Badge variant="destructive" className="ml-2 text-[10px]">Obrigatória</Badge>}
            </p>
          </div>
          {canManage && (
            <Dialog open={showAssign === selected.id} onOpenChange={open => { if (!open) setShowAssign(null); else setShowAssign(selected.id); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 h-8"><Users className="w-3.5 h-3.5" /> Inscrever</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>Inscrever Colaborador</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <Select value={assignColabId} onValueChange={setAssignColabId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button onClick={handleAssign}>Inscrever</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {selected.descricao && <p className="text-sm text-muted-foreground">{selected.descricao}</p>}

        {/* Módulos */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Módulos</h3>
          {selected.modulos.map((mod, idx) => {
            const TipoIcon = TIPO_ICONS[mod.tipo] || FileText;
            return (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TipoIcon className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{mod.titulo}</CardTitle>
                    <Badge variant="outline" className="text-[10px] ml-auto">{mod.tipo}</Badge>
                  </div>
                  {mod.descricao && <CardDescription className="text-xs">{mod.descricao}</CardDescription>}
                </CardHeader>
                {mod.conteudo && (
                  <CardContent><p className="text-xs text-muted-foreground whitespace-pre-wrap">{mod.conteudo}</p></CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Inscritos & Progresso */}
        {canManage && trilhaProgressos.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Inscritos ({trilhaProgressos.length})</h3>
            {trilhaProgressos.map(p => {
              const done = p.modulos_concluidos.length;
              const total = selected.modulos.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <Card key={p.id}>
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{getColabNome(p.colaborador_id)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                    {p.certificado_emitido && <Award className="w-5 h-5 text-warning" />}
                    <Badge variant={p.status === 'CONCLUIDO' ? 'default' : 'outline'} className="text-[10px]">
                      {p.status === 'CONCLUIDO' ? 'Concluído' : 'Em Andamento'}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // List view
  const stats = {
    total: trilhas.length,
    obrigatorias: trilhas.filter(t => t.obrigatoria).length,
    inscritos: progressos.length,
    concluidos: progressos.filter(p => p.status === 'CONCLUIDO').length,
  };

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Trilhas" value={stats.total} icon={GraduationCap} />
        <KpiCard label="Obrigatórias" value={stats.obrigatorias} icon={BookOpen} variant={stats.obrigatorias > 0 ? 'danger' : 'default'} />
        <KpiCard label="Inscrições" value={stats.inscritos} icon={Users} />
        <KpiCard label="Concluídos" value={stats.concluidos} icon={CheckCircle2} variant="success" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{trilhas.length} trilhas de treinamento</p>
        {canManage && (
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Nova Trilha</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Trilha de Treinamento</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} /></div>
                <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Setor</Label>
                    <Select value={form.setor} onValueChange={v => setForm(p => ({ ...p, setor: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SETORES.map(s => <SelectItem key={s} value={s}>{SETOR_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Carga Horária (min)</Label><Input type="number" value={form.carga_horaria_min || ''} onChange={e => setForm(p => ({ ...p, carga_horaria_min: Number(e.target.value) }))} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.obrigatoria} onCheckedChange={v => setForm(p => ({ ...p, obrigatoria: v }))} />
                  <Label>Trilha obrigatória</Label>
                </div>

                {/* Módulos */}
                <div className="border-t pt-3 space-y-2">
                  <h4 className="text-sm font-medium">Módulos ({formModulos.length})</h4>
                  {formModulos.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-background-subtle">
                      <Badge variant="outline" className="text-[10px]">{m.tipo}</Badge>
                      <span className="font-medium">{m.titulo}</span>
                    </div>
                  ))}
                  <div className="grid gap-2 p-3 border rounded">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Título módulo</Label><Input value={newModulo.titulo} onChange={e => setNewModulo(p => ({ ...p, titulo: e.target.value }))} className="h-8 text-xs" /></div>
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={newModulo.tipo} onValueChange={v => setNewModulo(p => ({ ...p, tipo: v as Modulo['tipo'] }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="leitura">Leitura</SelectItem>
                            <SelectItem value="video">Vídeo</SelectItem>
                            <SelectItem value="quiz">Quiz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label className="text-xs">Conteúdo</Label><Textarea value={newModulo.conteudo} onChange={e => setNewModulo(p => ({ ...p, conteudo: e.target.value }))} rows={2} className="text-xs" /></div>
                    <Button size="sm" variant="outline" onClick={handleAddModulo} className="h-7 text-xs">+ Adicionar Módulo</Button>
                  </div>
                </div>

                <Button onClick={handleCreateTrilha} className="w-full">Criar Trilha</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {trilhas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhuma trilha de treinamento cadastrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortByName(trilhas, t => t.titulo).map(t => {
            const inscritos = progressos.filter(p => p.trilha_id === t.id).length;
            const concluidos = progressos.filter(p => p.trilha_id === t.id && p.status === 'CONCLUIDO').length;
            return (
              <Card key={t.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTrilha(t.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{t.titulo}</CardTitle>
                    {t.obrigatoria && <Badge variant="destructive" className="text-[10px]">Obrigatória</Badge>}
                  </div>
                  <CardDescription className="text-xs">{t.descricao || 'Sem descrição'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Setor</span>
                    <Badge variant="secondary" className="text-[10px]">{SETOR_LABELS[t.setor]}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Módulos</span>
                    <span>{t.modulos.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Carga</span>
                    <span>{t.carga_horaria_min}min</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Inscritos</span>
                    <span>{concluidos}/{inscritos} concluídos</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
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
