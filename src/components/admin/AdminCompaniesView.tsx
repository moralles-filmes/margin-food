import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import TableActions from '@/components/ui/TableActions';
import { Building2, Plus, Loader2, Users, RefreshCw, UserPlus } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { sortByName } from '@/lib/sortByName';
import { novaSemente } from '@/lib/chaveOperacao';
import { chaveCriacaoEmpresa, mensagemErroCriacaoEmpresa } from '@/domain/admin/empresa';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { mensagemErroEdge } from '@/lib/edgeFunctionError';

interface Company {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  total_usuarios: number;
  /** Algum membro ativo gerencia usuários: aí o acesso é concedido pela própria empresa. */
  tem_gestor?: boolean;
}

function extractEdgeFnError(data: any, error: any): string {
  if (error) return error.message || 'Erro desconhecido';
  if (data?.error) return data.error;
  return 'Erro desconhecido';
}

export default function AdminCompaniesView() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { user } = useAuth();
  const canCreate = useCan('configuracoes:empresas:create');
  const canEdit = useCan('configuracoes:empresas:edit');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  // Semente do cadastro: só troca depois do sucesso. O retry do mesmo cadastro
  // reaproveita a chave e o servidor devolve a empresa já criada.
  const [sementeCriacao, setSementeCriacao] = useState(novaSemente);
  // Trava síncrona: `creating` só chega ao botão no próximo render.
  const criandoRef = useRef(false);

  // Edit dialog
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCnpj, setEditCnpj] = useState('');
  const [saving, setSaving] = useState(false);

  // Create Admin dialog
  const [adminTarget, setAdminTarget] = useState<Company | null>(null);
  const [adminNome, setAdminNome] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const { enviando: creatingAdmin, executar: executarCriacaoAdmin } = useTravaEnvio();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)('list_companies');
      if (rpcError) throw rpcError;
      setCompanies(sortByName<Company>(data || [], c => c.nome));
    } catch (e: any) {
      const msg = e?.message || 'Erro ao carregar empresas';
      setError(msg);
      console.error('list_companies error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // ── Create ──
  const handleCreate = async () => {
    if (criandoRef.current) return;
    if (!newNome.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }
    criandoRef.current = true;
    setCreating(true);
    try {
      const cnpj = newCnpj.trim() || null;
      const { data, error: rpcError } = await supabase.rpc('onboard_new_company', {
        p_company_name: newNome.trim(),
        p_cnpj: cnpj ?? undefined,
        p_onboarding_request_id: await chaveCriacaoEmpresa(sementeCriacao, { nome: newNome, cnpj }),
      });
      if (rpcError) throw rpcError;
      const criada = data as { idempotente?: boolean; company_id?: string; company_name?: string } | null;
      toast.success(criada?.idempotente
        ? `Empresa "${newNome.trim()}" já estava criada.`
        : `Empresa "${newNome.trim()}" criada com sucesso!`);
      setSementeCriacao(novaSemente());
      setShowCreate(false);
      setNewNome('');
      setNewCnpj('');
      // Quem cria a empresa não entra nela: o próximo passo é o 1º admin.
      if (criada?.company_id && !criada.idempotente) {
        openCreateAdmin({
          id: criada.company_id, nome: criada.company_name ?? newNome.trim(), cnpj, ativo: true,
          created_at: '', updated_at: '', total_usuarios: 0, tem_gestor: false,
        });
      }
      // Recarregar a lista é depois do commit: falhar aqui não é erro do cadastro.
      fetchCompanies();
    } catch (e: any) {
      console.error('onboard_new_company error:', e);
      toast.error(mensagemErroCriacaoEmpresa(e?.message));
    } finally {
      criandoRef.current = false;
      setCreating(false);
    }
  };

  // ── Edit ──
  const openEdit = (company: Company) => {
    setEditCompany(company);
    setEditNome(company.nome);
    setEditCnpj(company.cnpj || '');
  };

  const handleSave = async () => {
    if (!editCompany) return;
    if (!editNome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const { error: rpcError } = await (supabase.rpc as any)('update_company', {
        p_company_id: editCompany.id,
        p_nome: editNome.trim(),
        p_cnpj: editCnpj.trim() || null,
      });
      if (rpcError) throw rpcError;
      toast.success('Empresa atualizada');
      setEditCompany(null);
      await fetchCompanies();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  // ── Create Admin ──
  const openCreateAdmin = (company: Company) => {
    setAdminTarget(company);
    setAdminNome('');
    setAdminEmail('');
    setAdminPassword('');
  };

  const handleCreateAdmin = () => executarCriacaoAdmin(async () => {
    if (!adminTarget) return;
    if (!adminEmail.trim()) { toast.error('Email é obrigatório'); return; }
    if (adminPassword && adminPassword.length < 12) {
      toast.error('Senha deve ter no mínimo 12 caracteres');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-companies', {
        body: {
          action: 'create-first-user',
          company_id: adminTarget.id,
          email: adminEmail.trim(),
          password: adminPassword,
          nome: adminNome.trim() || null,
        },
      });

      if (error || data?.error) {
        console.error('admin-companies create-first-user error:', error ?? data?.error);
        toast.error(error ? await mensagemErroEdge(error, 'Erro ao criar admin') : extractEdgeFnError(data, null));
        // A empresa pode ter ganho um gestor nesse meio-tempo: o card precisa refletir.
        fetchCompanies();
        return;
      }

      toast.success(`Admin "${adminEmail.trim()}" criado para ${adminTarget.nome}!`);
      setAdminTarget(null);
      await fetchCompanies();
    } catch (e: any) {
      console.error('admin-companies create-first-user error:', e);
      toast.error(e?.message || 'Erro ao criar admin');
    }
  });

  // ── Toggle ativo ──
  const handleToggleAtivo = async (company: Company) => {
    try {
      const { error: rpcError } = await (supabase.rpc as any)('update_company', {
        p_company_id: company.id,
        p_ativo: !company.ativo,
      });
      if (rpcError) throw rpcError;
      toast.success(company.ativo ? 'Empresa desativada' : 'Empresa reativada');
      await fetchCompanies();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alterar status');
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
      return '—';
    }
  };

  const formatCnpj = (cnpj: string | null) => {
    if (!cnpj) return '—';
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Gestão de Empresas</h2>
          <Badge variant="secondary" className="text-xs">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchCompanies} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Nova Empresa
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive-soft text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Company cards */}
      {!loading && companies.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma empresa cadastrada.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {companies.map((c) => (
          <Card key={c.id} className={!c.ativo ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-semibold truncate">{c.nome}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatCnpj(c.cnpj)}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <Badge variant={c.ativo ? 'default' : 'destructive'} className="text-[10px]">
                    {c.ativo ? 'Ativa' : 'Inativa'}
                  </Badge>
                  {canEdit && (
                    <TableActions
                      onEdit={() => openEdit(c)}
                      onDelete={() => handleToggleAtivo(c)}
                      editPermission="configuracoes:empresas:edit"
                      deletePermission="configuracoes:empresas:delete"
                      deleteConfirmTitle={c.ativo ? 'Desativar empresa?' : 'Reativar empresa?'}
                      deleteConfirmDescription={
                        c.ativo
                          ? `A empresa "${c.nome}" será desativada. Usuários desta empresa não poderão acessar o sistema.`
                          : `A empresa "${c.nome}" será reativada.`
                      }
                    />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  <span>{c.total_usuarios} usuário{c.total_usuarios !== 1 ? 's' : ''}</span>
                </div>
                {c.ativo && canCreate && !c.tem_gestor && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => openCreateAdmin(c)}
                  >
                    <UserPlus className="w-3 h-3" /> Criar Admin
                  </Button>
                )}
                {c.ativo && c.tem_gestor && (
                  <span className="text-[10px] text-muted-foreground" title="Novos acessos, inclusive o seu, são criados pelo admin da própria empresa.">
                    Acessos geridos pela empresa
                  </span>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Criada em {formatDate(c.created_at)}</span>
                <span className="font-mono truncate max-w-24" title={c.id}>
                  {c.id.slice(0, 8)}...
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Nova Empresa
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="company-name">Nome da Empresa *</Label>
              <Input
                id="company-name"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                placeholder="Ex: Restaurante Moralles - Unidade Centro"
                autoFocus
                disabled={creating}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-cnpj">CNPJ (opcional)</Label>
              <Input
                id="company-cnpj"
                value={newCnpj}
                onChange={(e) => setNewCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                disabled={creating}
              />
            </div>
            <div className="p-3 rounded-lg bg-background-subtle text-xs text-muted-foreground space-y-1">
              <p>Ao criar a empresa:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Cargos padrão serão criados automaticamente</li>
                <li>Em seguida, cadastre o primeiro admin da empresa</li>
                <li>O admin da nova loja poderá criar os demais usuários</li>
                <li>Você não terá acesso aos dados da empresa — se precisar, o admin dela cadastra o seu e-mail</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newNome.trim()}>
              {creating ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Criando...</>
              ) : (
                'Criar Empresa'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Editar Empresa
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome da Empresa *</Label>
              <Input
                id="edit-name"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                autoFocus
                disabled={saving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-cnpj">CNPJ</Label>
              <Input
                id="edit-cnpj"
                value={editCnpj}
                onChange={(e) => setEditCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompany(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !editNome.trim()}>
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Salvando...</>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Admin Dialog ── */}
      <Dialog open={!!adminTarget} onOpenChange={(open) => !open && setAdminTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Criar Admin
            </DialogTitle>
          </DialogHeader>
          {adminTarget && (
            <div className="p-2 rounded-lg bg-primary-soft text-xs text-primary-ink font-medium flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              {adminTarget.nome}
            </div>
          )}
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-nome">Nome</Label>
              <Input
                id="admin-nome"
                value={adminNome}
                onChange={(e) => setAdminNome(e.target.value)}
                placeholder="Nome do administrador"
                autoFocus
                disabled={creatingAdmin}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-email">Email *</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@empresa.com"
                disabled={creatingAdmin}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-password">Senha para novo login (mín. 12 caracteres)</Label>
              <Input
                id="admin-password"
                aria-describedby="admin-password-hint"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Senha segura..."
                disabled={creatingAdmin}
              />
              <p id="admin-password-hint" className="rounded-md border border-primary/20 bg-primary/5 p-2 text-xs leading-relaxed text-foreground">Se o usuário já tem acesso a outra unidade, informe o mesmo e-mail e <strong>deixe a senha em branco</strong>. Ele continuará usando o mesmo login e senha. O seu próprio e-mail não é aceito: o seu acesso é concedido pelo admin da empresa.</p>
              {adminPassword.length > 0 && adminPassword.length < 12 && (
                <p className="text-[10px] text-destructive">
                  {12 - adminPassword.length} caractere{12 - adminPassword.length !== 1 ? 's' : ''} restante{12 - adminPassword.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-background-subtle text-xs text-muted-foreground space-y-1">
              <p>Este usuário será criado como <strong>admin</strong> da empresa e poderá:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Acessar todos os módulos da empresa</li>
                <li>Criar e gerenciar outros usuários</li>
                <li>Configurar permissões dos colaboradores</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminTarget(null)} disabled={creatingAdmin}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateAdmin}
              disabled={creatingAdmin || !adminEmail.trim() || (!!adminPassword && adminPassword.length < 12)}
            >
              {creatingAdmin ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Criando...</>
              ) : (
                'Criar Admin'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
