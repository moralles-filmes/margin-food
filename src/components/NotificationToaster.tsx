import { useEffect } from 'react';
import { useNotificationsContext } from '@/contexts/NotificationsContext';
import { useOpenNotification } from '@/hooks/useOpenNotification';
import { useScopedToast } from '@/hooks/useScopedToast';

/** Tipos que, além do sininho, avisam na hora. Menção = responsável por um pedido de compra. */
const TOAST_TYPES = new Set(['MENTION']);

/**
 * Aviso imediato de menções. Usa a assinatura Realtime do NotificationsProvider,
 * em vez de abrir um segundo canal na mesma tabela.
 */
export default function NotificationToaster() {
  const { subscribeInsert, markAsRead } = useNotificationsContext();
  const openNotification = useOpenNotification();
  const toast = useScopedToast();

  useEffect(() => subscribeInsert(notification => {
    if (!TOAST_TYPES.has(notification.type) || notification.read_at) return;
    toast.info(notification.title, {
      description: notification.message,
      duration: 8000,
      action: {
        label: 'Ver agora',
        onClick: () => {
          void markAsRead(notification.id);
          openNotification(notification);
        },
      },
    });
  }), [subscribeInsert, markAsRead, openNotification, toast]);

  return null;
}
