import { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  favorite?: boolean;
  onFavoriteClick?: () => void;
  className?: string;
}

/**
 * Cabeçalho de página reutilizável (título + estrela opcional, subtítulo, ações à direita).
 * Ver docs/redesign/referencias/MOCKUPS.md "Cabeçalho de página". Adoção tela a tela: Fases 9 e 10.
 */
export default function PageHeader({ title, subtitle, actions, favorite, onFavoriteClick, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[26px] font-bold text-foreground tracking-tight truncate">{title}</h1>
          {favorite !== undefined && (
            onFavoriteClick ? (
              <button
                type="button"
                onClick={onFavoriteClick}
                aria-pressed={favorite}
                aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                className="shrink-0 text-muted-foreground hover:text-warning transition-colors"
              >
                <Star className={cn('w-5 h-5', favorite && 'fill-warning text-warning')} />
              </button>
            ) : (
              <Star aria-hidden="true" className={cn('w-5 h-5 shrink-0 text-muted-foreground', favorite && 'fill-warning text-warning')} />
            )
          )}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
