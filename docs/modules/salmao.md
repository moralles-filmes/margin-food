# Módulo: Salmão

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `salmon` (parâmetros também em `configuracoes:salmon`)
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: entradas de lote bruto (SIF, validade, custo/kg), manipulação em produto limpo com rendimento, estoque por lote, metas, planejamento de compra e parâmetros por unidade.
- Não faz: o ledger de estoque (a manipulação e a entrada geram movimentação em `movimentacoes_estoque`, ver [estoque.md](estoque.md)).
- Código: `src/components/SalmonControlView.tsx` (abas), `EntriesView.tsx`, `ManipulationView.tsx`, `StockView.tsx` (estoque por lote), `DashboardView.tsx`, `GoalsView.tsx`, `SmartSuggestionCard.tsx`, `EtiquetaModal.tsx`, `ValidadeAlertCard.tsx`, `src/hooks/useSalmonStore.ts`, `src/hooks/useSalmonDashboard.ts`. A aba Planejamento monta a `PlanningView` ([planejamento.md](planejamento.md)).

## Submódulos e permissões

| Submódulo | Ações (`salmon:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `dashboard`, `estoque` | view | empresa |
| `entradas` | view, create, edit, delete | empresa |
| `manipulacao` | view, create, delete | empresa |
| `metas` | view, edit | empresa |
| `planejamento` | view, manage | empresa |

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `salmon_entries` | empresa | lotes brutos; `expiration_date` define a fila FEFO |
| `salmon_manipulations` | empresa | manipulações; soft-cancel |
| `salmon_config` | empresa | uma linha por unidade, gravada só por `salmon_salvar_config` |
| `salmon_daily_records` / `salmon_metas_provisionadas` / `salmon_purchase_targets` / `salmon_auditorias_compra` | empresa | metas, planejamento e auditoria de compra |

## Invariantes

- **Salmão: quem manipula precisa LER `salmon_entries`** — lote, SIF, saldo e custo/kg do lote vêm de lá, então a policy de SELECT aceita também `salmon:manipulacao:view` (além de estoque/dashboard/planejamento/metas). Exigir só `salmon:entradas:view` faz o operador ver "Nenhum lote disponível em estoque" com entrada ativa no estoque (aconteceu em produção com o perfil da peixaria). Escrita continua exigindo `salmon:entradas:*`.
- **Parâmetros do Salmão (`salmon_config`): uma linha por unidade, gravada só por `salmon_salvar_config`** — parâmetro nulo mantém o valor gravado (Salmão → Estoque salva os limites, Configurações → Salmão os alertas, sem uma sobrescrever a outra); limites exigem `salmon:estoque:view` ou admin de Configurações, alertas só Configurações. Até `20261007150000` nenhuma unidade gravava (UPDATE sem INSERT + chave fora do registry) e a tela dizia "atualizado".
- **Salmão: a fila de consumo do lote bruto é FEFO, não FIFO** — `salmon_entries.expiration_date` (opcional, informada na Entrada) manda na ordenação de `lotStocks`/`availableLots`/`suggestedLot`; lote sem validade cai na data de entrada, o que preserva o FIFO legado e o mantém antes de lotes recém-comprados. A validade da etiqueta do produto limpo continua sendo `data da manipulação + validadePadraoDias` — é outra coisa.
- **Salmão: exclusão é cancelamento idempotente** — `salmon_entries`/`salmon_manipulations` usam soft-cancel via RPCs atômicas, que também cancelam o movimento de estoque vinculado. Esse movimento pode ser cancelado *fora* do módulo (em Movimentações), o que cascateia de volta e dessincroniza a lista local do `useSalmonStore`. O delete no Salmão detecta "já cancelado" (`isAlreadyCancelledError`) e trata como no-op — não remover a cascata do lado de Movimentações, ela evita órfãos.
- Cancelamento com estorno insere o estorno antes de marcar o original `CANCELADO`: [estoque.md](estoque.md), "Saldo e movimentações".
- SKU do salmão nasce pelo gate de entrada com prefixo SALM, não por permissão de catálogo: [estoque.md](estoque.md), "Catálogo e código de barras".

## Commands, queries e eventos

- Commands: `salmon_salvar_config`, `_salmon_cancel_entry_guarded`, `_salmon_cancel_manipulation_guarded` (chamadas em `src/hooks/useSalmonStore.ts`).
- Cliente: `isAlreadyCancelledError` trata "já cancelado" como no-op.

## Dependências

- Estoque Geral (movimentações e catálogo), Compras (`suppliers`).
