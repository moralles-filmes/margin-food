import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { usePurchaseOrdersStoreContext } from '@/contexts/PurchaseOrdersStoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Calendar, Pencil, Trash2, Zap } from 'lucide-react';
import UserMentionSelect from '@/components/UserMentionSelect';
import { todayBR } from '@/lib/datetime';

import { useCan } from '@/permissions/hooks';
import { sortByName } from '@/lib/sortByName';
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const CATEGORIAS = ['Bebidas', 'Cozinha', 'Descartáveis', 'Embalagens', 'Hortifruti', 'Limpeza', 'Oriental', 'Peixe', 'Proteínas', 'Outros'];

interface Reminder {
  id: string;
  title: string;
  day_of_week: number;
  recurrence: string;
  active: boolean;
  type_default: string;
  category_ids: string[];
  item_ids: string[];
  supplier_id: string | null;
  payment_type: string | null;
  need_by_offset_days: number;
  delivery_forecast_offset_days: number | null;
  responsible_user_ids: string[];
  notes_template: string;
  created_by: string;
}

const emptyForm = {
  title: '',
  day_of_week: 0,
  type_default: 'FORNECEDOR',
  category_ids: [] as string[],
  item_ids: [] as string[],
  supplier_id: '',
  payment_type: '',
  need_by_offset_days: 0,
  responsible_user_id: '',
  notes_template: '',
  active: true,
};

