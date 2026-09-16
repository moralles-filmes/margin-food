import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import TableActions from '@/components/ui/TableActions';
import KpiCard from '@/components/ui/KpiCard';
import { Heart, Plus, Shield, Bus, UtensilsCrossed, Stethoscope, Users, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayBR } from '@/lib/datetime';
import { formatFixedBR, normalizeBRLMoneyToNumber } from '@/lib/formatters';

import { useCan } from '@/permissions/hooks';
import { compareNames } from '@/lib/sortByName';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  cargo: string;
}

interface Beneficio {
  id: string;
  colaborador_id: string;
  tipo: string;
  nome: string;
  descricao: string;
  valor_empresa: number;
  valor_colaborador: number;
  percentual_desconto: number;
  elegivel: boolean;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  operadora: string;
  numero_cartao: string;
  observacoes: string;
  created_at: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const TIPOS_BENEFICIO = [
  { value: 'vale_transporte', label: 'Vale Transporte', icon: Bus },
  { value: 'vale_refeicao', label: 'Vale Refeição', icon: UtensilsCrossed },
  { value: 'vale_alimentacao', label: 'Vale Alimentação', icon: UtensilsCrossed },
  { value: 'plano_saude', label: 'Plano de Saúde', icon: Stethoscope },
  { value: 'plano_odonto', label: 'Plano Odontológico', icon: Stethoscope },
  { value: 'seguro_vida', label: 'Seguro de Vida', icon: Shield },
  { value: 'outro', label: 'Outro', icon: Heart },
];

const TIPO_LABELS: Record<string, string> = Object.fromEntries(TIPOS_BENEFICIO.map(t => [t.value, t.label]));

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ATIVO: { label: 'Ativo', variant: 'default' },
  SUSPENSO: { label: 'Suspenso', variant: 'secondary' },
  CANCELADO: { label: 'Cancelado', variant: 'destructive' },
};

const R = (v: number) => formatFixedBR(v, 2);

