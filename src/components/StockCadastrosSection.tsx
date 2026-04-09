import { useState, useEffect, useCallback } from 'react';
import { Tag, MapPin, Plus, Edit2, Power, PowerOff, Trash2, Check, X, Loader2 } from 'lucide-react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface StockCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

interface StockLocation {
  id: string;
  name: string;
  type: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const LOCATION_TYPES = [
  { value: 'seco', label: 'Seco' },
  { value: 'refrigerado', label: 'Refrigerado' },
  { value: 'congelado', label: 'Congelado' },
  { value: 'bar', label: 'Bar' },
  { value: 'producao', label: 'Produção' },
];

export default function StockCadastrosSection() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState('categorias');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Categories state
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [catDialog, setCatDialog] = useState(false);
  const [editCat, setEditCat] = useState<StockCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [savingCat, setSavingCat] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [locDialog, setLocDialog] = useState(false);
  const [editLoc, setEditLoc] = useState<StockLocation | null>(null);
  const [locForm, setLocForm] = useState({ name: '', type: '', notes: '' });
  const [savingLoc, setSavingLoc] = useState(false);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    setLoadingCat(true);
    const { data } = await supabase
      .from('stock_categories')
      .select('id, name, description, is_active, sort_order, created_at')
      .eq('company_id', profile?.company_id ?? '')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    setCategories((data as StockCategory[]) || []);
    setLoadingCat(false);
  }, []);

  // Fetch locations
  const fetchLocations = useCallback(async () => {
    setLoadingLoc(true);
    const { data } = await supabase
      .from('stock_locations')
      .select('id, name, type, notes, is_active, created_at')
      .eq('company_id', profile?.company_id ?? '')
      .order('name', { ascending: true });
    setLocations((data as StockLocation[]) || []);
    setLoadingLoc(false);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchLocations();
  }, [fetchCategories, fetchLocations]);

  // ── Categories CRUD ──
  const openCatDialog = (cat?: StockCategory) => {
    if (cat) {
      setEditCat(cat);
      setCatForm({ name: cat.name, description: cat.description || '' });
    } else {
      setEditCat(null);
      setCatForm({ name: '', description: '' });
    }
    setCatDialog(true);
  };

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingCat(true);
    try {
      if (editCat) {
        const { error } = await supabase
          .from('stock_categories')
          .update({ name: catForm.name.trim(), description: catForm.description || null })
          .eq('id', editCat.id);
        if (error) throw error;
        // Audit log
        await supabase.from('audit_log').insert({
          acao: 'UPDATE_CATEGORY', tabela: 'stock_categories', registro_id: editCat.id,
          user_id: user?.id, valor_anterior: editCat.name, valor_novo: catForm.name.trim(),
        });
        toast.success('Categoria atualizada!');
      } else {
        // Auto sort_order: max + 1
        const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
        const { data, error } = await supabase
          .from('stock_categories')
          .insert({ name: catForm.name.trim(), description: catForm.description || null, sort_order: maxOrder + 1, created_by: user?.id, company_id: profile?.company_id })
          .select('id')
          .single();
        if (error) throw error;
        await supabase.from('audit_log').insert({
          acao: 'CREATE_CATEGORY', tabela: 'stock_categories', registro_id: data.id,
          user_id: user?.id, valor_novo: catForm.name.trim(),
        });
        toast.success('Categoria criada!');
      }
      setCatDialog(false);
      fetchCategories();
    } catch (e: any) {
      if (e?.message?.includes('stock_categories_name_unique')) {
        toast.error('Já existe uma categoria com esse nome');
      } else {
        toast.error(e?.message || 'Erro ao salvar categoria');
      }
    }
    setSavingCat(false);
  };

  const toggleCatActive = async (cat: StockCategory) => {
    const newActive = !cat.is_active;
    const { error } = await supabase.from('stock_categories').update({ is_active: newActive }).eq('id', cat.id);
    if (error) { toast.error('Erro ao alterar status'); return; }
    await supabase.from('audit_log').insert({
      acao: newActive ? 'ACTIVATE_CATEGORY' : 'INACTIVATE_CATEGORY', tabela: 'stock_categories', registro_id: cat.id,
      user_id: user?.id, valor_anterior: String(!newActive), valor_novo: String(newActive),
    });
    toast.success(newActive ? 'Categoria ativada' : 'Categoria inativada');
    fetchCategories();
  };

  // ── Locations CRUD ──
  const openLocDialog = (loc?: StockLocation) => {
    if (loc) {
      setEditLoc(loc);
      setLocForm({ name: loc.name, type: loc.type || '', notes: loc.notes || '' });
    } else {
      setEditLoc(null);
      setLocForm({ name: '', type: '', notes: '' });
    }
    setLocDialog(true);
  };

  const handleSaveLoc = async () => {
    if (!locForm.name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingLoc(true);
    try {
      if (editLoc) {
        const { error } = await supabase
          .from('stock_locations')
          .update({ name: locForm.name.trim(), type: locForm.type || null, notes: locForm.notes || null })
          .eq('id', editLoc.id);
        if (error) throw error;
        await supabase.from('audit_log').insert({
          acao: 'UPDATE_LOCATION', tabela: 'stock_locations', registro_id: editLoc.id,
          user_id: user?.id, valor_anterior: editLoc.name, valor_novo: locForm.name.trim(),
        });
        toast.success('Local atualizado!');
      } else {
        const { data, error } = await supabase
          .from('stock_locations')
          .insert({ name: locForm.name.trim(), type: locForm.type || null, notes: locForm.notes || null, created_by: user?.id, company_id: profile?.company_id })
          .select('id')
          .single();
        if (error) throw error;
        await supabase.from('audit_log').insert({
          acao: 'CREATE_LOCATION', tabela: 'stock_locations', registro_id: data.id,
          user_id: user?.id, valor_novo: locForm.name.trim(),
        });
        toast.success('Local criado!');
      }
      setLocDialog(false);
      fetchLocations();
    } catch (e: any) {
      if (e?.message?.includes('stock_locations_name_unique')) {
        toast.error('Já existe um local com esse nome');
      } else {
        toast.error(e?.message || 'Erro ao salvar local');
      }
    }
    setSavingLoc(false);
  };

  const toggleLocActive = async (loc: StockLocation) => {
    const newActive = !loc.is_active;
    const { error } = await supabase.from('stock_locations').update({ is_active: newActive }).eq('id', loc.id);
    if (error) { toast.error('Erro ao alterar status'); return; }
    await supabase.from('audit_log').insert({
      acao: newActive ? 'ACTIVATE_LOCATION' : 'INACTIVATE_LOCATION', tabela: 'stock_locations', registro_id: loc.id,
      user_id: user?.id, valor_anterior: String(!newActive), valor_novo: String(newActive),
    });
    toast.success(newActive ? 'Local ativado' : 'Local inativado');
    fetchLocations();
  };

  const deleteCat = async (cat: StockCategory) => {
    const ok = await confirm({ title: 'Excluir categoria', description: `Tem certeza que deseja excluir "${cat.name}"? Se houver produtos vinculados, prefira inativar.`, confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    const { error } = await supabase.from('stock_categories').delete().eq('id', cat.id);
    if (error) {
      if (error.message?.includes('violates foreign key') || error.code === '23503') {
        toast.error('Categoria em uso. Inative-a em vez de excluir.');
      } else {
        toast.error(error.message || 'Erro ao excluir');
      }
      return;
    }
    await supabase.from('audit_log').insert({
      acao: 'DELETE_CATEGORY', tabela: 'stock_categories', registro_id: cat.id,
      user_id: user?.id, valor_anterior: cat.name,
    });
    toast.success('Categoria excluída');
    fetchCategories();
  };

  const deleteLoc = async (loc: StockLocation) => {
    const ok = await confirm({ title: 'Excluir local', description: `Tem certeza que deseja excluir "${loc.name}"? Se houver produtos vinculados, prefira inativar.`, confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    const { error } = await supabase.from('stock_locations').delete().eq('id', loc.id);
    if (error) {
      if (error.message?.includes('violates foreign key') || error.code === '23503') {
        toast.error('Local em uso. Inative-o em vez de excluir.');
      } else {
        toast.error(error.message || 'Erro ao excluir');
      }
      return;
    }
    await supabase.from('audit_log').insert({
      acao: 'DELETE_LOCATION', tabela: 'stock_locations', registro_id: loc.id,
      user_id: user?.id, valor_anterior: loc.name,
    });
    toast.success('Local excluído');
    fetchLocations();
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="categorias" className="flex-1 gap-1.5 text-xs">
            <Tag className="w-3.5 h-3.5" /> Categorias
          </TabsTrigger>
          <TabsTrigger value="locais" className="flex-1 gap-1.5 text-xs">
            <MapPin className="w-3.5 h-3.5" /> Locais
          </TabsTrigger>
        </TabsList>

        {/* ── CATEGORIAS ── */}
        <TabsContent value="categorias" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Categorias de Estoque</p>
            <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs" onClick={() => openCatDialog()}>
              <Plus className="w-3.5 h-3.5" /> Nova Categoria
            </Button>
          </div>

          {loadingCat ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Tag className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhuma categoria cadastrada</p>
              <p className="text-xs text-muted-foreground">Crie categorias para organizar seus produtos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className={`bg-card border rounded-xl p-3 flex items-center justify-between ${cat.is_active ? 'border-border' : 'border-border/50 opacity-80'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{cat.name}</p>
                      {!cat.is_active && <Badge variant="outline" className="text-[9px] h-4">Inativa</Badge>}
                      {cat.sort_order > 0 && <span className="text-[9px] text-muted-foreground">#{cat.sort_order}</span>}
                    </div>
                    {cat.description && <p className="text-[11px] text-muted-foreground mt-0.5">{cat.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openCatDialog(cat)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleCatActive(cat)} className={`p-1.5 rounded-lg ${cat.is_active ? 'text-warning hover:bg-warning/10' : 'text-success hover:bg-success/10'}`}>
                      {cat.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteCat(cat)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── LOCAIS ── */}
        <TabsContent value="locais" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Locais de Armazenagem</p>
            <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs" onClick={() => openLocDialog()}>
              <Plus className="w-3.5 h-3.5" /> Novo Local
            </Button>
          </div>

          {loadingLoc ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : locations.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <MapPin className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm font-medium text-foreground">Nenhum local cadastrado</p>
              <p className="text-xs text-muted-foreground">Crie locais de armazenagem para seus produtos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map(loc => (
                <div key={loc.id} className={`bg-card border rounded-xl p-3 flex items-center justify-between ${loc.is_active ? 'border-border' : 'border-border/50 opacity-80'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{loc.name}</p>
                      {loc.type && (
                        <Badge variant="secondary" className="text-[9px] h-4 capitalize">{loc.type}</Badge>
                      )}
                      {!loc.is_active && <Badge variant="outline" className="text-[9px] h-4">Inativo</Badge>}
                    </div>
                    {loc.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{loc.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openLocDialog(loc)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleLocActive(loc)} className={`p-1.5 rounded-lg ${loc.is_active ? 'text-warning hover:bg-warning/10' : 'text-success hover:bg-success/10'}`}>
                      {loc.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteLoc(loc)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editCat ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            <DialogDescription>Preencha os dados da categoria de estoque.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Bebidas" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" className="bg-secondary border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCat} disabled={savingCat} className="gradient-salmon text-primary-foreground border-0">
              {savingCat ? <Loader2 className="w-4 h-4 animate-spin" /> : editCat ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={locDialog} onOpenChange={setLocDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editLoc ? 'Editar Local' : 'Novo Local'}</DialogTitle>
            <DialogDescription>Preencha os dados do local de armazenagem.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Câmara Fria" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={locForm.type} onValueChange={v => setLocForm(f => ({ ...f, type: v === '_none' ? '' : v }))}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {LOCATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Observação</Label>
              <Input value={locForm.notes} onChange={e => setLocForm(f => ({ ...f, notes: e.target.value }))} placeholder="Opcional" className="bg-secondary border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLocDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveLoc} disabled={savingLoc} className="gradient-salmon text-primary-foreground border-0">
              {savingLoc ? <Loader2 className="w-4 h-4 animate-spin" /> : editLoc ? 'Atualizar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
