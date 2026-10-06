# Relatório — Fase 01 • Fundação visual, cards e gráficos compartilhados

## Identificação

- Fase: 01. Data: 2026-10-03.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f01`, criada a partir de `main` em `c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2`. Commits, feitos a pedido do proprietário ao fim da fase: `875514a` (código) e `ce512d4` (documentação). Sem push, merge ou deploy. `main` não foi alterada.
- `git status` no início: só `?? docs/redesign-margin-food-v2/`. Nada anterior a preservar.
- Ambiente: Windows 11, Bun, Vite em `http://127.0.0.1:8082` (8080 e 8081 estavam ocupadas), Chrome com a extensão conectada. Login feito pelo proprietário com usuário e empresa de teste. O navegador estava com `prefers-reduced-motion: reduce` ativo.
- Roteamento (ai-router): TIER 0, agente principal. Auditoria de módulo exigida pelo router executada em modo `--audit-only`: nenhum P0/P1/P2 (relatório em `.saas-audit/modules/primitivas-ui-redesign-v2-f01/REPORT.md`, fora do versionamento).

## Escopo entregue e preservado

Entregue:

1. Tokens do destaque nos dois temas (`--highlight*`, `--gradient-highlight`, `--shadow-highlight`, `--radius-summary`) e o mapeamento Tailwind.
2. `KpiCard`: `appearance` (`default` | `summary` | `highlight`) e `valueTone`. Arcos decorativos atrás do conteúdo, com `aria-hidden` e `pointer-events-none`.
3. `ChartCard` com erro e nova tentativa, rodapé e `<figure>` nomeada; `ChartTooltip` com largura máxima e `maxItems`; `ChartLegend` como lista, com `justify` e `scrollable`; `chartTheme` com `chartMargin`, `barProps` e `horizontalBarProps`.
4. Primitivas `AccessDenied` e `ErrorState`.
5. Catálogo `/__catalogo`, só em desenvolvimento, com dados sintéticos.
6. Exceção do gradiente registrada em `CLAUDE.md` e `AGENTS.md` (idênticos, conferido com `cmp`).

Preservado: nenhum consumidor do `KpiCard` foi tocado (30 arquivos). `card.tsx`, `--radius`, `button.tsx`, `StatusBadge`, `PageHeader`, `FilterBar`, `SegmentedControl`, `EmptyState` e `ui/chart.tsx` não mudaram. Nada de sidebar, seletor, RPC, migration, permissão, cálculo ou dependência. Os quatro `presentation*Export.ts` não foram abertos.

Diferenças em relação ao prompt da fase, registradas em `DECISOES.md`:

- D15: `appearance` ganhou um terceiro valor, `summary`, além dos dois previstos na D01.
- D17: `tabular-nums` **não** foi aplicado ao card compacto; só à família V2.
- D18: o azul do destaque ficou um pouco mais escuro que o recorte aprovado, por contraste.

## Arquivos reais

Alterados: `src/index.css`, `tailwind.config.ts`, `src/components/ui/KpiCard.tsx`, `src/components/ui/ChartCard.tsx`, `src/components/ui/ChartTooltip.tsx`, `src/components/ui/ChartLegend.tsx`, `src/lib/chartTheme.ts`, `src/App.tsx`, `CLAUDE.md`, `AGENTS.md` (10 arquivos, +208 −39).

Novos: `src/components/ui/AccessDenied.tsx`, `src/components/ui/ErrorState.tsx`, `src/components/ui/KpiCard.test.tsx`, `src/components/ui/StateMessages.test.tsx`, `src/pages/DesignCatalog.tsx`.

Documentação: `PROGRESSO.md`, `DECISOES.md` (D15–D21), `MATRIZ-DE-COBERTURA.md` (GLB-001 a GLB-008), `PROXIMO-CHAT.md`, este relatório e `handoffs/01-HANDOFF.md`.

