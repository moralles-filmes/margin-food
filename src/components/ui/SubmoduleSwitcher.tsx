import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SubmoduleItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

interface SubmoduleSwitcherProps<T extends string> {
  items: SubmoduleItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Label to display on trigger when value is not in items (group-level fallback) */
  groupLabel?: string;
  /** Icon to display on trigger when value is not in items */
  groupIcon?: LucideIcon;
}

export function SubmoduleSwitcher<T extends string>({
  items,
  value,
  onChange,
  className,
  groupLabel,
  groupIcon,
}: SubmoduleSwitcherProps<T>) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const active = items.find(i => i.id === value);
  // When value not found: if groupLabel provided, show ghost group button; else fall back to items[0]
  const isGroupInactive = !active && !!groupLabel;
  const displayItem = active ?? (!groupLabel ? items[0] : undefined);
  const DisplayIcon = displayItem?.icon ?? groupIcon;
  const displayLabel = displayItem?.label ?? groupLabel ?? '';

  function handleSelect(id: T) {
    onChange(id);
    setDrawerOpen(false);
  }

  const triggerContent = (
    <>
      {DisplayIcon && <DisplayIcon className="w-4 h-4 shrink-0" />}
      <span className="flex-1 text-left">{displayLabel}</span>
      {displayItem && !!displayItem.badge && (
        <span className="min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold leading-none">
          {displayItem.badge > 99 ? '99+' : displayItem.badge}
        </span>
      )}
      <ChevronDown className="w-4 h-4 shrink-0 opacity-70" />
    </>
  );

  const activeCls = 'bg-primary-soft text-primary-soft-foreground border border-primary-border font-medium';
  const inactiveCls = 'bg-secondary text-foreground border border-transparent hover:bg-secondary/80 transition-colors';

  if (isMobile) {
    return (
      <div className={className}>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium',
              isGroupInactive ? inactiveCls : activeCls,
            )}
          >
            {triggerContent}
          </button>
          <DrawerContent>
            <DrawerHeader className="text-left pb-2">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-sm font-semibold">Selecionar módulo</DrawerTitle>
                <DrawerClose asChild>
                  <button type="button" className="text-xs text-muted-foreground px-2 py-1 rounded hover:bg-secondary">Fechar</button>
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div className="px-4 pb-6 flex flex-col gap-1 overflow-y-auto max-h-[60vh]">
              {items.map(item => {
                const Icon = item.icon;
                const isActive = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors text-left w-full',
                      isActive
                        ? 'bg-primary-soft text-primary-soft-foreground'
                        : 'hover:bg-secondary text-foreground',
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {!!item.badge && (
                      <span className="min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold leading-none">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    {isActive && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium min-w-[180px] max-w-xs',
              isGroupInactive ? inactiveCls : activeCls,
            )}
          >
            {triggerContent}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px] p-1">
          {items.map(item => {
            const Icon = item.icon;
            const isActive = item.id === value;
            return (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer',
                  isActive && 'bg-primary-soft text-primary-soft-foreground font-medium',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                {isActive && <Check className="w-4 h-4 shrink-0 text-primary-soft-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
