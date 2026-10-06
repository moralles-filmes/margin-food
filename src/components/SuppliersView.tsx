import { useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import type { SuppliersStore } from '@/hooks/useSuppliers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRLInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Building2, Check, X } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Supplier } from '@/types/salmon';
import { useCan } from '@/permissions/hooks';
import { SUPPLIER_KEYS_COMPRAS, type SupplierPermissionKeys } from '@/domain/compras/fornecedores';

interface SuppliersViewProps {
  store: Pick<SuppliersStore, 'suppliers' | 'addSupplier' | 'updateSupplier' | 'deleteSupplier'> & { loading?: boolean };
  permissionKeys?: SupplierPermissionKeys;
}

const emptyForm = { name: '', cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [] as string[], prazoEntregaPadrao: 0, formaPagamentoPadrao: '', pedidoMinimoValor: 0, pedidoMinimoQtd: 0, whatsappNumber: '' };

export default function SuppliersView({ store, permissionKeys = SUPPLIER_KEYS_COMPRAS }: SuppliersViewProps) {
  const toast = useScopedToast();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, loading = false } = store;
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { enviando, executar } = useTravaEnvio();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canCreate = useCan(permissionKeys.create);
  const canEdit = useCan(permissionKeys.edit);
  const canDelete = useCan(permissionKeys.delete);

  const startEdit = (s: Supplier) => {
    if (!canEdit) { toast.error('Sem permissão para editar fornecedores'); return; }
    setEditId(s.id);
    setForm({ name: s.name, cnpj: s.cnpj, contact: s.contact, notes: s.notes, active: s.active, categoriasAtendidas: s.categoriasAtendidas || [], prazoEntregaPadrao: s.prazoEntregaPadrao || 0, formaPagamentoPadrao: s.formaPagamentoPadrao || '', pedidoMinimoValor: s.pedidoMinimoValor || 0, pedidoMinimoQtd: s.pedidoMinimoQtd || 0, whatsappNumber: s.whatsappNumber || '' });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }

    await executar(async () => {
      try {
        if (editId) {
          if (!canEdit) { toast.error('Sem permissão para editar fornecedores'); return; }
          await updateSupplier(editId, form);
          toast.success('Fornecedor atualizado!');
          setEditId(null);
        } else {
          if (!canCreate) { toast.error('Sem permissão para criar fornecedores'); return; }
          await addSupplier(form);
          toast.success('Fornecedor cadastrado!');
        }
        setForm(emptyForm);
        setShowForm(false);
      } catch {
        // o hook já avisou o erro traduzido; o formulário fica aberto para corrigir
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canDelete) { toast.error('Sem permissão para excluir fornecedores'); return; }
    const ok = await confirm({ title: 'Excluir fornecedor', description: `Tem certeza que deseja excluir "${name}"?`, confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    try {
      await deleteSupplier(id);
      toast.success('Fornecedor excluído');
    } catch {
      // recusa (ex.: fornecedor já usado em contas) já avisada pelo hook
    }
  };

  const toggleActive = async (s: Supplier) => {
    if (!canEdit) { toast.error('Sem permissão para editar fornecedores'); return; }
    try {
      await updateSupplier(s.id, { active: !s.active });
      toast.info(s.active ? `${s.name} desativado` : `${s.name} ativado`);
    } catch {
      // recusa já avisada pelo hook
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Fornecedores</h2>
          <p className="text-xs text-muted-foreground">{suppliers.length} cadastrados • {suppliers.filter(s => s.active).length} ativos</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }} size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5">
            <Plus className="w-4 h-4" /> Novo
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-[11px] text-muted-foreground">Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do fornecedor" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">CNPJ</Label>
              <Input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Contato</Label>
              <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Tel / WhatsApp / Email" className="bg-secondary border-border text-foreground" />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px] text-muted-foreground">Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas..." className="bg-secondary border-border text-foreground" />
            </div>
            <div className="col-span-2 pt-1 border-t border-border/60">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Cotação</p>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Pedido mínimo (R$)</Label>
              <BRLInput numericValue={form.pedidoMinimoValor} onNumericChange={value => setForm(f => ({ ...f, pedidoMinimoValor: value }))} showPrefix min={0} placeholder="0,00" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">WhatsApp (Z-API)</Label>
              <Input value={form.whatsappNumber} onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))} placeholder="55 11 99999-9999" className="bg-secondary border-border text-foreground" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
              <span className="text-xs text-muted-foreground">Ativo</span>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={enviando} className="bg-primary-strong text-primary-foreground border-0">{editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {suppliers.map((s, i) => (
          <div key={s.id} className={`bg-card border rounded-xl p-3 animate-fade-up ${s.active ? 'border-border' : 'border-border/50 opacity-60'}`} style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.active ? 'bg-primary/15' : 'bg-secondary'}`}>
                  <Building2 className={`w-4 h-4 ${s.active ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {s.cnpj && <span>{s.cnpj}</span>}
                    {s.contact && <span>• {s.contact}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <button type="button" aria-label={`${s.active ? 'Desativar' : 'Ativar'} ${s.name}`} onClick={() => toggleActive(s)} className={`p-1.5 rounded-lg transition-colors ${s.active ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-secondary'}`}>
                    {s.active ? <Check aria-hidden="true" className="w-3.5 h-3.5" /> : <X aria-hidden="true" className="w-3.5 h-3.5" />}
                  </button>
                )}
                {canEdit && (
                  <button type="button" aria-label={`Editar ${s.name}`} onClick={() => startEdit(s)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary">
                    <Edit2 aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button type="button" aria-label={`Excluir ${s.name}`} onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                    <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {s.notes && <p className="text-[10px] text-muted-foreground mt-1.5 ml-[42px] italic">{s.notes}</p>}
            <div className="ml-[42px] mt-1">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${s.active ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'}`}>
                {s.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
        ))}
        {loading && suppliers.length === 0 && (
          <p role="status" className="text-center py-8 text-sm text-muted-foreground">Carregando fornecedores…</p>
        )}
        {!loading && suppliers.length === 0 && (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado</p>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
