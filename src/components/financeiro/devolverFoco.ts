/**
 * Foco depois de uma confirmação de `useConfirmDialog` (Redesign V2, Fase 05B).
 *
 * A confirmação abre por estado, sem gatilho, e o Radix deixa o foco no corpo da página ao fechar —
 * quem usa teclado perdia a linha de onde pediu "Excluir"/"Desativar". Guarde o elemento antes de
 * chamar `confirm()` e devolva depois: se a linha sumiu (exclusão concluída) ou o botão ficou
 * desabilitado, nada acontece.
 */
export function elementoComFoco(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

export function devolverFoco(origem: HTMLElement | null) {
  if (!origem) return;
  requestAnimationFrame(() => {
    if (origem.isConnected && !(origem as HTMLButtonElement).disabled) origem.focus({ preventScroll: true });
  });
}
