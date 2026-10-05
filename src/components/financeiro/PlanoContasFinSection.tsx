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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BookOpen, Plus } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import TableActions from '@/components/ui/TableActions';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { PLANO_LISTA_LIMITE_PX, PLANO_NATUREZA_LABEL, PLANO_TIPO_LABEL, rotuloOuValor } from './fechamentoView';

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
  // Só apresentação: leitura que falhou não vira "Nenhuma conta cadastrada".
  const [erro, setErro] = useState(false);
  const [listaRef, listaEstreita] = useConteinerEstreito(PLANO_LISTA_LIMITE_PX);
  const retornoForm = useRetornoFoco();
  const campoId = useId();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fin_plano_contas').select('id, codigo, nome, tipo, natureza, linha_dre, updated_at').eq('ativo', true).order('codigo');
    if (error) console.error('[PlanoContasFinSection.load]', error);
    setErro(Boolean(error));
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

  if (!canViewRbac) return <AccessDenied compact title="Acesso negado" description="Você não tem permissão para ver o plano de contas." />;

  const ids = {
    codigo: `${campoId}-codigo`,
    nome: `${campoId}-nome`,
    tipo: `${campoId}-tipo`,
    natureza: `${campoId}-natureza`,
    linha: `${campoId}-linha`,
  };
  const temAcoes = canEdit || canDelete;

  const acoes = (item: PlanoContaRow) => (
    <TableActions
      canEditOverride={canEdit}
      canDeleteOverride={canDelete}
      onEdit={() => openEdit(item)}
      onDelete={() => remove(item.id)}
      deleteConfirmTitle="Remover do Plano de Contas"
      deleteConfirmDescription={`Tem certeza que deseja remover a conta "${item.nome}"?`}
      editLabel={`Editar ${item.codigo} ${item.nome}`}
      deleteLabel={`Remover ${item.codigo} ${item.nome}`}
      className="flex justify-end gap-1"
    />
  );

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Plano de Contas"
        description="Contas contábeis ativas da unidade."
        actions={canCreate && <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); else setShowForm(true); }}>
          <DialogTrigger asChild><Button size="sm"><Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Nova Conta</Button></DialogTrigger>
          <DialogContent {...retornoForm}>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Conta' : 'Nova Conta Contábil'}</DialogTitle>
              <DialogDescription>Código, nome, tipo, natureza e linha da DRE da conta contábil.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor={ids.codigo}>Código</Label><Input id={ids.codigo} value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} placeholder="Ex: 1.1.01" /></div>
              <div className="space-y-1.5"><Label htmlFor={ids.nome}>Nome</Label><Input id={ids.nome} value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor={ids.tipo}>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v})}>
                    <SelectTrigger id={ids.tipo}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="passivo">Passivo</SelectItem>
                      <SelectItem value="patrimonio">Patrimônio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor={ids.natureza}>Natureza</Label>
                  <Select value={form.natureza} onValueChange={v => setForm({...form, natureza: v})}>
                    <SelectTrigger id={ids.natureza}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operacional">Operacional</SelectItem>
                      <SelectItem value="financeira">Financeira</SelectItem>
                      <SelectItem value="nao_operacional">Não Operacional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor={ids.linha}>Linha DRE</Label><Input id={ids.linha} value={form.linha_dre} onChange={e => setForm({...form, linha_dre: e.target.value})} /></div>
              <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Salvando...' : editId ? 'Atualizar' : 'Salvar'}</Button>
            </div>
          </DialogContent>
        </Dialog>}
      />

      <FinSectionGroup
        id="cad-plano"
        title="Contas"
        caption={loading || erro || items.length === 0 ? undefined : items.length === 1 ? '1 conta ativa' : `${items.length} contas ativas`}
      >
        <div ref={listaRef}>
          {loading && items.length === 0 ? (
            <ListaCarregando estreito={listaEstreita} texto="Carregando plano de contas…" />
          ) : erro ? (
            <ErrorState title="Não foi possível carregar o plano de contas" onRetry={() => { void load(); }} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Nenhuma conta cadastrada"
              description={canCreate ? 'Use Nova Conta para cadastrar.' : undefined}
            />
          ) : listaEstreita ? (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-foreground">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{item.codigo}</span>
                      {item.nome}
                    </p>
                    {temAcoes && <div className="shrink-0">{acoes(item)}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge status="neutral" label={rotuloOuValor(PLANO_TIPO_LABEL, item.tipo)} />
                    <span className="text-muted-foreground">{rotuloOuValor(PLANO_NATUREZA_LABEL, item.natureza)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Natureza</TableHead>
                  {temAcoes && <TableHead className="w-24 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-sm">{item.codigo}</TableCell>
                    <TableCell className="break-words font-medium">{item.nome}</TableCell>
                    <TableCell><StatusBadge status="neutral" label={rotuloOuValor(PLANO_TIPO_LABEL, item.tipo)} /></TableCell>
                    <TableCell className="text-muted-foreground">{rotuloOuValor(PLANO_NATUREZA_LABEL, item.natureza)}</TableCell>
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
