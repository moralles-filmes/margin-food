import { useEffect, useRef } from 'react';
import type { TabId } from '@/types/salmon';

/**
 * Leva o clique do sininho até a aba interna do módulo. As views são lazy: quando
 * o clique troca de módulo, a view de destino ainda não montou e um evento
 * disparado naquele instante se perde. O pedido fica guardado aqui e a view o
 * consome ao montar — ou na hora, se já estava aberta.
 */
const EVENT = 'notification-subtab';
const MAX_AGE_MS = 15_000;

let pending: { tab: TabId; subtab: string; at: number } | null = null;

export function requestNotificationSubtab(tab: TabId, subtab: string) {
  pending = { tab, subtab, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT));
}

function takePending(tab: TabId): string | null {
  if (!pending || pending.tab !== tab) return null;
  const { subtab, at } = pending;
  pending = null;
  return Date.now() - at <= MAX_AGE_MS ? subtab : null;
}

export function useNotificationSubtab(tab: TabId, onSubtab: (subtab: string) => void) {
  const handlerRef = useRef(onSubtab);
  handlerRef.current = onSubtab;

  useEffect(() => {
    const consume = () => {
      const subtab = takePending(tab);
      if (subtab) handlerRef.current(subtab);
    };
    consume();
    window.addEventListener(EVENT, consume);
    return () => window.removeEventListener(EVENT, consume);
  }, [tab]);
}
