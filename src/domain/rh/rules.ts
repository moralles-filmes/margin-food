/**
 * ─── Domain Rules Placeholder: RH ───
 *
 * Future official rules for the HR module.
 * Expand as rules are formalized.
 */

export const RH_RULES_PLACEHOLDER = {
  'RH-CUSTO-MENSAL': {
    id: 'RH-CUSTO-MENSAL',
    name: 'Custo Mensal de Pessoal',
    description: 'Soma de salários + encargos + benefícios por mês de competência.',
    sourceOfTruth: 'Tabela rh_custos_mensais',
    consumers: ['Dashboard RH', 'Controle de Custos'],
  },
} as const;
