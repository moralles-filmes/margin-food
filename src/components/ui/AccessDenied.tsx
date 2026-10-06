import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccessDeniedProps {
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Estado único de "sem permissão" para telas e seções. É só apresentação: quem decide o acesso
 * continua sendo o guard de permissão do consumidor (`useCan`/RLS) — nunca devolver `null` no lugar.
 */
export default function AccessDenied({
  title = 'Acesso restrito',
  description = 'Você não tem permissão para acessar esta área.',
  compact = false,
  className,
}: AccessDeniedProps) {
  return (
    <div
      role="status"
      className={cn(
        'bg-card border border-border rounded-xl text-center animate-fade-up',
        compact ? 'p-4 space-y-1' : 'p-8 space-y-3',
        className,
      )}
    >
      <div className={cn(
        'mx-auto rounded-full bg-muted flex items-center justify-center',
        compact ? 'w-10 h-10' : 'w-14 h-14',
      )}>
        <Lock aria-hidden="true" className={cn('text-muted-foreground', compact ? 'w-5 h-5' : 'w-7 h-7')} />
      </div>
      <p className={cn('font-medium text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <p className={cn('text-muted-foreground max-w-sm mx-auto', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
    </div>
  );
}
