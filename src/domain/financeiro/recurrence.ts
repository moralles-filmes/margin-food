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
