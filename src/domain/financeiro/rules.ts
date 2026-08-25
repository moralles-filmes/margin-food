/**
 * ─── Domain Rules Registry: Financeiro ───
 *
 * Machine-readable registry of all official business rules.
 * Each rule has a unique ID, description, formula, and list
 * of modules that consume it.
 *
 * This file is the programmatic counterpart of docs/DOMAIN_RULES.md.
 * When a new rule is added to the doc, it MUST be registered here.
 *
 * Usage in code reviews / quality gate:
 *   import { RULES } from '@/domain/financeiro/rules';
 *   // verify a module references the correct rule
 */

export interface DomainRule {
  id: string;
  name: string;
  description: string;
  formula?: string;
  statusIncluded?: readonly string[];
  statusExcluded?: readonly string[];
  tipoExcluded?: readonly string[];
  sourceOfTruth: string;
  consumers: string[];
}

export const RULES: Record<string, DomainRule> = {
  'FIN-RECEITA': {
    id: 'FIN-RECEITA',
    name: 'Receita Oficial',
    description: 'Soma de lançamentos tipo RECEITA com status REALIZADO ou CONCILIADO, excluindo TRANSFERENCIA e CANCELADO.',
    formula: 'SUM(valor) WHERE tipo=RECEITA AND status IN (REALIZADO, CONCILIADO) AND tipo != TRANSFERENCIA',
    statusIncluded: ['REALIZADO', 'CONCILIADO'],
    statusExcluded: ['CANCELADO'],
    tipoExcluded: ['TRANSFERENCIA'],
    sourceOfTruth: 'RPC get_fin_dashboard_summary / get_fin_dre_summary / relatorio_socios_resumo',
    consumers: ['Dashboard', 'DRE', 'Relatório Sócios', 'KPIs', 'Comparativo'],
  },
  'FIN-DESPESA': {
    id: 'FIN-DESPESA',
    name: 'Despesa Oficial',
    description: 'Soma de lançamentos tipo DESPESA com status REALIZADO ou CONCILIADO, excluindo TRANSFERENCIA e CANCELADO.',
    formula: 'SUM(valor) WHERE tipo=DESPESA AND status IN (REALIZADO, CONCILIADO) AND tipo != TRANSFERENCIA',
    statusIncluded: ['REALIZADO', 'CONCILIADO'],
    statusExcluded: ['CANCELADO'],
    tipoExcluded: ['TRANSFERENCIA'],
    sourceOfTruth: 'RPC get_fin_dashboard_summary / get_fin_dre_summary / relatorio_socios_resumo',
    consumers: ['Dashboard', 'DRE', 'Relatório Sócios', 'KPIs', 'Comparativo'],
  },
  'FIN-RESULTADO': {
    id: 'FIN-RESULTADO',
    name: 'Resultado Oficial',
    description: 'Receita Oficial − Despesa Oficial.',
    formula: 'Receita − Despesa',
    sourceOfTruth: 'calcResultado() em domain/financeiro/selectors.ts',
    consumers: ['Dashboard', 'DRE', 'Relatório Sócios', 'KPIs', 'Comparativo'],
  },
  'FIN-MARGEM': {
    id: 'FIN-MARGEM',
    name: 'Margem Oficial',
    description: 'Resultado / Receita × 100. Zero quando Receita = 0.',
    formula: 'receita === 0 ? 0 : (resultado / receita) * 100',
    sourceOfTruth: 'calcMargem() em domain/financeiro/selectors.ts',
    consumers: ['Dashboard', 'Relatório Sócios', 'KPIs', 'Comparativo'],
  },
  'FIN-SALDO': {
    id: 'FIN-SALDO',
    name: 'Saldo em Caixa Oficial',
    description: 'Saldo inicial + entradas realizadas − saídas realizadas, consolidado por conta bancária ativa.',
    sourceOfTruth: 'RPC get_fin_dashboard_summary (saldo_caixa) / fin_contas_saldo_cache',
    consumers: ['Dashboard', 'Fluxo de Caixa', 'Projeção'],
  },
  'FIN-INADIMPLENCIA': {
    id: 'FIN-INADIMPLENCIA',
    name: 'Inadimplência Oficial',
    description: 'Total vencido a receber / Total pendente a receber × 100.',
    formula: 'totalVencido / totalPendente * 100',
    sourceOfTruth: 'calcInadimplencia() / RPC get_fin_kpis',
    consumers: ['KPIs', 'Alertas'],
  },
  'FIN-DRE': {
    id: 'FIN-DRE',
    name: 'DRE — Demonstrativo de Resultado',
    description: 'Apuração por competência. Usa categorias hierárquicas com rateio. Exclui TRANSFERENCIA. Regime de competência (data_competencia).',
    statusIncluded: ['REALIZADO', 'CONCILIADO'],
    tipoExcluded: ['TRANSFERENCIA'],
    sourceOfTruth: 'RPC get_fin_dre_summary',
    consumers: ['DRE', 'Relatório Sócios'],
  },
  'FIN-DFC': {
    id: 'FIN-DFC',
    name: 'DFC — Demonstrativo de Fluxo de Caixa',
    description: 'Apuração por caixa (data do pagamento/recebimento). Inclui TRANSFERENCIA para visualizar movimentações entre contas.',
    statusIncluded: ['REALIZADO', 'CONCILIADO'],
    sourceOfTruth: 'RPC get_fin_dfc_summary',
    consumers: ['DFC'],
  },
  'FIN-FLUXO': {
    id: 'FIN-FLUXO',
    name: 'Fluxo de Caixa',
    description: 'Visão diária Real + Projetado. Realizado = lançamentos REALIZADO/CONCILIADO. Projetado = CP/CR pendentes por data de vencimento.',
    sourceOfTruth: 'RPC get_fin_cashflow',
    consumers: ['Fluxo de Caixa'],
  },
  'FIN-PROJECAO': {
    id: 'FIN-PROJECAO',
    name: 'Projeção de Fluxo',
    description: 'Saldo inicial + entradas projetadas − saídas projetadas ao longo do horizonte. Expande recorrências via generate_series.',
    sourceOfTruth: 'RPC get_fin_projecao',
    consumers: ['Projeção de Fluxo'],
  },
  'FIN-ORCAMENTO': {
    id: 'FIN-ORCAMENTO',
    name: 'Orçamento vs Realizado',
    description: 'Compara valores orçados (meta) contra realizados por categoria, usando regime de competência.',
    statusIncluded: ['REALIZADO', 'CONCILIADO'],
    sourceOfTruth: 'RPC get_fin_orcamento_vs_realizado',
    consumers: ['Orçamento'],
  },
  'FIN-COMPARATIVO': {
    id: 'FIN-COMPARATIVO',
    name: 'Comparativo entre Períodos',
    description: 'Compara FinancialSummary entre dois meses. Variação % = (A − B) / |B| × 100.',
    formula: 'calcVariacaoPct(periodoA.value, periodoB.value)',
    sourceOfTruth: 'RPC comparativo_periodos / calcVariacaoPct()',
    consumers: ['Comparativo'],
  },
  'FIN-FECHAMENTO': {
    id: 'FIN-FECHAMENTO',
    name: 'Fechamento de Caixa',
    description: 'Faturamento líquido = bruto − taxas − descontos. Registrado por dia. Impacta receita de faturamento.',
    formula: 'faturamento_liquido = faturamento_bruto - taxas - descontos',
    sourceOfTruth: 'Tabela fin_fechamento_caixa',
    consumers: ['Fechamento de Caixa'],
  },
  'FIN-RATEIO': {
    id: 'FIN-RATEIO',
    name: 'Rateio Oficial',
    description: 'Se houver itens de rateio, usar rateio. Se não, usar categoria do lançamento pai. Aplica-se em DRE, DFC, Orçamento.',
    sourceOfTruth: 'resolveRateio() em domain/financeiro/selectors.ts',
    consumers: ['DRE', 'DFC', 'Orçamento'],
  },
  'FIN-RECORRENCIA': {
    id: 'FIN-RECORRENCIA',
    name: 'Recorrência Financeira',
    description: 'Contas a Pagar/Receber materializam toda a série na criação; Livro Razão mantém geração por recorrencia_config. Consolidadas por origem:id para evitar colisões.',
    sourceOfTruth: 'RPCs _guarded_create_conta_pagar/_guarded_create_conta_receber e gerar_parcela_recorrente',
    consumers: ['Recorrências', 'Projeção de Fluxo'],
  },
  'FIN-CONCILIACAO': {
    id: 'FIN-CONCILIACAO',
    name: 'Conciliação Bancária',
    description: 'Pareamento automático de extrato OFX com lançamentos. Transferências são detectadas automaticamente. Duplicidades bloqueadas por idempotency.',
    sourceOfTruth: 'Conciliação Section / RPC fin_conciliar_lancamento',
    consumers: ['Conciliação Bancária'],
  },
};
