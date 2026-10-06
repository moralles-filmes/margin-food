# Relatório — Fase 06A • DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria e Borderô

## Identificação

- Fase: 06A. Data: 2026-10-05.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f06a`, criada a pedido do proprietário a partir de `feat/redesign-v2-f05b` em `b4cf636`. `git status` no início: limpo. Commits a pedido do proprietário (SHAs no handoff). Sem push, PR, merge ou deploy; `main` intocada em `c6a9774`.
- Ambiente: Windows 11, Bun, Vite do projeto iniciado nesta sessão em `http://127.0.0.1:8080` com uma config só da sessão (a do projeto + `server.watch.ignored` para `.claude/**`: outra sessão gerava arquivos em `.claude/worktrees/` e cada mudança recarregava a página e apagava a fixture). Parado no fim. Chrome com a extensão (o proprietário escolheu o "Browser 1"), `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: login "Administrador Principal", unidade de teste **Moralles**, com autorização do proprietário nesta fase para usá-la com **dados simulados**. Nenhuma senha digitada; nenhum download (autorizado, mas não feito: os arquivos iriam para a pasta Downloads do usuário e apagá-los depois seria excluir arquivos dele).
- Dados: fixture sintética só no cliente (`fetch` da aba interceptado; script servido por um servidor estático local na porta 8099, parado no fim): árvore de 20 categorias (receitas, deduções, custos, despesas, raízes não operacionais), receita negativa, valores de centenas de milhares e milhões em 12 meses, agosto/2026 sem movimento; DFC com saldo inicial; orçamento com folhas orçadas e não orçadas, pai com orçamento legado, realizado acima do orçado, folha sem realizado e resíduo "Sem categoria"; KPIs 3/6/12 meses (margem negativa, positiva e sem receita; prazo negativo; 8 fornecedores com nome longo); Comparativo com categoria só em A, só em B e base zerada; 130 eventos de auditoria (cursor, diff longo e JSON aninhado, sem diff, log global); Borderô com vencidas antes do período, conta sem saldo, rateio, categoria não operacional e inativa. Erros, atraso (3–4 s) e vazios simulados por RPC no cliente; perfil reduzido simulado trocando a lista de permissões que o cliente recebe (num iframe).
- Proteção de escrita: as leituras destas telas respondidas pela fixture; `get_/count_/list_/has_` e GET/HEAD repassados; todo o resto (RPC, INSERT/UPDATE/DELETE/UPSERT, Edge Function) bloqueado com resposta simulada e registrado. **Nenhuma escrita foi tentada** (registro de bloqueadas vazio na aba e nos iframes do começo ao fim).
- Botões acionados só para abrir diálogos/estados (conferido no código): "Copiar Mês" (diálogo, fechado com Esc), lixeira do orçamento legado (confirmação, cancelada com Esc), card "Saldo das contas" (diálogo), "Ver detalhes" da Auditoria, "Carregar mais", "Calcular", "Comparar", "Tentar novamente", "Atualizar". Nunca clicados: Salvar, Copiar, Excluir, PDF, Excel, Exportar PDF.
- Estado restaurado no fim: tema claro, aba do Financeiro em "Dashboard", sem largura de sidebar salva, sem fixture nem registros dela no `sessionStorage`, página recarregada.
- Capturas (antes e depois, claro/escuro, larguras) só em `C:\Users\Yuri\AppData\Local\Temp\claude-chrome-screenshots-ImZy4v` e na pasta da sessão; fora do repositório.
- Roteamento (ai-router): **TIER 0 → agente principal**, auditoria exigida. Executado pelo agente principal.

## Escopo entregue e preservado

Entregue (FIN-B-011 a FIN-B-038):

