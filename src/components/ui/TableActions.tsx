import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { useCan } from '@/permissions/hooks';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface TableActionsProps {
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  editPermission?: string;
  deletePermission?: string;
  isDeleting?: boolean;
  canEditOverride?: boolean;
  canDeleteOverride?: boolean;
  deleteConfirmTitle?: string;
  deleteConfirmDescription?: string;
  className?: string;
  size?: 'sm' | 'default' | 'icon';
  hideConfirm?: boolean;
  /** Nome acessível do botão de editar (ex.: "Editar <descrição>"); sem ele o botão só tem o ícone. */
  editLabel?: string;
  /** Nome acessível do botão de excluir. */
  deleteLabel?: string;
}

/**
 * Standardized component for Table row actions (Edit/Delete).
 * Enforces permission checks and confirmation dialogs.
 */
export default function TableActions({
  onEdit,
  onDelete,
  editPermission,
  deletePermission,
  isDeleting = false,
  canEditOverride,
  canDeleteOverride,
  deleteConfirmTitle = 'Confirmar exclusão',
  deleteConfirmDescription = 'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
  className = 'flex gap-1',
  size = 'icon',
  hideConfirm = false,
  editLabel,
  deleteLabel,
}: TableActionsProps) {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  
  const hasEditPerm = useCan(editPermission || '');
  const hasDeletePerm = useCan(deletePermission || '');
  
  const canShowEdit = onEdit && (canEditOverride !== undefined ? canEditOverride : (editPermission ? hasEditPerm : true));
  const canShowDelete = onDelete && (canDeleteOverride !== undefined ? canDeleteOverride : (deletePermission ? hasDeletePerm : true));

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (hideConfirm) {
      if (onDelete) await onDelete();
      return;
    }

    const ok = await confirm({
      title: deleteConfirmTitle,
      description: deleteConfirmDescription,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    
    if (ok && onDelete) {
      await onDelete();
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit();
  };

  if (!canShowEdit && !canShowDelete) return null;

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      {canShowEdit && (
        <Button
          size={size}
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={handleEdit}
          disabled={isDeleting}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil aria-hidden={editLabel ? true : undefined} className="w-3.5 h-3.5" />
        </Button>
      )}
      {canShowDelete && (
        <Button
          size={size}
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          {isDeleting ? (
            <Loader2 aria-hidden={deleteLabel ? true : undefined} className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 aria-hidden={deleteLabel ? true : undefined} className="w-3.5 h-3.5" />
          )}
        </Button>
      )}
      <ConfirmDialog />
    </div>
  );
}
