import { type LucideIcon } from 'lucide-react';
import { SubmoduleSwitcher, type SubmoduleItem } from '@/components/ui/SubmoduleSwitcher';
import { cn } from '@/lib/utils';

export interface ModuleNavItem<T extends string = string> {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When present, this item renders as a group trigger with a dropdown (desktop) / drawer (mobile) of sub-items. */
  children?: SubmoduleItem<T>[];
}

interface ModuleNavProps<T extends string> {
  items: ModuleNavItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

export function ModuleNav<T extends string>({ items, value, onChange, className }: ModuleNavProps<T>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 pb-3 border-b border-border', className)}>
      {items.map(item => {
        if (item.children) {
          return (
            <SubmoduleSwitcher
              key={item.id}
              items={item.children}
              value={value}
              onChange={onChange}
              groupLabel={item.label}
              groupIcon={item.icon}
            />
          );
        }

        const Icon = item.icon;
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id as T)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
              isActive
                ? 'bg-primary-soft text-primary-ink border-primary-border'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