1. **DRE e DFC (D69–D71):** alternador em `SegmentedControl` com ativação manual; cabeçalho com o regime; filtros rotulados; legenda do período carregado + regime; erro com nova tentativa (antes só toast, com valores antigos sob o período novo ou "Nenhuma categoria"); esqueleto só na 1ª carga; só a resposta mais recente entra; exportação bloqueada em leitura/erro; `DemonstrativoTree` com hierarquia por token (sem opacidade), botões nomeados com `aria-expanded`, `tabular-nums`, lista abaixo de 600 px, `-0` exibido como `R$0,00`, nota quando não há receita; rodapé do DFC legível.
2. **Orçamento (D72):** resumo com receita, despesa e resultado realizados × orçado/projetado; tabela ⇄ lista com o `BRLInput` nomeado por folha, cadeado com texto, lixeira nomeada, `StatusBadge` da regra existente; esqueleto também na troca de mês; erro/vazio/sem permissão; Copiar Mês e exportação bloqueados em leitura/erro; diálogo e confirmação com retorno de foco.
3. **KPIs (D73):** dois grupos com a janela carregada e textos do contrato da RPC; "—" sem receita; gráfico em `ChartCard` com "Valores por mês"; Top 8 rotulado; exportação só com a janela exibida.
4. **Comparativo (D74):** cinco `KpiCard` com A, B e variação em % ou p.p., "Sem base"; rótulos dos meses da resposta; aviso e exportação bloqueada quando os campos mudam sem comparar; categorias em tabela ⇄ lista.
5. **Auditoria (D75):** resumo rotulado como contagem do servidor (período + entidade + ação, sem a busca — o prompt supunha "carregados", o SQL mostra o contrário); filtros rotulados; tabela ⇄ lista; detalhe por botão com registro e justificativa inteiros e diff legível no celular; erro de "Carregar mais" junto da lista.
6. **Borderô (D76):** família V2, saldo final em destaque (ou card de perigo quando negativo), filtro com ativação manual, diálogo de composição com retorno de foco e lista no celular, tabela de categorias ⇄ lista.
7. **Compartilhado (D77):** `MonthNavigator` com seletor de 180 px (meses longos eram cortados).

Preservado (conferido pelo mapeador de arquitetura sobre `git show HEAD` × árvore e pelos testes): nomes de RPC, parâmetros, payloads e ordem das chamadas; chaves `useCan`; Salvar (mesma condição e payload), Copiar, Excluir; `exportOpts` do demonstrativo, `gerarPDF`/`gerarExcel`, `exportPdf`/`exportExcel` de KPIs, Comparativo e Auditoria, `exportBorderoPdf` e `buildBorderoPdfModel`; regimes, somas, sinais, denominadores, hierarquia, regra pai/filho, rateio e não operacionais; paginação por cursor; `useBordero`. Condições alteradas, todas restritivas ou só de exibição e registradas: exportações e Copiar Mês desabilitados em leitura/erro (e, no Comparativo/KPIs, quando os campos não correspondem ao exibido); esqueleto na troca de mês do Orçamento; descarte de resposta antiga (DRE, DFC, Orçamento).

Fora do escopo e não tocado: Apresentação Sócios e `Presentation*` (06B), CMV Financeiro (07), telas da 03 a 05B (exceto o `MonthNavigator`, D77), exportadores (`exportDemonstrativo.ts`, `borderoPdfExport.ts`, `pdfFinanceiro.ts`, `presentation*Export.ts`) e as funções de exportação inline; RPC, migration, RLS, permissão; nenhuma PF corrigida.

## Arquivos reais

Alterados (15): `src/components/FinanceiroView.tsx` (só `DREDFCSection`), `src/components/financeiro/DRESection.tsx`, `DFCSection.tsx`, `DemonstrativoTree.tsx`, `DemonstrativoTree.test.tsx`, `OrcamentoSection.tsx`, `OrcamentoSection.test.tsx`, `KPIsSection.tsx`, `ComparativoSection.tsx`, `AuditoriaFinSection.tsx`, `BorderoSection.tsx`, `BorderoSection.test.tsx`, `MonthNavigator.tsx`, `bordero/BorderoPeriodFilter.tsx`, `bordero/BorderoCategoryTable.tsx`.

Novos (6): `src/components/financeiro/analisesParts.tsx` (`DemonstrativoFiltros`), `analisesView.ts` (período dos KPIs, deltas em % e p.p., variação por categoria) e os testes `analisesView.test.ts` (4), `DemonstrativosSection.test.tsx` (7), `KpisComparativo.test.tsx` (10), `AuditoriaFinSection.test.tsx` (7).

