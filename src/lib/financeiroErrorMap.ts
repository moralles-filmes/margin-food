export function mapFinanceiroDeleteError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('OPTIMISTIC_LOCK_CONFLICT'))
    return 'Este registro foi alterado por outro usuário. Recarregue a página e tente novamente.';
  if (msg.includes('LANCAMENTO_VINCULADO'))
    return 'Não é possível excluir: existe lançamento financeiro vinculado. Estorne o pagamento antes.';
  if (msg.includes('STATUS_INVALIDO') || msg.includes('Não é permitido excluir') || msg.includes('não pode ser excluída'))
    return 'Esta conta não pode ser excluída no status atual.';
  if (msg.includes('PERMISSION_DENIED') || msg.includes('Permission denied'))
    return 'Você não tem permissão para excluir este registro.';
  if (msg.includes('NOT_FOUND') || msg.includes('não encontrado') || msg.includes('Not found'))
    return 'Registro não encontrado ou já foi excluído.';
  if ((err as { code?: string })?.code === '23503')
    return 'Não é possível excluir: existem registros vinculados.';
  return `Erro ao excluir${msg ? ': ' + msg : ''}`;
}
