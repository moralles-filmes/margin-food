import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { toast } from 'sonner';

interface Company {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  total_usuarios: number;
}

function extractEdgeFnError(data: any, error: any): string {
  if (error) return error.message || 'Erro desconhecido';
  if (data?.error) return data.error;
  return 'Erro desconhecido';
}

export default function AdminCompaniesView() {
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
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)('list_companies');
      if (rpcError) throw rpcError;
      setCompanies(data || []);
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
    if (!newNome.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }
    setCreating(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)('onboard_new_company', {
        p_company_name: newNome.trim(),
        p_cnpj: newCnpj.trim() || null,
      });
      if (rpcError) throw rpcError;
      toast.success(`Empresa "${newNome.trim()}" criada com sucesso!`);
      setShowCreate(false);
      setNewNome('');
      setNewCnpj('');
      await fetchCompanies();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar empresa');
    } finally {
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

  const handleCreateAdmin = async () => {
    if (!adminTarget) return;
    if (!adminEmail.trim()) { toast.error('Email é obrigatório'); return; }
    if (!adminPassword || adminPassword.length < 12) {
      toast.error('Senha deve ter no mínimo 12 caracteres');
      return;
    }

    setCreatingAdmin(true);
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
        toast.error(extractEdgeFnError(data, error));
        return;
      }

      toast.success(`Admin "${adminEmail.trim()}" criado para ${adminTarget.nome}!`);
      setAdminTarget(null);
      await fetchCompanies();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar admin');
    } finally {
      setCreatingAdmin(false);
    }
  };

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
                {c.ativo && canCreate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => openCreateAdmin(c)}
                  >
                    <UserPlus className="w-3 h-3" /> Criar Admin
                  </Button>
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
                <li>Crie o primeiro usuário admin pela aba Usuários</li>
                <li>O admin da nova loja poderá criar os demais usuários</li>
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
              <Label htmlFor="admin-password">Senha * (mín. 12 caracteres)</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Senha segura..."
                disabled={creatingAdmin}
              />
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
              disabled={creatingAdmin || !adminEmail.trim() || adminPassword.length < 12}
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
