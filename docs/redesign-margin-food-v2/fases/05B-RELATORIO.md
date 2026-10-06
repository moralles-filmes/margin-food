# Relatório — Fase 05B • Fechamento de Caixa, Marcas, Cadastros Base e Categorização

## Identificação

- Fase: 05B. Data: 2026-10-05.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f05b`, criada a pedido do proprietário a partir de `feat/redesign-v2-f05a` em `149f4b5`. `git status` no início: limpo. Commits a pedido do proprietário: `c102ddb` (código) e `211353b` (documentação), mais um de documentação registrando os SHAs. Sem push, PR, merge ou deploy; `main` intocada em `c6a9774`.
- Ambiente: Windows 11, Bun, Vite do projeto iniciado nesta sessão em `http://127.0.0.1:8080` (parado no fim), Chrome com a extensão, `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: login "Administrador Principal", unidade de teste **Moralles**, com autorização do proprietário nesta fase para usá-la com **dados simulados**. Nenhuma senha digitada; nenhum download.
- Dados: cinco fechamentos sintéticos de outubro/2026 (três marcas no mesmo dia com pedidos e pessoas, dia legado sem divisão, marca sem quantidade, marca sem forma de venda, marca inativa num dia, dia de R$ 1.234.567,89 com observação longa), cinco marcas (uma sem categoria, uma sem forma de venda, uma inativa), 17 categorias (raízes não operacionais de sistema com filhos, "Fora dos totais", nome com acento), três centros, cinco contas contábeis, três regras (regex, contém, exato longo), contagem de sem categoria e prévia de 4 itens — tudo injetado **só no cliente**, interceptando o `fetch` da aba. Erros, atraso (4 s), vazios e "um dia só" simulados no cliente.
- Proteção de escrita: toda RPC fora das leituras (`get_/count_/list_/has_` repassadas; `contar_lancamentos_sem_categoria` e `preview_regra_categorizacao` respondidas pela fixture), todo INSERT/UPDATE/DELETE/UPSERT e toda Edge Function recebiam resposta simulada e eram registrados. **Nenhuma escrita foi tentada** (lista de bloqueadas vazia na aba e nos iframes, do começo ao fim). Bloqueada por precaução uma única **leitura** de outra tela (`fin_get_limite_aprovacao_atual`, Contas a Pagar), que não é escrita.
- Botões acionados só para abrir diálogos (conferido no código): "Novo Dia", Editar da linha do fechamento, "Excluir" da linha (só abre a confirmação; cancelada), "Nova marca", lápis da marca, "Nova Raiz", Editar da categoria, "Nova Conta"/Editar/Remover (cancelado) do Plano, "Nova Regra", "Testar Regra" (leitura respondida pela fixture). Nunca clicados: Registrar/Atualizar, Switch de marca, Salvar marca, arrastar/Subir/Descer, Desativar confirmado, Excluir selecionadas, Modelo Padrão, Criar/Atualizar categoria, Salvar conta/centro, Aplicar Regras, Criar/Salvar regra.
- Interrupção: no meio da validação a extensão desconectou e, ao voltar, a janela ficou oculta (aba em segundo plano). Nesse intervalo uma rodada de medição em iframe leu os **dados reais** da unidade de teste (só leitura — o temporizador que instala a fixture no iframe foi estrangulado pelo Chrome); essas medições foram descartadas e refeitas com a janela visível e a fixture confirmada no iframe.
- Estado restaurado no fim: tema claro, aba do Financeiro em "Dashboard", sem largura de sidebar salva, sem a fixture nem os registros dela no `sessionStorage`, página recarregada.
- Capturas (antes e depois, claro/escuro, larguras, diálogos) só nas pastas temporárias `C:\Users\Yuri\AppData\Local\Temp\claude-chrome-screenshots-nAetN4` e na pasta da sessão; fora do repositório.
- Roteamento (ai-router): **TIER 0 → agente principal**, auditoria exigida. Executado pelo agente principal.

## Escopo entregue e preservado

Entregue:

