import { useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Building2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Supplier } from '@/types/salmon';
import { useCan } from '@/permissions/hooks';

interface SuppliersViewProps {
  store: ReturnType<typeof useSalmonStore>;
}

const emptyForm = { name: '', cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [] as string[], prazoEntregaPadrao: 0, formaPagamentoPadrao: '', pedidoMinimoValor: 0, pedidoMinimoQtd: 0, whatsappNumber: '' };

export default function SuppliersView({ store }: SuppliersViewProps) {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = store;
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const canCreate = useCan('compras:fornecedores:create');
  const canEdit = useCan('compras:fornecedores:edit');
  const canDelete = useCan('compras:fornecedores:delete');

  const startEdit = (s: Supplier) => {
    if (!canEdit) { toast.error('Sem permissão para editar fornecedores'); return; }
    setEditId(s.id);
    setForm({ name: s.name, cnpj: s.cnpj, contact: s.contact, notes: s.notes, active: s.active, categoriasAtendidas: s.categoriasAtendidas || [], prazoEntregaPadrao: s.prazoEntregaPadrao || 0, formaPagamentoPadrao: s.formaPagamentoPadrao || '', pedidoMinimoValor: s.pedidoMinimoValor || 0, pedidoMinimoQtd: s.pedidoMinimoQtd || 0, whatsappNumber: s.whatsappNumber || '' });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }

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
      // error toast already shown in store
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canDelete) { toast.error('Sem permissão para excluir fornecedores'); return; }
    const ok = await confirm({ title: 'Excluir fornecedor', description: `Tem certeza que deseja excluir "${name}"?`, confirmLabel: 'Excluir', variant: 'destructive' });
    if (ok) {
      await deleteSupplier(id);
      toast.success('Fornecedor excluído');
    }
  };

  const toggleActive = async (s: Supplier) => {
    if (!canEdit) { toast.error('Sem permissão para editar fornecedores'); return; }
    await updateSupplier(s.id, { active: !s.active });
    toast.info(s.active ? `${s.name} desativado` : `${s.name} ativado`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Fornecedores</h2>
          <p className="text-xs text-muted-foreground">{suppliers.length} cadastrados • {suppliers.filter(s => s.active).length} ativos</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }} size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5">
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
              <Input type="number" min={0} step="0.01" value={form.pedidoMinimoValor || ''} onChange={e => setForm(f => ({ ...f, pedidoMinimoValor: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className="bg-secondary border-border text-foreground" />
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
              <Button type="submit" size="sm" className="gradient-salmon text-primary-foreground border-0">{editId ? 'Atualizar' : 'Salvar'}</Button>
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
                  <button onClick={() => toggleActive(s)} className={`p-1.5 rounded-lg transition-colors ${s.active ? 'text-success hover:bg-success/10' : 'text-muted-foreground hover:bg-secondary'}`}>
                    {s.active ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" />
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
        {suppliers.length === 0 && (
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

// Quick add supplier modal for inline use
export function QuickSupplierForm({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg animate-scale-in">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do fornecedor" className="h-8 text-xs bg-card border-border text-foreground flex-1" autoFocus />
      <Button size="sm" className="h-8 text-xs gradient-salmon text-primary-foreground border-0" onClick={() => { if (name.trim()) onAdd(name.trim()); }} disabled={!name.trim()}>
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
