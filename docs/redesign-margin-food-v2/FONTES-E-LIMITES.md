# Fontes e limites de preparação

Pacote de instruções preparado a partir da conversa, dos recortes aprovados e de leitura do repositório `moralles-filmes/margin-food`. Não houve implementação, execução do sistema, testes de produção, push ou deploy por este pacote. A inspeção prévia não substitui o inventário e o baseline da Fase 00.

Leitura de código/dados históricos não comprova aparência atual em navegador. Os caminhos a seguir foram identificados na análise e devem ser reconfirmados na execução; branch, conteúdo e APIs podem mudar.

## Referências do projeto

- Navegação e empresas: https://github.com/moralles-filmes/margin-food/blob/main/src/components/AppLayout.tsx
- Seletor: https://github.com/moralles-filmes/margin-food/blob/main/src/components/CompanySelector.tsx
- Financeiro: https://github.com/moralles-filmes/margin-food/blob/main/src/components/FinanceiroView.tsx
- Dashboard: https://github.com/moralles-filmes/margin-food/blob/main/src/components/financeiro/DashboardFinanceiroSection.tsx
- Gráficos do dashboard: https://github.com/moralles-filmes/margin-food/blob/main/src/components/financeiro/DashboardCharts.tsx
- KPI compartilhado: https://github.com/moralles-filmes/margin-food/blob/main/src/components/ui/KpiCard.tsx
- Tema de gráficos: https://github.com/moralles-filmes/margin-food/blob/main/src/lib/chartTheme.ts
- Histórico anterior: https://github.com/moralles-filmes/margin-food/blob/main/docs/redesign/PLANO-DE-FASES.md
- CMV financeiro: https://github.com/moralles-filmes/margin-food/blob/main/src/components/financeiro/cmv/CmvCards.tsx
- Estoque: https://github.com/moralles-filmes/margin-food/blob/main/src/components/estoque/StockDashboardSection.tsx
- Planejamento: https://github.com/moralles-filmes/margin-food/blob/main/src/components/PlanningView.tsx
- RH: https://github.com/moralles-filmes/margin-food/blob/main/src/components/rh/DashboardRhSection.tsx

## Critérios de acessibilidade consultados

- W3C, WCAG 2.2, Understanding 1.4.3 — contraste mínimo: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C, Understanding 1.4.10 — reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- W3C, Understanding 1.4.11 — contraste não textual: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

A meta de 44 × 44 CSS px para ações móveis é uma decisão proposta de projeto, não uma afirmação de mínimo universal de AA. Os testes listados não certificam sozinhos conformidade integral WCAG.

## Confiabilidade dos dados ilustrativos

Valores nas referências são exemplos ou retratos do momento de um print. Não são fonte de produção nem evidência de dados atuais. O pacote não traz credenciais, banco de dados, arquivos de fonte tipográfica nem código do backend.
