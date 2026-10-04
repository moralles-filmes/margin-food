# Relatório — Fase 03 • Dashboard Financeiro completo

## Identificação

- Fase: 03. Data: 2026-10-03/04.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f03`, criada a pedido do proprietário a partir de `feat/redesign-v2-f02` em `1227af64d8a2ca62959884b6e7701eb543455d29`. `git status` no início: limpo. Commits a pedido do proprietário: `8f755dd` (código) e `709688b` (documentação), mais um registrando estes SHAs. Sem push, merge ou deploy; `main` intocada em `c6a9774`.
- Ambiente: Windows 11, Bun, Vite do projeto já em execução em `http://127.0.0.1:8080`. Chrome com a extensão, janela de 1278 × 888 px úteis, `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: login "Administrador Principal" (o mesmo da Fase 02). O proprietário escolheu "conta e unidade de teste" e confirmou a unidade **Moralles** como a de teste; uso **só de leitura**. Nada foi salvo, exportado nem enviado; nenhum download (o proprietário não autorizou abrir PDF/Excel). Gravações locais restauradas no fim: tema claro e largura da sidebar sem valor salvo.
- Dados controlados: além dos dados reais da Moralles (Outubro e Junho/2026), cenários sintéticos injetados **só no cliente**, interceptando o `fetch` da aba (nenhuma chamada ao banco alterada): A (saldo e resultado negativos, vencidas zero, 8 categorias com nome longo, série com mês negativo e mês parcial) e B (valores de milhões). Erros e atraso também simulados só na aba.
- Roteamento (ai-router): o `dry-run` inicial indicou TIER 3 (DeepSeek); com o pacote detalhado o `dispatch` reclassificou para **TIER 0 → agente principal** (risco 8 por citar permissões/RLS como restrição). Auditoria de módulo em modo `--audit-only` (relatório local em `.saas-audit/modules/dashboard-financeiro-redesign-v2-f03/REPORT.md`, fora do versionamento).

## Escopo entregue e preservado

Entregue:

1. Cabeçalho: título "Dashboard Financeiro" (22/24 px) e descrição; linha com Dia/Mês/Período (o mesmo `SegmentedControl`), seletor de mês com ícone e `aria-label`, DatePicker e DateInputs com `aria-label`; Atualizar, PDF e Excel à direita, com spinner e `aria-busy` durante a exportação.
2. Dois grupos com título, linha e legenda: **Posição Financeira** (Saldo em Caixa em `highlight`; Contas a Receber, Contas a Pagar, Contas Vencidas em `summary`) e **Desempenho do Período** (Receita, Despesa Realizada, Despesas Provisionadas, Resultado em `summary`). Mesmas `variant`s, exceto Vencidas neutra quando zero. Grade por container query dependente do valor mais longo (D31).
3. Textos de apoio e notas derivados do contrato das RPCs (D32, D33): período dos valores, janela do comparativo, período em andamento e recorte das vencidas.
4. "Evolução financeira": Receitas vs Despesas e Resultado Mensal em `ChartCard` com tema compartilhado, legenda manual, linha de zero, pontos negativos destacados, " · parcial" no mês atual e aviso de meses sem lançamento; janela do histórico rotulada e separada do período (D33, D35).
5. "Onde estão as despesas": ranking em lista com valor e participação (Top 8 só quando a RPC devolve o limite; D34) e card "Entenda as despesas provisionadas" com o mesmo total do card.
6. Estados: skeletons no formato dos cards, erro dos gráficos com `ErrorState` e nova tentativa em cada card, vazio com `EmptyState`.

Preservado (conferido no diff e em navegador): RPCs `get_fin_dashboard_summary` e `get_fin_dashboard_charts` com os mesmos parâmetros (inclusive a 2ª chamada de charts, preexistente); `loadResumo`, efeitos, `useDataEvent`, `buildDelta`, fórmula `despesa + aPagar`; corpo de `exportPdf`/`exportExcel`; gates `financeiro:dashboard:view`/`:export`; os oito rótulos, a ordem e os oito objetos passados a `onNavigate`; comportamento de erro do resumo (PF-004) e do filtro Período (PF-003).

Fora do escopo e não tocado: RPC, migration, RLS, permissão, `KpiCard`, `ChartCard`, `chartTheme`, `FinanceiroView`, tokens, dependências, `presentation*Export.ts`, outras telas do Financeiro.

Não implementado de propósito (D36): painel de atalhos "Do resumo para a operação", links "Ver…", sobrancelha e menu "Exportar" do mockup celular.

## Arquivos reais

Alterados (2): `src/components/financeiro/DashboardFinanceiroSection.tsx`, `src/components/financeiro/DashboardCharts.tsx`.

