import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HardHat, Stethoscope, AlertTriangle, Plus, Edit2, Trash2,
  ShieldCheck, CalendarClock, CheckCircle2, XCircle
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import GlobalKpiCard from '@/components/ui/KpiCard';
import { formatIntegerBR } from '@/lib/formatters';

import { useCan } from '@/permissions/hooks';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

type SstTab = 'epis' | 'exames' | 'incidentes';

const TIPOS_EPI = ['Luva', 'Avental', 'Bota', 'Touca', 'Máscara', 'Óculos', 'Protetor Auricular', 'Outro'];
const TIPOS_EXAME = [
  { value: 'admissional', label: 'Admissional' },
  { value: 'periodico', label: 'Periódico' },
  { value: 'retorno', label: 'Retorno ao Trabalho' },
  { value: 'mudanca_funcao', label: 'Mudança de Função' },
  { value: 'demissional', label: 'Demissional' },
];
const GRAVIDADES = [
  { value: 'leve', label: 'Leve', color: 'bg-warning/10 text-warning' },
  { value: 'moderado', label: 'Moderado', color: 'bg-warning/20 text-warning' },
  { value: 'grave', label: 'Grave', color: 'bg-destructive/10 text-destructive' },
  { value: 'fatal', label: 'Fatal', color: 'bg-destructive/20 text-destructive' },
];

const R = (v: number) => formatIntegerBR(v);