export default function BeneficiosSection({
 colaboradores, canManage }: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('rh:beneficios:view');
  const { user } = useAuth();
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [filterColab, setFilterColab] = useState<string>('todos');

  const emptyForm = {
    colaborador_id: '', tipo: 'vale_transporte', nome: '', descricao: '',
    valor_empresa: '0', valor_colaborador: '0', percentual_desconto: '0',
    elegivel: true, data_inicio: todayBR(),
    data_fim: '', status: 'ATIVO', operadora: '', numero_cartao: '', observacoes: '',
  };
  const [form, setForm] = useState(emptyForm);

  const [benPage, setBenPage] = useState(0);
  const [benHasMore, setBenHasMore] = useState(true);
  const [savingBen, setSavingBen] = useState(false);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    const { data, error } = await supabase
      .from('rh_beneficios')
      .select('id, colaborador_id, tipo, nome, descricao, valor_empresa, valor_colaborador, percentual_desconto, elegivel, data_inicio, data_fim, status, operadora, numero_cartao, observacoes, created_at')
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (error) console.error(error);
    const newItems = (data || []) as Beneficio[];
    if (append) {
      setBeneficios(prev => [...prev, ...newItems]);
    } else {
      setBeneficios(newItems);
    }
    setBenHasMore(newItems.length === PAGE_SIZE);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';

  const handleSave = async () => {
    if (savingBen) return;
    if (!form.colaborador_id) { toast.error('Selecione um colaborador'); return; }
    if (!form.nome.trim()) { toast.error('Nome do benefício é obrigatório'); return; }
    setSavingBen(true);
    try {
      const payload = {
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        nome: form.nome,
        descricao: form.descricao,
        valor_empresa: normalizeBRLMoneyToNumber(form.valor_empresa) ?? 0,
        valor_colaborador: normalizeBRLMoneyToNumber(form.valor_colaborador) ?? 0,
        percentual_desconto: parseDecimal(form.percentual_desconto) ?? 0,
        elegivel: form.elegivel,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim || null,
        status: form.status,
        operadora: form.operadora,
        numero_cartao: form.numero_cartao,
        observacoes: form.observacoes,
      };

      if (editingId) {
        const { error } = await supabase.from('rh_beneficios').update(payload).eq('id', editingId);
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Benefício atualizado!');
      } else {
        const { error } = await supabase.from('rh_beneficios').insert(withCompanyId(companyId, { ...payload, created_by: user?.id }));
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Benefício cadastrado!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setBenPage(0);
      fetchData(0);
    } finally {
      setSavingBen(false);
    }
  };

  const handleEdit = (b: Beneficio) => {
    setForm({
      colaborador_id: b.colaborador_id,
      tipo: b.tipo,
      nome: b.nome,
      descricao: b.descricao || '',
      valor_empresa: String(b.valor_empresa),
      valor_colaborador: String(b.valor_colaborador),
      percentual_desconto: String(b.percentual_desconto),
      elegivel: b.elegivel,
      data_inicio: b.data_inicio,
      data_fim: b.data_fim || '',
      status: b.status,
      operadora: b.operadora || '',
      numero_cartao: b.numero_cartao || '',
      observacoes: b.observacoes || '',
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rh_beneficios').update({ status: 'CANCELADO' }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Benefício cancelado!');
    fetchData();
  };

  const handleAtribuirEmLote = async (tipo: string) => {
    const tipoInfo = TIPOS_BENEFICIO.find(t => t.value === tipo);
    if (!tipoInfo) return;

    const colabsSemBeneficio = colaboradores.filter(c =>
      !beneficios.some(b => b.colaborador_id === c.id && b.tipo === tipo && b.status === 'ATIVO')
    );

    if (colabsSemBeneficio.length === 0) {
      toast.info('Todos os colaboradores já possuem este benefício');
      return;
    }

    const inserts = colabsSemBeneficio.map(c => ({
      colaborador_id: c.id,
      tipo,
      nome: tipoInfo.label,
      valor_empresa: 0,
      valor_colaborador: 0,
      percentual_desconto: tipo === 'vale_transporte' ? 6 : 0,
      data_inicio: todayBR(),
      status: 'ATIVO',
      created_by: user?.id,
    }));

    const { error } = await supabase.from('rh_beneficios').insert(withCompanyId(companyId, inserts));
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`${tipoInfo.label} atribuído a ${colabsSemBeneficio.length} colaboradores!`);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats
  const ativos = beneficios.filter(b => b.status === 'ATIVO');
  const custoTotalEmpresa = ativos.reduce((s, b) => s + b.valor_empresa, 0);
  const custoTotalColab = ativos.reduce((s, b) => s + b.valor_colaborador, 0);
  const porTipo = TIPOS_BENEFICIO.map(t => ({
    ...t,
    count: ativos.filter(b => b.tipo === t.value).length,
    custo: ativos.filter(b => b.tipo === t.value).reduce((s, b) => s + b.valor_empresa, 0),
  }));

  // Filtered list
  const filtered = beneficios.filter(b => {
    if (filterTipo !== 'todos' && b.tipo !== filterTipo) return false;
    if (filterColab !== 'todos' && b.colaborador_id !== filterColab) return false;
    return true;
  }).sort((a, b) => compareNames(getColabNome(a.colaborador_id), getColabNome(b.colaborador_id)) || compareNames(a.nome, b.nome));

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Benefícios Ativos" value={ativos.length} icon={Heart} />
        <KpiCard label="Custo Empresa/mês" value={`R$ ${R(custoTotalEmpresa)}`} icon={DollarSign} variant="danger" />
        <KpiCard label="Desc. Colaborador/mês" value={`R$ ${R(custoTotalColab)}`} icon={DollarSign} />
        <KpiCard label="Colaboradores" value={new Set(ativos.map(b => b.colaborador_id)).size} sub={`/ ${colaboradores.length} total`} icon={Users} />
      </div>

      {/* Tipo breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {porTipo.map(t => {
          const Icon = t.icon;
          return (
            <Card key={t.value} className={cn("cursor-pointer hover:shadow-md transition-shadow", filterTipo === t.value && "ring-2 ring-primary")}
              onClick={() => setFilterTipo(filterTipo === t.value ? 'todos' : t.value)}>
              <CardContent className="py-3 px-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">{t.label}</p>
                <p className="text-sm font-semibold">{t.count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterColab} onValueChange={setFilterColab}>
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder="Todos colaboradores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos colaboradores</SelectItem>
              {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Select onValueChange={handleAtribuirEmLote}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="Atribuir em lote..." />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_BENEFICIO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) { setEditingId(null); setForm(emptyForm); } }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Novo Benefício</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? 'Editar' : 'Novo'} Benefício</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs">Colaborador *</Label>
                    <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={form.tipo} onValueChange={v => {
                        const label = TIPO_LABELS[v] || v;
                        setForm(p => ({ ...p, tipo: v, nome: p.nome || label }));
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_BENEFICIO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nome *</Label>
                      <Input className="h-8 text-xs" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
            <div>
                      <Label className="text-xs">Valor Empresa (R$)</Label>
                      <CurrencyInput className="h-8 text-xs" value={form.valor_empresa} onValueChange={(raw) => setForm(p => ({ ...p, valor_empresa: raw }))} showPrefix maxDecimals={2} />
                    </div>
                    <div>
                      <Label className="text-xs">Valor Colaborador (R$)</Label>
                      <CurrencyInput className="h-8 text-xs" value={form.valor_colaborador} onValueChange={(raw) => setForm(p => ({ ...p, valor_colaborador: raw }))} showPrefix maxDecimals={2} />
                    </div>
                    <div>
                      <Label className="text-xs">Desconto (%)</Label>
                      <DecimalInput className="h-8 text-xs" value={form.percentual_desconto} onValueChange={(raw) => setForm(p => ({ ...p, percentual_desconto: raw }))} maxDecimals={2} suffix="%" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Operadora</Label>
                      <Input className="h-8 text-xs" value={form.operadora} onChange={e => setForm(p => ({ ...p, operadora: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Nº Cartão</Label>
                      <Input className="h-8 text-xs" value={form.numero_cartao} onChange={e => setForm(p => ({ ...p, numero_cartao: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Data Início</Label>
                      <DateInput className="h-8 text-xs" value={form.data_inicio} onValueChange={v => setForm(p => ({ ...p, data_inicio: v }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Data Fim (opcional)</Label>
                      <DateInput className="h-8 text-xs" value={form.data_fim} onValueChange={v => setForm(p => ({ ...p, data_fim: v }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ATIVO">Ativo</SelectItem>
                        <SelectItem value="SUSPENSO">Suspenso</SelectItem>
                        <SelectItem value="CANCELADO">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Observações</Label>
                    <Textarea className="text-xs" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
                  </div>
                  <Button onClick={handleSave} disabled={savingBen} className="w-full">{savingBen ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar Benefício'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Benefícios Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <Heart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhum benefício encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Colaborador</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs text-right">Empresa</TableHead>
                    <TableHead className="text-xs text-right">Colab.</TableHead>
                    <TableHead className="text-xs">Operadora</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    {canManage && <TableHead className="text-xs w-20"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(b => {
                    const status = STATUS_CONFIG[b.status] || STATUS_CONFIG.ATIVO;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs font-medium">{getColabNome(b.colaborador_id)}</TableCell>
                        <TableCell className="text-xs">{TIPO_LABELS[b.tipo] || b.tipo}</TableCell>
                        <TableCell className="text-xs">{b.nome}</TableCell>
                        <TableCell className="text-xs text-right">R$ {R(b.valor_empresa)}</TableCell>
                        <TableCell className="text-xs text-right">R$ {R(b.valor_colaborador)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{b.operadora || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <TableActions
                              onEdit={() => handleEdit(b)}
                              onDelete={() => handleDelete(b.id)}
                              deleteConfirmTitle="Cancelar benefício"
                              deleteConfirmDescription="Tem certeza que deseja cancelar este benefício?"
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {/* Totals */}
                  <TableRow className="bg-background-subtle font-semibold">
                    <TableCell className="text-xs" colSpan={3}>TOTAL ({filtered.filter(b => b.status === 'ATIVO').length} ativos)</TableCell>
                    <TableCell className="text-xs text-right text-destructive">
                      R$ {R(filtered.filter(b => b.status === 'ATIVO').reduce((s, b) => s + b.valor_empresa, 0))}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      R$ {R(filtered.filter(b => b.status === 'ATIVO').reduce((s, b) => s + b.valor_colaborador, 0))}
                    </TableCell>
                    <TableCell colSpan={canManage ? 3 : 2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
