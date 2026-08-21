import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { emitDataEvent } from '@/lib/dataEvents';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import TableActions from '@/components/ui/TableActions';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';

import { useCan } from '@/permissions/hooks';
interface CategoriaRow {
  id: string;
  nome: string;
  tipo: string;
  grupo: string | null;
  linha_dre: string | null;
  centro_custo_padrao_id: string | null;
  updated_at: string;
}

interface CentroRef {
  id: string;
  nome: string;
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export default function CategoriasFinSection({
 canCreate, canEdit, canDelete }: Props) {
  const canViewRbac = useCan('financeiro:cadastros:view');
  const { user, profile } = useAuth();
  const [items, setItems] = useState<CategoriaRow[]>([]);
  const [centros, setCentros] = useState<CentroRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', tipo: 'despesa', grupo: '', linha_dre: '', centro_custo_padrao_id: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [catRes, ccRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, grupo, linha_dre, centro_custo_padrao_id, updated_at').eq('ativo', true).eq('company_id', profile?.company_id ?? '').order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).eq('company_id', profile?.company_id ?? '').order('nome'),
    ]);
    setItems((catRes.data || []) as CategoriaRow[]);
    setCentros((ccRes.data || []) as CentroRef[]);
    setLoading(false);
  };

  const openEdit = (item: CategoriaRow) => {
    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setForm({ nome: item.nome, tipo: item.tipo, grupo: item.grupo || '', linha_dre: item.linha_dre || '', centro_custo_padrao_id: item.centro_custo_padrao_id || '' });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({ nome: '', tipo: 'despesa', grupo: '', linha_dre: '', centro_custo_padrao_id: '' });
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const save = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    const payload = { ...form, centro_custo_padrao_id: form.centro_custo_padrao_id || null };
    if (editId) {
      const { error } = await (supabase.rpc as any)('_guarded_update_categoria', {
        p_id: editId,
        p_nome: form.nome,
        p_tipo: form.tipo,
        p_grupo: form.grupo || '',
        p_linha_dre: form.linha_dre || '',
        p_centro_custo_padrao_id: form.centro_custo_padrao_id || null,
        p_expected_updated_at: editUpdatedAt
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Categoria atualizada');
    } else {
      const { error } = await supabase.from('fin_categorias').insert({ ...payload, created_by: user?.id, company_id: profile?.company_id });
      if (error) { toast.error(error.message); return; }
      toast.success('Categoria criada');
    }
    handleCloseForm();
    load();
    emitDataEvent('financeiro:cadastros');
  };

  const remove = async (id: string) => {
    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_categoria', { p_id: id });
      if (error) throw error;
      toast.success('Categoria removida');
      load();
      emitDataEvent('financeiro:cadastros');
    } catch (err: unknown) {
      console.error('[CategoriasFinSection.remove]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  const centroNome = (id: string) => centros.find(c => c.id === id)?.nome || '—';

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Categorias Financeiras</h3>
        {canCreate && <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); else setShowForm(true); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Categoria</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div><Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Grupo</Label><Input value={form.grupo} onChange={e => setForm({...form, grupo: e.target.value})} placeholder="Ex: alimentação, impostos, marketing" /></div>
              <div><Label>Linha DRE</Label><Input value={form.linha_dre} onChange={e => setForm({...form, linha_dre: e.target.value})} placeholder="Ex: Despesas Operacionais" /></div>
              <div><Label>Centro de Custo Padrão</Label>
                <Select value={form.centro_custo_padrao_id} onValueChange={v => setForm({...form, centro_custo_padrao_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Nenhum (manual)" /></SelectTrigger>
                  <SelectContent>
                    {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Preenchido automaticamente ao usar esta categoria no rateio</p>
              </div>
              <Button onClick={save} className="w-full">{editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </DialogContent>
        </Dialog>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead>Linha DRE</TableHead>
            <TableHead>CC Padrão</TableHead>
            <TableHead className="w-20">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma categoria cadastrada</TableCell></TableRow>
          ) : items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.nome}</TableCell>
              <TableCell><Badge variant={item.tipo === 'receita' ? 'default' : 'secondary'}>{item.tipo}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{item.grupo || '—'}</TableCell>
              <TableCell className="text-muted-foreground">{item.linha_dre || '—'}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{item.centro_custo_padrao_id ? centroNome(item.centro_custo_padrao_id) : '—'}</TableCell>
              <TableCell>
                <TableActions
                  canEditOverride={canEdit}
                  canDeleteOverride={canDelete}
                  onEdit={() => openEdit(item)}
                  onDelete={() => remove(item.id)}
                  deleteConfirmTitle="Remover Categoria"
                  deleteConfirmDescription={`Tem certeza que deseja remover a categoria "${item.nome}"?`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
