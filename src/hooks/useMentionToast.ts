import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SESSION_KEY = 'mentions_toast_last_shown_at';

export function useMentionToast(userId: string | undefined, onNavigate: () => void) {
  const shownRef = useRef(false);

  useEffect(() => {
    if (!userId || shownRef.current) return;

    const checkMentions = async () => {
      const lastShown = sessionStorage.getItem(SESSION_KEY);

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
      if (!data || data.length === 0) return;

      shownRef.current = true;
      sessionStorage.setItem(SESSION_KEY, new Date().toISOString());

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
  }, [userId, onNavigate]);

  // Realtime: listen for new notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('mention-toast-' + userId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.type === 'MENTION_MARKET_SEASONAL' && !row?.read_at) {
            sessionStorage.setItem(SESSION_KEY, new Date().toISOString());
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
      supabase.removeChannel(channel);
    };
  }, [userId, onNavigate]);
}
