import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Users, ShieldCheck, ShieldOff, History, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  is_super_admin: boolean;
}

interface AuditEntry {
  id: string;
  created_at: string;
  actor_user_id: string;
  action: string;
  target_email: string | null;
  details: Record<string, unknown> | null;
}

export default function AccessManagementCard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  // Promote/Demote modal
  const [modalOpen, setModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserItem | null>(null);
  const [promoting, setPromoting] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNome, setNewNome] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_list_users');
      if (error) {
        toast.error('Erro ao carregar usuários: ' + error.message);
      } else {
        setUsers(data as UserItem[]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('admin_actions_log')
        .select('id, created_at, actor_user_id, action, target_email, details')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setAuditLogs((data as AuditEntry[]) || []);
    } catch (e) {
      console.error('[AccessManagementCard.fetchAudit]', e);
      toast.error('Não foi possível carregar o log de auditoria.');
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAudit();
  }, [fetchUsers, fetchAudit]);

  // ── Promote/Demote ──
  const openModal = (u: UserItem, enable: boolean) => {
    setTargetUser(u);
    setPromoting(enable);
    setEmailInput('');
    setPhraseInput('');
    setModalOpen(true);
  };

  const expectedPhrase = promoting ? 'PROMOVER' : 'REBAIXAR';
  const canSubmit = targetUser && emailInput === targetUser.email && phraseInput === expectedPhrase;

  const handleSubmit = async () => {
    if (!targetUser || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_set_super_admin', {
        p_target_user_id: targetUser.id,
        p_enable: promoting,
        p_confirmation_email: emailInput,
        p_confirmation_phrase: phraseInput,
      });
      if (error) {
        toast.error('Erro: ' + error.message);
      } else if (data && !data.success) {
        toast.error(data.error || 'Erro desconhecido');
      } else {
        toast.success(data?.message || 'Operação concluída');
        setModalOpen(false);
        fetchUsers();
        fetchAudit();
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Create User ──
  const handleCreateUser = async () => {
    if (!newEmail.trim()) {
      toast.error('Email é obrigatório');
      return;
    }
    if (!sendInvite && (!newPassword || newPassword.length < 12)) {
      toast.error('Senha deve ter no mínimo 12 caracteres');
      return;
    }
    setCreating(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        toast.error('Sessão expirada');
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          nome: newNome.trim() || undefined,
          send_invite: sendInvite,
          password: sendInvite ? undefined : newPassword,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || 'Erro ao criar usuário');
      } else {
        toast.success(`Usuário ${result.email} criado com sucesso`);
        setCreateOpen(false);
        setNewEmail('');
        setNewNome('');
        setNewPassword('');
        setSendInvite(true);
        fetchUsers();
        fetchAudit();
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Gestão de Acessos (Super Admin)
            <div className="ml-auto flex gap-1">
              <Button variant="outline" size="sm" className="h-6 px-2 gap-1" onClick={() => setCreateOpen(true)}>
                <UserPlus className="w-3 h-3" />
                <span className="text-xs">Adicionar usuário</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={fetchUsers}>
                <span className="text-xs">Atualizar</span>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-xs text-muted-foreground animate-pulse">Carregando...</p>}

          {!loading && users.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2">Email</th>
                    <th className="text-left py-2 px-2">Nome</th>
                    <th className="text-center py-2 px-2">Super Admin</th>
                    <th className="text-right py-2 px-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border hover:bg-surface-hover">
                      <td className="py-2 px-2 font-mono text-foreground">{u.email}</td>
                      <td className="py-2 px-2 text-foreground">{u.name || '—'}</td>
                      <td className="py-2 px-2 text-center">
                        {u.is_super_admin ? (
                          <span className="text-success font-semibold">SIM</span>
                        ) : (
                          <span className="text-muted-foreground">NÃO</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {u.is_super_admin ? (
                          u.id === user?.id ? (
                            <span className="text-[10px] text-muted-foreground italic">Você</span>
                          ) : (
                            <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => openModal(u, false)}>
                              <ShieldOff className="w-3 h-3" /> Rebaixar
                            </Button>
                          )
                        ) : (
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => openModal(u, true)}>
                            <ShieldCheck className="w-3 h-3" /> Promover
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit sub-card */}
          {auditLogs.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                <History className="w-3 h-3" /> Auditoria (últimos 20)
              </h4>
              <div className="space-y-1 max-h-48 overflow-auto">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-[11px] font-mono border-b border-border py-1">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`font-semibold ${log.action === 'SET_SUPER_ADMIN' ? 'text-success' : log.action.includes('CREATED') || log.action.includes('INVITED') ? 'text-info' : 'text-destructive'}`}>
                      {log.action}
                    </span>
                    <span className="text-foreground truncate">{log.target_email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promote/Demote Confirmation Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {promoting ? 'Promover a Super Admin' : 'Remover Super Admin'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {promoting
                ? `Você está prestes a conceder acesso total (system:global:manage) para ${targetUser?.email}.`
                : `Você está prestes a remover o acesso super_admin de ${targetUser?.email}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirme o email do usuário</label>
              <Input
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder={targetUser?.email}
                className="mt-1 text-sm font-mono"
              />
              {emailInput && emailInput !== targetUser?.email && (
                <p className="text-[10px] text-destructive mt-1">Email não confere</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Digite <strong className="text-foreground">{expectedPhrase}</strong> para confirmar
              </label>
              <Input
                value={phraseInput}
                onChange={e => setPhraseInput(e.target.value.toUpperCase())}
                placeholder={expectedPhrase}
                className="mt-1 text-sm font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={promoting ? 'default' : 'destructive'}
              size="sm"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Processando...' : promoting ? 'Confirmar Promoção' : 'Confirmar Remoção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar Usuário</DialogTitle>
            <DialogDescription className="text-sm">
              O novo usuário será vinculado automaticamente ao seu tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email *</label>
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <Input
                value={newNome}
                onChange={e => setNewNome(e.target.value)}
                placeholder="Nome completo (opcional)"
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-invite"
                checked={sendInvite}
                onCheckedChange={(v) => setSendInvite(!!v)}
              />
              <label htmlFor="send-invite" className="text-xs text-muted-foreground cursor-pointer">
                Enviar convite por email (magic link)
              </label>
            </div>
            {!sendInvite && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Senha (mín. 12 caracteres)</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 text-sm"
                />
                {newPassword && newPassword.length < 12 && (
                  <p className="text-[10px] text-destructive mt-1">Mínimo 12 caracteres</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={creating || !newEmail.trim() || (!sendInvite && newPassword.length < 12)}
              onClick={handleCreateUser}
            >
              {creating ? 'Criando...' : sendInvite ? 'Enviar Convite' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
