import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveNotificationTarget, type NotificationLink } from '@/lib/notificationTarget';
import { requestNavigation } from '@/hooks/useNavigationRequest';

/** Abre o destino de uma notificação. Devolve `false` quando ela não aponta para lugar nenhum. */
export function useOpenNotification() {
  const navigate = useNavigate();
  return useCallback((notification: NotificationLink): boolean => {
    const target = resolveNotificationTarget(notification);
    if (!target) return false;
    if (target.href) {
      navigate(target.href);
      // A troca de rota nem sempre muda o caminho (outra decisão na mesma tela);
      // o módulo é pedido também, senão ficaria na aba em que o usuário estava.
      requestNavigation({ tab: target.tab });
    } else {
      requestNavigation(target);
    }
    return true;
  }, [navigate]);
}
