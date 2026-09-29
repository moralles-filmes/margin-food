import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';

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

export function useNotifications(userId: string | undefined) {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, company_id, recipient_user_id, type, module, title, message, entity_type, entity_id, link_path, created_by, created_at, read_at, metadata')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data as unknown as AppNotification[]);
    setLoading(false);
  }, [userId, supabase]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }, [supabase]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const unreadExists = notifications.some(n => !n.read_at);
    if (!unreadExists) return;

    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (error) { console.error('markAllAsRead error:', error); return; }

    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || now })));
  }, [userId, notifications, supabase]);

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
      })
      // O servidor marca como lido o aviso de requisição aberta quando outro
      // aprovador a atende; sem isso o sininho só baixaria ao recarregar.
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `company_id=eq.${companyId}`,
      }, (payload: any) => {
        const row = payload.new as AppNotification;
        if (!active || row.company_id !== companyId || row.recipient_user_id !== userId) return;
        setNotifications(prev => prev.map(n => n.id === row.id ? { ...n, read_at: row.read_at } : n));
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId, companyId, supabase]);

  return { notifications, unreadCount, loading, load, markAsRead, markAllAsRead };
}
