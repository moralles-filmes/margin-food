/**
 * Funções puras de apresentação de Contas Bancárias (Redesign V2, Fase 04A). Só somam e rotulam os
 * saldos que a tela já carrega de `get_all_saldos_contas` — nenhum cálculo de saldo novo mora aqui.
 */

export const TIPO_CONTA_OPTIONS = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'caixa_fisico', label: 'Caixa Físico' },
  { value: 'maquininha', label: 'Maquininha' },
] as const;

export const TIPO_CONTA_LABEL: Record<string, string> = Object.fromEntries(
  TIPO_CONTA_OPTIONS.map(option => [option.value, option.label]),
);

export function tipoContaLabel(tipo: string): string {
  return TIPO_CONTA_LABEL[tipo] || tipo;
}

interface ContaResumo {
  id: string;
  tipo: string;
}

/**
 * Soma do saldo atual de TODAS as contas recebidas (a tela passa as contas ativas, nunca a lista
 * filtrada). Conta sem linha no mapa vale zero, como no card da própria conta.
 */
export function somaSaldosContas(contas: ReadonlyArray<{ id: string }>, saldos: Readonly<Record<string, number>>): number {
  return contas.reduce((total, conta) => total + (saldos[conta.id] || 0), 0);
}

/** "Conta Corrente: 5 · Caixa Físico: 1" — na ordem dos tipos conhecidos; tipo desconhecido no fim. */
export function composicaoPorTipo(contas: ReadonlyArray<ContaResumo>): string {
  const counts = new Map<string, number>();
  for (const conta of contas) counts.set(conta.tipo, (counts.get(conta.tipo) ?? 0) + 1);
  const known: string[] = TIPO_CONTA_OPTIONS.map(option => option.value);
  const ordered = [
    ...known.filter(tipo => counts.has(tipo)),
    ...[...counts.keys()].filter(tipo => !known.includes(tipo)),
  ];
  return ordered.map(tipo => `${tipoContaLabel(tipo)}: ${counts.get(tipo)}`).join(' · ');
}

/** "Itaú | Ag. 0001 | CC 12345-6", só quando há banco (mesma regra do card anterior). */
export function contaDadosBancarios(conta: { banco: string | null; agencia: string | null; numero_conta: string | null }): string | null {
  if (!conta.banco) return null;
  return [
    conta.banco,
    conta.agencia ? `Ag. ${conta.agencia}` : null,
    conta.numero_conta ? `CC ${conta.numero_conta}` : null,
  ].filter(Boolean).join(' | ');
}

/**
 * Diferença entre o extrato e o sistema na mesma data, comparada em centavos: em ponto
 * flutuante 0,30 − 0,29 dá 0,00999… e um centavo de diferença passaria como "confere".
 */
export function conferenciaExtrato(saldoExtrato: number, saldoSistema: number): { diferenca: number; confere: boolean } {
  const centavos = Math.round(saldoExtrato * 100) - Math.round(saldoSistema * 100);
  return { diferenca: centavos / 100, confere: centavos === 0 };
}
