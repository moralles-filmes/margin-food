/**
 * Idempotência das criações do Financeiro (Livro Razão, transferência, Contas a
 * Pagar/Receber). A chave vem de `useChavesPendentes` (semente por conteúdo
 * pendente, `@/lib/chaveOperacao`); aqui ficam só os erros das RPCs.
 */

/**
 * Erros das RPCs de criação ligados à idempotência. Devolve `null` quando a
 * mensagem não é de idempotência, para a tela seguir com o tratamento dela.
 */
export function traduzirErroIdempotencia(mensagem: string | undefined): string | null {
  const msg = mensagem ?? '';
  if (msg.includes('REQUEST_ID_REUTILIZADO')) {
    // Só acontece se a chave de uma confirmação anterior for reenviada com outro
    // conteúdo. A tela renova a chave sozinha; a orientação é conferir e refazer.
    return 'Este envio não confere com o registro já gravado. Recarregue a tela e confira antes de lançar de novo.';
  }
  if (msg.includes('PARCELA_FORA_DE_ORDEM')) {
    return 'A lista de recorrências está desatualizada. Recarregue e tente de novo.';
  }
  if (msg.includes('LANCAMENTO_JA_VINCULADO')) {
    return 'Este lançamento do extrato já está vinculado a outro título ou baixa.';
  }
  if (msg.includes('IDEMPOTENCY_KEY_INVALIDA')) {
    return 'Não foi possível identificar este envio. Recarregue a tela e tente de novo.';
  }
  return null;
}
