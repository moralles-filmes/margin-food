import { useCompanyId } from '@/hooks/useCompanyId';
import { mensagemCadastroDuplicado } from '@/domain/financeiro/cadastros';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useRef, useId } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Target } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import TableActions from '@/components/ui/TableActions';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { CENTROS_LISTA_LIMITE_PX } from './fechamentoView';

import { useCan } from '@/permissions/hooks';
interface CentroRow {
  id: string;
  nome: string;
  descricao: string | null;
  updated_at: string;
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export default function CentrosCustoFinSection({
 canCreate, canEdit, canDelete }: Props) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('financeiro:cadastros:view');
  const { user } = useAuth();
  const [items, setItems] = useState<CentroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', descricao: '' });
  const [saving, setSaving] = useState(false);
  // Trava síncrona: sem ela, dois cliques em "Salvar" gravavam dois centros de custo.
  const salvandoRef = useRef(false);
  // Só apresentação: leitura que falhou não vira "Nenhum centro de custo".
  const [erro, setErro] = useState(false);
  const [listaRef, listaEstreita] = useConteinerEstreito(CENTROS_LISTA_LIMITE_PX);
  const retornoForm = useRetornoFoco();
  const campoId = useId();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fin_centros_custo').select('id, nome, descricao, updated_at').eq('ativo', true).order('nome');
    if (error) console.error('[CentrosCustoFinSection.load]', error);
    setErro(Boolean(error));
    setItems((data || []) as CentroRow[]);
    setLoading(false);
  };

  const openEdit = (item: CentroRow) => {
    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setForm({ nome: item.nome, descricao: item.descricao || '' });
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({ nome: '', descricao: '' });
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const falhaAoSalvar = (error: { message?: string }) => {
    console.error('[CentrosCustoFinSection.save]', error);
    const duplicado = mensagemCadastroDuplicado(error.message);
    toast.error(duplicado ?? error.message ?? 'Erro ao salvar centro de custo');
    // O que já existe (inclusive um envio anterior sem resposta) aparece na lista.
    if (duplicado) load();
  };

  const save = async () => {
    if (salvandoRef.current) return;
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    salvandoRef.current = true;
    setSaving(true);
    try {
      if (editId) {
        const { error } = await (supabase.rpc as any)('_guarded_update_centro_custo', {
          p_id: editId,
          p_nome: form.nome,
          p_descricao: form.descricao || '',
          p_expected_updated_at: editUpdatedAt
        });
        if (error) { falhaAoSalvar(error); return; }
        toast.success('Centro de custo atualizado');
      } else {
        const { error } = await supabase.from('fin_centros_custo').insert(withCompanyId(companyId, { ...form, created_by: user?.id }));
        if (error) { falhaAoSalvar(error); return; }
        toast.success('Centro de custo criado');
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
      const { error } = await (supabase.rpc as any)('_guarded_delete_centro_custo', { p_id: id });
      if (error) throw error;
      toast.success('Centro de custo removido');
      load();
      emitDataEvent('financeiro:cadastros');
    } catch (err: unknown) {
      console.error('[CentrosCustoFinSection.remove]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  if (!canViewRbac) return <AccessDenied compact title="Acesso negado" description="Você não tem permissão para ver os centros de custo." />;

  const nomeId = `${campoId}-nome`;
  const descricaoId = `${campoId}-descricao`;
  const temAcoes = canEdit || canDelete;

  const acoes = (item: CentroRow) => (
    <TableActions
      canEditOverride={canEdit}
      canDeleteOverride={canDelete}
      onEdit={() => openEdit(item)}
      onDelete={() => remove(item.id)}
      deleteConfirmTitle="Remover Centro de Custo"
      deleteConfirmDescription={`Tem certeza que deseja remover o centro de custo "${item.nome}"?`}
      editLabel={`Editar ${item.nome}`}
      deleteLabel={`Remover ${item.nome}`}
      className="flex justify-end gap-1"
    />
  );

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Centros de Custo"
        description="Centros de custo ativos da unidade."
        actions={canCreate && <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); else setShowForm(true); }}>
          <DialogTrigger asChild><Button size="sm"><Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Novo Centro</Button></DialogTrigger>
          <DialogContent {...retornoForm}>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</DialogTitle>
              <DialogDescription>Nome e descrição do centro de custo.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor={nomeId}>Nome</Label><Input id={nomeId} value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div className="space-y-1.5"><Label htmlFor={descricaoId}>Descrição</Label><Textarea id={descricaoId} value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} /></div>
              <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Salvando...' : editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </DialogContent>
        </Dialog>}
      />

      <FinSectionGroup
        id="cad-centros"
        title="Centros"
        caption={loading || erro || items.length === 0 ? undefined : items.length === 1 ? '1 centro ativo' : `${items.length} centros ativos`}
      >
        <div ref={listaRef}>
          {loading && items.length === 0 ? (
            <ListaCarregando estreito={listaEstreita} texto="Carregando centros de custo…" />
          ) : erro ? (
            <ErrorState title="Não foi possível carregar os centros de custo" onRetry={() => { void load(); }} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Nenhum centro de custo"
              description={canCreate ? 'Use Novo Centro para cadastrar.' : undefined}
            />
          ) : listaEstreita ? (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="break-words text-sm font-medium text-foreground">{item.nome}</p>
                    <p className="break-words text-xs text-muted-foreground">{item.descricao || 'Sem descrição'}</p>
                  </div>
                  {temAcoes && <div className="shrink-0">{acoes(item)}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  {temAcoes && <TableHead className="w-24 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="break-words font-medium">{item.nome}</TableCell>
                    <TableCell className="break-words text-muted-foreground">{item.descricao || '—'}</TableCell>
                    {temAcoes && <TableCell>{acoes(item)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </FinSectionGroup>
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
