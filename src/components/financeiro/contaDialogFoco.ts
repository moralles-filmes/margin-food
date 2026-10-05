/**
 * Encadeamento de foco entre o detalhe e o formulário de conta (Redesign V2, Fase 05A).
 *
 * "Editar lançamento" no `ContaDetailDialog` fecha o detalhe e abre o `ContaFormDialog`. O elemento
 * que abriu o formulário (o botão dentro do detalhe) sai da tela junto com o detalhe; sem isto, ao
 * fechar o formulário o foco caía no corpo da página. O detalhe guarda aqui quem o abriu (a linha) e
 * o formulário usa como reserva — vale para Contas a Pagar, Contas a Receber e Livro Razão sem mudar
 * nenhum desses consumidores.
 */
let origemDoDetalhe: HTMLElement | null = null;

export function guardarOrigemDoDetalhe(el: HTMLElement | null) {
  origemDoDetalhe = el;
}

/** Devolve a origem guardada (se ainda está na tela) e limpa, para não vazar para outra abertura. */
export function tomarOrigemDoDetalhe(): HTMLElement | null {
  const el = origemDoDetalhe;
  origemDoDetalhe = null;
  return el && el.isConnected ? el : null;
}
