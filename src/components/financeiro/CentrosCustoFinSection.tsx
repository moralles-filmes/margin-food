import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { emitDataEvent } from '@/lib/dataEvents';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, X } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';

interface CentroRow {
  id: string;
  nome: string;
  descricao: string | null;
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export default function CentrosCustoFinSection({ canCreate, canEdit, canDelete }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<CentroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', descricao: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('fin_centros_custo').select('id, nome, descricao').eq('ativo', true).order('nome');
    setItems((data || []) as CentroRow[]);
    setLoading(false);
  };

  const openEdit = (item: CentroRow) => {
    setEditId(item.id);
    setForm({ nome: item.nome, descricao: item.descricao || '' });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditId(null);
    setForm({ nome: '', descricao: '' });
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const save = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    if (editId) {
      const { error } = await supabase.from('fin_centros_custo').update({ ...form }).eq('id', editId);
      if (error) { toast.error(error.message); return; }
      toast.success('Centro de custo atualizado');
    } else {
      const { error } = await supabase.from('fin_centros_custo').insert({ ...form, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Centro de custo criado');
    }
    handleCloseForm();
    load();
    emitDataEvent('financeiro:cadastros');
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('fin_centros_custo').update({ ativo: false }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Centro de custo removido');
    load();
    emitDataEvent('financeiro:cadastros');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Centros de Custo</h3>
        {canCreate && <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); else setShowForm(true); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Centro</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>{editId ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</DialogTitle>
                <button type="button" onClick={guardedClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} /></div>
              <Button onClick={save} className="w-full">{editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </DialogContent>
        </Dialog>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="w-20">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhum centro de custo</TableCell></TableRow>
          ) : items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.nome}</TableCell>
              <TableCell className="text-muted-foreground">{item.descricao || '—'}</TableCell>
              <TableCell>
                 <div className="flex gap-1">
                   {canEdit && <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Edit className="w-4 h-4" /></Button>}
                   {canDelete && <Button size="icon" variant="ghost" onClick={() => remove(item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                 </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
