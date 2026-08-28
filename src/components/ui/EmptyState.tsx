import { LucideIcon, PackageOpen } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'bg-card border border-dashed border-border rounded-xl text-center animate-fade-up',
      compact ? 'p-4 space-y-1' : 'p-8 space-y-3',
      className,
    )}>
      <div className={cn(
        'mx-auto rounded-full bg-muted flex items-center justify-center',
        compact ? 'w-10 h-10' : 'w-14 h-14',
      )}>
        <Icon className={cn('text-muted-foreground', compact ? 'w-5 h-5' : 'w-7 h-7')} />
      </div>
      <p className={cn('font-medium text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <p className={cn('text-muted-foreground max-w-sm mx-auto', compact ? 'text-[11px]' : 'text-sm')}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
