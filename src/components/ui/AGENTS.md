<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em src/components/ui/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## UI compartilhada — ao tocar componentes, formatação, busca ou design system

Antes de alterar, leia `docs/modules/ui.md`.

Pontos críticos:

- Reutilize o componente padronizado (TableActions, SearchableSelect, DateInput, BRLInput/CurrencyInput, KpiCard, StatusBadge, ChartCard, SubmoduleSwitcher, CompanySelector) em vez de criar outro local.
- Botão que grava usa `useTravaEnvio`; envio que mexe em dinheiro, estoque, ponto ou mensagem externa precisa também de chave derivada + índice único no servidor.
- Busca de texto: `includesNormalized`/`normalizeSearchText`, nunca `.toLowerCase().includes()`.
- Texto formatado em pt-BR nunca volta para campo numérico editável; `formatDateBR` de `@/lib/datetime` (ISO) ≠ `@/lib/formatters` (exibição).
- Cores só por token HSL (`hsl(var(--token))`): nunca hex em componente, nunca `dark:` avulso, nunca opacidade para hierarquia semântica.
- `NotificationsProvider` é instância única; notificação nasce só no servidor.
