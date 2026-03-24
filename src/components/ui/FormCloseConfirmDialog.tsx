/**
 * ─── FormCloseConfirmDialog ───
 * Reusable confirmation dialog for unsaved form changes.
 */

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
}

export default function FormCloseConfirmDialog({ open, onConfirmLeave, onCancelLeave }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancelLeave(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem alterações não salvas. Deseja sair sem salvar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancelLeave}>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Sair sem salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
