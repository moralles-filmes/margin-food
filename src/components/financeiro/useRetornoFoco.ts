import { useRef } from 'react';

/**
 * Devolve o foco ao elemento que abriu o diálogo quando ele fecha.
 *
 * Os diálogos da Conciliação são abertos por estado (sem `DialogTrigger`), e o Radix só devolve o
 * foco ao trigger dele — sem trigger, o foco caía no corpo da página e quem usa teclado perdia a
 * linha em que estava. Uso: `<DialogContent {...retornoFoco}>` (vale também para `AlertDialogContent`).
 * Se o elemento de origem saiu da tela (ex.: a linha foi processada), usa `reserva` quando houver
 * (ex.: o campo de arquivo, que fica desabilitado — e sem foco — enquanto o extrato é lido); senão,
 * fica o comportamento padrão.
 */
export function useRetornoFoco(reserva?: () => HTMLElement | null) {
  const origem = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      // Roda antes de o Radix mover o foco para dentro do diálogo.
      origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      const candidatos = [origem.current, reserva?.() ?? null];
      origem.current = null;
      const el = candidatos.find(c => c && c.isConnected && c !== document.body && !(c as HTMLInputElement).disabled);
      if (el) {
        event.preventDefault();
        el.focus({ preventScroll: true });
      }
    },
  };
}