Documentação: `PROGRESSO.md`, `DECISOES.md` (D69–D77), `MATRIZ-DE-COBERTURA.md` (FIN-B-011 a 038; nota na FIN-A-067), `PENDENCIAS-FUNCIONAIS.md` (PF-111 a PF-116), este relatório, `handoffs/06A-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md`/`AGENTS.md` sem alteração.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 209 arquivos, 1.975 testes, todos passando (rodado de novo depois das correções da auditoria) | Base 205 / 1.933 + 4 arquivos novos e 42 testes (inclui 6 novos em `DemonstrativoTree.test.tsx`, 6 em `OrcamentoSection.test.tsx` e 4 em `BorderoSection.test.tsx`) | — |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros; 662 avisos no repositório, **iguais antes e depois** arquivo a arquivo (`git show HEAD:<arquivo>` × atual, nos 15 alterados; 0 nos 6 novos) | JSON do ESLint | O total do comando (2.677, 3.338 e 3.329 nas rodadas desta sessão; 2.016 nas fases anteriores) inclui `.claude/worktrees/*` de outras sessões, que o ESLint passou a varrer e que mudam enquanto elas trabalham |
| Build | `bun run build` | ok. Lazy (antes → depois): Orçamento 15,29 → 20,13 kB; KPIs 10,36 → 13,51; Comparativo 10,35 → 12,85; Auditoria 14,65 → 18,60; Borderô 18,92 → 24,43; `borderoPdfExport` 8,53 igual. `FinanceiroView` 276,52 → 278,69 (DRE/DFC/árvore não são lazy); CSS 123,52 → 124,12; `Index` 41,24 → 41,40; `index` 204,76 e `vendor-charts` 555,44 iguais | Logs do build | O aumento vem de estados, listas e diálogos novos; nenhuma dependência nova |
| Hex, `dark:`, opacidade, valores das referências | grep nas linhas adicionadas e auditorias | 0 ocorrências novas; nenhum valor das imagens | Diff | — |
| Antes | As seis telas: valores por JS e capturas claro/escuro a 1.333 px e 390 px (iframe com a fixture) | Capturado antes de editar, com a mesma fixture | Pasta temporária + `baseline-antes.md` | — |
| Valores antes/depois | Contagem de todos os valores R$/% da tela | **Idênticos** em Orçamento, KPIs, Borderô e Auditoria (52 · 9 · 18 · 9 · 3); DRE/DFC iguais exceto `R$-0,00` → `R$0,00` (D71); Comparativo igual exceto "-3,4pp" → "-3,4 p.p." e "0,00%" real no lugar de "—" (D74) | JS | Dados sintéticos |
| Exportação | Testes com a mesma entrada | `exportOpts` do DRE/DFC idêntico; linhas do Excel de KPIs, Comparativo e Auditoria idênticas; `buildBorderoPdfModel` = valores da tela | Testes | Arquivos não baixados (ver Identificação) |
| Escrita | Interceptação do `fetch` (aba e iframes) | Nenhuma escrita tentada; Orçamento: digitar → "Salvar (1)", trocar de mês descarta, nada gravado | Registro da fixture + teste "digitar e fechar não grava" | — |
| Diálogos | Copiar Mês, confirmação da lixeira, composição do saldo, detalhe da Auditoria | Abertos por teclado e fechados com Esc; foco inicial no seletor/"Cancelar"; foco volta à origem (botão, lixeira, card) | JS + testes | — |
| Estados | Fixture: erro, atraso, vazio, mês sem movimento, sem receita, base zerada | Erro → `ErrorState` sem "R$" em todas as telas; esqueleto só na 1ª carga (e na troca de mês do Orçamento); recarga com "atualizando…"; vazios; "Sem base"; "—" sem receita | JS + capturas | "Tentar novamente" da Auditoria com lista vazia não recarrega (PF-111, preexistente) |
| Sem permissão | Iframe com lista de permissões reduzida (só no cliente) | DFC sem `financeiro:fluxo:view` → "Acesso restrito" (caminho da PF-002); demais telas em teste | JS + captura | As outras abas somem do menu sem a chave `:view` (o estado só aparece pelo guard) |
| Larguras | Iframe 320, 390, 768, 1024, 1920; janela 1.333; sidebar recolhida e a 437 px | Sem rolagem horizontal da página nem interna nas seis telas (antes: DRE 437/344, Orçamento 1.037/344, Auditoria 893/346, Borderô 628/344, Comparativo 404/312 a 390 px); só os arcos do card azul e a justificativa truncada de propósito na tabela | `scrollWidth` + medição de corte | Iframe, não aparelho; 1.366 medido como 1.333 (janela maximizada) |
| Teclado | Tab, Enter, Espaço, setas, Esc | Árvore abre/fecha por Enter e Espaço com `aria-expanded`; alternadores DRE/DFC e tipo de período não trocam pela seta | JS | — |
| Contraste, claro | JS sobre o fundo real | DRE/DFC ≥ 4,57; Orçamento ≥ 4,80; KPIs ≥ 5,17; Comparativo ≥ 5,04; Auditoria ≥ 4,80; Borderô ≥ 5,04; nenhuma falha | JS | Card azul não medido (gradiente) — vale D18 |
| Contraste, escuro | Idem | DRE/DFC ≥ 4,60; Orçamento ≥ 5,11; KPIs ≥ 5,17; Comparativo ≥ 5,17; Auditoria ≥ 4,93; Borderô ≥ 5,28 | JS | Idem |
| Leitor de tela / movimento normal | — | **Não executados** | Só nomes acessíveis em teste e JS | — |