export default function SSTSection({
 colaboradores, canManage }: Props) {
  const canViewRbac = useCan('rh:sst:view');
  const { user } = useAuth();
  const [tab, setTab] = useState<SstTab>('epis');
  const [epis, setEpis] = useState<any[]>([]);
  const [exames, setExames] = useState<any[]>([]);
  const [incidentes, setIncidentes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const SST_PAGE = 50;
  const [epiPage, setEpiPage] = useState(0);
  const [epiHasMore, setEpiHasMore] = useState(true);
  const [examePage, setExamePage] = useState(0);
  const [exameHasMore, setExameHasMore] = useState(true);
  const [incPage, setIncPage] = useState(0);
  const [incHasMore, setIncHasMore] = useState(true);

  const fetchAll = useCallback(async (eP = 0, exP = 0, inP = 0, append = false) => {
    setLoading(true);
    const [epiRes, exameRes, incRes] = await Promise.all([
      supabase.from('rh_epis').select('id, colaborador_id, nome, tipo, ca_numero, data_entrega, data_validade, quantidade, status, observacoes, created_at').order('data_entrega', { ascending: false })
        .range(eP * SST_PAGE, (eP + 1) * SST_PAGE - 1),
      supabase.from('rh_exames').select('id, colaborador_id, tipo, descricao, data_realizacao, data_vencimento, resultado, clinica, medico, status, observacoes, created_at').order('data_vencimento', { ascending: true })
        .range(exP * SST_PAGE, (exP + 1) * SST_PAGE - 1),
      supabase.from('rh_incidentes').select('id, colaborador_id, tipo, descricao, data_ocorrencia, local, gravidade, testemunhas, afastamento_dias, status, observacoes, created_at').order('data_ocorrencia', { ascending: false })
        .range(inP * SST_PAGE, (inP + 1) * SST_PAGE - 1),
    ]);
    const epiData = epiRes.data || [];
    const exameData = exameRes.data || [];
    const incData = incRes.data || [];
    setEpiHasMore(epiData.length === SST_PAGE);
    setExameHasMore(exameData.length === SST_PAGE);
    setIncHasMore(incData.length === SST_PAGE);
    setEpiPage(eP); setExamePage(exP); setIncPage(inP);
    if (append) {
      if (eP > 0) setEpis(prev => [...prev, ...epiData]); else setEpis(epiData);
      if (exP > 0) setExames(prev => [...prev, ...exameData]); else setExames(exameData);
      if (inP > 0) setIncidentes(prev => [...prev, ...incData]); else setIncidentes(incData);
    } else {
      setEpis(epiData);
      setExames(exameData);
      setIncidentes(incData);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';

  // Stats
  const episVencidos = epis.filter(e => e.data_validade && differenceInDays(parseISO(e.data_validade), new Date()) < 0).length;
  const episAVencer = epis.filter(e => e.data_validade && differenceInDays(parseISO(e.data_validade), new Date()) >= 0 && differenceInDays(parseISO(e.data_validade), new Date()) <= 30).length;
  const examesVencidos = exames.filter(e => e.data_vencimento && differenceInDays(parseISO(e.data_vencimento), new Date()) < 0 && e.status !== 'REALIZADO').length;
  const examesPendentes = exames.filter(e => e.status === 'PENDENTE').length;
  const incidentesAbertos = incidentes.filter(i => i.status === 'ABERTO').length;
  const diasAfastamento = incidentes.reduce((s, i) => s + (i.afastamento_dias || 0), 0);

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
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <GlobalKpiCard label="EPIs Ativos" value={epis.filter(e => e.status === 'ATIVO').length} icon={HardHat} />
        <GlobalKpiCard label="EPIs Vencidos" value={episVencidos} icon={AlertTriangle} variant={episVencidos > 0 ? 'danger' : 'default'} />
        <GlobalKpiCard label="Exames Pendentes" value={examesPendentes} icon={Stethoscope} variant={examesPendentes > 0 ? 'warning' : 'default'} />
        <GlobalKpiCard label="Exames Vencidos" value={examesVencidos} icon={CalendarClock} variant={examesVencidos > 0 ? 'danger' : 'default'} />
        <GlobalKpiCard label="Incidentes Abertos" value={incidentesAbertos} icon={AlertTriangle} variant={incidentesAbertos > 0 ? 'danger' : 'default'} />
        <GlobalKpiCard label="Dias Afastamento" value={diasAfastamento} icon={XCircle} />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as SstTab)}>
        <TabsList>
          <TabsTrigger value="epis" className="gap-1.5 text-xs"><HardHat className="w-3.5 h-3.5" /> EPIs</TabsTrigger>
          <TabsTrigger value="exames" className="gap-1.5 text-xs"><Stethoscope className="w-3.5 h-3.5" /> Exames</TabsTrigger>
          <TabsTrigger value="incidentes" className="gap-1.5 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Incidentes</TabsTrigger>
        </TabsList>

        <TabsContent value="epis">
          <EpisTab epis={epis} colaboradores={colaboradores} canManage={canManage} user={user} getColabNome={getColabNome} onRefresh={fetchAll} />
        </TabsContent>
        <TabsContent value="exames">
          <ExamesTab exames={exames} colaboradores={colaboradores} canManage={canManage} user={user} getColabNome={getColabNome} onRefresh={fetchAll} />
        </TabsContent>
        <TabsContent value="incidentes">
          <IncidentesTab incidentes={incidentes} colaboradores={colaboradores} canManage={canManage} user={user} getColabNome={getColabNome} onRefresh={fetchAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── EPIs Tab ───
function EpisTab({ epis, colaboradores, canManage, user, getColabNome, onRefresh }: any) {
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { colaborador_id: '', nome: '', tipo: 'Luva', ca_numero: '', data_entrega: format(new Date(), 'yyyy-MM-dd'), data_validade: '', quantidade: 1, observacoes: '' };
  const [form, setForm] = useState(emptyForm);

  const handleSave = async () => {
    if (!form.colaborador_id || !form.nome) { toast.error('Preencha colaborador e nome'); return; }
    const { error } = await supabase.from('rh_epis').insert({
      ...form, data_validade: form.data_validade || null, created_by: user?.id,
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('EPI registrado!');
    setShowForm(false);
    setForm(emptyForm);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rh_epis').update({ status: 'INATIVO' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('EPI desativado!');
    onRefresh();
  };

  return (
    <div className="space-y-3 mt-3">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Registrar EPI</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Registrar Entrega de EPI</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Nome do EPI *</Label><Input className="h-8 text-xs" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_EPI.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">CA Nº</Label><Input className="h-8 text-xs" value={form.ca_numero} onChange={e => setForm(p => ({ ...p, ca_numero: e.target.value }))} /></div>
                  <div><Label className="text-xs">Data Entrega</Label><Input type="date" className="h-8 text-xs" value={form.data_entrega} onChange={e => setForm(p => ({ ...p, data_entrega: e.target.value }))} /></div>
                  <div><Label className="text-xs">Validade</Label><Input type="date" className="h-8 text-xs" value={form.data_validade} onChange={e => setForm(p => ({ ...p, data_validade: e.target.value }))} /></div>
                </div>
                <div><Label className="text-xs">Qtd</Label><Input type="number" className="h-8 text-xs w-20" value={form.quantidade || ''} onChange={e => setForm(p => ({ ...p, quantidade: Number(e.target.value) }))} /></div>
                <Button onClick={handleSave} className="w-full">Registrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {epis.length === 0 ? (
            <div className="text-center py-8"><HardHat className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm text-muted-foreground">Nenhum EPI registrado</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Colaborador</TableHead>
                    <TableHead className="text-xs">EPI</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">CA</TableHead>
                    <TableHead className="text-xs">Entrega</TableHead>
                    <TableHead className="text-xs">Validade</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {canManage && <TableHead className="text-xs w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {epis.map((e: any) => {
                    const vencido = e.data_validade && differenceInDays(parseISO(e.data_validade), new Date()) < 0;
                    const aVencer = e.data_validade && !vencido && differenceInDays(parseISO(e.data_validade), new Date()) <= 30;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-medium">{getColabNome(e.colaborador_id)}</TableCell>
                        <TableCell className="text-xs">{e.nome}</TableCell>
                        <TableCell className="text-xs">{e.tipo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.ca_numero || '—'}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(e.data_entrega), 'dd/MM/yy')}</TableCell>
                        <TableCell className="text-xs">
                          {e.data_validade ? (
                            <span className={cn(vencido && "text-destructive font-semibold", aVencer && "text-warning font-semibold")}>
                              {format(parseISO(e.data_validade), 'dd/MM/yy')}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={vencido ? 'destructive' : aVencer ? 'secondary' : 'default'} className="text-[10px]">
                            {vencido ? 'Vencido' : aVencer ? 'A vencer' : 'OK'}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(e.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Exames Tab ───
function ExamesTab({ exames, colaboradores, canManage, user, getColabNome, onRefresh }: any) {
  const [showForm, setShowForm] = useState(false);
  const emptyForm = { colaborador_id: '', tipo: 'periodico', descricao: '', data_realizacao: '', data_vencimento: '', resultado: 'APTO', clinica: '', medico: '', observacoes: '' };
  const [form, setForm] = useState(emptyForm);

  const handleSave = async () => {
    if (!form.colaborador_id) { toast.error('Selecione um colaborador'); return; }
    const { error } = await supabase.from('rh_exames').insert({
      ...form,
      data_realizacao: form.data_realizacao || null,
      data_vencimento: form.data_vencimento || null,
      status: form.data_realizacao ? 'REALIZADO' : 'PENDENTE',
      created_by: user?.id,
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Exame registrado!');
    setShowForm(false);
    setForm(emptyForm);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rh_exames').update({ status: 'CANCELADO' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Exame cancelado!');
    onRefresh();
  };

  return (
    <div className="space-y-3 mt-3">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Novo Exame</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Registrar Exame</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS_EXAME.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Resultado</Label>
                    <Select value={form.resultado} onValueChange={v => setForm(p => ({ ...p, resultado: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="APTO">Apto</SelectItem>
                        <SelectItem value="INAPTO">Inapto</SelectItem>
                        <SelectItem value="APTO_RESTRICOES">Apto c/ Restrições</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Data Realização</Label><Input type="date" className="h-8 text-xs" value={form.data_realizacao} onChange={e => setForm(p => ({ ...p, data_realizacao: e.target.value }))} /></div>
                  <div><Label className="text-xs">Vencimento</Label><Input type="date" className="h-8 text-xs" value={form.data_vencimento} onChange={e => setForm(p => ({ ...p, data_vencimento: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Clínica</Label><Input className="h-8 text-xs" value={form.clinica} onChange={e => setForm(p => ({ ...p, clinica: e.target.value }))} /></div>
                  <div><Label className="text-xs">Médico</Label><Input className="h-8 text-xs" value={form.medico} onChange={e => setForm(p => ({ ...p, medico: e.target.value }))} /></div>
                </div>
                <Button onClick={handleSave} className="w-full">Registrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {exames.length === 0 ? (
            <div className="text-center py-8"><Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm text-muted-foreground">Nenhum exame registrado</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Colaborador</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Realização</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {canManage && <TableHead className="text-xs w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exames.map((e: any) => {
                    const vencido = e.data_vencimento && differenceInDays(parseISO(e.data_vencimento), new Date()) < 0 && e.status !== 'REALIZADO';
                    const tipoLabel = TIPOS_EXAME.find(t => t.value === e.tipo)?.label || e.tipo;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-medium">{getColabNome(e.colaborador_id)}</TableCell>
                        <TableCell className="text-xs">{tipoLabel}</TableCell>
                        <TableCell className="text-xs">{e.data_realizacao ? format(parseISO(e.data_realizacao), 'dd/MM/yy') : '—'}</TableCell>
                        <TableCell className={cn("text-xs", vencido && "text-destructive font-semibold")}>
                          {e.data_vencimento ? format(parseISO(e.data_vencimento), 'dd/MM/yy') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={e.resultado === 'INAPTO' ? 'destructive' : e.resultado === 'APTO_RESTRICOES' ? 'secondary' : 'default'} className="text-[10px]">
                            {e.resultado === 'APTO_RESTRICOES' ? 'Restrições' : e.resultado}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={vencido ? 'destructive' : e.status === 'REALIZADO' ? 'default' : 'outline'} className="text-[10px]">
                            {vencido ? 'Vencido' : e.status === 'REALIZADO' ? 'Realizado' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(e.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Incidentes Tab ───
function IncidentesTab({ incidentes, colaboradores, canManage, user, getColabNome, onRefresh }: any) {
  const [showForm, setShowForm] = useState(false);
  const emptyForm = {
    colaborador_id: '', tipo: 'incidente', gravidade: 'leve',
    data_ocorrencia: format(new Date(), 'yyyy-MM-dd'), local: '',
    descricao: '', causa_provavel: '', acao_imediata: '', acao_corretiva: '',
    afastamento_dias: 0, cat_emitida: false, cat_numero: '', testemunhas: '',
  };
  const [form, setForm] = useState(emptyForm);

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição é obrigatória'); return; }
    const { error } = await supabase.from('rh_incidentes').insert({
      ...form,
      colaborador_id: form.colaborador_id || null,
      created_by: user?.id,
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Incidente registrado!');
    setShowForm(false);
    setForm(emptyForm);
    onRefresh();
  };

  const handleEncerrar = async (id: string) => {
    const { error } = await supabase.from('rh_incidentes').update({
      status: 'ENCERRADO', encerrado_em: new Date().toISOString(), encerrado_por: user?.id,
    }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Incidente encerrado!');
    onRefresh();
  };

  return (
    <div className="space-y-3 mt-3">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="destructive" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Registrar Incidente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Registrar Incidente / Acidente</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Colaborador (opcional)</Label>
                    <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incidente">Incidente</SelectItem>
                        <SelectItem value="acidente">Acidente</SelectItem>
                        <SelectItem value="quase_acidente">Quase Acidente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Gravidade</Label>
                    <Select value={form.gravidade} onValueChange={v => setForm(p => ({ ...p, gravidade: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Data</Label><Input type="date" className="h-8 text-xs" value={form.data_ocorrencia} onChange={e => setForm(p => ({ ...p, data_ocorrencia: e.target.value }))} /></div>
                  <div><Label className="text-xs">Local</Label><Input className="h-8 text-xs" value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))} /></div>
                </div>
                <div><Label className="text-xs">Descrição *</Label><Textarea className="text-xs" rows={2} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} /></div>
                <div><Label className="text-xs">Causa Provável</Label><Input className="h-8 text-xs" value={form.causa_provavel} onChange={e => setForm(p => ({ ...p, causa_provavel: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Ação Imediata</Label><Input className="h-8 text-xs" value={form.acao_imediata} onChange={e => setForm(p => ({ ...p, acao_imediata: e.target.value }))} /></div>
                  <div><Label className="text-xs">Ação Corretiva</Label><Input className="h-8 text-xs" value={form.acao_corretiva} onChange={e => setForm(p => ({ ...p, acao_corretiva: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Dias Afastamento</Label><Input type="number" className="h-8 text-xs" value={form.afastamento_dias || ''} onChange={e => setForm(p => ({ ...p, afastamento_dias: Number(e.target.value) }))} /></div>
                  <div><Label className="text-xs">CAT Nº (se emitida)</Label><Input className="h-8 text-xs" value={form.cat_numero} onChange={e => setForm(p => ({ ...p, cat_numero: e.target.value, cat_emitida: !!e.target.value }))} /></div>
                </div>
                <Button onClick={handleSave} variant="destructive" className="w-full">Registrar Incidente</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {incidentes.length === 0 ? (
            <div className="text-center py-8"><ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30 text-success" /><p className="text-sm text-muted-foreground">Nenhum incidente registrado — ótimo!</p></div>
          ) : (
            <div className="space-y-3">
              {incidentes.map((i: any) => {
                const grav = GRAVIDADES.find(g => g.value === i.gravidade);
                return (
                  <Card key={i.id} className={cn("border-l-4", i.gravidade === 'grave' || i.gravidade === 'fatal' ? "border-l-destructive" : i.gravidade === 'moderado' ? "border-l-warning" : "border-l-warning/50")}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={i.status === 'ABERTO' ? 'destructive' : 'default'} className="text-[10px]">
                              {i.status === 'ABERTO' ? 'Aberto' : 'Encerrado'}
                            </Badge>
                            <Badge className={cn("text-[10px]", grav?.color)}>{grav?.label}</Badge>
                            <span className="text-[10px] text-muted-foreground">{i.tipo} · {format(parseISO(i.data_ocorrencia), 'dd/MM/yyyy')}</span>
                          </div>
                          <p className="text-xs">{i.descricao}</p>
                          {i.colaborador_id && <p className="text-[10px] text-muted-foreground">Colaborador: {getColabNome(i.colaborador_id)}</p>}
                          {i.local && <p className="text-[10px] text-muted-foreground">Local: {i.local}</p>}
                          {i.afastamento_dias > 0 && <p className="text-[10px] text-destructive font-medium">{i.afastamento_dias} dias de afastamento</p>}
                          {i.cat_emitida && <p className="text-[10px] text-muted-foreground">CAT: {i.cat_numero}</p>}
                        </div>
                        {canManage && i.status === 'ABERTO' && (
                          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => handleEncerrar(i.id)}>
                            <CheckCircle2 className="w-3 h-3" /> Encerrar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// local KpiCard removed — using global KpiCard from @/components/ui/KpiCard