export default function CalendarioLembretesView() {
  const supabase = useSupabase();
  const canViewRbac = useCan('compras:calendario:view');
  const { user } = useAuth();
  const { produtos } = useEstoqueGeralStoreContext();
  const salmonStore = useSalmonStoreContext();
  const purchaseStore = usePurchaseOrdersStoreContext();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    const { data } = await supabase
      .from('purchase_reminders')
      .select('id, title, day_of_week, recurrence, active, type_default, category_ids, item_ids, supplier_id, payment_type, need_by_offset_days, delivery_forecast_offset_days, responsible_user_ids, notes_template, created_by')
      .order('day_of_week', { ascending: true });
    setReminders((data || []) as unknown as Reminder[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (user) fetchReminders(); }, [user, fetchReminders]);

  const activeSuppliers = useMemo(() =>
    salmonStore.suppliers.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name)),
    [salmonStore.suppliers]
  );

  const handleSave = async () => {
    if (!user || !form.title.trim()) { toast.error('Preencha o título'); return; }

    const payload = {
      title: form.title,
      day_of_week: form.day_of_week,
      recurrence: 'WEEKLY',
      active: form.active,
      type_default: form.type_default,
      category_ids: form.category_ids,
      item_ids: form.item_ids,
      supplier_id: form.supplier_id || null,
      payment_type: form.payment_type || null,
      need_by_offset_days: form.need_by_offset_days,
      responsible_user_ids: form.responsible_user_id ? [form.responsible_user_id] : [],
      notes_template: form.notes_template,
      created_by: user.id,
      // W5: updated_at handled by server trigger
    };

    if (editingId) {
      const { error } = await supabase.from('purchase_reminders').update(payload).eq('id', editingId);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Lembrete atualizado!');
    } else {
      const { error } = await supabase.from('purchase_reminders').insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Lembrete criado!');
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    fetchReminders();
  };

  const handleDelete = async (id: string) => {
    // W4: Soft delete — set active=false instead of hard delete
    await supabase.from('purchase_reminders').update({ active: false }).eq('id', id);
    toast.success('Lembrete desativado');
    fetchReminders();
  };

  const handleEdit = (r: Reminder) => {
    setForm({
      title: r.title,
      day_of_week: r.day_of_week,
      type_default: r.type_default || 'FORNECEDOR',
      category_ids: r.category_ids || [],
      item_ids: (r.item_ids || []).map(String),
      supplier_id: r.supplier_id || '',
      payment_type: r.payment_type || '',
      need_by_offset_days: r.need_by_offset_days || 0,
      responsible_user_id: r.responsible_user_ids?.[0] || '',
      notes_template: r.notes_template || '',
      active: r.active,
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleGenerateOrder = async (r: Reminder) => {
    if (!user) return;
    setGenerating(r.id);
    try {
      // Gather items from categories + specific items
      const itemsToAdd: { stock_item_id: string; name_snapshot: string; unit_snapshot: string; estimated_unit_value: number; qty_requested: number; purchase_unit_snapshot: string; purchase_unit_cost_snapshot: number; conversion_factor_snapshot: number }[] = [];

      const relevantProducts = produtos.filter(p => {
        if (!p.ativo) return false;
        const inCategory = r.category_ids.length > 0 && r.category_ids.includes(p.categoria);
        const inItems = r.item_ids.length > 0 && r.item_ids.includes(p.id);
        return inCategory || inItems;
      });

      relevantProducts.forEach(p => {
        itemsToAdd.push({
          stock_item_id: p.id,
          name_snapshot: p.nomeProduto,
          unit_snapshot: p.unidadeMedida,
          estimated_unit_value: p.custoUltimaCompra || p.custoPadrao || 0,
          qty_requested: 1,
          purchase_unit_snapshot: p.unidadeCompra || p.unidadeMedida,
          purchase_unit_cost_snapshot: p.custoUltimaCompra || p.custoPadrao || 0,
          conversion_factor_snapshot: p.fatorConversaoPadrao || 1,
        });
      });

      if (itemsToAdd.length === 0) {
        toast.error('Nenhum item encontrado para as categorias/itens configurados');
        setGenerating(null);
        return;
      }

      const today = todayBR();
      const orderType = (r.type_default || 'FORNECEDOR') as 'FORNECEDOR' | 'MERCADO' | 'SAZONAL';
      const isMercadoSazonal = orderType === 'MERCADO' || orderType === 'SAZONAL';
      const result = await purchaseStore.createOrder({
        title: `${r.title} — ${today}`,
        type: orderType,
        priority: 'MEDIA',
        category: r.category_ids[0] || '',
        supplier_name: r.supplier_id || null,
        payment_type: r.payment_type || null,
        need_by_date: today,
        delivery_forecast_date: null,
        responsible_user_id: r.responsible_user_ids?.[0] || null,
        notes: r.notes_template || '',
        status: isMercadoSazonal ? 'PENDING' : 'OPEN',
        total_estimated: 0,
        origin: 'MANUAL',
        origin_ref: null,
      }, itemsToAdd);

      if (result) {
        toast.success(`Solicitação "${r.title}" gerada com ${itemsToAdd.length} itens!`);
      }
    } catch (err: any) {
      toast.error('Erro ao gerar solicitação: ' + err.message);
    }
    setGenerating(null);
  };

  const toggleCat = (cat: string) => {
    setForm(f => ({
      ...f,
      category_ids: f.category_ids.includes(cat) ? f.category_ids.filter(c => c !== cat) : [...f.category_ids, cat],
    }));
  };

  const toggleItem = (id: string) => {
    setForm(f => ({
      ...f,
      item_ids: f.item_ids.includes(id) ? f.item_ids.filter(i => i !== id) : [...f.item_ids, id],
    }));
  };

  // Group reminders by day
  const byDay = useMemo(() => {
    const map: Record<number, Reminder[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    reminders.forEach(r => { if (map[r.day_of_week]) map[r.day_of_week].push(r); });
    return map;
  }, [reminders]);

  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Calendário de Lembretes</p>
          <p className="text-[10px] text-muted-foreground">Lembretes recorrentes de compras por dia da semana</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
          <Plus className="w-3.5 h-3.5" /> Novo Lembrete
        </Button>
      </div>

      {reminders.length === 0 ? (
        <div className="bg-secondary/50 rounded-xl p-8 text-center">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Nenhum lembrete configurado</p>
          <Button size="sm" variant="outline" onClick={() => { setForm(emptyForm); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Criar primeiro lembrete
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {DIAS.map((dia, idx) => (
            <div key={dia} className={`rounded-xl border p-2.5 min-h-[120px] ${idx === todayIdx ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
              <p className={`text-[10px] font-bold mb-2 ${idx === todayIdx ? 'text-primary' : 'text-muted-foreground'}`}>
                {dia} {idx === todayIdx && <Badge variant="outline" className="text-[8px] ml-1 py-0">HOJE</Badge>}
              </p>
              <div className="space-y-1.5">
                {byDay[idx].map(r => (
                  <div key={r.id} className={`rounded-lg p-2 border text-[10px] ${r.active ? 'bg-secondary/60 border-border' : 'bg-muted/30 border-muted opacity-50'}`}>
                    <p className="font-semibold text-foreground truncate">{r.title}</p>
                    {r.category_ids.length > 0 && (
                      <p className="text-muted-foreground truncate">{r.category_ids.join(', ')}</p>
                    )}
                    <div className="flex gap-1 mt-1.5">
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleEdit(r)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-primary" disabled={generating === r.id}
                        onClick={() => handleGenerateOrder(r)} title="Gerar solicitação">
                        <Zap className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{editingId ? 'Editar Lembrete' : 'Novo Lembrete'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Pedido Salmão" className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dia da Semana</Label>
                <Select value={String(form.day_of_week)} onValueChange={v => setForm(f => ({ ...f, day_of_week: parseInt(v) }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo Padrão</Label>
                <Select value={form.type_default} onValueChange={v => setForm(f => ({ ...f, type_default: v }))}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
                    <SelectItem value="MERCADO">Mercado</SelectItem>
                    <SelectItem value="SAZONAL">Sazonal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Categorias (puxar itens automaticamente)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CATEGORIAS.map(cat => (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${form.category_ids.includes(cat) ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Itens específicos (opcional)</Label>
              <div className="max-h-32 overflow-y-auto border rounded-lg p-2 mt-1 space-y-1">
                {sortByName(produtos.filter(p => p.ativo), p => p.nomeProduto).slice(0, 50).map(p => (
                  <label key={p.id} className="flex items-start gap-2 text-[10px] cursor-pointer">
                    <input type="checkbox" checked={form.item_ids.includes(p.id)} onChange={() => toggleItem(p.id)} className="rounded mt-0.5 shrink-0" />
                    <span className="flex-1 min-w-0 break-words">{p.nomeProduto}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">{p.unidadeCompra || p.unidadeMedida}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Fornecedor (opcional)</Label>
              <SearchableSelect
                value={form.supplier_id}
                onValueChange={v => setForm(f => ({ ...f, supplier_id: v === '__none__' ? '' : v }))}
                options={[{ value: '__none__', label: 'Nenhum' }, ...activeSuppliers.map(s => ({ value: s.name, label: s.name }))]}
                placeholder="Selecione..."
                searchPlaceholder="Buscar fornecedor..."
                className="text-sm"
                modal
              />
            </div>

            <div>
              <Label className="text-xs">Responsável (menção)</Label>
              <UserMentionSelect value={form.responsible_user_id} onChange={v => setForm(f => ({ ...f, responsible_user_id: v }))} />
            </div>

            <div>
              <Label className="text-xs">Observação padrão</Label>
              <Textarea value={form.notes_template} onChange={e => setForm(f => ({ ...f, notes_template: e.target.value }))}
                className="text-sm" rows={2} placeholder="Observações para o pedido gerado" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>{editingId ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
