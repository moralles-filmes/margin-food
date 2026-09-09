import { useCallback, useRef } from 'react';

export function useQuantityNavigation() {
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const focus = useCallback((id: string) => {
    const input = inputs.current.get(id);
    if (!input || input.disabled) return false;
    input.focus();
    input.select();
    input.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return true;
  }, []);

  return {
    register: (id: string, input: HTMLInputElement | null) => {
      if (input) inputs.current.set(id, input);
      else inputs.current.delete(id);
    },
    focus,
    next: (id: string, visibleIds: string[]) => {
      const index = visibleIds.indexOf(id);
      if (index < 0) return false;
      for (const nextId of visibleIds.slice(index + 1)) {
        if (focus(nextId)) return true;
      }
      inputs.current.get(id)?.blur();
      return false;
    },
  };
}
