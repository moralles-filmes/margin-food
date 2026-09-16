import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ShieldAlert, Plus, AlertTriangle, Ban, FileWarning, Award,
  Eye, XCircle, CheckCircle2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import KpiCard from '@/components/ui/KpiCard';

type OcorrenciaRow = Database['public']['Tables']['rh_ocorrencias_disciplinares']['Row'];

interface Props {
  colaboradores: { id: string; nome: string; cargo?: string; status: string }[];
  canManage: boolean;
}

const TIPOS = [
  { value: 'advertencia_verbal', label: 'Advertência Verbal', icon: AlertTriangle, color: 'text-warning' },
  { value: 'advertencia_escrita', label: 'Advertência Escrita', icon: FileWarning, color: 'text-warning' },
  { value: 'suspensao', label: 'Suspensão', icon: Ban, color: 'text-destructive' },
  { value: 'termo_responsabilidade', label: 'Termo de Responsabilidade', icon: ShieldAlert, color: 'text-primary' },
  { value: 'elogio', label: 'Elogio', icon: Award, color: 'text-success' },
];

const GRAVIDADES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  leve: { label: 'Leve', variant: 'outline' },
  moderada: { label: 'Moderada', variant: 'secondary' },
  grave: { label: 'Grave', variant: 'default' },
  gravissima: { label: 'Gravíssima', variant: 'destructive' },
};

