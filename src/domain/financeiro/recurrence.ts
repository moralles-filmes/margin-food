export const RECURRENCE_LIMITS = {
  mensal: 36,
  semanal: 144,
  quinzenal: 72,
} as const;

export type RecurrenceFrequency = keyof typeof RECURRENCE_LIMITS;

export function isRecurrenceFrequency(value: string): value is RecurrenceFrequency {
  return value in RECURRENCE_LIMITS;
}

export function getRecurrenceLimit(frequency: string): number {
  return isRecurrenceFrequency(frequency) ? RECURRENCE_LIMITS[frequency] : 0;
}

export function getRecurrenceValidationMessage(frequency: string, count: number): string | null {
  const limit = getRecurrenceLimit(frequency);

  if (limit === 0) return 'Frequência de repetição inválida';
  if (!Number.isInteger(count)) return 'Informe uma quantidade inteira de lançamentos';
  if (count < 2) return 'Informe pelo menos 2 lançamentos para repetir';
  if (count > limit) return `O limite para esta frequência é de ${limit} lançamentos`;

  return null;
}

/** Posição de um título na série criada por "Repetir lançamento". */
export interface PosicaoSerie {
  parcela_atual?: number | null;
  parcela_total?: number | null;
}

/**
 * O título é uma parcela de série e ainda há parcelas depois dele.
 * Só a 1ª parcela fica com `recorrente = true`; as demais são reconhecidas pela posição.
 */
export function temParcelasSeguintes(titulo: PosicaoSerie | null | undefined): boolean {
  const atual = Number(titulo?.parcela_atual);
  const total = Number(titulo?.parcela_total);
  return Number.isInteger(atual) && Number.isInteger(total) && total > 1 && atual >= 1 && atual < total;
}

/** Retorno de `_guarded_update_conta_pagar_serie` / `_guarded_update_conta_receber_serie`. */
export interface ResultadoEdicaoSerie {
  parcelas_atualizadas?: number | null;
  parcelas_ignoradas?: number | null;
}

/** Toast depois de salvar "Esta e as próximas". `quitada` = "paga" (CP) ou "recebida" (CR). */
export function mensagemEdicaoSerie(resultado: ResultadoEdicaoSerie | null | undefined, quitada: 'paga' | 'recebida'): string {
  const atualizadas = Number(resultado?.parcelas_atualizadas) || 0;
  const ignoradas = Number(resultado?.parcelas_ignoradas) || 0;
  const principal = atualizadas > 0
    ? `Conta atualizada, junto com ${atualizadas === 1 ? '1 parcela seguinte' : `${atualizadas} parcelas seguintes`}.`
    : ignoradas > 0
      ? 'Conta atualizada.'
      : 'Conta atualizada. Nada mudou que precisasse ir para as próximas parcelas.';
  // A RPC deixa de fora as quitadas e as canceladas.
  const fora = ignoradas === 0 ? ''
    : ignoradas === 1 ? ` 1 parcela já ${quitada} ou cancelada ficou como estava.`
      : ` ${ignoradas} parcelas já ${quitada}s ou canceladas ficaram como estavam.`;
  return principal + fora;
}

/** Erros próprios da edição em série; `null` = erro comum da edição, tratado por quem chamou. */
export function mensagemErroEdicaoSerie(error: { code?: string | null; message?: string | null }): string | null {
  // RPC ainda não aplicada neste banco.
  if (error.code === 'PGRST202') return 'Alterar as próximas parcelas ainda não está disponível. Salve somente esta parcela.';
  // Outra gravação na mesma série ao mesmo tempo (ex.: repetir a resposta do CMV); nada foi salvo.
  if (error.code === '40P01') return 'Outra alteração nesta série estava sendo gravada ao mesmo tempo. Nada foi salvo; tente de novo.';
  const message = error.message ?? '';
  if (message.includes('SERIE_INVALIDA')) return 'Esta conta não tem parcelas seguintes. Salve somente esta parcela.';
  if (message.includes('SERIE_AMBIGUA')) return 'Não foi possível identificar as próximas parcelas desta série. Edite uma parcela de cada vez.';
  return null;
}
