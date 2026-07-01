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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Megaphone, Plus, Pin, Trash2, Edit2, AlertTriangle,
  Info, Bell, Star, Eye, Calendar
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { useCan } from '@/permissions/hooks';
interface Props {
  canManage: boolean;
}

const TIPOS = [
  { value: 'aviso', label: 'Aviso', icon: Bell, color: 'text-primary' },
  { value: 'urgente', label: 'Urgente', icon: AlertTriangle, color: 'text-destructive' },
  { value: 'informativo', label: 'Informativo', icon: Info, color: 'text-muted-foreground' },
  { value: 'destaque', label: 'Destaque', icon: Star, color: 'text-warning' },
  { value: 'evento', label: 'Evento', icon: Calendar, color: 'text-success' },
];

const PRIORIDADES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  baixa: { label: 'Baixa', variant: 'outline' },
  normal: { label: 'Normal', variant: 'secondary' },
  alta: { label: 'Alta', variant: 'default' },
  urgente: { label: 'Urgente', variant: 'destructive' },
};

const SETORES = ['cozinha', 'sushi', 'limpeza', 'salao', 'copa'];
const SETOR_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};

export default function ComunicacaoInternaSection({
 canManage }: Props) {
  const canViewRbac = useCan('rh:mural:view');
  const { user } = useAuth();
  const [comunicados, setComunicados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTipo, setFilterTipo] = useState<string>('todos');

  const emptyForm = {
    titulo: '', conteudo: '', tipo: 'aviso', prioridade: 'normal',
    setores_alvo: [] as string[], fixado: false, data_expiracao: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    const { data, error } = await supabase
      .from('rh_comunicados')
      .select('id, titulo, conteudo, tipo, prioridade, setores_alvo, fixado, data_expiracao, autor_id, autor_nome, ativo, created_at')
      .eq('ativo', true)
      .order('fixado', { ascending: false })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (error) console.error(error);
    const newItems = data || [];
    if (append) {
      setComunicados(prev => [...prev, ...newItems]);
    } else {
      setComunicados(newItems);
    }
    setHasMore(newItems.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (saving) return;
    if (!form.titulo.trim() || !form.conteudo.trim()) {
      toast.error('Título e conteúdo são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo,
        conteudo: form.conteudo,
        tipo: form.tipo,
        prioridade: form.prioridade,
        setores_alvo: form.setores_alvo,
        fixado: form.fixado,
        data_expiracao: form.data_expiracao || null,
      };

      if (editingId) {
        const { error } = await supabase.from('rh_comunicados').update(payload).eq('id', editingId);
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Comunicado atualizado!');
      } else {
        const { error } = await supabase.from('rh_comunicados').insert({
          ...payload, autor_id: user?.id, autor_nome: user?.email?.split('@')[0] || '',
        });
        if (error) { toast.error('Erro: ' + error.message); return; }
        toast.success('Comunicado publicado!');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setPage(0);
      fetchData(0);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: any) => {
    setForm({
      titulo: c.titulo, conteudo: c.conteudo, tipo: c.tipo,
      prioridade: c.prioridade, setores_alvo: c.setores_alvo || [],
      fixado: c.fixado, data_expiracao: c.data_expiracao || '',
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rh_comunicados').update({ ativo: false }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Comunicado removido!');
    fetchData();
  };

  const handleTogglePin = async (id: string, currentPin: boolean) => {
    const { error } = await supabase.from('rh_comunicados').update({ fixado: !currentPin }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(currentPin ? 'Desfixado!' : 'Fixado!');
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filtered = comunicados.filter(c => {
    if (filterTipo !== 'todos' && c.tipo !== filterTipo) return false;
    return true;
  });

  const fixados = filtered.filter(c => c.fixado);
  const naoFixados = filtered.filter(c => !c.fixado);

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="Filtrar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} comunicado(s)</span>
        </div>
        {canManage && (
          <Dialog open={showForm} onOpenChange={o => { setShowForm(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Novo Comunicado</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? 'Editar' : 'Novo'} Comunicado</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Título *</Label>
                  <Input className="h-8 text-xs" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Conteúdo *</Label>
                  <Textarea className="text-xs" rows={4} value={form.conteudo} onChange={e => setForm(p => ({ ...p, conteudo: e.target.value }))} />
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
                    <Label className="text-xs">Prioridade</Label>
                    <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORIDADES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Setores Alvo (vazio = todos)</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SETORES.map(s => (
                      <label key={s} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={form.setores_alvo.includes(s)}
                          onCheckedChange={checked => {
                            setForm(p => ({
                              ...p,
                              setores_alvo: checked
                                ? [...p.setores_alvo, s]
                                : p.setores_alvo.filter(x => x !== s),
                            }));
                          }}
                        />
                        {SETOR_LABELS[s]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Expiração (opcional)</Label>
                    <Input type="date" className="h-8 text-xs" value={form.data_expiracao} onChange={e => setForm(p => ({ ...p, data_expiracao: e.target.value }))} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={form.fixado} onCheckedChange={c => setForm(p => ({ ...p, fixado: !!c }))} />
                      <Pin className="w-3 h-3" /> Fixar no topo
                    </label>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Salvando...' : editingId ? 'Salvar' : 'Publicar'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Mural */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhum comunicado publicado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Pinned */}
          {fixados.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Pin className="w-3 h-3" /> Fixados</p>
              {fixados.map(c => <ComunicadoCard key={c.id} comunicado={c} canManage={canManage} onEdit={handleEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />)}
            </div>
          )}
          {/* Regular */}
          {naoFixados.length > 0 && (
            <div className="space-y-2">
              {fixados.length > 0 && <p className="text-xs font-medium text-muted-foreground mt-4">Recentes</p>}
              {naoFixados.map(c => <ComunicadoCard key={c.id} comunicado={c} canManage={canManage} onEdit={handleEdit} onDelete={handleDelete} onTogglePin={handleTogglePin} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComunicadoCard({ comunicado: c, canManage, onEdit, onDelete, onTogglePin }: any) {
  const tipoConfig = TIPOS.find(t => t.value === c.tipo) || TIPOS[0];
  const Icon = tipoConfig.icon;
  const prioConfig = PRIORIDADES[c.prioridade] || PRIORIDADES.normal;
  const expirado = c.data_expiracao && differenceInDays(parseISO(c.data_expiracao), new Date()) < 0;

  return (
    <Card className={cn(
      "transition-shadow hover:shadow-md",
      c.fixado && "border-primary/30 bg-primary/5",
      c.prioridade === 'urgente' && "border-destructive/40",
      expirado && "opacity-60",
    )}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5", tipoConfig.color)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">{c.titulo}</h3>
              {c.fixado && <Pin className="w-3 h-3 text-primary" />}
              <Badge variant={prioConfig.variant} className="text-[10px]">{prioConfig.label}</Badge>
              {c.setores_alvo?.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {c.setores_alvo.map((s: string) => SETOR_LABELS[s] || s).join(', ')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.conteudo}</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{format(parseISO(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              {c.autor_nome && <span>por {c.autor_nome}</span>}
              {c.data_expiracao && (
                <span className={cn(expirado && "text-destructive")}>
                  {expirado ? 'Expirado' : `Expira ${format(parseISO(c.data_expiracao), 'dd/MM/yy')}`}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onTogglePin(c.id, c.fixado)} title={c.fixado ? 'Desfixar' : 'Fixar'}>
                <Pin className={cn("w-3 h-3", c.fixado && "text-primary")} />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(c)}>
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDelete(c.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
