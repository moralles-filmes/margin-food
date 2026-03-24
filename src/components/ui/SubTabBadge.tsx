/**
 * ─── SubTabBadge ───
 * Reusable badge counter for sub-tab navigation.
 * Displays a red pill with count when count > 0.
 * Positioned absolutely relative to parent (parent needs `relative`).
 */

import { cn } from '@/lib/utils';

interface SubTabBadgeProps {
  count: number | undefined;
  /** Max display value before showing "9+" etc. Default: 99 */
  max?: number;
  className?: string;
}

export default function SubTabBadge({ count, max = 99, className }: SubTabBadgeProps) {
  if (!count || count <= 0) return null;

  const display = count > max ? `${max}+` : String(count);

  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold leading-none',
        className,
      )}
      aria-label={`${count} pendente${count !== 1 ? 's' : ''}`}
    >
      {display}
    </span>
  );
}
