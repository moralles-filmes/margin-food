import { useState, useEffect, useCallback } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useCan } from '@/permissions/hooks';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePasswordValidation } from '@/hooks/usePasswordValidation';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import PasswordInput from '@/components/PasswordInput';
import PermissionMatrix from '@/components/PermissionMatrix';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UserPlus, Shield, Ban, CheckCircle, Loader2, Pencil, KeyRound, Power, Trash2, Briefcase, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface UserRecord {
  id: string;
  nome: string;
  email: string;
  role: string;
  sector: string | null;
  job_role_name: string | null;
  created_at: string;
  disabled: boolean;
  permissions: { key: string; effect: string }[];
}

interface JobRole {
  id: string;
  nome: string;
  descricao: string | null;
  is_active: boolean;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-destructive/10 text-destructive' },
  operador: { label: 'Operador', color: 'bg-primary/10 text-primary' },
  sem_role: { label: 'Sem Role', color: 'bg-muted text-muted-foreground' },
};

const ALL_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'operador', label: 'Operador' },
];

export default function AdminUsersView() {
  const { user, rolesLoaded } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canManageUsers = useCan('configuracoes:usuarios:manage');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState('users');

  // Create user state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNome, setNewNome] = useState('');
  const [newRole, setNewRole] = useState('operador');
  // Sector is no longer role-dependent
  const [newSector, setNewSector] = useState('');
  const [newJobRoleId, setNewJobRoleId] = useState('');
  const [newPermissions, setNewPermissions] = useState<Set<string>>(new Set());
  const [rolePermissionsMap, setRolePermissionsMap] = useState<Record<string, string[]>>({});
  const pwValidation = usePasswordValidation();

  // Edit user state
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSector, setEditSector] = useState('');
  const [editJobRoleId, setEditJobRoleId] = useState('');
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Reset password state
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const resetPw = usePasswordValidation();
  const [resetting, setResetting] = useState(false);

  // Delete user state
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Job role create
  const [showCreateJobRole, setShowCreateJobRole] = useState(false);
  const [newJrNome, setNewJrNome] = useState('');
  const [newJrDescricao, setNewJrDescricao] = useState('');
  const [creatingJr, setCreatingJr] = useState(false);

  // ─── Helpers ───
  const invoke = async (body: Record<string, any>) => {
    const parseInvokeError = async (error: any) => {
      try {
        if (error?.context) {
          // Read as text first (stream can only be read once)
          const text = await error.context.text();
          if (text) {
            try {
              const parsed = JSON.parse(text);
              if (parsed?.error) return parsed.error;
            } catch (parseErr) {
              console.debug('[parseInvokeError] JSON inválido, usando texto bruto:', parseErr);
            }
            return text;
          }
        }
      } catch (ctxErr) {
        console.debug('[parseInvokeError] falha ao ler context:', ctxErr);
      }
      return error?.message || 'Erro';
    };

    const runInvoke = async (accessToken?: string) => {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      return supabase.functions.invoke('admin-users', { body, headers });
    };

    const { data: sessionData } = await supabase.auth.getSession();
    let { data, error } = await runInvoke(sessionData.session?.access_token);

    if (error) {
      const firstMsg = await parseInvokeError(error);
      const isAuthError = /não autorizado|não autenticado|jwt|auth/i.test(firstMsg);

      if (isAuthError) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const retried = await runInvoke(refreshed.session.access_token);
          data = retried.data;
          error = retried.error;
          if (error) throw new Error(await parseInvokeError(error));
        }
      } else {
        throw new Error(firstMsg);
      }
    }

    if (data?.error) throw new Error(data.error);
    return data;
  };

  // ─── Fetch ───
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const timeout = setTimeout(() => { setLoading(false); setLoadError('Tempo esgotado. Tente novamente.'); }, 10000);
    try {
      const data = await invoke({ action: 'list' });
      clearTimeout(timeout);
      setUsers(data.users || []);
    } catch (err: any) {
      clearTimeout(timeout);
      setLoadError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchJobRoles = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('job_roles').select('id, nome, descricao, is_active, created_at').order('nome');
      if (error) throw error;
      setJobRoles((data || []) as { id: string; nome: string; descricao: string | null; is_active: boolean; created_at: string }[]);
    } catch (e) {
      console.error('[fetchJobRoles]', e);
      toast.error('Erro ao carregar cargos. Recarregue a página se o dropdown de cargos estiver vazio.');
    }
  }, []);

  const fetchRolePermissions = useCallback(async () => {
    try {
      const map: Record<string, string[]> = {};
      let from = 0;
      const step = 1000;
      
      while (true) {
        const { data: chunk, error } = await supabase
          .from('role_permissions')
          .select('role, permission_key')
          .range(from, from + step - 1);
        
        if (error) {
          console.error('Error fetching role_permissions chunk:', error);
          break;
        }
        if (!chunk || chunk.length === 0) break;
        
        chunk.forEach((rp: any) => {
          if (!map[rp.role]) map[rp.role] = [];
          map[rp.role].push(rp.permission_key);
        });
        
        if (chunk.length < step) break;
        from += step;
      }
      
      setRolePermissionsMap(map);
    } catch (e) {
      console.error('[fetchRolePermissions]', e);
      toast.error('Erro ao carregar permissões dos perfis. Recarregue a página.');
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchUsers(),
      fetchJobRoles(),
      fetchRolePermissions()
    ]);
  }, [fetchUsers, fetchJobRoles, fetchRolePermissions]);

  useEffect(() => {
    if (canManageUsers && rolesLoaded && user) {
      fetchAll();
    }
  }, [fetchAll, canManageUsers, rolesLoaded, user]);

  // ─── Access denied ───
  if (!canManageUsers) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
        <p className="text-sm font-medium text-foreground">Acesso Negado</p>
        <p className="text-xs text-muted-foreground">Apenas Diretor e Gerente Geral podem gerenciar usuários.</p>
      </div>
    );
  }

  // ─── Handlers ───
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwValidation.localErrors.length > 0) { toast.error('Senha não atende os requisitos'); return; }
    setCreating(true);
    const isServerValid = await pwValidation.checkServer();
    if (!isServerValid) { toast.error('Senha não aprovada pela verificação de segurança'); setCreating(false); return; }
    try {
      const data = await invoke({
        action: 'create', email: newEmail, password: pwValidation.password, nome: newNome, role: newRole,
        sector: null,
        job_role_id: newJobRoleId || null,
        permissions: Array.from(newPermissions),
      });

      if (data?.warning) toast.warning(data.warning);
      else toast.success(`Usuário ${newEmail} criado!`);
      setShowCreate(false);
      setNewEmail(''); setNewNome(''); setNewRole('operador'); setNewSector(''); setNewJobRoleId('');
      setNewPermissions(new Set());
      pwValidation.setPassword('');
      fetchUsers();
    } catch (err: any) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const openEdit = (u: UserRecord) => {
    setEditingUser(u);
    setEditNome(u.nome);
    setEditEmail(u.email);
    const role = u.role === 'sem_role' ? 'viewer' : u.role;
    setEditRole(role);
    setEditSector(u.sector || '');
    setEditJobRoleId('');
    // Compute effective permissions: role defaults + ALLOW - DENY
    const rolePerms = new Set(rolePermissionsMap[role] || []);
    const userAllows = (u.permissions || []).filter(p => p.effect === 'ALLOW').map(p => p.key);
    const userDenies = new Set((u.permissions || []).filter(p => p.effect === 'DENY').map(p => p.key));
    const effective = new Set<string>();
    rolePerms.forEach(k => { if (!userDenies.has(k)) effective.add(k); });
    userAllows.forEach(k => effective.add(k));
    setEditPermissions(effective);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      // Usa o helper invoke() (checa data.error, faz refresh de auth e lança em
      // falha) — o chamador antigo ignorava invokeError e mostrava sucesso sempre.
      const data = await invoke({
        action: 'edit-user',
        userId: editingUser.id,
        nome: editNome,
        email: editEmail,
        role: editRole,
        permissions: Array.from(editPermissions),
      });

      if (data?.warning) toast.warning(data.warning);
      else toast.success('Usuário atualizado!');
      setEditingUser(null);
      fetchAll();
    } catch (err: any) {
      console.error('[handleEditUser]', err);
      toast.error('Erro ao salvar usuário: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (resetPw.localErrors.length > 0) { toast.error('Senha não atende os requisitos'); return; }
    setResetting(true);
    const ok = await resetPw.checkServer();
    if (!ok) { toast.error('Senha não aprovada pela verificação de segurança'); setResetting(false); return; }
    try {
      await invoke({ action: 'reset-password', userId: resetUser.id, newPassword: resetPw.password });
      toast.success('Senha resetada com sucesso!');
      setResetUser(null);
      resetPw.setPassword('');
    } catch (err: any) { toast.error(err.message); }
    finally { setResetting(false); }
  };

  const handleToggleStatus = async (u: UserRecord) => {
    const actionName = u.disabled ? 'enable' : 'disable';
    const label = u.disabled ? 'reativar' : 'desativar';
    const ok = await confirm({ title: `${u.disabled ? 'Reativar' : 'Desativar'} usuário`, description: `Tem certeza que deseja ${label} o usuário ${u.nome || u.email}?`, confirmLabel: u.disabled ? 'Reativar' : 'Desativar', variant: u.disabled ? 'default' : 'destructive' });
    if (!ok) return;
    try {
      await invoke({ action: actionName, userId: u.id });
      toast.success(`Usuário ${u.disabled ? 'reativado' : 'desativado'}!`);
      fetchUsers();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    if (!deleteMotivo || deleteMotivo.trim().length < 3) { toast.error('Informe o motivo da exclusão (mín. 3 caracteres)'); return; }
    setDeleting(true);
    try {
      const { data, error } = await invoke({ action: 'delete', userId: deleteUser.id, motivo: deleteMotivo.trim() });
      if (error) throw error;
      const deletedId = deleteUser.id;
      toast.success(`Usuário ${deleteUser.nome || deleteUser.email} excluído!`);
      setUsers(prev => prev.filter(u => u.id !== deletedId));
      setDeleteUser(null);
      setDeleteMotivo('');
    } catch (err: any) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  const handleCreateJobRole = async () => {
    if (!newJrNome.trim()) { toast.error('Nome é obrigatório'); return; }
    setCreatingJr(true);
    try {
      const { data, error } = await invoke({ action: 'create-job-role', nome: newJrNome.trim(), descricao: newJrDescricao.trim() || null });
      if (error) throw error;
      toast.success(`Cargo "${newJrNome}" criado!`);
      setShowCreateJobRole(false);
      setNewJrNome(''); setNewJrDescricao('');
      fetchJobRoles();
    } catch (err: any) { toast.error(err.message); }
    finally { setCreatingJr(false); }
  };

  const handleToggleJobRole = async (jr: JobRole) => {
    try {
      const { data, error } = await invoke({ action: 'toggle-job-role', jobRoleId: jr.id, is_active: !jr.is_active });
      if (error) throw error;
      toast.success(`Cargo ${jr.is_active ? 'desativado' : 'reativado'}!`);
      fetchJobRoles();
    } catch (err: any) { toast.error(err.message); }
  };

  const sectorRequired = false;
  const editSectorRequired = false;

  return (
    <><div className="space-y-4">
      <Tabs value={adminTab} onValueChange={setAdminTab}>
        <TabsList>
          <TabsTrigger value="users" className="text-xs gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Usuários</TabsTrigger>
          <TabsTrigger value="job-roles" className="text-xs gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Cargos</TabsTrigger>
        </TabsList>

        {/* ─── USERS TAB ─── */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Gestão de Usuários</p>
              <p className="text-xs text-muted-foreground">{users.length} usuário(s) cadastrado(s)</p>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 text-xs">
              <UserPlus className="w-3.5 h-3.5" /> Novo Usuário
            </Button>
          </div>

          {loadError ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center space-y-3">
              <Shield className="w-10 h-10 mx-auto text-destructive/40" />
              <p className="text-sm font-medium text-foreground">{loadError}</p>
              <Button size="sm" variant="outline" onClick={fetchUsers} className="gap-1.5 text-xs">
                <Loader2 className="w-3.5 h-3.5" /> Tentar novamente
              </Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2">
              {users.map(u => {
                const roleInfo = ROLE_LABELS[u.role] || ROLE_LABELS.sem_role;
                return (
                  <div key={u.id} className={`bg-card border rounded-xl p-3 flex items-center justify-between ${u.disabled ? 'border-destructive/30 opacity-60' : 'border-border'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{u.nome || '—'}</p>
                        {u.disabled && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Inativo</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleInfo.color}`}>
                          {roleInfo.label}
                        </span>
                        {u.job_role_name && (
                          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20">
                            {u.job_role_name}
                          </span>
                        )}
                        {u.sector && (
                          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {u.sector}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" title="Editar usuário"
                        onClick={() => openEdit(u)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" title="Resetar senha"
                        onClick={() => { setResetUser(u); resetPw.setPassword(''); }}>
                        <KeyRound className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" title={u.disabled ? 'Reativar' : 'Desativar'}
                        className={`text-xs h-7 px-2 ${u.disabled ? 'text-success hover:text-success' : 'text-destructive hover:text-destructive'}`}
                        onClick={() => handleToggleStatus(u)}>
                        {u.disabled ? <Power className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" title="Excluir usuário"
                        className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => { setDeleteUser(u); setDeleteMotivo(''); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── JOB ROLES TAB ─── */}
        <TabsContent value="job-roles" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Cargos Personalizados</p>
              <p className="text-xs text-muted-foreground">Crie cargos operacionais (ex: Peixaria, Bar, Líder Sushi)</p>
            </div>
            <Button size="sm" onClick={() => setShowCreateJobRole(true)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Novo Cargo
            </Button>
          </div>
          <div className="space-y-2">
            {jobRoles.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum cargo criado ainda.</p>
            )}
            {jobRoles.map(jr => (
              <div key={jr.id} className={`bg-card border rounded-xl p-3 flex items-center justify-between ${!jr.is_active ? 'opacity-50' : 'border-border'}`}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{jr.nome}</p>
                  {jr.descricao && <p className="text-xs text-muted-foreground">{jr.descricao}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleToggleJobRole(jr)}
                  className={`text-xs h-7 ${jr.is_active ? 'text-destructive' : 'text-success'}`}>
                  {jr.is_active ? <Ban className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── CREATE USER DIALOG ─── */}
      <AlertDialog open={showCreate} onOpenChange={setShowCreate}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <button onClick={() => setShowCreate(false)} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"><X className="h-4 w-4" /><span className="sr-only">Fechar</span></button>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" /> Criar Novo Usuário
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <form onSubmit={handleCreateUser} className="space-y-4 text-left mt-2">
                {/* Section 1: User data */}
                <p className="text-xs font-semibold text-foreground border-b border-border pb-1">Dados do Usuário</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome completo</Label>
                    <Input value={newNome} onChange={e => setNewNome(e.target.value)} required className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Senha (mín. 12 caracteres)</Label>
                    <PasswordInput value={pwValidation.password} onChange={e => pwValidation.setPassword(e.target.value)} required minLength={12} wrapperClassName="mt-1" />
                    <PasswordStrengthMeter strength={pwValidation.strength} strengthLabel={pwValidation.strengthLabel} strengthColor={pwValidation.strengthColor} errors={pwValidation.localErrors} serverErrors={pwValidation.serverErrors} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Role base (sistema)</Label>
                    <select value={newRole} onChange={e => { setNewRole(e.target.value); setNewPermissions(new Set(rolePermissionsMap[e.target.value] || [])); }}
                      className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground mt-1">
                      {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cargo (opcional)</Label>
                    <select value={newJobRoleId} onChange={e => setNewJobRoleId(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground mt-1">
                      <option value="">Nenhum</option>
                      {jobRoles.filter(j => j.is_active).map(j => <option key={j.id} value={j.id}>{j.nome}</option>)}
                    </select>
                  </div>
                </div>

                {/* Section 2: Permissions */}
                <p className="text-xs font-semibold text-foreground border-b border-border pb-1 pt-2">
                  Acessos (Permissões Adicionais)
                </p>
                <p className="text-[10px] text-muted-foreground">
                  O role base já inclui permissões padrão. Marque aqui permissões adicionais ou use um template.
                </p>
                <PermissionMatrix selected={newPermissions} onChange={setNewPermissions} />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={creating || pwValidation.isChecking || pwValidation.localErrors.length > 0}>
                    {creating ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Criando...</> : 'Criar Usuário'}
                  </Button>
                </div>
              </form>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── EDIT USER DIALOG ─── */}
      <AlertDialog open={!!editingUser} onOpenChange={open => !open && setEditingUser(null)}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <button onClick={() => setEditingUser(null)} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"><X className="h-4 w-4" /><span className="sr-only">Fechar</span></button>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" /> Editar Usuário
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 mt-2 text-left">
                <p className="text-xs font-semibold text-foreground border-b border-border pb-1">Dados do Usuário</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Perfil de acesso</Label>
                    <select value={editRole} onChange={e => {
                        const newR = e.target.value;
                        setEditRole(newR);
                        const defaults = rolePermissionsMap[newR] || [];
                        setEditPermissions(new Set(defaults));
                      }}
                      className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground mt-1">
                      {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Cargo (opcional)</Label>
                    <select value={editJobRoleId} onChange={e => setEditJobRoleId(e.target.value)}
                      className="w-full h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground mt-1">
                      <option value="">Nenhum</option>
                      {jobRoles.filter(j => j.is_active).map(j => <option key={j.id} value={j.id}>{j.nome}</option>)}
                    </select>
                  </div>
                </div>

                <p className="text-xs font-semibold text-foreground border-b border-border pb-1 pt-2">
                  Permissões Adicionais (override)
                </p>
                <PermissionMatrix selected={editPermissions} onChange={setEditPermissions} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button size="sm" onClick={handleEditUser} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              Salvar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── RESET PASSWORD DIALOG ─── */}
      <AlertDialog open={!!resetUser} onOpenChange={open => { if (!open) { setResetUser(null); resetPw.setPassword(''); } }}>
        <AlertDialogContent>
          <button onClick={() => { setResetUser(null); resetPw.setPassword(''); }} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"><X className="h-4 w-4" /><span className="sr-only">Fechar</span></button>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Resetar Senha
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2 text-left">
                <p className="text-xs text-muted-foreground">
                  Definir nova senha temporária para <span className="font-semibold text-foreground">{resetUser?.nome || resetUser?.email}</span>.
                </p>
                <div>
                  <Label className="text-xs text-muted-foreground">Nova senha (mín. 12 caracteres)</Label>
                  <PasswordInput value={resetPw.password} onChange={e => resetPw.setPassword(e.target.value)} required minLength={12} wrapperClassName="mt-1" />
                  <PasswordStrengthMeter strength={resetPw.strength} strengthLabel={resetPw.strengthLabel} strengthColor={resetPw.strengthColor} errors={resetPw.localErrors} serverErrors={resetPw.serverErrors} />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button size="sm" onClick={handleResetPassword} disabled={resetting || resetPw.isChecking || resetPw.localErrors.length > 0}>
              {resetting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <KeyRound className="w-3 h-3 mr-1" />}
              Resetar Senha
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── DELETE USER DIALOG ─── */}
      <AlertDialog open={!!deleteUser} onOpenChange={open => { if (!open) { setDeleteUser(null); setDeleteMotivo(''); } }}>
        <AlertDialogContent>
          <button onClick={() => { setDeleteUser(null); setDeleteMotivo(''); }} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"><X className="h-4 w-4" /><span className="sr-only">Fechar</span></button>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Excluir Usuário
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2 text-left">
                <p className="text-xs text-muted-foreground">
                  Tem certeza que deseja excluir <span className="font-semibold text-foreground">{deleteUser?.nome || deleteUser?.email}</span>?
                  Esta ação irá desativar permanentemente o acesso e remover o perfil de acesso.
                </p>
                <div>
                  <Label className="text-xs text-muted-foreground">Motivo da exclusão (obrigatório)</Label>
                  <Input value={deleteMotivo} onChange={e => setDeleteMotivo(e.target.value)} placeholder="Ex: Desligamento, duplicado..." className="mt-1" />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button size="sm" variant="destructive" onClick={handleDeleteUser} disabled={deleting || deleteMotivo.trim().length < 3}>
              {deleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── CREATE JOB ROLE DIALOG ─── */}
      <AlertDialog open={showCreateJobRole} onOpenChange={setShowCreateJobRole}>
        <AlertDialogContent>
          <button onClick={() => setShowCreateJobRole(false)} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"><X className="h-4 w-4" /><span className="sr-only">Fechar</span></button>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" /> Novo Cargo
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 mt-2 text-left">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome do cargo</Label>
                  <Input value={newJrNome} onChange={e => setNewJrNome(e.target.value)} placeholder="Ex: Peixaria, Bar..." className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição (opcional)</Label>
                  <Input value={newJrDescricao} onChange={e => setNewJrDescricao(e.target.value)} placeholder="Descrição do cargo" className="mt-1" />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button size="sm" onClick={handleCreateJobRole} disabled={creatingJr || !newJrNome.trim()}>
              {creatingJr ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Criar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
      <ConfirmDialog />
    </>
  );
}
