import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface AppNotification {
  company_id: string;
  id: string;
  recipient_user_id: string;
  type: string;
  module: string | null;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  link_path: string | null;
  created_by: string | null;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

const NOTIFICATION_SELECT = 'id, company_id, recipient_user_id, type, module, title, message, entity_type, entity_id, link_path, created_by, created_at, read_at, metadata';
const REQUISICAO_ENCERRADA = 'REQUISICAO_ENCERRADA';

type InsertListener = (notification: AppNotification) => void;

export function useNotifications(userId: string | undefined) {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  // O modal de requisição encerrada é bloqueante: o aviso não lido mais antigo
  // precisa aparecer mesmo depois de sair das 50 mais recentes do sininho.
  const [pendingRequisicaoAck, setPendingRequisicaoAck] = useState<AppNotification | null>(null);
  const pendingAckIdRef = useRef<string | null>(null);
  const insertListenersRef = useRef(new Set<InsertListener>());

  const loadPendingAck = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIFICATION_SELECT)
      .eq('recipient_user_id', userId)
      .eq('type', REQUISICAO_ENCERRADA)
      .is('read_at', null)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) { console.error('loadPendingAck error:', error); return; }
    const pending = (data?.[0] as unknown as AppNotification | undefined) ?? null;
    pendingAckIdRef.current = pending?.id ?? null;
    setPendingRequisicaoAck(pending);
  }, [userId, supabase]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data, error }] = await Promise.all([
      supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      loadPendingAck(),
    ]);
    if (error) console.error('notifications load error:', error);
    if (data) setNotifications(data as unknown as AppNotification[]);
    setLoading(false);
  }, [userId, supabase, loadPendingAck]);

  const markAsRead = useCallback(async (id: string): Promise<boolean> => {
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: readAt }).eq('id', id).is('read_at', null);
    if (error) { console.error('markAsRead error:', error); return false; }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: n.read_at ?? readAt } : n));
    if (pendingAckIdRef.current === id) {
      pendingAckIdRef.current = null;
      setPendingRequisicaoAck(null);
      void loadPendingAck();
    }
    return true;
  }, [supabase, loadPendingAck]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const unreadExists = notifications.some(n => !n.read_at);
    if (!unreadExists) return;

    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (error) { console.error('markAllAsRead error:', error); return; }

    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })));
    void loadPendingAck();
  }, [userId, notifications, supabase, loadPendingAck]);

  /** Avisa de cada notificação que chega pelo Realtime (não das que já estavam carregadas). */
  const subscribeInsert = useCallback((listener: InsertListener) => {
    insertListenersRef.current.add(listener);
    return () => { insertListenersRef.current.delete(listener); };
  }, []);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!userId || !companyId) return;
    let active = true;
    const channel = supabase
      .channel('notif-bell-' + userId + ':' + companyId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `company_id=eq.${companyId}`,
      }, (payload: any) => {
        const row = payload.new as AppNotification;
        if (!active || row.company_id !== companyId || row.recipient_user_id !== userId) return;
        setNotifications(prev => [row, ...prev].slice(0, 50));
        if (row.type === REQUISICAO_ENCERRADA) void loadPendingAck();
        insertListenersRef.current.forEach(listener => listener(row));
      })
      // O servidor marca como lido o aviso de requisição aberta quando outro
      // aprovador a atende, e reabre o de requisição encerrada quando o resultado
      // muda; sem isso o sininho só acompanharia ao recarregar.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `company_id=eq.${companyId}`,
      }, (payload: any) => {
        const row = payload.new as AppNotification;
        if (!active || row.company_id !== companyId || row.recipient_user_id !== userId) return;
        setNotifications(prev => prev.map(n => n.id === row.id ? { ...n, ...row } : n));
        if (row.type === REQUISICAO_ENCERRADA) void loadPendingAck();
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId, companyId, supabase, loadPendingAck]);

  return {
    notifications, unreadCount, loading, load, markAsRead, markAllAsRead,
    pendingRequisicaoAck, subscribeInsert,
  };
}
