import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useNotificationsContext } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useOpenNotification } from '@/hooks/useOpenNotification';

const AUTH_ROUTES = ['/login', '/reset-password'];

export default function RequisicaoNotificationModal() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { user } = useAuth();
  const location = useLocation();
  const { pendingRequisicaoAck: pending, markAsRead } = useNotificationsContext();
  const openNotification = useOpenNotification();
  const [confirming, setConfirming] = useState(false);

  if (!user || AUTH_ROUTES.includes(location.pathname)) return null;
  if (!pending) return null;

  const handleConfirm = async (openAfter: boolean) => {
    if (confirming) return;
    setConfirming(true);
    try {
      const { error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'marcar_requisicao_visto', requisicao_id: pending.entity_id },
      });
      if (error) throw error;
      await markAsRead(pending.id);
      if (openAfter) openNotification(pending);
    } catch (err) {
      console.error('[RequisicaoNotificationModal.handleConfirm]', err);
      toast.error('Não foi possível confirmar. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{pending.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {pending.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => handleConfirm(true)} disabled={confirming}>
            Confirmar e ver requisição
          </Button>
          <AlertDialogAction onClick={() => handleConfirm(false)} disabled={confirming}>
            {confirming ? 'Confirmando...' : 'Confirmar recebimento da informação'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