Novos (4): `src/components/financeiro/dashboardFinanceiroView.ts` (funções puras de rótulo de período, período anterior, ranking, composição, janela e grade) e os testes `dashboardFinanceiroView.test.ts` (15), `DashboardFinanceiroSection.test.tsx` (15), `DashboardCharts.test.tsx` (8).

Documentação: `PROGRESSO.md`, `DECISOES.md` (D31–D36), `MATRIZ-DE-COBERTURA.md` (FIN-B-001 a 010 e FIN-B-077), `PENDENCIAS-FUNCIONAIS.md` (PF-003 e PF-004 atualizadas; PF-074 a PF-077 novas), este relatório, `handoffs/03-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md`/`AGENTS.md` sem alteração (nada duradouro além do que está em DECISOES).

Consultados sem alteração: `FinanceiroView.tsx`, `KpiCard.tsx` (+ teste), `ChartCard.tsx`, `ChartTooltip.tsx`, `ChartLegend.tsx`, `chartTheme.ts`, `EmptyState.tsx`, `ErrorState.tsx`, `SegmentedControl.tsx`, `select.tsx`, `card.tsx`, `dataEvents.ts`, `useScopedToast.ts`, `formatters.ts`, `money.ts`, `datetime.ts`, `domain/financeiro/selectors.ts`, `index.css`, `tailwind.config.ts`, migrations `20260828181108`, `20260825212335`.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 180 arquivos, 1.779 testes, todos passando | Base 177 / 1.741 + 3 arquivos e 38 testes novos | Aviso de source map preexistente |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual à base (o aviso `exhaustive-deps` do arquivo é preexistente) | — |
| Build | `bun run build` | ok; `vendor-charts` 555,44 kB (=), `FinanceiroView` 235,26 kB (+13,42), `index` 204,80 kB (=), `Index` 41,05 kB (−0,04), CSS 120,23 kB (+2,51) | Saída do build | O aumento é o código novo da tela e as classes de container query |
| Catálogo e valores das referências | grep em `dist/` e nos arquivos do Dashboard | 0 ocorrências | — | — |
| Antes | Outubro e Junho/2026; claro, escuro; 1278 px; iframes de 390 (escuro) e 320 (claro) | Capturado antes de editar | Pasta temporária da extensão | — |
| Oito valores antes/depois | Outubro e Junho/2026, Moralles | **Idênticos** (Out: 1.108,08 / 0,00 / 20.000,00 / 21.500,00 + 3 boletos / 0,00 / 0,00 / 20.000,00 / 0,00; Jun: 1.108,08 / 0,00 / 0,00 / 21.500,00 / 1.108,71 / 0,63 / 0,63 / 1.108,08) | Texto dos cards lido por JS | — |
| Negativo, zero, valores longos | Cenários A e B no cliente | Saldo negativo branco no azul com sinal; resultado negativo vermelho com sinal; vencidas zero neutra; milhões sem estouro | Capturas + medição por `Range` | Simulado no cliente |
| Cliques dos cards | Os 8 cards | Fluxo de Caixa; Contas a Receber "A Receber"; Contas a Pagar; Contas a Pagar "Vencido"; Livro Razão Receitas e Despesas com 01/10–31/10; Contas a Pagar; DRE | Títulos e filtros da tela de destino lidos por JS | — |
| Filtros | Dia, Mês, Período, datas inválidas, Atualizar | Dia → 04/10–05/10; Período 01–15/06 → p_end 16/06; data final < inicial → toast, sem RPC; Aplicar desabilitado sem datas; Atualizar refaz só o resumo (igual ao anterior) | Corpo das chamadas registrado no `fetch` | — |
| Loading | Atraso de 3,5 s simulado | Skeletons no formato dos cards; Atualizar e janela desabilitados | Captura | — |
| Erro | 500 simulado | Gráficos: `ErrorState` + "Tentar novamente" (recarrega as 2 RPCs); resumo: só toast, últimos valores e legenda do período desses valores | Capturas + JS | Primeira carga com erro não reproduzida |
| Sem acesso | — | **Só em teste automatizado** | `DashboardFinanceiroSection.test.tsx` | Sem perfil sem `financeiro:dashboard:view` |
| Gráfico com 1 ponto e série negativa | Dados reais (jun/26) e cenário A | Barra estreita (`maxBarSize`), ponto único; linha de zero e pontos negativos vermelhos | Capturas | — |
| Top 8 ≠ total | Cenário A | Soma do Top 8 R$98.795,53 ≠ despesa R$123.456,78; percentuais sobre a soma; nota explícita | Captura | — |
| Larguras | Iframes de 320, 390, 768, 1024, 1366 e 1920 (viewport exato, 1366/1920 escalados) | Sem rolagem horizontal; grupos 1/1/2/2/4/4 colunas; gráficos lado a lado a partir de 1366; nenhum valor estourando | `scrollWidth` + medição | Iframe, não aparelho |
| Sidebar | Recolhida; alargada a 437 px | Recolhida: 4 colunas com milhões; 437 px: 2 colunas; sem rolagem | Captura + medição | Largura restaurada |
| Contraste, claro | Cálculo WCAG sobre cores computadas e extremos do gradiente | Azul: rótulo 5,64, valor 6,13, apoio 5,64 (4,50 no pior ponto sobre os arcos); summary: rótulo/apoio 5,67, valor 17,87, delta verde 5,15, vermelho 6,48; legendas 5,42; nota azul 6,71; "Soma" 5,04 | JS | Sobre tokens, não por pixel |
| Contraste, escuro | Idem | Azul 6,12 / 6,65 / 6,12 (4,79 sobre arcos); summary 7,69 / 17,15 / 9,05 / 5,59; legendas 8,33; nota 8,61; "Soma" 6,92 | JS | Idem |
| Teclado | Tab a partir de Excel | Foco visível (2 px, afastado) em Saldo e Contas a Receber, na ordem visual | Captura | — |
| Comparação com referências | `01`, `01b`, `01c` lado a lado com a tela real | Mesma estrutura; diferenças registradas abaixo | Capturas | Escalas diferentes (referência em 2×) |
| Console | Recarga + troca de mês | Sem erros; só avisos de "future flag" do React Router (preexistentes) | `read_console_messages` | — |
| Exportação PDF/Excel | — | **Não executado** (download não autorizado) | Handlers inalterados no diff | — |
| Auditoria de módulo | 4 agentes (mapeador, processo de negócio, identidade/acesso, funcional) | Sem mudança de fronteira; PASS / PASS com avisos / PRODUCTION_READY; P2/P3 de texto corrigidos na fase | Relatório local | — |
| Leitor de tela | — | **Não executado** | Só atributos | — |
| Movimento normal | — | **Não observado** (movimento reduzido ativo) | — | — |

