---
paths:
  - "src/components/ui/**"
  - "src/components/CompanySelector.tsx"
  - "src/lib/utils.ts"
  - "src/lib/formatters.ts"
  - "src/lib/datetime.ts"
  - "src/lib/chartTheme.ts"
  - "src/lib/padronizarTexto.ts"
  - "src/lib/chaveOperacao.ts"
  - "src/contexts/NotificationsContext.tsx"
  - "src/contexts/ModuleBadgesContext.tsx"
  - "src/index.css"
  - "tailwind.config.ts"
---

# UI compartilhada — ao tocar componentes, formatação, busca ou design system

Antes de alterar, leia `docs/modules/ui.md`.

Pontos críticos:

- Reutilize o componente padronizado (TableActions, SearchableSelect, DateInput, BRLInput/CurrencyInput, KpiCard, StatusBadge, ChartCard, SubmoduleSwitcher, CompanySelector) em vez de criar outro local.
- Botão que grava usa `useTravaEnvio`; envio que mexe em dinheiro, estoque, ponto ou mensagem externa precisa também de chave derivada + índice único no servidor.
- Busca de texto: `includesNormalized`/`normalizeSearchText`, nunca `.toLowerCase().includes()`.
- Texto formatado em pt-BR nunca volta para campo numérico editável; `formatDateBR` de `@/lib/datetime` (ISO) ≠ `@/lib/formatters` (exibição).
- Cores só por token HSL (`hsl(var(--token))`): nunca hex em componente, nunca `dark:` avulso, nunca opacidade para hierarquia semântica.
- `NotificationsProvider` é instância única; notificação nasce só no servidor.
