import { useCompanyId } from '@/hooks/useCompanyId';
import { mensagemCadastroDuplicado } from '@/domain/financeiro/cadastros';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';
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
interface PlanoContaRow {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  linha_dre: string | null;
  updated_at: string;
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export default function PlanoContasFinSection({
 canCreate, canEdit, canDelete }: Props) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('financeiro:cadastros:view');
  const { user } = useAuth();
  const [items, setItems] = useState<PlanoContaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: '', nome: '', tipo: 'despesa', natureza: 'operacional', linha_dre: '' });
  const [saving, setSaving] = useState(false);
  // Trava síncrona: sem ela, dois cliques em "Salvar" gravavam duas contas.
  const salvandoRef = useRef(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('fin_plano_contas').select('id, codigo, nome, tipo, natureza, linha_dre, updated_at').eq('ativo', true).order('codigo');
    setItems((data || []) as PlanoContaRow[]);
    setLoading(false);
  };

  const openEdit = (item: PlanoContaRow) => {
    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setForm({ codigo: item.codigo, nome: item.nome, tipo: item.tipo, natureza: item.natureza, linha_dre: item.linha_dre || '' });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({ codigo: '', nome: '', tipo: 'despesa', natureza: 'operacional', linha_dre: '' });
    setShowForm(false);
  };

  const { showConfirm, guardedClose, confirmClose, cancelClose } =
    useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const falhaAoSalvar = (error: { message?: string }) => {
    console.error('[PlanoContasFinSection.save]', error);
    const duplicado = mensagemCadastroDuplicado(error.message);
    toast.error(duplicado ?? error.message ?? 'Erro ao salvar conta');
    // O que já existe (inclusive um envio anterior sem resposta) aparece na lista.
    if (duplicado) load();
  };

  const save = async () => {
    if (salvandoRef.current) return;
    if (!form.codigo.trim() || !form.nome.trim()) { toast.error('Código e nome obrigatórios'); return; }
    salvandoRef.current = true;
    setSaving(true);
    try {
      if (editId) {
        const { error } = await (supabase.rpc as any)('_guarded_update_plano_contas', {
          p_id: editId,
          p_codigo: form.codigo,
          p_nome: form.nome,
          p_tipo: form.tipo,
          p_natureza: form.natureza,
          p_linha_dre: form.linha_dre || '',
          p_expected_updated_at: editUpdatedAt
        });
        if (error) { falhaAoSalvar(error); return; }
        toast.success('Conta atualizada');
      } else {
        const { error } = await supabase.from('fin_plano_contas').insert(withCompanyId(companyId, { ...form, created_by: user?.id }));
        if (error) { falhaAoSalvar(error); return; }
        toast.success('Conta criada');
      }
      handleCloseForm();
      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_plano_contas', { p_id: id });
      if (error) throw error;
      toast.success('Conta removida');
      load();
      emitDataEvent('financeiro:cadastros');
    } catch (err: unknown) {
      console.error('[PlanoContasFinSection.remove]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Plano de Contas</h3>
        {canCreate && <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); else setShowForm(true); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Conta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Conta' : 'Nova Conta Contábil'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} placeholder="Ex: 1.1.01" /></div>
              <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div><Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="passivo">Passivo</SelectItem>
                    <SelectItem value="patrimonio">Patrimônio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Natureza</Label>
                <Select value={form.natureza} onValueChange={v => setForm({...form, natureza: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operacional">Operacional</SelectItem>
                    <SelectItem value="financeira">Financeira</SelectItem>
                    <SelectItem value="nao_operacional">Não Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Linha DRE</Label><Input value={form.linha_dre} onChange={e => setForm({...form, linha_dre: e.target.value})} /></div>
              <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Salvando...' : editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </DialogContent>
        </Dialog>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Natureza</TableHead>
            <TableHead className="w-20">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada</TableCell></TableRow>
          ) : items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
              <TableCell className="font-medium">{item.nome}</TableCell>
              <TableCell><Badge variant="outline">{item.tipo}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{item.natureza}</TableCell>
              <TableCell>
                <TableActions
                  canEditOverride={canEdit}
                  canDeleteOverride={canDelete}
                  onEdit={() => openEdit(item)}
                  onDelete={() => remove(item.id)}
                  deleteConfirmTitle="Remover do Plano de Contas"
                  deleteConfirmDescription={`Tem certeza que deseja remover a conta "${item.nome}"?`}
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
