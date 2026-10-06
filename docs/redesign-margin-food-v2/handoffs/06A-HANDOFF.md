# Handoff 06A → 06B

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f06a`, criada de `feat/redesign-v2-f05b` em `b4cf636`. Commits da Fase 06A: `9ffb6ab` (código), `dd64f0a` (documentação) e `5548766` (SHAs). Depois da validação, a pedido do proprietário, merge de `origin/main` em `6f19117` (PR #144 e padronização de texto #142/#143, sem conflito).
- Publicada na `main` pelo PR #145 (deploy automático da Vercel). As fases 01–05B entraram pelo PR #144.
- Fase 06A validada com ressalvas em 2026-10-05. Fase 06B pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. Já estão no padrão: estrutura global (01–02), Dashboard Financeiro (03), Contas/Livro Razão/Fluxo/Projeção (04A), Conciliação (04B), Contas a Pagar/Receber, Códigos, Recorrências e Alertas (05A), Fechamento, Cadastros Base e Categorização (05B) e, nesta fase, DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria e Borderô (06A). Nenhuma delas mudou RPC, parâmetro, payload, ordem de chamada, permissão nem exportador; as condições alteradas são restritivas (exportação/Copiar Mês bloqueados em leitura ou erro) ou só de exibição, todas registradas.

Não reverter: D15–D68 e D69–D77 (alternador DRE/DFC com ativação manual; DRE/DFC com regime, filtros rotulados, legenda do período carregado e erro com nova tentativa; `DemonstrativoTree` com hierarquia por token, botões nomeados e lista no celular; Orçamento com resumo realizado × orçado, tabela ⇄ lista e esqueleto na troca de mês; KPIs com janela e base do contrato; Comparativo com A/B, % × p.p. e "Sem base"; Auditoria com o resumo do servidor rotulado e detalhe por botão; Borderô na família V2; `MonthNavigator` com 180 px). D09 e D13.

## Leitura obrigatória do próximo chat

Está no prompt abaixo (CLAUDE.md, mestre, progresso, decisões, este handoff, relatório 06A, matriz FIN-B-039 a 065, pendências da Apresentação, prompt 06).

## Já implementado e validado (06A)

- Navegador: Chrome "Browser 1", login "Administrador Principal", unidade de teste Moralles com dados sintéticos injetados no cliente; nenhuma escrita chegou ao servidor (registro de bloqueadas vazio).
- Valores idênticos antes e depois nas seis telas (diferenças só de rótulo, registradas: `R$-0,00` → `R$0,00` na árvore; "-3,4pp" → "-3,4 p.p." e "0,00%" real no Comparativo).
- Estados (erro, atraso, vazio, mês sem movimento, sem receita, base zerada), perfil reduzido simulado (DFC → "Acesso restrito"), diálogos abertos e fechados sem confirmar com retorno de foco, teclado, claro/escuro, 320/390/768/1024/1920 (iframe) e 1.333 px, sidebar recolhida e a 437 px sem rolagem, contraste ≥ 4,57 (claro) e ≥ 4,60 (escuro).
- Linha de comando: testes 209 / 1.975; typecheck 0; lint 0 erros (662 avisos no repositório, iguais antes/depois); build ok. Depois do merge da `main`: testes 211 / 2.239; typecheck 0; lint 0 erros e 661 avisos no código rastreado, os mesmos do PR #144 (sem `.claude/` a contagem dá 662 porque inclui `dev-cmv-preview/`, pasta local excluída do git); build ok (`FinanceiroView` 278,99 kB).
- Auditoria de módulo (mapeador, identidade, processo, funcional): nenhum bloqueante; sete achados da fase corrigidos; preexistentes em PF-111 a PF-116 (e PF-001 mantida).

Não executado: leitor de tela, movimento normal, download de PDF/Excel (comparação pela entrada dos exportadores em teste), "sem permissão" em navegador nas telas além do DFC.

## Trabalho seguinte

Fase 06B — Apresentação Sócios (FIN-B-039 a 065), só apresentação. É grande (~10 mil linhas com canvas, governança e exportadores): o prompt autoriza dividir em 06B1/06B2 se não couber com QA real.

## Bloqueios / riscos / cuidado com dados

- **Escritas na Apresentação:** reuniões/sessões executivas, transições de ata, decisões e revisões gravam — abrir os diálogos e fechar sem confirmar, com escrita interceptada.
- **Regras intocáveis:** escopo independente `presentationUnit`; metas/orçamento/projeção (ausência nunca vira zero; projeção só com 7 dias); só a DRE é competência; atas só referenciam decisões; idempotência por fingerprint do pedido original; exportadores `presentation*Export.ts` com paleta literal intencional.
- **Ambiente:** outras sessões geram arquivos em `.claude/worktrees/`; o Vite do projeto recarrega a página a cada mudança ali (use a config da sessão com `server.watch.ignored`) e o ESLint inclui esses arquivos no total de avisos (compare só o repositório).
- **Sessão e unidade:** o proprietário precisa reautorizar a cada chat; o assistente não digita senha. **D09:** nunca usar valores das imagens de referência. **Capturas** fora do repositório.
- **Pendências:** PF-001 a PF-116; nenhuma corrigida no redesign. Da Apresentação: PF-006. Aguardam o proprietário: PF-105 (impacto alto), PF-097, PF-108, PF-109, PF-088, PF-111, PF-112, PF-114, PF-115.

## Commits

- `9ffb6ab` — feat(financeiro): telas da Fase 06A (código e testes).
- `dd64f0a` — docs(redesign-v2): relatório, decisões, matriz, pendências, handoff e prompt.
- Commit seguinte — registra estes SHAs.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 06B — Apresentação Sócios (FIN-B-039 a
FIN-B-065): escopo de unidade, modo apresentação (canvas de slides, tela
cheia, toolbar), workspace de preparação (filtros, painel analítico, metas e
projeção, cenários, árvore financeira, rankings, informativo não
operacional), páginas de detalhe por rota (:detail, inclusive despesas),
reuniões/atas e governança de decisões com os diálogos, e as exportações
(PDF, PPTX, impressão, ata PDF/PPTX) — somente apresentação. Não mexa de
novo no Dashboard (03), nas telas da 04A, 04B, 05A, 05B e 06A (DRE/DFC,
Orçamento, KPIs, Comparativo, Auditoria, Borderô), não toque no CMV
Financeiro (07) e não inicie a Fase 07.

ESTADO REAL DEIXADO PELA FASE 06A (2026-10-05)
- Fases 01–05B na main pelo PR #144. Fase 06A na branch
  feat/redesign-v2-f06a (criada de feat/redesign-v2-f05b em b4cf636;
  9ffb6ab código, dd64f0a documentação, 5548766 SHAs), atualizada com
  merge de origin/main em 6f19117 (#144 e padronização de texto #142/#143,
  sem conflito) e publicada na main pelo PR #145. A 06B parte de
  origin/main atualizada (git fetch antes).
- Fase 06A validada com ressalvas. Gates depois do merge da main:
  bun run test = 211 arquivos / 2.239 testes; tsc --noEmit -p
  tsconfig.app.json = 0 erros; bun run lint = 0 erros e 661 avisos no
  código rastreado (o TOTAL impresso pelo comando inclui .claude/worktrees/*
  de outras sessões e pastas locais excluídas do git, como
  dev-cmv-preview/, e muda enquanto elas trabalham: compare só o
  repositório, ou arquivo a arquivo com `git show HEAD:<arquivo> | eslint
  --stdin --stdin-filename <arquivo> -f json`); bun run build ok
  (FinanceiroView 278,99 kB; Orçamento 20,13; KPIs 13,51; Comparativo
  12,85; Auditoria 18,60; Borderô 24,43; Index 41,46; index 204,80; CSS
  124,12; vendor-charts 555,44). Chunks da Apresentação Sócios no mesmo
  build (ponto de partida da 06B; confirme com um build antes de editar):
  ApresentacaoSociosSection 260,24 kB; presentationPdfExport 36,93;
  presentationPptxExport 48,35; presentationMinutesPdfExport 2,75;
  presentationMinutesPptxExport 4,79; presentationSlides 19,48;
  presentationMinutesPages 8,04; presentationInsightsFormatting 3,56.
- Entregue na 06A (D69–D77): alternador DRE/DFC em SegmentedControl com
  ativação manual; DRE/DFC com regime no cabeçalho, filtros rotulados
  (DemonstrativoFiltros), legenda do período carregado, ErrorState,
  esqueleto só na 1ª carga, descarte de resposta antiga, exportação
  bloqueada em leitura/erro; DemonstrativoTree com hierarquia por token,
  botões nomeados com aria-expanded, lista abaixo de 600 px e -0 exibido
  como R$0,00 (o PDF ainda imprime R$-0,00 — PF-115); Orçamento com resumo
  realizado × orçado, tabela ⇄ lista com BRLInput nomeado, esqueleto
  também na troca de mês, Copiar Mês/exportação bloqueados em erro;
  KPIs com janela e base do contrato da RPC e "—" sem receita; Comparativo
  com KpiCard A/B, variação em % ou p.p. e "Sem base"; Auditoria com
  resumo rotulado como contagem do SERVIDOR (período + entidade + ação, sem
  a busca), detalhe por botão e diff legível no celular; Borderô na família
  V2 com saldo final em destaque (perigo quando negativo); MonthNavigator
  com seletor de 180 px.
- Peças reutilizáveis (src/components/financeiro/): finV2Layout.tsx
  (FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote), analisesParts.tsx
  (DemonstrativoFiltros), analisesView.ts (deltaPercentual, deltaPontos,
  variacaoCategoria, periodoDosKpis, dataBR), useRetornoFoco.ts,
  useConteinerEstreito.ts, devolverFoco.ts, ContasParts.tsx
  (ListaCarregando/ResumoCarregando); em src/components/ui/: kpiGrid.ts,
  KpiCard (appearance summary/highlight), ChartCard + chartTheme +
  ChartLegend, SegmentedControl (ariaLabel, manualActivation),
  SubmoduleSwitcher (ariaLabel), StatusBadge, EmptyState, ErrorState,
  AccessDenied, TableActions.
- Ressalvas da 06A (não bloqueiam a 06B): leitor de tela e movimento
  normal não observados; PDF/Excel não baixados (comparação pela entrada
  dos exportadores em teste); larguras pequenas em iframe; "sem
  permissão" em navegador só no DFC. Auditoria de módulo sem bloqueante;
  achados da fase corrigidos; preexistentes em PF-111 a PF-116.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a 06B segue em nova branch a partir de origin/main atualizada (ex.:
   feat/redesign-v2-f06b), com commit separado por fase, e se haverá
   commit ao final. Não reverta nem sobrescreva o que existir. Sem push,
   merge ou deploy sem pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico). Para esta fase: Apresentação Sócios
     usa escopo independente no parâmetro presentationUnit (queries,
     permissões, detalhes e exports herdam o provider local —
     docs/multi-unidades/02-ARQUITETURA-E-OPERACAO.md); "Apresentação Sócios
     — metas e projeção" (orçamento só de fin_orcamentos, meta de CMV só de
     metas_cmv, realizado = caixa de Resultados, ausência nunca vira zero,
     projeção linear só com 7 dias observados, contas em aberto fora); só a
     DRE é competência; a chave financeiro:relatorio-socios:* governa
     Borderô E Apresentação; "Ritual executivo e atas são evidência de
     governança" (atas só referenciam decisões/ações; snapshot aprovado
     nunca vira fonte financeira viva); idempotência de sessão e decisão
     pelo idempotency_fingerprint do pedido original; notificação nasce só
     no servidor; telas com estado na URL recebem rota, não registro
     (useNavigationRequest); os quatro src/lib/presentation*Export.ts têm
     paleta literal, intencionalmente fora dos tokens — nunca migrar. Nada
     disso pode mudar.
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D77; em especial D15–D19,
     D29, D33, D38–D41, D43, D45, D47–D49, D57, D64–D66 e D69–D77)
   - docs/redesign-margin-food-v2/handoffs/06A-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/06A-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-B-039 a FIN-B-065 (e FIN-B-032/038 e FIN-A-067, para regressão)
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     que citam Apresentação/Presentation (ex.: PF-006 — card "Evolução" diz
     competência enquanto o resumo diz caixa); não corrigir
   - docs/redesign-margin-food-v2/prompts/06-analises-e-relatorios-financeiros.md
     (itens 1 a 5, 7 e 8 aplicados à Apresentação; o canvas tem proporção
     própria e é validado separado do layout responsivo)
3. Abra 00-card-azul-aprovado.png, 01-dashboard-financeiro.png e
   07-sidebar-e-componentes.png em docs/redesign-margin-food-v2/referencias/
   (MANIFESTO.md). Não há prancha da Apresentação: siga a família aplicada
   da 04A à 06A no workspace; o canvas de slides não vira layout de tela.
4. Inspecione o código real antes de propor mudanças (≈10 mil linhas —
   se não couber com QA real, DIVIDA em 06B1 [workspace, filtros, painel
   analítico, detalhe por rota] e 06B2 [canvas/modo apresentação, reuniões,
   atas, decisões, exportações], registrando no PLANO/PROGRESSO):
   src/components/financeiro/ApresentacaoSociosSection.tsx (639),
   PresentationCompanyScope.tsx (32), PresentationPeriodFilters.tsx (326),
   PresentationAnalytics.tsx (780), PresentationPlanComparison.tsx (479),
   PresentationScenarioSection.tsx (885), PresentationFinancialTree.tsx
   (148), PresentationHistoryYearsSelector.tsx (96),
   PresentationDetailPage.tsx (677), PresentationExpensesDetailPage.tsx
   (159), PresentationSlideCanvas.tsx (1.482), PresentationMode.tsx (504),
   PresentationMeetingGovernance.tsx (641),
   PresentationMeetingEditorDialog.tsx (477),
   PresentationDecisionGovernance.tsx (822),
   PresentationDecisionRegisterDialog.tsx (331), LegacyPresentationRedirect
   e os hooks src/hooks/usePresentation*.ts; src/lib/presentationDetailNavigation.ts,
   presentationFilters/Formatting/Slides.ts e os exportadores
   presentationPdfExport.ts, presentationPptxExport.ts,
   presentationMinutesPdfExport.ts, presentationMinutesPptxExport.ts (NÃO
   alterar). Há testes para quase todos — rode-os antes e depois.

CUIDADO COM ESCRITA
- A Apresentação grava: sessões executivas/reuniões (preparar, editar,
  transições da ata — aprovar, devolver), decisões (registrar, nova revisão,
  confirmar transição) e o que mais o código mostrar (confira cada
  handler). Nunca confirmar nenhum desses diálogos; abrir e fechar com Esc
  ou Cancelar, com escrita interceptada, e registrar no relatório. Na
  dúvida se uma ação grava, não clique.
- Use unidade de teste e dados SINTÉTICOS no cliente: intercepte o fetch da
  aba e responda com fixtures TODAS as leituras da Apresentação (as RPCs
  get_fin_presentation_* e as de reuniões/decisões/metadados que os hooks
  usePresentation*.ts chamarem — liste-as pelo código antes de montar a
  fixture); demais get_/count_/list_/has_ e GET repassados; todo o resto
  (RPC, INSERT/UPDATE/DELETE/UPSERT, Edge Function) bloqueado com resposta
  simulada e registrado. Guarde o código e instale de novo após recarga;
  confirme que nenhuma escrita chegou ao servidor e remova tudo no fim.
- Fixture mínima: dois anos de histórico com mês sem movimento, receita por
  marca com categoria compartilhada e resíduos "Sem marca vinculada"/"Sem
  detalhamento por marca", despesas com rateio e não operacional, plano com
  orçamento ausente (nunca zero) e meta de CMV, cenários, contas em aberto,
  rankings com nomes longos, valores negativos e de milhões, reuniões em
  vários estados, decisões com revisões; erro, atraso e vazio por RPC.

NAVEGADOR (lições da 06A)
- Rode o Vite com uma config SÓ DA SESSÃO (na pasta temporária) que importa
  o vite.config.ts do projeto e acrescenta server.watch.ignored para
  .claude/**, dist/**, docs/**, release/**: outras sessões geram arquivos em
  .claude/worktrees/ e cada mudança recarregava a página e apagava a
  fixture. Antes de instalar a fixture, importe os módulos das telas no
  console (await import('/src/components/financeiro/...')) para o Vite
  otimizar dependências sem recarregar depois. Leia a porta no log e pare o
  seu Vite (e o processo node filho) ao terminar.
- Na 06A o Chrome escolhido foi o "Browser 1", no login "Administrador
  Principal", e o proprietário autorizou a unidade de teste Moralles com
  dados simulados. Isso não vale automaticamente para a 06B: pergunte de
  novo, prefira empresa e usuário de teste e nunca digite senha. Download e
  abertura de PDF/PPTX só com autorização (lembre que vão para a pasta
  Downloads do usuário).
- Atenção (D09): valores das imagens de referência COINCIDEM com dados
  reais de uma unidade. Nada de número da imagem no código, nos testes ou na
  documentação; valores de unidade real não vão para o repositório.
- Capture o "antes" (claro, escuro, desktop e celular; canvas em tela
  cheia) ANTES de alterar qualquer arquivo, com os mesmos dados do "depois".
  Capturas na pasta temporária, nunca no repo.
- A janela do Chrome não fica menor que 500 px: use iframe da própria
  página para 320/390 px (instale a fixture DENTRO do iframe com um
  intervalo de 1 ms que avalia o código assim que o documento aparece, e
  confirme no registro dele antes de medir); mantenha a janela visível;
  chamadas de JS acima de ~45 s estouram — meça poucas telas por chamada.
  Perfil reduzido: simule trocando a lista `permissions` da resposta de
  get_my_company_context dentro do iframe. Tela cheia (Fullscreen API) pode
  exigir gesto do usuário — registre a limitação se não abrir.
- A extensão bloqueia o retorno de JS com URL ou query string; mascare.
  Uma edição salva no Vite pode remontar a tela e fechar diálogos.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard default | summary | highlight; highlight só no número
  principal do grupo; estado crítico usa summary + variant semântica.
- D19/D31/D38: valor nunca diminui para caber; a grade reorganiza
  (kpiGridClassFor/longestValueLength).
- D29/D39/D50/D69: SegmentedControl; alternância que desmonta conteúdo ou
  recarrega dados usa manualActivation. D63: rótulos longos →
  SubmoduleSwitcher com ariaLabel.
- D33/D41/D48/D51/D57/D59/D70/D75: período e base junto do valor (da
  carga EXIBIDA); rótulos descrevem o que a RPC calcula (confira no SQL);
  erro nunca vira vazio nem R$ 0,00; contagem paginada nunca é total;
  exportação desabilitada com leitura em erro ou com filtro ≠ dado exibido
  (D43/D59/D73/D74); só a resposta mais recente entra na tela.
- D40, D41/D45/D52/D60/D71/D72: tabela larga vira lista sem rolagem
  horizontal (container query com duas marcações para lista leve;
  useConteinerEstreito com uma marcação quando há controles por linha ou
  hierarquia que abre e fecha — D64).
- D47/D51: StatusBadge com a mesma precedência e textos; sem opacidade.
- D49/D54/D55/D68: retorno de foco (useRetornoFoco/devolverFoco); foco
  inicial nunca num botão que grava; rótulos associados (useId).
- D64/D66/D65: ações visíveis e nomeadas; esqueleto só na primeira carga;
  AccessDenied; convite a gravar só depois de leitura bem-sucedida.
- D74: variação em % × p.p.; "Sem base" quando a fonte não tem base;
  realizado ≠ orçado/projetado (projeção tracejada + legenda, prompt 06 §4).
- D77: MonthNavigator com 180 px.
- D08, D09, D13. Gradiente só no card de destaque e no item ativo da
  sidebar. Nenhum hex em componente (exceto os quatro presentation*Export.ts,
  que são literais por exigência do jsPDF/pptxgenjs); nenhum dark: avulso.

ESCOPO DA FASE 06B (FIN-B-039 a FIN-B-065)
1. Escopo de unidade (CompanySelector inline) e cabeçalho do workspace;
   filtros de período rotulados; estados da requisição; detalhe inválido.
2. Painel analítico: resumo executivo, metas/orçamento/projeção (realizado
   sólido, projetado tracejado, ausência ≠ zero), cenários e sensibilidade
   (simulação nunca como fato), evolução e insights, árvore financeira,
   contas em aberto, rankings (Top N ≠ total), informativo não operacional.
3. Detalhe por rota :detail (9 alvos + despesas): deep links, voltar,
   tabelas ⇄ listas, mesmos números do resumo.
4. Modo apresentação: canvas com proporção própria (não vira layout
   responsivo), toolbar, teclado/tela cheia, slides com os mesmos dados.
5. Reuniões/atas e decisões: listas, estados, diálogos (preparar/editar
   sessão, transição da ata, modo reunião, registrar decisão, nova revisão,
   confirmar transição) com rótulos, foco e retorno — sem confirmar.
6. Exportações (PDF, PPTX, impressão, ata PDF/PPTX) intocadas: comparar
   pelo builder/modelo com a mesma entrada antes e depois.
7. Desktop/celular, claro/escuro, teclado, foco, formulários sujos.

FORA DE ESCOPO
Regimes, agregações, fórmulas, cenários e denominadores; RPC, payload,
migration, RLS, permissão; idempotência e notificações; telas da 03 à 06A;
CMV Financeiro (07); os quatro src/lib/presentation*Export.ts e
presentationSlides/Minutes* (os arquivos exportados saem iguais); corrigir
PF-*.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint (avisos do repositório, não o total),
  bun run build — comparar com os números acima e explicar diferenças.
  Testes de tela com cliente falso que registre qualquer escrita.
- Em navegador (escrita interceptada): fixtures acima; workspace e
  detalhes; deep links (rota direta e voltar); modo apresentação com
  teclado e tela cheia; canvas nos dois temas e em proporção separada do
  layout; diálogos abertos e fechados sem confirmar; erros, atraso e vazio;
  sem permissão (simulado); claro e escuro; 320, 390, 768, 1024, 1366 e
  1920 px; sidebar expandida, recolhida e redimensionada; teclado e foco.
  Mesmos dados antes e depois, com valores, linhas, hierarquia e somas
  idênticos.
- Medir contraste nos dois temas sobre o fundo real.
- Auditoria de módulo (saas-audit-br:module --audit-only) com foco em
  processo (regime, metas/orçamento/projeção, cenários, Top N, governança e
  idempotência das escritas) e estados que escondem erro. Corrigir só o que
  a fase introduzir; preexistente vira PF. Registrar o que não foi
  executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-116. Da Apresentação: PF-006.
  Aguardam decisão do proprietário: PF-105 (impacto alto), PF-097, PF-108,
  PF-109, PF-088, PF-111, PF-112, PF-114, PF-115. Não corrigir nesta fase.
- Observações: PF-072 (503 nas contagens HEAD do menu) continua; a tela de
  login registra dois erros de console antes da autenticação
  (preexistente); o catálogo de desenvolvimento fica em /__catalogo (só com
  o Vite de desenvolvimento).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas FIN-B-039 a 065 na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/06B-RELATORIO.md e handoffs/06B-HANDOFF.md (ou 06B1/06B2
   se dividir).
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 07 (CMV Financeiro) se os gates passaram com navegador;
   continuação/validação da 06B caso contrário.
4. PARAR. Não iniciar a fase seguinte no mesmo chat.
```
