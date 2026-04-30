import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Bug, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateBR } from '@/lib/formatters';

const MODULES = ['estoque','financeiro','compras','auth','relatorios','admin','edge','rh','planning','salmon','ficha_tecnica','geral'] as const;
const SEVERITIES = ['low','medium','high','critical'] as const;
const STATUSES = ['open','in_progress','fixed','validated'] as const;

type SystemBug = {
  id: string;
  title: string;
  description: string;
  module: string;
  severity: string;
  status: string;
  company_id: string;
  created_at: string;
  created_by: string;
  fixed_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  notes: string | null;
  updated_at: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-destructive/10 text-destructive',
  in_progress: 'bg-blue-500/10 text-blue-600',
  fixed: 'bg-emerald-500/10 text-emerald-600',
  validated: 'bg-primary/10 text-primary',
};

export default function BugTrackerView() {
  const { user } = useAuth();
  const [bugs, setBugs] = useState<SystemBug[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBug, setEditingBug] = useState<SystemBug | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [form, setForm] = useState({
    title: '',
    description: '',
    module: 'geral' as string,
    severity: 'medium' as string,
    status: 'open' as string,
    notes: '',
  });

  const fetchBugs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_bugs')
      .select('id, title, description, module, severity, status, company_id, created_at, created_by, fixed_at, validated_at, validated_by, notes, updated_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar bugs: ' + error.message);
    } else {
      setBugs((data ?? []) as SystemBug[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchBugs(); }, []);

  const openNew = () => {
    setEditingBug(null);
    setForm({ title: '', description: '', module: 'geral', severity: 'medium', status: 'open', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (bug: SystemBug) => {
    setEditingBug(bug);
    setForm({
      title: bug.title,
      description: bug.description,
      module: bug.module,
      severity: bug.severity,
      status: bug.status,
      notes: bug.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Título obrigatório'); return; }
    setSaving(true);

    if (editingBug) {
      const updates: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        module: form.module,
        severity: form.severity,
        status: form.status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (form.status === 'fixed' && editingBug.status !== 'fixed') {
        updates.fixed_at = new Date().toISOString();
      }
      if (form.status === 'validated' && editingBug.status !== 'validated') {
        updates.validated_at = new Date().toISOString();
        updates.validated_by = user?.id;
      }

      const { error } = await supabase
        .from('system_bugs')
        .update(updates)
        .eq('id', editingBug.id);
      if (error) toast.error('Erro: ' + error.message);
      else { toast.success('Bug atualizado'); setDialogOpen(false); fetchBugs(); }
    } else {
      const { error } = await supabase
        .from('system_bugs')
        .insert({
          title: form.title,
          description: form.description,
          module: form.module,
          severity: form.severity,
          status: form.status,
          notes: form.notes || null,
          created_by: user?.id,
        });
      if (error) toast.error('Erro: ' + error.message);
      else { toast.success('Bug registrado'); setDialogOpen(false); fetchBugs(); }
    }
    setSaving(false);
  };

  const filtered = bugs.filter(b =>
    (filterModule === 'all' || b.module === filterModule) &&
    (filterStatus === 'all' || b.status === filterStatus)
  );

  const criticalOpen = bugs.filter(b => b.severity === 'critical' && (b.status === 'open' || b.status === 'in_progress')).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Bug className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Bug Tracker</h2>
          {criticalOpen > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" /> {criticalOpen} crítico{criticalOpen > 1 ? 's' : ''} aberto{criticalOpen > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openNew}>
          <Plus className="w-3 h-3" /> Registrar Bug
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos módulos</SelectItem>
            {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center ml-2">{filtered.length} bug{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum bug encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(bug => (
            <Card key={bug.id} className={`cursor-pointer hover:border-primary/30 transition-colors ${bug.severity === 'critical' ? 'border-destructive/30' : ''}`} onClick={() => openEdit(bug)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{bug.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SEVERITY_COLORS[bug.severity]}`}>
                        {bug.severity}
                      </Badge>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[bug.status]}`}>
                        {bug.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{bug.module}</span>
                      <span>{formatDateBR(new Date(bug.created_at))}</span>
                      {bug.notes && <span className="truncate max-w-40">📝 {bug.notes}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingBug ? 'Editar Bug' : 'Registrar Bug'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input className="h-8 text-sm" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Descrição curta do bug" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea className="text-sm min-h-[60px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Passos para reproduzir, contexto..." />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Módulo</Label>
                <Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severidade</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Textarea className="text-sm min-h-[40px]" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas internas, workarounds..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingBug ? 'Salvar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function useCriticalBugCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    supabase
      .from('system_bugs')
      .select('id', { count: 'exact', head: true })
      .in('severity', ['critical'])
      .in('status', ['open', 'in_progress'])
      .then(({ count: c }) => setCount(c ?? 0));
  }, []);
  return count;
}
