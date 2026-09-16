import { useMemo } from 'react';
import { toast } from 'sonner';
import { useScopeActivity } from './useScopeActivity';

/** O resultado atrasado de uma unidade encerrada não notifica a unidade atual. */
export function useScopedToast(): typeof toast {
  const isActive = useScopeActivity();
  return useMemo(() => new Proxy(toast, {
    apply(target, receiver, args) { return isActive() ? Reflect.apply(target, receiver, args) : ''; },
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function'
        ? (...args: unknown[]) => isActive() ? Reflect.apply(value, target, args) : ''
        : value;
    },
  }), [isActive]);
}