## Auditoria de módulo e correções aplicadas na fase

`saas-audit-br:module analises-financeiras-redesign-v2-f06a --audit-only` sobre o diff `b4cf636..` de `src/`. Estado e relatório em `.saas-audit/modules/analises-financeiras-redesign-v2-f06a/` (fora do Git).

| Agente | Veredito | Resultado |
|---|---|---|
| Mapeador de arquitetura | Sem mudança de fronteira | RPCs, parâmetros, permissões, ordem e exportadores idênticos ao HEAD; nenhuma chamada nova; condições alteradas só restritivas/exibição |
| Identidade e acesso | PASS_WITH_WARNINGS (0 bloqueantes; 2 P3 preexistentes) | Nenhuma chave nem guard alterado; Copiar Mês e exportações mais restritivos; Auditoria sem dado novo (o detalhe mostra o que a mesma RPC já devolvia) |
| Processo de negócio | PASS_WITH_WARNINGS (0 bloqueantes; 4 P2 e 6 P3) | Nenhum cálculo, regime, denominador ou hierarquia mudou; rótulos conferidos contra o SQL |
| Funcional | Sem BLOCKER introduzido; 1 HIGH preexistente (link da Auditoria — PF-001) | Hooks antes dos retornos, `aria-controls` válidos, chaves únicas, nenhum hex/`dark:`/opacidade novo, nada só no hover |

Introduzidos pela fase e **corrigidos** (com teste quando cabia e conferidos em navegador):

1. Orçamento: com o esqueleto só na 1ª carga, ao trocar de mês as linhas do mês anterior ficavam editáveis durante a leitura (o Salvar gravaria no mês novo; zerar uma meta podia excluir a do mês anterior pelo id) → esqueleto também na troca de mês.
2. Auditoria: sub do card "Total" dizia "todas as ações" com filtro de ação → "Eventos com os filtros de entidade e ação"; o erro de "Carregar mais" ficava preso numa recarga → limpo em toda carga nova.
3. Rótulos: "vencido até hoje" → "com vencimento antes de hoje" (a RPC usa `<`); Top 8 "não todos" → "a lista para em 8"; margem "Sem base" também quando A não tem receita; resumo do Orçamento "Sem orçamento no mês" em vez de "Orçado: R$0,00".
4. Exportação com dado inconsistente (D43/D59 aplicada também onde a fase não tinha aplicado): KPIs só com a janela exibida igual à do seletor e sem erro; Comparativo e Borderô também com a leitura em erro. Nos KPIs, nota "Os valores abaixo ainda são da janela de N meses. Clique em Calcular…" quando a janela muda durante um cálculo (a carga descartada é a PF-007), em vez de só travar a exportação.
5. Orçamento: "Copiar Mês" desabilitado também na recarga do mesmo mês fazia o foco cair no `body` ao fechar o diálogo depois de copiar → desabilitado só na primeira carga/troca de mês e em erro.
6. Borderô (lista): título "Total de contas" era um `<div>` solto dentro de `<dl>` → saiu da lista de definição.

Preexistentes **registrados sem corrigir**: PF-111 (retry morto da Auditoria com lista vazia), PF-112 (Orçamento descarta o digitado sem confirmação), PF-113 (dupla leitura da Auditoria), PF-114 (valor em categoria inativa/sem nó some do DRE/DFC), PF-115 (arquivos × tela), PF-116 (menores). PF-001, PF-002 e PF-007 continuam.

## Rollback seletivo

Reverter o commit de código da fase (ou descartar a branch `feat/redesign-v2-f06a`). `analisesParts.tsx` e `analisesView.ts` só são usados pelas telas desta fase. A única mudança em componente compartilhado é a largura do seletor do `MonthNavigator` (D77), reversível isoladamente.

## Decisão de avanço

**Validada com ressalvas.** Gates automáticos verdes, navegador com dados sintéticos em claro/escuro e seis larguras, valores idênticos antes e depois (diferenças só de rótulo, registradas), nenhuma escrita, auditoria sem bloqueante e com os achados da fase corrigidos. Ressalvas: leitor de tela e movimento normal não observados; arquivos PDF/Excel não baixados (comparação pela entrada dos exportadores); larguras pequenas em iframe; "sem permissão" em navegador só no DFC (as demais em teste). Próxima: **Fase 06B — Apresentação Sócios**.
