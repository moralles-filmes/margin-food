# Domain Rules — MORALLES TECH

> Fonte única de verdade para regras de negócio do sistema.
> Cada módulo, dashboard, relatório e exportação DEVE consumir as regras oficiais aqui documentadas.

## Princípios

1. **Fonte Única** — Cada regra tem exatamente uma implementação oficial.
2. **Sem Divergência** — Telas que mostram o mesmo indicador DEVEM usar a mesma regra.
3. **Backend Primeiro** — Regras sensíveis e agregações são calculadas server-side (RPCs).
4. **Reutilização** — Frontend consome contratos e selectors oficiais de `src/domain/`.
5. **Rastreabilidade** — Cada regra tem ID, fórmula e lista de consumidores.

---

## Catálogo de Regras — Financeiro

### FIN-RECEITA — Receita Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Soma de lançamentos tipo RECEITA com status REALIZADO ou CONCILIADO |
| **Fórmula** | `SUM(valor) WHERE tipo=RECEITA AND status IN (REALIZADO, CONCILIADO)` |
| **Exclusões** | `tipo = TRANSFERENCIA`, `status = CANCELADO` |
| **Regime** | Competência (data_competencia) para DRE/Dashboard; Caixa para Fluxo/DFC |
| **Rateio** | Se houver rateio, usar itens de rateio. Se não, categoria do pai |
| **Fonte** | RPCs `get_fin_dashboard_summary`, `get_fin_dre_summary`, `relatorio_socios_resumo` |
| **Consumidores** | Dashboard, DRE, Relatório Sócios, KPIs, Comparativo |
| **Selector** | `isElegivelParaReceita()` |

### FIN-DESPESA — Despesa Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Soma de lançamentos tipo DESPESA com status REALIZADO ou CONCILIADO |
| **Fórmula** | `SUM(valor) WHERE tipo=DESPESA AND status IN (REALIZADO, CONCILIADO)` |
| **Exclusões** | `tipo = TRANSFERENCIA`, `status = CANCELADO` |
| **Regime** | Competência (data_competencia) para DRE/Dashboard; Caixa para Fluxo/DFC |
| **Rateio** | Se houver rateio, usar itens de rateio. Se não, categoria do pai |
| **Fonte** | RPCs `get_fin_dashboard_summary`, `get_fin_dre_summary`, `relatorio_socios_resumo` |
| **Consumidores** | Dashboard, DRE, Relatório Sócios, KPIs, Comparativo |
| **Selector** | `isElegivelParaDespesa()` |

### FIN-RESULTADO — Resultado Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Receita Oficial − Despesa Oficial |
| **Fórmula** | `receita - despesa` |
| **Invariante** | `assertResultado(receita, despesa, resultado)` deve ser `true` |
| **Fonte** | `calcResultado()` em `domain/financeiro/selectors.ts` |
| **Consumidores** | Dashboard, DRE, Relatório Sócios, KPIs, Comparativo |

### FIN-MARGEM — Margem Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Resultado / Receita × 100. Zero quando Receita = 0 |
| **Fórmula** | `receita === 0 ? 0 : (resultado / receita) * 100` |
| **Invariante** | `assertMargem(resultado, receita, margem)` deve ser `true` |
| **Fonte** | `calcMargem()` em `domain/financeiro/selectors.ts` |
| **Consumidores** | Dashboard, Relatório Sócios, KPIs, Comparativo |

### FIN-SALDO — Saldo em Caixa Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Saldo inicial + entradas realizadas − saídas realizadas, consolidado por conta bancária ativa |
| **Inclui** | TRANSFERENCIA (movimentação entre contas) |
| **Status** | REALIZADO, CONCILIADO |
| **Fonte** | `fin_contas_saldo_cache` / RPC `get_fin_dashboard_summary` |
| **Consumidores** | Dashboard, Fluxo de Caixa, Projeção |

### FIN-INADIMPLENCIA — Inadimplência Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Percentual de valores vencidos sobre total pendente a receber |
| **Fórmula** | `totalVencido / totalPendente * 100` |
| **Invariante** | `assertInadimplencia()` |
| **Fonte** | `calcInadimplencia()` / RPC `get_fin_kpis` |
| **Consumidores** | KPIs, Alertas |

### FIN-DRE — Demonstrativo de Resultado

| Campo | Valor |
|-------|-------|
| **Descrição** | Apuração por competência usando categorias hierárquicas com rateio |
| **Status** | REALIZADO, CONCILIADO |
| **Exclusões** | TRANSFERENCIA, CANCELADO |
| **Regime** | Competência (data_competencia) |
| **Rateio** | Obrigatório: se houver itens de rateio, usar rateio |
| **Fonte** | RPC `get_fin_dre_summary` |
| **Consumidores** | DRE, Relatório Sócios |

### FIN-DFC — Demonstrativo de Fluxo de Caixa

| Campo | Valor |
|-------|-------|
| **Descrição** | Apuração por caixa (data do pagamento/recebimento) |
| **Status** | REALIZADO, CONCILIADO |
| **Inclui** | TRANSFERENCIA (para visualizar movimentações entre contas) |
| **Regime** | Caixa |
| **Fonte** | RPC `get_fin_dfc_summary` |
| **Consumidores** | DFC |

### FIN-FLUXO — Fluxo de Caixa

