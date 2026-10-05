import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** nova tentativa em andamento — desabilita o botão */
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Estado de erro de carregamento com nova tentativa. Erro nunca é exibido como zero nem como
 * lista vazia: use este componente no lugar do conteúdo que não pôde ser carregado.
 */
export default function ErrorState({
  title = 'Não foi possível carregar os dados',
  description,
  onRetry,
  retryLabel = 'Tentar novamente',
  retrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'bg-card border border-destructive-border rounded-xl text-center animate-fade-up',
        compact ? 'p-4 space-y-1' : 'p-8 space-y-3',
        className,
      )}
    >
      <div className={cn(
        'mx-auto rounded-full bg-destructive-soft flex items-center justify-center',
        compact ? 'w-10 h-10' : 'w-14 h-14',
      )}>
        <AlertTriangle aria-hidden="true" className={cn('text-destructive', compact ? 'w-5 h-5' : 'w-7 h-7')} />
      </div>
      <p className={cn('font-medium text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && (
        <p className={cn('text-muted-foreground max-w-sm mx-auto', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={retrying}>
          <RefreshCw aria-hidden="true" className={cn('w-4 h-4 mr-1.5', retrying && 'animate-spin')} />
          {retrying ? 'Tentando…' : retryLabel}
        </Button>
      )}
    </div>
  );
}
