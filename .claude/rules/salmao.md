---
paths:
  - "src/components/SalmonControlView.tsx"
  - "src/components/EntriesView.tsx"
  - "src/components/ManipulationView.tsx"
  - "src/components/StockView.tsx"
  - "src/components/DashboardView.tsx"
  - "src/components/GoalsView.tsx"
  - "src/components/SmartSuggestionCard.tsx"
  - "src/components/EtiquetaModal.tsx"
  - "src/components/ValidadeAlertCard.tsx"
  - "src/hooks/useSalmon*.ts"
---

# Salmão — ao tocar entradas, manipulação, estoque por lote ou parâmetros

Antes de alterar, leia `docs/modules/salmao.md` (e `docs/modules/estoque.md` para movimentação e cancelamento).

Pontos críticos:

- A fila de consumo do lote bruto é FEFO (`expiration_date`); lote sem validade cai na data de entrada.
- Exclusão é cancelamento idempotente pelas RPCs `_salmon_cancel_*_guarded`, que também cancelam a movimentação; "já cancelado" é no-op (`isAlreadyCancelledError`).
- Quem manipula precisa LER `salmon_entries` (`salmon:manipulacao:view`).
- `salmon_config` é uma linha por unidade, gravada só por `salmon_salvar_config`; parâmetro nulo mantém o valor gravado.