Consultados sem alteração: `card.tsx`, `PageHeader.tsx`, `FilterBar.tsx`, `SegmentedControl.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `financeiro/cmv/CmvCards.tsx`. **Não lidos nesta fase**: `button.tsx`, `ui/chart.tsx`, `TableActions`, `table`, diálogos.

Fora do versionamento: `.ai-router/TASKS/RDV2-F01.json`, `.saas-audit/…`, `dist/`.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 174 arquivos, 1.719 testes, todos passando | Baseline 172 / 1.687 + 2 arquivos e 32 testes novos | Aviso de source map preexistente |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | Mesmas limitações da Fase 00 |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual ao baseline | — |
| Build | `bun run build` | ok; `vendor-charts` 555,44 kB, `FinanceiroView` 221,91 kB, `index` 204,75 kB | Iguais ao baseline | CSS não comparado (sem número no baseline) |
| Catálogo fora da produção | grep em `dist/` por `__catalogo` e pelo título | 0 arquivos; nenhum chunk `DesignCatalog` | Saída do grep | — |
| Compatibilidade do card compacto | `KpiCard.test.tsx`: 6 variants sem `appearance` | Mesmo conjunto de classes de antes em contêiner, rótulo, valor, apoio, ícone e delta | Teste | O teste pegou uma regressão durante a fase (`leading-tight` descartado pelo `tailwind-merge`), corrigida antes dos gates |
| Consumidores reais, antes × depois | Snapshot de DOM (classes, largura, altura, raio, borda, fundo, sombra, fonte, tamanho e cor do valor) com viewport 1278×888, tema claro | 0 diferenças em 27 cards: Dashboard Financeiro (8), Dashboard de Estoque (5), Relatórios Gerais (6), Centro de CMV (8) | Comparação em `sessionStorage` na mesma aba | Com viewport diferente a largura muda 3 px — efeito da grade, não do card |
| Consumidores sem "antes" | RH → Folha (4 cards), Compras → Cotação (5 cards) | Mesma assinatura do card antigo: raio 12 px, Space Grotesk 20 px, sem sombra | Leitura do DOM + captura de tela | Sem captura anterior para comparar |
| Contraste do destaque, tema claro | Cálculo WCAG sobre as cores computadas | Branco 6,14:1 no ponto mais claro; 5,50 sob um arco; 4,93 sob dois; apoio 5,65 e 4,53 no pior caso; 8,12 no ponto mais escuro | JS no navegador | Calculado a partir dos tokens, não por amostragem de pixel |
| Contraste do destaque, tema escuro | Idem | 6,66 / 6,02 / 5,47; apoio 6,13 e 5,04; 8,83 | JS no navegador | Idem |
| Valores | Negativo, zero, `R$123.456.789,12`, rótulo longo, apoio em várias linhas, card sem ícone | Inteiros, sem reticências e sem quebra no meio do número | Catálogo, claro e escuro | Dados sintéticos |
| 320 px | Catálogo em iframe de 320 px (área útil 316 px) | Sem rolagem horizontal após o ajuste da grade; valores em uma linha | `scrollWidth` = `clientWidth` | O Chrome não reduz a janela abaixo de 500 px; não é um aparelho real |
| 500 px | Janela real | Sem rolagem horizontal; duas colunas | Medição + captura | — |
| Teclado e foco | Foco no card azul clicável, Enter e Espaço | Dois acionamentos; anel de foco de 2 px visível; a página não rola com Espaço | Contador do catálogo | Só no catálogo |
| Movimento reduzido | `prefers-reduced-motion: reduce` ativo no navegador | Cards aparecem sem animação | `matchMedia` | **Movimento normal não foi observado** |
| Gráficos | 12 séries empilhadas, linha com negativo/zero/nulo, série projetada tracejada, ranking com nome longo, ponto único, carregando, vazio, erro | Tooltip limitado a 8 linhas com "+ 4 séries"; legenda quebra em linhas e alinha à direita com `justify`; nulo não é ligado; barra parte do zero | Capturas nos dois temas | Só no catálogo |
| Console | Erros durante a navegação | Nenhum erro dos componentes da fase | `read_console_messages` | Dois erros preexistentes na tela de login (`permission denied for table produtos`, antes da autenticação) |
| Tema escuro nas telas reais | — | **Não executado** | — | Tema escuro conferido só no catálogo |
| Larguras 390, 768, 1024, 1366, 1920 | — | **Não executado** | — | Conferidos 316, 500 e 1278/1284 |
| Leitor de tela | — | **Não executado** | — | Só atributos (`aria-hidden`, `role`, `aria-label`) |

As capturas de tela ficaram na pasta temporária da extensão e mostram dados da empresa de teste; não foram copiadas para o repositório.

## Pendências e regressões

- Introduzidas: nenhuma conhecida.
- Corrigidas durante a fase: `leading-tight` descartado no card compacto; prop `align` da legenda sobrescrita pelo Recharts; estouro de 4 px a 316 px em duas colunas.
- Observações para fases seguintes:
  - A legenda do Recharts 3 ordena as séries por nome ("Série 1, 10, 11, 12, 2…"). Preexistente; não alterado porque mudar `legendProps` afetaria os gráficos atuais.
  - `SegmentedControl` usa azul cheio no item ativo; a prancha 07 mostra pílula branca. Decidir na Fase 02.
  - Erros de console na tela de login (consultas antes da autenticação) — fora do escopo; não registrados em `PENDENCIAS-FUNCIONAIS.md` porque não foram investigados.
- Preexistentes: as 71 suspeitas de `PENDENCIAS-FUNCIONAIS.md`, nenhuma tocada.
- Aberta: D07.

## Rollback seletivo

`git revert 875514a` (código); ou descartar a branch `feat/redesign-v2-f01`. Como nenhum consumidor passa `appearance`, reverter só `KpiCard.tsx` também é seguro.

## Decisão de avanço

Fase 01 **validada com ressalvas**: gates de linha de comando iguais ao baseline, compatibilidade dos consumidores medida em navegador e primitivas novas conferidas no catálogo nos dois temas. Ressalvas: 320 px em iframe, movimento normal e tema escuro das telas reais não observados. Próxima: Fase 02.