1. **Fechamento de Caixa (D59, D60, D61):** `FinScreenHeader`; filtros rotulados; resumo com os mesmos cinco números (Total bruto em destaque) e legenda do período da última carga e da origem ("somado na tela"); `ChartCard` com a mesma série e estado de um dia; lista por dia tabela ⇄ cartões com a observação inteira; estados de carregamento, erro (inicial e de recarga), divisão e marcas indisponíveis e vazio; exportação desabilitada com leitura em erro; diálogo com rótulos, nomes por marca, avisos por token e retorno de foco — mesma soma, validações, payload e "Data futura".
2. **Marcas e dark kitchens (D62):** avisos por token, lista tabela ⇄ cartões, `StatusBadge`, Switch nomeado (grava no clique, como antes), erro das marcas e das categorias, diálogo com retorno de foco e forma de venda alcançável pelo teclado.
3. **Cadastros Base (D63–D66):** sub-abas em `SubmoduleSwitcher` nomeado; árvore em uma marcação com ações sempre visíveis e nomeadas, selos, busca que abre os grupos, folha decidida pela árvore inteira, estados e Modelo Padrão só após leitura bem-sucedida; Plano de Contas e Centros com tabela ⇄ cartões, rótulos do formulário, erro, `AccessDenied` e retorno de foco (PF-009 mantida).
4. **Categorização (D67):** "Situação" com a contagem do servidor, alerta, lista tabela ⇄ cartões, erros separados, prévia rotulada pelo padrão testado.
5. **Foco (D68):** `devolverFoco` nas confirmações das telas e no `TableActions`.
6. **Peças novas:** `fechamentoView.ts` (rótulos e limites), `devolverFoco.ts`.

Preservado (conferido pelo mapeador e por teste): todas as chamadas `supabase.from/.rpc`, colunas, filtros, parâmetros e payloads; `save`/`remove` do Fechamento, `save`/`toggleActive` das marcas, `save`/`handleDelete`/`handleBulkDelete`/`handleMove`/`handleDrop`/`seedDefaults` da árvore, `_guarded_*` do Plano e dos Centros, `save`/`remover`/`aplicarRegras`/`handlePreview` da Categorização; textos de confirmação; `exportPdf`/`exportExcel` e os builders de exportação; `hasRegularCategories` e a subárvore de sistema; useFormDirtyGuard; permissões. Condições alteradas, todas restritivas ou de exibição e registradas: Modelo Padrão (D65), exportações desabilitadas em erro (D59/D65), folha da árvore na busca (D64).

Fora do escopo e não tocado: regras do fechamento, vínculo marca→categoria, flags de categoria, seed, reordenação e aplicação de regras; RPC, migration, RLS, permissão; telas da 03, 04A, 04B e 05A (exceto os compartilhados, conferidos por teste); `presentation*Export.ts`, `pdfFinanceiro.ts`, exportadores do Fechamento; nenhuma PF corrigida (a PF-109 foi só mitigada na tela, porque a fase aumentaria a exposição).

## Arquivos reais

Alterados (11): `src/components/FinanceiroView.tsx` (só `CadastrosBase`), `src/components/financeiro/FechamentoCaixaSection.tsx`, `FechamentoMarcasTab.tsx`, `CadastroBaseTree.tsx`, `PlanoContasFinSection.tsx`, `CentrosCustoFinSection.tsx`, `CategorizacaoSection.tsx`, `src/components/ui/SegmentedControl.tsx`, `SegmentedControl.test.tsx`, `SubmoduleSwitcher.tsx`, `TableActions.tsx`.

Novos (7): `src/components/financeiro/fechamentoView.ts`, `devolverFoco.ts` e os testes `fechamentoView.test.ts` (4), `FechamentoCaixaSection.test.tsx` (11), `CadastroBaseTree.test.tsx` (8), `CadastrosFinanceiros.test.tsx` (9), `CategorizacaoSection.test.tsx` (7).

