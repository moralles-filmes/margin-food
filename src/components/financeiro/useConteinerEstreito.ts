import { useLayoutEffect, useState } from 'react';

/**
 * Diz se o contêiner tem menos de `limitePx` de largura — para trocar tabela ⇄ lista com UMA só
 * marcação no DOM.
 *
 * O Livro Razão (Fase 04A) mantém as duas versões no DOM e esconde uma por container query. Na
 * Conciliação isso não serve: as linhas do extrato não são paginadas e cada uma carrega checkbox,
 * combobox de categoria e até sete ações — duas cópias dobrariam os controles e o custo de cada
 * render a cada clique.
 *
 * Devolve um ref de callback (o contêiner pode surgir depois do 1º render) e o estado. Antes da
 * primeira medida parte da largura da janela (o contêiner nunca é mais largo que ela); onde não há
 * layout (jsdom), medida zero é ignorada e vale essa largura inicial.
 *
 * Histerese: depois de virar lista, só volta a tabela com `HISTERESE_PX` a mais. Sem ela, abrir um
 * diálogo (o Radix esconde a barra de rolagem e o contêiner ganha ~8–17 px) trocava a marcação perto
 * do limite e desmontava o botão que abriu o diálogo — o foco não tinha para onde voltar.
 */
const HISTERESE_PX = 32;

export function useConteinerEstreito(limitePx: number) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [estreito, setEstreito] = useState(() => typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < limitePx);

  useLayoutEffect(() => {
    if (!el) return;
    const aplicar = (largura: number) => {
      if (largura > 0) setEstreito(atual => largura < limitePx + (atual ? HISTERESE_PX : 0));
    };
    aplicar(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) aplicar(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, limitePx]);

  return [setEl, estreito] as const;
}
