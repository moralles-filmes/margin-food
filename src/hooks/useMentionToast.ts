import { useSupabase, useCompanyScope } from '@/contexts/CompanyScopeContext';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';


export function useMentionToast(userId: string | undefined, onNavigate: () => void) {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId;
  const sessionKey = `mentions_toast_last_shown_at:${userId}:${companyId}`;
  const shownRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!userId || shownRef.current) return;

    const checkMentions = async () => {
      const lastShown = sessionStorage.getItem(sessionKey);

      let query = supabase
        .from('notifications')
        .select('id, created_at')
        .eq('recipient_user_id', userId)
        .eq('type', 'MENTION_MARKET_SEASONAL')
        .is('read_at', null);

      if (lastShown) {
        query = query.gt('created_at', lastShown);
      }

      const { data } = await query;
      if (!active || !data || data.length === 0) return;

      shownRef.current = true;
      sessionStorage.setItem(sessionKey, new Date().toISOString());

      toast.info(`Você tem ${data.length} menção(ões) pendente(s) em Requisições.`, {
        duration: 10000,
        action: {
          label: 'Ver agora',
          onClick: onNavigate,
        },
        cancel: {
          label: 'Depois',
          onClick: () => {},
        },
      });
    };

    checkMentions();
    return () => { active = false; };
  }, [userId, companyId, supabase, onNavigate, sessionKey]);

  // Realtime: listen for new notifications
  useEffect(() => {
    if (!userId || !companyId) return;
    let active = true;

    const channel = supabase
      .channel('mention-toast-' + userId + ':' + companyId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${companyId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!active || row.company_id !== companyId || row.recipient_user_id !== userId) return;
          if (row?.type === 'MENTION_MARKET_SEASONAL' && !row?.read_at) {
            sessionStorage.setItem(sessionKey, new Date().toISOString());
            toast.info('Nova menção recebida em Mercado & Sazonais', {
              duration: 8000,
              action: {
                label: 'Ver agora',
                onClick: onNavigate,
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId, companyId, supabase, onNavigate, sessionKey]);
}