Diferenças restantes em relação às referências: rótulos dos cards em Title Case e valores no formato canônico `R$1.108,08` (sem espaço e sem "R$" menor), como no restante do sistema; barras verde/vermelho em vez de dois azuis (D35); delta com linha divisória (família `summary` da F01); a 390 px uma coluna em vez de duas (D19/D31); sem cartão "Outubro em andamento" (D09), sem atalhos e sem menu "Exportar" (D36).

As capturas ficaram na pasta temporária da extensão (`claude-chrome-screenshots-*`) e mostram dados da unidade de teste; não foram copiadas para o repositório.

## Pendências e regressões

- Introduzidas e corrigidas na fase: ícone do seletor de mês empilhado (o `SelectTrigger` aplica `line-clamp` ao `span` filho); grade fixa cortando 4 colunas a 1278 px; trilhos do ranking com comprimentos diferentes; subtítulo do ranking com o Top do período anterior durante a carga; segmento "a pagar" quase invisível no escuro; e, pela auditoria, legenda de período avançando antes da resposta (P2) e cinco textos imprecisos (1 P2, 4 P3).
- Registradas sem corrigir (preexistentes): PF-074 (RPC chamada sem permissão), PF-075 (chave de exportação fora do registry), PF-076 (card Vencidas × lista), PF-077 (guarda que descarta troca de período). PF-003 e PF-004 ganharam evidência de navegador; PF-005 e PF-008 continuam como estavam.
- Observações para outras fases: `SegmentedControl` sem nome acessível no `radiogroup` (primitiva da F02); títulos h3 achatados entre seção e cards (primitiva `CardTitle`); foco do Recharts ao clicar no gráfico mostra contorno preto (todos os gráficos; tema de gráficos); botão flutuante da calculadora cobre conteúdo no celular (global, ligado à PF-073); PDF do Dashboard com cor literal laranja e sem período (PF-008).

## Rollback seletivo

Reverter os commits de código da Fase 03 (ou descartar a branch `feat/redesign-v2-f03`). `DashboardFinanceiroSection.tsx`, `DashboardCharts.tsx` e `dashboardFinanceiroView.ts` andam juntos (props `periodLabel`/`expenseAside` e funções puras); os três testes novos saem com eles. Nenhum outro arquivo de código foi tocado.

## Decisão de avanço

Fase 03 **validada com ressalvas**: gates de linha de comando ok; os oito valores idênticos antes/depois; cliques, filtros, estados, temas, seis larguras, sidebar e contraste conferidos em navegador; auditoria de módulo sem bloqueante. Ressalvas: sem acesso e exportação só em teste/diff (sem perfil reduzido e sem autorização de download); leitor de tela e movimento normal não observados; larguras pequenas em iframe. Próxima: Fase 04A.