export default function GestaoDisciplinarSection({ colaboradores, canManage }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const { user } = useAuth();
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterColab, setFilterColab] = useState('todos');
  const [detailItem, setDetailItem] = useState<OcorrenciaRow | null>(null);

  const emptyForm = {
    colaborador_id: '', tipo: 'advertencia_verbal', motivo: '', descricao: '',
    data_ocorrencia: format(new Date(), 'yyyy-MM-dd'), testemunhas: '',
    gravidade: 'leve', assinatura_colaborador: false, assinatura_gestor: false, observacoes: '',
  };
  const [form, setForm] = useState(emptyForm);

  const [savingOc, setSavingOc] = useState(false);
  const [discPage, setDiscPage] = useState(0);
  const [discHasMore, setDiscHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    const { data, error } = await supabase
      .from('rh_ocorrencias_disciplinares')
      .select('id, colaborador_id, tipo, motivo, descricao, data_ocorrencia, testemunhas, gravidade, assinatura_colaborador, assinatura_gestor, observacoes, status, aplicado_por, aplicado_por_nome, revogado_em, revogado_por, revogado_motivo, created_at, company_id, updated_at, documento_path')
      .order('data_ocorrencia', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (error) console.error(error);
    const newItems = data || [];
    if (append) {
      setOcorrencias(prev => [...prev, ...newItems]);
    } else {
      setOcorrencias(newItems);
    }
    setDiscHasMore(newItems.length === PAGE_SIZE);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (savingOc) return;
    if (!form.colaborador_id || !form.motivo.trim()) {
      toast.error('Colaborador e motivo são obrigatórios');
      return;
    }
    setSavingOc(true);
    try {
      const payload: Database['public']['Tables']['rh_ocorrencias_disciplinares']['Insert'] = {
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        motivo: form.motivo,
        descricao: form.descricao,
        data_ocorrencia: form.data_ocorrencia,
        testemunhas: form.testemunhas || null,
        gravidade: form.gravidade,
        assinatura_colaborador: form.assinatura_colaborador,
        assinatura_gestor: form.assinatura_gestor,
        observacoes: form.observacoes || null,
        aplicado_por: user?.id || '',
        aplicado_por_nome: user?.email?.split('@')[0] || '',
      };

      const { error } = await supabase
        .from('rh_ocorrencias_disciplinares')
        .insert(withCompanyId(companyId, payload));

      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Ocorrência registrada!');
      setShowForm(false);
      setForm(emptyForm);
      setDiscPage(0);
      fetchData(0);
    } finally {
      setSavingOc(false);
    }
  };

  const handleRevogar = async (id: string) => {
    const motivo = prompt('Motivo da revogação:');
    if (!motivo) return;

    const { error } = await supabase
      .from('rh_ocorrencias_disciplinares')
      .update({
        status: 'revogado',
        revogado_em: new Date().toISOString(),
        revogado_por: user?.id ?? null,
        revogado_motivo: motivo,
      })
      .eq('id', id);

    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Ocorrência revogada!');
    fetchData();
    setDetailItem(null);
  };

  const colabName = (id: string) => colaboradores.find(c => c.id === id)?.nome || '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filtered = ocorrencias.filter(o => {
    if (filterTipo !== 'todos' && o.tipo !== filterTipo) return false;
    if (filterColab !== 'todos' && o.colaborador_id !== filterColab) return false;
    return true;
  });

  // Stats
  const ativos = ocorrencias.filter(o => o.status === 'ativo');
  const advertencias = ativos.filter(o => o.tipo.startsWith('advertencia')).length;
  const suspensoes = ativos.filter(o => o.tipo === 'suspensao').length;
  const elogios = ativos.filter(o => o.tipo === 'elogio').length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ocorrências Ativas" value={ativos.length} icon={ShieldAlert} />
        <KpiCard label="Advertências" value={advertencias} icon={AlertTriangle} variant="warning" />
        <KpiCard label="Suspensões" value={suspensoes} icon={Ban} variant="danger" />
        <KpiCard label="Elogios" value={elogios} icon={Award} variant="success" />
      </div>

      {/* Filters + Add */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterColab} onValueChange={setFilterColab}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Colaborador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {colaboradores.filter(c => c.status === 'ativo').map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} registro(s)</span>
        </div>
        {canManage && (
          <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Nova Ocorrência</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Registrar Ocorrência Disciplinar</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {colaboradores.filter(c => c.status === 'ativo').map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome} — {c.cargo ?? ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Gravidade</Label>
                    <Select value={form.gravidade} onValueChange={v => setForm(p => ({ ...p, gravidade: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(GRAVIDADES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Data da Ocorrência</Label>
                  <DateInput className="h-8 text-xs" value={form.data_ocorrencia} onValueChange={v => setForm(p => ({ ...p, data_ocorrencia: v }))} />
                </div>
                <div>
                  <Label className="text-xs">Motivo *</Label>
                  <Input className="h-8 text-xs" value={form.motivo} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} placeholder="Resumo do motivo" />
                </div>
                <div>
                  <Label className="text-xs">Descrição Detalhada</Label>
                  <Textarea className="text-xs" rows={3} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Testemunhas</Label>
                  <Input className="h-8 text-xs" value={form.testemunhas} onChange={e => setForm(p => ({ ...p, testemunhas: e.target.value }))} placeholder="Nomes separados por vírgula" />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={form.assinatura_colaborador} onCheckedChange={c => setForm(p => ({ ...p, assinatura_colaborador: !!c }))} />
                    Assinatura Colaborador
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={form.assinatura_gestor} onCheckedChange={c => setForm(p => ({ ...p, assinatura_gestor: !!c }))} />
                    Assinatura Gestor
                  </label>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea className="text-xs" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
                </div>
                <Button onClick={handleSave} disabled={savingOc} className="w-full">{savingOc ? 'Salvando...' : 'Registrar'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Colaborador</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Gravidade</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const tipoConf = TIPOS.find(t => t.value === o.tipo) || TIPOS[0];
                  const Icon = tipoConf.icon;
                  const gravConf = GRAVIDADES[o.gravidade] || GRAVIDADES.leve;
                  return (
                    <TableRow key={o.id} className={cn(o.status === 'revogado' && 'opacity-50')}>
                      <TableCell className="text-xs">{format(parseISO(o.data_ocorrencia), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-xs font-medium">{colabName(o.colaborador_id)}</TableCell>
                      <TableCell className="text-xs">
                        <span className={cn("flex items-center gap-1", tipoConf.color)}>
                          <Icon className="w-3 h-3" /> {tipoConf.label}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant={gravConf.variant} className="text-[10px]">{gravConf.label}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{o.motivo}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === 'ativo' ? 'default' : 'outline'} className="text-[10px]">
                          {o.status === 'ativo' ? 'Ativo' : 'Revogado'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDetailItem(o)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {discHasMore && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => { const next = discPage + 1; setDiscPage(next); fetchData(next, true); }}>
            Carregar mais
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={o => { if (!o) setDetailItem(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const t = TIPOS.find(x => x.value === detailItem.tipo); const I = t?.icon || ShieldAlert; return <I className={cn("w-4 h-4", t?.color)} />; })()}
                  {TIPOS.find(t => t.value === detailItem.tipo)?.label}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Colaborador:</span> <strong>{colabName(detailItem.colaborador_id)}</strong></div>
                  <div><span className="text-muted-foreground">Data:</span> <strong>{format(parseISO(detailItem.data_ocorrencia), 'dd/MM/yyyy')}</strong></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Gravidade:</span> <Badge variant={GRAVIDADES[detailItem.gravidade]?.variant || 'outline'} className="text-[10px] ml-1">{GRAVIDADES[detailItem.gravidade]?.label}</Badge></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant={detailItem.status === 'ativo' ? 'default' : 'outline'} className="text-[10px] ml-1">{detailItem.status}</Badge></div>
                </div>
                <div><span className="text-muted-foreground">Motivo:</span> <p className="mt-0.5">{detailItem.motivo}</p></div>
                {detailItem.descricao && <div><span className="text-muted-foreground">Descrição:</span> <p className="mt-0.5 whitespace-pre-wrap">{detailItem.descricao}</p></div>}
                {detailItem.testemunhas && <div><span className="text-muted-foreground">Testemunhas:</span> {detailItem.testemunhas}</div>}
                <div className="flex gap-4">
                  <span className="flex items-center gap-1">{detailItem.assinatura_colaborador ? <CheckCircle2 className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-muted-foreground" />} Assinatura Colab.</span>
                  <span className="flex items-center gap-1">{detailItem.assinatura_gestor ? <CheckCircle2 className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-muted-foreground" />} Assinatura Gestor</span>
                </div>
                <div><span className="text-muted-foreground">Aplicado por:</span> {detailItem.aplicado_por_nome} em {format(parseISO(detailItem.created_at), "dd/MM/yyyy 'às' HH:mm")}</div>
                {detailItem.observacoes && <div><span className="text-muted-foreground">Obs:</span> {detailItem.observacoes}</div>}
                {detailItem.status === 'revogado' && (
                  <div className="p-2 bg-muted rounded text-[10px]">
                    <p className="font-medium text-destructive">Revogado</p>
                    {detailItem.revogado_em && <p>Em: {format(parseISO(detailItem.revogado_em), 'dd/MM/yyyy HH:mm')}</p>}
                    {detailItem.revogado_motivo && <p>Motivo: {detailItem.revogado_motivo}</p>}
                  </div>
                )}
                {canManage && detailItem.status === 'ativo' && (
                  <Button size="sm" variant="destructive" className="mt-2" onClick={() => handleRevogar(detailItem.id)}>
                    Revogar Ocorrência
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// local StatCard removed — using global KpiCard from @/components/ui/KpiCard
