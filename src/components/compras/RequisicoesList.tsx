import { useState, useEffect, useCallback, useMemo } from 'react';
import { AtSign, CheckCheck, Inbox, RefreshCw, ExternalLink, Clock, Package, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { useCan } from '@/permissions/hooks';
interface MentionNotification {
  id: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  created_by: string | null;
  created_at: string;
  read_at: string | null;
  link_path: string | null;
}

interface OrderSnapshot {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  category: string;
  supplier_name: string | null;
  need_by_date: string | null;
  delivery_forecast_date: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  OPEN: { label: 'Aberto', color: 'bg-primary/15 text-primary', icon: Clock },
  IN_RECEIVING: { label: 'Em Recebimento', color: 'bg-warning/15 text-warning', icon: Package },
  PARTIAL: { label: 'Parcial', color: 'bg-warning/15 text-warning', icon: AlertTriangle },
  COMPLETED: { label: 'Concluído', color: 'bg-success/15 text-success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  URGENTE: 'bg-destructive/15 text-destructive',
  ALTA: 'bg-destructive/10 text-destructive',
  MEDIA: 'bg-warning/10 text-warning',
  BAIXA: 'bg-success/10 text-success',
};

interface Props {
  onNavigateToOrder?: (orderId: string) => void;
}

export default function RequisicoesList({
 onNavigateToOrder }: Props) {
  const canViewRbac = useCan('compras:lista:view');
  const { user } = useAuth();
  const [mentions, setMentions] = useState<(MentionNotification & { order?: OrderSnapshot })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch mention notifications for this user
    const { data: notifs } = await supabase
      .from('notifications')
      .select('id, title, message, entity_type, entity_id, created_by, created_at, read_at, link_path')
      .eq('recipient_user_id', user.id)
      .eq('type', 'MENTION')
      .eq('module', 'purchases')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!notifs || notifs.length === 0) {
      setMentions([]);
      setLoading(false);
      return;
    }

    // Fetch referenced orders
    const orderIds = [...new Set((notifs as MentionNotification[]).filter(n => n.entity_id).map(n => n.entity_id!))];
    const { data: orders } = orderIds.length > 0
      ? await supabase
          .from('purchase_orders')
          .select('id, title, status, type, priority, category, supplier_name, need_by_date, delivery_forecast_date')
          .in('id', orderIds)
      : { data: [] };

    const orderMap = new Map((orders || []).map(o => [o.id, o as unknown as OrderSnapshot]));

    setMentions((notifs as MentionNotification[]).map(n => ({
      ...n,
      order: n.entity_id ? orderMap.get(n.entity_id) : undefined,
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('mentions-requisicoes-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_user_id=eq.${user.id}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setMentions(prev => prev.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = mentions.filter(m => !m.read_at).map(m => m.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    setMentions(prev => prev.map(m => ({ ...m, read_at: m.read_at || new Date().toISOString() })));
    toast.success('Todas marcadas como lidas');
  }, [mentions]);

  const unreadCount = mentions.filter(m => !m.read_at).length;

  const handleOpen = (mention: MentionNotification & { order?: OrderSnapshot }) => {
    if (!mention.read_at) markAsRead(mention.id);
    if (mention.entity_id && onNavigateToOrder) {
      onNavigateToOrder(mention.entity_id);
    }
  };

  if (!canViewRbac) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AtSign className="w-4 h-4 text-warning" />
          <p className="text-sm font-semibold text-foreground">Menções Recebidas</p>
          {unreadCount > 0 && (
            <span className="bg-warning/15 text-warning text-[10px] px-2 py-0.5 rounded-full font-bold">{unreadCount} não lidas</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={markAllAsRead}>
              <CheckCheck className="w-3.5 h-3.5" /> Marcar todas lidas
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && mentions.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : mentions.length > 0 ? (
        <div className="space-y-2">
          {mentions.map((m, i) => {
            const order = m.order;
            const sc = order ? STATUS_CONFIG[order.status] || STATUS_CONFIG.OPEN : null;
            return (
              <button
                key={m.id}
                onClick={() => handleOpen(m)}
                className={`w-full text-left bg-card border rounded-xl p-3 transition-all animate-fade-up hover:border-primary/30 ${
                  m.read_at ? 'border-border opacity-75' : 'border-warning/30 bg-warning/5'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-start gap-3">
                  <AtSign className={`w-4 h-4 mt-0.5 flex-shrink-0 ${m.read_at ? 'text-muted-foreground' : 'text-warning'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!m.read_at && <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0" />}
                      <p className={`text-xs font-semibold ${m.read_at ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {order?.title || m.title}
                      </p>
                      {sc && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${sc.color}`}>{sc.label}</span>
                      )}
                      {order && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[order.priority] || ''}`}>{order.priority}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{m.message}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {order?.type && <span className="text-[9px] text-muted-foreground">{order.type}</span>}
                      {order?.category && <span className="text-[9px] text-muted-foreground">• {order.category}</span>}
                      {order?.supplier_name && <span className="text-[9px] text-muted-foreground">• {order.supplier_name}</span>}
                      {order?.need_by_date && <span className="text-[9px] text-muted-foreground">• Necessidade: {order.need_by_date}</span>}
                      <span className="text-[9px] text-muted-foreground ml-auto">{(() => { try { return new Date(m.created_at).toLocaleString('pt-BR'); } catch { return m.created_at; } })()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!m.read_at && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] gap-0.5" onClick={e => { e.stopPropagation(); markAsRead(m.id); }}>
                        <CheckCheck className="w-3 h-3" /> Lida
                      </Button>
                    )}
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma menção</p>
          <p className="text-xs text-muted-foreground">Quando alguém mencionar você como responsável em um pedido, aparecerá aqui.</p>
        </div>
      )}
    </div>
  );
}