Documentação: `PROGRESSO.md`, `DECISOES.md` (D59–D68), `MATRIZ-DE-COBERTURA.md` (FIN-A-051 a 055, 060 a 066; nota na 067), `PENDENCIAS-FUNCIONAIS.md` (PF-105 a PF-110), este relatório, `handoffs/05B-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md`/`AGENTS.md` sem alteração.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 205 arquivos, 1.933 testes, todos passando (rodado de novo depois das correções da auditoria) | Base 200 / 1.893 + 5 arquivos e 40 testes (1 a mais em `SegmentedControl.test.tsx`) | — |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual à base; os avisos dos arquivos tocados são anteriores (`any`, dependências de `useEffect`, `react-refresh` do `buildTree`) | — |
| Build | `bun run build` | ok; `FinanceiroView` 261,90 → 276,52 kB; CSS 123,23 → 123,52 kB; `livroRazaoView` 34,99 → 34,68 kB; `CodigosPagamentoSection` 11,09 → 11,13 kB (`TableActions`); `Index` 41,20 → 41,24 kB (`SubmoduleSwitcher`); `index` 204,77 → 204,76 kB; Conciliação 136,35 e `vendor-charts` 555,44 kB iguais | — | As seis telas não são lazy (como antes): o aumento vem de estados, cartões e diálogos |
| Hex, `dark:`, opacidade, valores das referências | grep nas linhas adicionadas e auditoria funcional | 0 ocorrências novas (o gráfico usa `hsl(var(--primary))`/`--primary-soft`); nenhum valor das imagens | Diff | — |
| Antes | Fechamento (diário, marcas, Novo/Editar, Excluir), Cadastros (árvore, busca, Nova Categoria, Plano, Centros), Categorização (Nova Regra + prévia); claro, escuro, 1366 e 390/320 px; foco e guard | Capturado antes de editar, com a mesma fixture | Pasta temporária + `baseline-antes.md` | — |
| Valores antes/depois | Texto lido por JS | **Idênticos**: 5 cards (R$1.251.649,14 · R$1.226.373,55 · 5 · 4.217 · 3.435) e as 5 linhas com marcas, quantidades, taxas, descontos e líquido; 5 marcas; 17 categorias; 5 contas; 3 centros; 3 regras e contagem 7; prévia de 4 itens. Edição de 03/10: soma das marcas R$6.310,75 e líquido R$5.955,45 = gravado | JS + capturas | Dados sintéticos |
| Escrita | Interceptação do `fetch` (aba e iframes) | Nenhuma escrita tentada | Registro da fixture | — |
| Diálogos | Novo/Editar Fechamento, Excluir (cancelado), Nova/Editar marca, Nova Raiz/Editar categoria, Nova/Editar conta, Remover (cancelado), Nova Regra + Testar Regra | Abertos e fechados com Esc/"Sair sem salvar"/Cancelar; textos de decisão iguais | Capturas + JS | "Data futura", Desativar e Excluir selecionadas não abertos (exigem clicar em gravação ou selecionar) |
| Foco | `document.activeElement` após fechar | Edição do dia → botão da linha (antes "Novo Dia"); Nova marca → "Nova marca" e lápis → lápis (antes `body`, por causa do `autoFocus`); Editar categoria → botão; Editar conta → botão; Remover cancelado → "Remover …" (antes `body`, em todo `TableActions`); Nova Regra → "Nova Regra" (antes `body`) | JS | — |
| Teclado | Tab, Esc, Enter | "Forma de venda" alcançável sem valor (antes os dois rádios fora do Tab); ações da árvore no Tab (antes invisíveis fora do hover) | JS + capturas | Subir/Descer não acionados (gravam) |
| Estados | Fixture: erro, atraso, vazio, um dia | Fechamento: carregamento anunciado; erro inicial → `ErrorState` (antes vazio + zeros, só toast); erro de recarga → aviso com a última carga; divisão indisponível → "—" e aviso na edição; marcas indisponíveis → aviso; vazio; um dia → "Tendência a partir de dois dias". Marcas: erro → `ErrorState`; categorias → "Indisponível". Árvore: erro sem Modelo Padrão; vazio com Modelo Padrão. Plano vazio; Centros com erro. Categorização: regras em erro → `ErrorState` e "—"; contagem 0 → Aplicar desabilitado | Capturas + JS | — |
| Busca | "hortifruti" com a árvore recolhida | Acha "Hortifrúti" com os grupos acima abertos (antes escondido no grupo recolhido) | JS + captura | Grupo achado só pelo nome: só em teste |
| Larguras | Iframe 320, 390, 768, 1024, 1920; janela 1366; janela 1333 com sidebar a 437 px e recolhida | Sem rolagem horizontal da página nem interna e nenhum valor cortado nas seis telas; 1366 e 1920 em tabela; 1024 com sidebar e abaixo em cartões (Fechamento, Categorização); árvore em duas faixas abaixo de 40rem | `scrollWidth` + capturas | Iframe, não aparelho; 1366 com sidebar alterada medido a 1333 (janela maximizada não redimensiona) |
| Contraste, claro | JS sobre o fundo real, quatro telas e dois diálogos | Telas ≥ 4,80 (selos); Fechamento ≥ 4,92; diálogo do fechamento ≥ 4,57 (valor de 18 px em negrito sobre `muted`); prévia ≥ 5,04 | JS | Card azul não medido por JS (gradiente) — vale a medição da F01 (D18, ≥ 4,53) |
| Contraste, escuro | Idem | Telas ≥ 5,11; diálogos ≥ 5,17 | JS | Idem |
| Formulário sujo | Esc nos formulários | Guard aparece como antes (inclusive em formulário intacto — PF-107) | Capturas | — |
| Sem permissão | — | Só em teste (`AccessDenied`) | Testes | Não simulado em navegador |
| Leitor de tela / movimento normal | — | **Não executados** | Só nomes acessíveis em teste e JS | — |

