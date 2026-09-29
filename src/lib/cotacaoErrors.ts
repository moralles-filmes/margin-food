// Mapeia erros das RPCs de Cotação para mensagens amigáveis em PT-BR.
// Erros lançados pelo servidor: PERMISSION_DENIED / NOT_FOUND / STATUS_INVALIDO /
// OPTIMISTIC_LOCK_CONFLICT / VALIDATION / REQUEST_ID_REUTILIZADO.
export function mapCotacaoError(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err ?? '');
  if (msg.includes('REQUEST_ID_REUTILIZADO')) {
    // A chave é derivada do conteúdo, então isto só aparece se algo reenviar a
    // chave de outra cotação. Refazer gera chave nova.
    return 'Este envio não confere com a cotação registrada antes. Confira a lista antes de criar de novo.';
  }
  if (msg.includes('OPTIMISTIC_LOCK_CONFLICT')) {
    return 'A cotação foi alterada por outra pessoa. Recarregue e tente novamente.';
  }
  if (msg.includes('STATUS_INVALIDO')) {
    const m = msg.match(/\(([^)]+)\)/); // motivo entre parênteses do servidor
    return m ? `Ação indisponível: ${m[1]}.` : 'Esta cotação não pode mais ser editada no status atual.';
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return 'Você não tem permissão para esta ação.';
  }
  if (msg.includes('NOT_FOUND')) {
    return 'Cotação não encontrada.';
  }
  if (msg.includes('VALIDATION')) {
    return msg.replace(/^.*VALIDATION:\s*/, '') || 'Dados inválidos.';
  }
  return msg || 'Erro ao processar a cotação.';
}
