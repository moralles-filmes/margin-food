import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  onNavigate?: (tabId: string, linkPath?: string) => void;
}

const MODULE_LABELS: Record<string, string> = {
  purchases: 'Compras',
  stock: 'Estoque',
  inventory: 'Inventário',
  finance: 'Financeiro',
  rh: 'RH',
};

export default function NotificationBell({ onNavigate }: Props) {
  const { user } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = filter === 'unread' ? notifications.filter(n => !n.read_at) : notifications;

  const handleClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.link_path && onNavigate) {
      // Parse link_path for tab + query params
      const url = new URL(n.link_path, 'https://placeholder');
      const tab = url.pathname.replace('/', '').split('/')[0];
      if (tab) {
        // Pass full link_path so parent can extract subtab/order params
        onNavigate(tab, n.link_path);
      }
    } else if (n.module && onNavigate) {
      const moduleTabMap: Record<string, string> = {
        purchases: 'compras',
        stock: 'estoque-geral',
        inventory: 'inventario',
        finance: 'financeiro',
        rh: 'rh',
      };
      const tabId = moduleTabMap[n.module];
      if (tabId) onNavigate(tabId);
    }
    setOpen(false);
  };

  const timeAgo = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-[420px] bg-card border border-border rounded-xl shadow-xl z-50 animate-scale-in flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-foreground">Notificações</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilter('unread')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${filter === 'unread' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Não lidas
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${filter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Todas
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Inbox className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">Nenhuma notificação</p>
              </div>
            ) : (
              filtered.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-accent/50 transition-colors ${!n.read_at ? 'bg-primary/5' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read_at ? 'bg-primary' : 'bg-transparent'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={`text-[11px] font-medium truncate ${!n.read_at ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</p>
                      {n.module && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 flex-shrink-0">
                          {MODULE_LABELS[n.module] || n.module}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors mt-1"
                      title="Marcar como lida"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {unreadCount > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <Button size="sm" variant="ghost" className="w-full text-[10px] h-7 gap-1" onClick={markAllAsRead}>
                <CheckCheck className="w-3 h-3" /> Marcar todas como lidas
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
