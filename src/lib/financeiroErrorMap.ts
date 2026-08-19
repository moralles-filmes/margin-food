/** Erros das RPCs de baixa/conciliação (pay_conta_pagar, reconcile_*). */
export function mapPagamentoError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('CONTA_OBRIGATORIA'))
    return 'Selecione a conta bancária de onde o pagamento saiu.';
  if (msg.includes('CONTA_DIVERGENTE'))
    return 'Este lançamento pertence a outra conta bancária. Concilie pelo extrato da conta correta.';
  if (msg.includes('CATEGORIA_OPERACIONAL'))
    return 'O desconto obtido não pode ir para uma categoria de receita operacional — ele somaria no faturamento do DRE. Use "Descontos Obtidos" ou outra categoria sob RECEITAS NÃO OPERACIONAIS.';
  if (msg.includes('DIVERGENCIA_VALOR'))
    return 'O valor do extrato não bate com o do título. Classifique a diferença como juros, tarifa ou desconto antes de baixar.';
  if (msg.includes('AJUSTE_INVALIDO'))
    return 'A classificação da diferença não corresponde ao sinal: banco debitou a mais é juros/tarifa, a menos é desconto.';
  if (msg.includes('CATEGORY_REQUIRED'))
    return 'O lançamento está sem categoria. Informe a categoria antes de conciliar.';
  if (msg.includes('EXTERNAL_ID_CONFLICT'))
    return 'Esta linha do extrato já está vinculada a outro lançamento.';
  if (msg.includes('OPTIMISTIC_LOCK_CONFLICT') || msg.includes('alterado por outro'))
    return 'Este registro foi alterado por outro usuário. Recarregue a página e tente novamente.';
  if (msg.includes('STATUS_INVALIDO'))
    return 'A conta não está em um status que permita esta operação.';
  if (msg.includes('PERMISSION_DENIED') || msg.includes('Permission denied') || msg.includes('Sem permissão'))
    return 'Você não tem permissão para esta operação.';
  if (msg.includes('NOT_FOUND'))
    return 'Registro não encontrado.';
  return msg || 'Erro ao registrar o pagamento';
}

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
