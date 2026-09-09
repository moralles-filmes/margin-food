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
import { useNotificationsContext } from '@/contexts/NotificationsContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const AUTH_ROUTES = ['/login', '/reset-password'];

export default function RequisicaoNotificationModal() {
  const supabase = useSupabase();
  const { user } = useAuth();
  const location = useLocation();
  const { notifications, markAsRead } = useNotificationsContext();
  const [confirming, setConfirming] = useState(false);

  if (!user || AUTH_ROUTES.includes(location.pathname)) return null;

  // Pega a notificação pendente mais antiga (a lista vem desc; usamos o último não-lido)
  const pending = notifications
    .filter(n => n.type === 'REQUISICAO_ENCERRADA' && !n.read_at)
    .at(-1);

  if (!pending) return null;

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      const { error } = await supabase.functions.invoke('requisicao-estoque', {
        body: { action: 'marcar_requisicao_visto', requisicao_id: pending.entity_id },
      });
      if (error) throw error;
      markAsRead(pending.id);
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
          <AlertDialogAction onClick={handleConfirm} disabled={confirming}>
            {confirming ? 'Confirmando...' : 'Confirmar recebimento da informação'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