| Campo | Valor |
|-------|-------|
| **Descrição** | Visão diária Real + Projetado |
| **Realizado** | Lançamentos REALIZADO/CONCILIADO |
| **Projetado** | CP/CR pendentes por data de vencimento |
| **Fonte** | RPC `get_fin_cashflow` |
| **Consumidores** | Fluxo de Caixa |

### FIN-PROJECAO — Projeção de Fluxo

| Campo | Valor |
|-------|-------|
| **Descrição** | Saldo inicial + entradas/saídas projetadas ao longo do horizonte |
| **Recorrências** | Expandidas via `generate_series` |
| **Saldo inicial** | Pode ser sobreposto por valor manual para simulação |
| **Fonte** | RPC `get_fin_projecao` |
| **Consumidores** | Projeção de Fluxo |

### FIN-ORCAMENTO — Orçamento vs Realizado

| Campo | Valor |
|-------|-------|
| **Descrição** | Compara valores orçados (meta) contra realizados por categoria |
| **Status** | REALIZADO, CONCILIADO |
| **Regime** | Competência |
| **Fonte** | RPC `get_fin_orcamento_vs_realizado` |
| **Consumidores** | Orçamento |

### FIN-COMPARATIVO — Comparativo entre Períodos

| Campo | Valor |
|-------|-------|
| **Descrição** | Compara FinancialSummary entre dois meses |
| **Fórmula variação** | `(A − B) / |B| × 100` |
| **Selector** | `calcVariacaoPct()` |
| **Fonte** | RPC `comparativo_periodos` |
| **Consumidores** | Comparativo |

### FIN-FECHAMENTO — Fechamento de Caixa

| Campo | Valor |
|-------|-------|
| **Descrição** | Registro diário de faturamento |
| **Fórmula** | `faturamento_liquido = bruto - taxas - descontos` |
| **Invariante** | `assertFechamentoLiquido()` |
| **Fonte** | Tabela `fin_fechamento_caixa` |
| **Consumidores** | Fechamento de Caixa |

### FIN-RATEIO — Rateio Oficial

| Campo | Valor |
|-------|-------|
| **Descrição** | Se houver itens de rateio, usar rateio. Se não, usar categoria do pai |
| **Selector** | `resolveRateio()` |
| **Aplica-se em** | DRE, DFC, Orçamento |

### FIN-RECORRENCIA — Recorrência Financeira

| Campo | Valor |
|-------|-------|
| **Descrição** | Parcelas futuras geradas por `generate_series` |
| **Consolidação** | Por `origem:id` para evitar colisões |
| **Fonte** | RPC `expand_recorrencias` / `scheduled-jobs` |
| **Consumidores** | Recorrências, Projeção de Fluxo |

### FIN-CONCILIACAO — Conciliação Bancária

| Campo | Valor |
|-------|-------|
| **Descrição** | Pareamento automático de extrato OFX com lançamentos |
| **Transferências** | Detectadas automaticamente |
| **Duplicidades** | Bloqueadas por idempotency |
| **Fonte** | RPC `fin_conciliar_lancamento` |
| **Consumidores** | Conciliação Bancária |

---

## Status Válidos

| Status | Tipo | Descrição |
|--------|------|-----------|
| REALIZADO | Realizado | Dinheiro efetivamente movimentou |
| CONCILIADO | Realizado | Confirmado via conciliação bancária |
| PENDENTE | Pendente | Aguardando pagamento/recebimento |
| PREVISTO | Pendente | Projetado para o futuro |
| APROVADO | Pendente | Aprovado mas ainda não pago |
| CANCELADO | Excluído | Desconsiderado em todos os cálculos |

---

## Regra de TRANSFERENCIA

- **EXCLUÍDA** de Receita e Despesa (FIN-RECEITA, FIN-DESPESA, DRE, Relatório Sócios)
- **INCLUÍDA** em DFC e Fluxo de Caixa (movimentação entre contas)
- **INCLUÍDA** no cálculo de Saldo (afeta saldo por conta)

---

## Implementação no Código

| Artefato | Localização |
|----------|-------------|
| Contratos tipados | `src/domain/financeiro/contracts.ts` |
| Invariantes | `src/domain/financeiro/invariants.ts` |
| Selectors / Helpers | `src/domain/financeiro/selectors.ts` |
| Registry de Regras | `src/domain/financeiro/rules.ts` |
| Entry point | `src/domain/financeiro/index.ts` |

---

## Regras para Novas Features

1. Consultar este catálogo antes de implementar
2. Reutilizar contratos e selectors oficiais de `src/domain/`
3. Não implementar regras sensíveis "na unha" no componente
4. Documentar aqui quando uma regra nova nascer
5. Declarar a fonte da verdade dos números exibidos
6. Testar coerência: mesmo indicador em telas diferentes deve bater

---

## Domínios Futuros (placeholders)

### Estoque
- `EST-SALDO`: Saldo atual = entradas − saídas − perdas
- `EST-CUSTO-MEDIO`: Custo médio ponderado

### RH
- `RH-CUSTO-MENSAL`: Soma de salários + encargos + benefícios

### Compras
- `COM-REQUISICAO`: Fluxo de requisição → aprovação → pedido
- `COM-LEAD-TIME`: Prazo médio do pedido ao recebimento