## Auditoria de módulo e correções aplicadas na fase

`saas-audit-br:module fechamento-cadastros-categorizacao-redesign-v2-f05b --audit-only` sobre o diff `149f4b5..` de `src/`. Estado e relatório em `.saas-audit/modules/fechamento-cadastros-categorizacao-redesign-v2-f05b/` (fora do Git).

| Agente | Veredito | Resultado |
|---|---|---|
| Mapeador de arquitetura | Sem mudança de fronteira | Chamadas, colunas, filtros, RPC, parâmetros e payloads idênticos; nenhum caminho de escrita novo; condições alteradas só restritivas/exibição |
| Identidade e acesso | PASS | Nenhum gate alterado; Modelo Padrão mais restritivo; PF-009 preservada |
| Processo de negócio | PASS_WITH_WARNINGS (0 bloqueantes; 2 P3 introduzidos, 5 preexistentes) | Soma, validação, payload e confirmações intactos; rótulos novos conferidos contra as migrations |
| Funcional | Sem BLOCKER; 1 HIGH preexistente | Handlers, hooks e marcação conferidos |

Introduzidos pela fase e **corrigidos** (com teste quando cabia; as larguras e o contraste foram medidos depois das correções):

1. Rótulos imprecisos (nota de pedidos/pessoas por marca, descrição do diálogo de edição, erro e escopo da prévia) e mensagens contraditórias em erro (alerta "Crie regras", "fechamento antigo", "Cadastre marcas").
2. Exposição da PF-109: a busca abria os grupos e um grupo achado só pelo nome aparecia como folha (seleção, "Desativar", lote) → folha decidida pela árvore inteira.
3. Exportações com leitura em erro (PDF/Excel do Fechamento, Excel da árvore) → desabilitadas.
4. Subir/Descer e o retorno de foco perdiam a linha porque o esqueleto substituía a lista na recarga → esqueleto só na primeira carga (árvore, Plano, Centros, Regras, Marcas; Marcas mantém a última lista com aviso).
5. Foco não devolvido em caminhos de erro; nome acessível sem o rótulo visível; ids órfãos; erro da prévia persistente; limite da tabela do Fechamento abaixo da largura dela (960 → 1000).
6. `SearchableSelect` da categoria confundiria rótulos repetidos pelo teclado → de volta ao `Select` por id.
7. Durante a validação em navegador (antes da auditoria): `autoFocus` do Nome da marca impedia o retorno de foco; ações da árvore desalinhadas; selos e ações em duas linhas abaixo de 44rem → 40rem e faixas.

Preexistentes **registrados sem corrigir**: PF-105 (edição com a divisão indisponível apaga o detalhamento — **impacto alto**), PF-106 (leituras sem permissão), PF-107 (guard de formulário sujo), PF-108 (Novo Dia sobrescreve sem lock), PF-109 (busca/folha e checagem de vínculo — mitigada só na tela), PF-110 (menores). PF-009 continua.

## Rollback seletivo

Reverter o commit de código da fase (ou descartar a branch `feat/redesign-v2-f05b`). `fechamentoView.ts` e `devolverFoco.ts` só são usados pelas telas desta fase; as mudanças nos compartilhados são opcionais (`ariaLabel` do `SubmoduleSwitcher`) ou só de foco/teclado (`TableActions`, `SegmentedControl` sem valor).

## Decisão de avanço

**Validada com ressalvas.** Gates automáticos verdes, navegador com dados sintéticos em claro/escuro e seis larguras, valores idênticos antes e depois, nenhuma escrita, auditoria sem bloqueante e com os achados da fase corrigidos. Ressalvas: leitor de tela e movimento normal não observados; sem permissão só em teste; "Data futura", Desativar e Excluir selecionadas não abertos; larguras pequenas em iframe. Próxima: **Fase 06A — DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria e Borderô**. O proprietário deveria decidir a PF-105 (e a PF-097 da 05A) antes de um deploy dessas telas.
