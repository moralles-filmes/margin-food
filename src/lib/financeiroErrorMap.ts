/** Erros das RPCs de baixa/conciliação (pay_conta_pagar, reconcile_*). */
export function mapPagamentoError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('CONTA_OBRIGATORIA'))
    return 'Selecione a conta bancária de onde o pagamento saiu.';
  if (msg.includes('JA_CONCILIADO_OUTRA_CONTA'))
    return 'Este lançamento já foi conciliado no extrato de outra conta. Desconcilie lá antes de trazê-lo para esta.';
  if (msg.includes('LANCAMENTO_PREVISTO_VINCULADO'))
    return 'Este lançamento previsto pertence a um título de Contas a Pagar/Receber. Dê baixa pelo título.';
  if (msg.includes('TIPO_DIVERGENTE'))
    return 'O lançamento escolhido é de outro tipo (receita × despesa) que a linha do extrato.';
  if (msg.includes('VALOR_DIVERGENTE'))
    return 'O valor do lançamento é diferente do extrato. Corrija o valor no Livro Razão antes de conciliar.';
  if (msg.includes('LANCAMENTO_JA_VINCULADO'))
    return 'Este lançamento já está vinculado a outra linha do extrato desta conta. Recarregue o extrato antes de continuar.';
  if (msg.includes('DATA_EXTRATO_FUTURA'))
    return 'A linha do extrato tem data futura. Um lançamento previsto só vira realizado com pagamento já feito.';
  if (msg.includes('LINHA_EXTRATO_OBRIGATORIA'))
    return 'Faltam o tipo ou a data da linha do extrato para confirmar o pagamento do lançamento previsto.';
  if (msg.includes('CONTA_DIVERGENTE'))
    return 'Este lançamento pertence a outra conta bancária. Concilie pelo extrato da conta correta.';
  if (msg.includes('CATEGORIA_OPERACIONAL'))
    // Repassa a mensagem da RPC em vez de fixar um texto: contas a pagar (desconto
    // obtido, RECEITAS NÃO OPERACIONAIS) e contas a receber (desconto concedido,
    // DESPESAS NÃO OPERACIONAIS) exigem o tipo oposto de categoria — um texto único
    // orientaria a pessoa a escolher exatamente a categoria errada num dos dois lados.
    return msg.replace(/^.*CATEGORIA_OPERACIONAL:\s*/, '');
  if (msg.includes('DIVERGENCIA_VALOR'))
    return 'O valor do extrato não bate com o do título. Classifique a diferença como juros, tarifa ou desconto antes de baixar.';
  if (msg.includes('AJUSTE_INVALIDO'))
    // Mesmo motivo do CATEGORIA_OPERACIONAL acima — repassa a mensagem da RPC.
    return msg.replace(/^.*AJUSTE_INVALIDO:\s*/, '');
  if (msg.includes('RATEIO_SEM_CATEGORIA'))
    // Título legado com linha nula: a cópia do rateio para o espelho da baixa é recusada.
    return 'Há linha de rateio sem categoria. Escolha a categoria em todas as linhas (num boleto, edite a conta em Contas a Pagar) e tente de novo.';
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
