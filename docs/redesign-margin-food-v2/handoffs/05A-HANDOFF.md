# Handoff 05A → 05B

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f05a`, criada de `feat/redesign-v2-f04b` em `2079f94`. Commits da Fase 05A: `be5a67e` (código) e `43b44ad` (documentação), mais um commit de documentação registrando estes SHAs.
- Sem push, PR ou merge; `main` intocada em `c6a9774`.
- Fase 05A validada com ressalvas em 2026-10-04. Fase 05B pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. Fases 01 e 02 criaram a base e a estrutura global; a 03 levou o padrão ao Dashboard Financeiro; a 04A, a Contas Bancárias, Livro Razão, Fluxo e Projeção; a 04B, à Conciliação; a 05A, a Contas a Pagar/Receber, Códigos de Pagamento, Recorrências, Alertas e aos diálogos de detalhe e formulário de conta — sem mudar RPC, parâmetro, payload, ordem de chamada, chave de idempotência, permissão nem condição de botão. A 05B fecha as operações e cadastros do Financeiro: Fechamento de Caixa (com marcas), Cadastros Base (árvore de categorias, Plano de Contas, Centros de Custo) e Categorização.

Não reverter: D15–D19, D22–D30, D31–D36, D37–D44, D45–D50 e D51–D58 (resumo só das fontes atuais com rótulo do recorte e erro que nunca vira R$ 0,00; tabela ⇄ lista por largura medida com uma marcação ou container query com duas; estorno em `AlertDialog` com o mesmo texto e trava síncrona; foco inicial seguro e retorno de foco encadeado nos diálogos de conta; rateio em cartões sem perder o CMV por linha; cópia exata de código; erro dos alertas nunca vira "Tudo sob controle!"; nomes acessíveis nos compartilhados), D09, D13.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md` (Fechamento por marca, forma de venda e quantidade, vínculo marca→categoria, categorias não operacionais, `seed_default_categories`, chave `financeiro:cadastros:*`, busca normalizada)
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/05A-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — linhas FIN-A-051 a 055 e 060 a 066
7. `docs/redesign-margin-food-v2/prompts/05-operacoes-e-cadastros-financeiros.md` (itens 4, 6, 7 e 8)

Código a inspecionar: `FechamentoCaixaSection.tsx`, `FechamentoMarcasTab.tsx`, `CadastroBaseTree.tsx`, `PlanoContasFinSection.tsx`, `CentrosCustoFinSection.tsx`, `CategorizacaoSection.tsx` e o wrapper `CadastrosBase` em `src/components/FinanceiroView.tsx`. Exemplo do padrão: `ContasPagarSection.tsx`, `LivroRazaoSection.tsx`, `finV2Layout.tsx`, `kpiGrid.ts`, `useRetornoFoco.ts`, `useConteinerEstreito.ts`.

## Já implementado e validado

Conferido em navegador (login "Administrador Principal"; unidade de teste Moralles com títulos, códigos, recorrências, alertas e lançamentos sintéticos injetados no cliente; toda escrita interceptada; nenhuma chegou ao servidor, em três passagens):

- Valores, datas, parcelas e contadores idênticos antes/depois nas cinco telas e nos detalhes; os quatro códigos copiados idênticos byte a byte.
- Diálogos de detalhe, edição, Nova Conta (com rateio e CMV), pagamento, recebimento, limite, estorno e exclusão abertos e fechados sem confirmar; foco volta à origem (inclusive detalhe → editar, Livro Razão e Conciliação — ressalva da 04B resolvida); foco inicial do detalhe no próprio diálogo.
- Estados de carregamento anunciado, erro com nova tentativa (antes R$ 0,00, "Nenhuma conta a pagar" e "Tudo sob controle! 🎉") e vazio; "Total filtrado" "—" com a lista em erro; claro/escuro; 320/390 (iframe), 768, 1024, 1366, 1920 px sem rolagem horizontal; sidebar recolhida e a 437 px; rateio em tabela/cartões medido; teclado; contraste ≥ 4,80 (claro) e ≥ 4,93 (escuro).

Executado em linha de comando: testes 200 / 1.893, typecheck 0, lint 0 erros e 2.016 avisos, build ok (`FinanceiroView` 261,90 kB, CSS 123,23 kB). Auditoria de módulo (mapeador, identidade/acesso, processo de negócio, funcional): sem bloqueante; seis regressões da fase corrigidas e conferidas em navegador; preexistentes em PF-093 a PF-104.

Só em teste: "Aplicar às outras recorrências?" (exige salvar), sem permissão, erro/vazio de Códigos, Recorrências e Receber. Não executado: leitor de tela, movimento normal, qualquer confirmação de gravação.

Desvios registrados no relatório: botões de linha "Pagar", "Receber", "Estornar", editar e "Excluir" acionados só para abrir os diálogos (confirmado no código), com escrita interceptada.

## Trabalho seguinte

Fase 05B — Fechamento de Caixa, Cadastros Base e Categorização, só apresentação. Critérios: os do prompt 05 (itens 4, 6, 7 e 8) e a validação do prompt abaixo.

## Bloqueios / riscos / cuidado com dados

- Estas telas gravam com um clique: Switch de ativar marca, arrastar/subir/descer categoria, "Modelo Padrão", "Aplicar Regras". Não acionar; validar com dados sintéticos e escrita interceptada.
- O Fechamento soma marcas contra o bruto e distingue pedidos de pessoas; a árvore tem raízes de sistema e flags herdadas. Nada disso muda na apresentação.
- O proprietário precisa reautorizar sessão e unidade a cada chat; o assistente não digita senha.
- Os valores das imagens de referência coincidem com os de uma unidade real (D09): nunca usar como fixture, no código ou nas docs.
- Capturas mostram dados; ficam fora do repositório.
- 104 pendências em `PENDENCIAS-FUNCIONAIS.md`; nenhuma deve ser corrigida no redesign. PF-097 (baixa de Conta a Receber sem conta bancária, impacto alto) e PF-088 aguardam decisão do proprietário.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 05B — Fechamento de Caixa (com Marcas e dark
kitchens), Cadastros Base (Estrutura de Categorias, Plano de Contas, Centros
de Custo) e Categorização (regras automáticas), com os diálogos que essas
telas abrem. Somente apresentação. Não mexa de novo no Dashboard (03), nas
telas da 04A (Contas Bancárias, Livro Razão, Fluxo, Projeção), na
Conciliação (04B) nem nas telas da 05A (Contas a Pagar/Receber, Códigos de
Pagamento, Recorrências, Alertas, ContaDetailDialog, ContaFormDialog), e não
inicie a Fase 06A.

ESTADO REAL DEIXADO PELA FASE 05A (2026-10-04)
- Branch feat/redesign-v2-f05a, criada de feat/redesign-v2-f04b em
  2079f94. Fase 05A commitada em be5a67e (código) e 43b44ad
  (documentação), mais um commit de documentação com estes SHAs. Sem push,
  PR ou merge. main intocada (c6a9774).
- Fase 05A validada com ressalvas: bun run test = 200 arquivos / 1.893
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (FinanceiroView 261,90 kB;
  livroRazaoView 34,99 kB; CodigosPagamentoSection 11,09 kB;
  ConciliacaoBancariaSection 136,35 kB; index 204,77 kB; CSS 123,23 kB;
  vendor-charts 555,44 kB).
- Entregue na 05A (D51–D58): Contas a Pagar/Receber com resumo em KpiCard
  só das fontes atuais (rótulo do recorte; erro nunca vira R$ 0,00 — nem o
  "Total filtrado" com a lista em erro), lista tabela ⇄ cartões por largura
  medida com uma marcação (832 px), selos com a mesma precedência, linha
  focável; estorno em AlertDialog com o mesmo texto e useTravaEnvio;
  ContaDetailDialog/ContaFormDialog com títulos reais, foco inicial seguro,
  retorno de foco (inclusive detalhe → editar), rateio em cartões sem
  perder o CMV por linha (640 px, 760 px com a coluna do CMV); Códigos com
  cópia exata e "Copiado"; Recorrências e Alertas com estados reais;
  compartilhados com nome acessível (DateRangePresets, MonthNavigator,
  CategoryCombobox/SupplierCombobox com id/aria-label/aria-labelledby,
  TableActions com editLabel/deleteLabel).
- Peças reutilizáveis (src/components/financeiro/): finV2Layout.tsx
  (FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote),
  useRetornoFoco.ts, useConteinerEstreito.ts (agora com histerese opcional;
  padrão 32 px), contasView.ts, ContasParts.tsx, contaDialogFoco.ts; em
  src/components/ui/: kpiGrid.ts, SegmentedControl (ariaLabel,
  manualActivation), StatusBadge, EmptyState, ErrorState, AccessDenied,
  TableActions.
- Ressalvas da 05A (não bloqueiam a 05B): "Aplicar às outras recorrências?"
  só em teste; sem permissão e erro/vazio de Códigos, Recorrências e Receber
  só em teste; leitor de tela e movimento normal não observados; larguras
  pequenas em iframe. Auditoria de módulo sem bloqueante; as regressões da
  fase foram corrigidas; preexistentes em PF-093 a PF-104.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a 05B segue em nova branch a partir da atual (ex.: feat/redesign-v2-f05b)
   ou na mesma, com commit separado por fase, e se haverá commit ao final.
   Não reverta nem sobrescreva o que existir. Sem push, merge ou deploy sem
   pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico). ATENÇÃO às regras destas telas:
     Fechamento de Caixa por marca é detalhamento, não nova receita
     (faturamento_bruto continua a fonte oficial; as marcas somam exatamente
     o bruto via rpc_upsert_fechamento_caixa_com_marcas); forma de venda
     PEDIDOS/PESSOAS e quantidade (pedidos e pessoas nunca se somam; a forma
     gravada no dia vence a atual da marca; quantidade obrigatória só no
     cliente e não para dia antigo); vínculo marca→categoria (só categoria
     folha de RECEITA operacional; marca legada sem vínculo continua válida
     e a UI avisa); categorias não operacionais (raízes com system_key,
     excluir_dos_totais herdado pela árvore); seed_default_categories e a
     subárvore de sistema; chave financeiro:cadastros:* (não existe
     financeiro:categorias:* nem :centros-custo:*); busca com
     normalizeSearchText/includesNormalized; DateInput; campos monetários e
     numéricos. Nada disso pode mudar.
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D58; em especial
     D40–D41, D45, D47–D49 e D51–D58)
   - docs/redesign-margin-food-v2/handoffs/05A-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/05A-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-A-051 a 055 e 060 a 066 (e a 067, compartilhados, para regressão)
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     que citam Fechamento de Caixa, marcas, Cadastros Base, árvore de
     categorias, Plano de Contas, Centros de Custo ou Categorização (ex.:
     PF-009 — o Dialog de edição de Plano de Contas e Centros de Custo só
     existe dentro de canCreate); não corrigir
   - docs/redesign-margin-food-v2/prompts/05-operacoes-e-cadastros-financeiros.md
     (aplicar só os itens 4, 6, 7 e 8 — fechamento, categorização/árvore/
     plano/centros e os gerais)
3. Abra 00-card-azul-aprovado.png, 01-dashboard-financeiro.png e
   07-sidebar-e-componentes.png em docs/redesign-margin-food-v2/referencias/
   (consulte o MANIFESTO.md). Não há prancha própria destas telas: siga a
   família aplicada na 04A/04B/05A.
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/FechamentoCaixaSection.tsx (823 linhas:
   SubmoduleSwitcher, 5 cards calculados no cliente sobre o período,
   AreaChart, tabela sem paginação, Dialog com marcas, useFormDirtyGuard,
   useConfirmDialog), FechamentoMarcasTab.tsx, CadastroBaseTree.tsx (952
   linhas: árvore com drag-and-drop, reordenação, seleção em lote, Modelo
   Padrão, Dialog de categoria), PlanoContasFinSection.tsx,
   CentrosCustoFinSection.tsx, CategorizacaoSection.tsx e o wrapper
   CadastrosBase em src/components/FinanceiroView.tsx (sub-abas feitas com
   Button e estado local). Exemplo do padrão aplicado: ContasPagarSection,
   LivroRazaoSection, ConciliacaoBancariaSection, finV2Layout.tsx,
   kpiGrid.ts, useRetornoFoco.ts, useConteinerEstreito.ts.

CUIDADO COM ESCRITA
- Estas telas gravam com um clique ou um diálogo: Salvar/Excluir fechamento
  (rpc_upsert_fechamento_caixa_com_marcas, rpc_delete_fechamento_caixa,
  confirmação "Data futura"); Switch de ativar/desativar marca (UPDATE
  direto em financeiro_fechamento_marcas, um clique); Salvar marca;
  arrastar e soltar, subir/descer categoria (reorder_fin_categoria,
  batch_reorder_fin_categorias — gravam ao soltar/clicar); desativar,
  "Excluir Selecionadas", "Modelo Padrão" (seed_default_categories, um
  clique quando não há categorias), Nova Raiz/Salvar categoria; Salvar e
  excluir conta contábil e centro de custo; "Aplicar Regras"
  (aplicar_regras_categorizacao, um clique), Salvar/desativar regra.
- Nunca clicar nem arrastar nada disso, nem confirmar diálogo. "Testar
  Regra" (preview_regra_categorizacao) e contar_lancamentos_sem_categoria
  são leituras, mas responda-as com fixture. Diálogos: abrir e fechar com Esc
  ou Cancelar. Para abrir um diálogo pelo botão da linha, confirme no código
  que o botão SÓ abre o diálogo, use escrita interceptada e registre no
  relatório. Na dúvida se uma ação grava, não clique.
- Use unidade de teste e dados SINTÉTICOS no cliente: intercepte o fetch da
  aba (supabaseFetch chama o fetch global de forma preguiçosa; instale a
  interceptação e só então remonte a tela), responda com fixtures as
  leituras necessárias (RPCs e SELECT de financeiro_fechamento_caixa,
  financeiro_fechamento_marca_valores, financeiro_fechamento_marcas,
  fin_categorias, fin_plano_contas, fin_centros_custo,
  fin_regras_categorizacao) e bloqueie com resposta simulada TODA escrita
  (RPCs rpc_upsert_*, rpc_delete_*, reorder_*, batch_*, seed_*, aplicar_*,
  _guarded_*, INSERT/UPDATE/DELETE/UPSERT). A fixture da 05A não foi
  versionada (modelo: lista de RPCs de leitura respondidas por nome,
  tabelas por GET, todo o resto registrado em "bloqueadas"); monte a desta
  fase, guarde o código no sessionStorage para reinstalar depois de um
  recarregamento do Vite, registre a lista de POSTs vistos, confirme que
  nenhuma escrita chegou ao servidor e remova tudo no fim.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080. Se subir
  outro, leia a porta no log e pare o seu ao terminar.
- Na 05A o Chrome estava no login "Administrador Principal" e o
  proprietário autorizou a unidade de teste Moralles com dados simulados.
  Isso não vale automaticamente para a 05B: pergunte de novo, prefira
  empresa e usuário de teste e nunca digite senha. Download e abertura de
  PDF/Excel só com autorização.
- Atenção (D09): valores das imagens de referência COINCIDEM com dados
  reais de uma unidade. Nada de número da imagem no código, nos testes ou na
  documentação; valores de unidade real não vão para o repositório.
- Capture o "antes" (claro, escuro, desktop e celular) ANTES de alterar
  qualquer arquivo, com os mesmos dados que usará no "depois". Capturas
  ficam na pasta temporária, nunca no repo.
- A janela do Chrome não fica menor que 500 px: use iframe da própria
  página para 320/390 px. O navegador costuma estar com
  prefers-reduced-motion ativo. O texto de cada opção do SegmentedControl
  aparece duplicado no DOM (D29): localize por includes. Com a aba em
  segundo plano a captura de tela falha: redimensione a janela para trazê-la
  à frente.
- A extensão bloqueia o retorno de JS que contenha URL ou query string;
  mascare esses trechos ao ler logs da fixture. Uma edição salva no Vite
  pode remontar a tela e fechar diálogos (a fixture continua instalada).
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da 05B.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard appearance default | summary | highlight; estado
  crítico usa summary + variant semântica.
- D19/D31/D38: valor nunca diminui para caber; a grade reorganiza
  (kpiGridClassFor/longestValueLength em src/components/ui/kpiGrid.ts).
- D29/D39/D50: SegmentedControl com visual aprovado; alternância que
  desmonta conteúdo ou recarrega dados usa manualActivation. Sub-abas feitas
  com Button (Cadastros Base) são candidatas a SegmentedControl ou
  SubmoduleSwitcher — registre a escolha como decisão.
- D33/D41/D48/D51: período e data sempre junto do valor; rótulos descrevem
  os números exibidos; erro nunca vira vazio nem R$ 0,00. Os 5 cards do
  Fechamento são calculados no cliente sobre o período carregado: o rótulo
  precisa dizer isso; não trocar a fonte nem o cálculo.
- D40: FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote. D41/D45/D52:
  tabela larga vira lista sem rolagem horizontal — container query com duas
  marcações (lista leve e paginada) ou useConteinerEstreito com uma
  marcação (linhas com muitos controles). Árvore com drag-and-drop não se
  duplica no DOM.
- D47/D51: estados por StatusBadge com a mesma precedência e os mesmos
  textos; sem opacidade; chips com aria-pressed.
- D49/D54/D55: diálogo aberto por estado devolve o foco com useRetornoFoco;
  foco inicial nunca num botão que grava; rótulos associados (useId).
- D53: confirmação nativa (window.confirm) só vira AlertDialog com o mesmo
  texto, a mesma ordem e trava síncrona, registrado como decisão.
- D58: compartilhados aceitam id/aria-label; "Limpar" dos presets é ação.
- D08, D09, D13. Gradiente só no card de destaque e no item ativo da
  sidebar. Nenhum hex em componente; nenhum dark: avulso; sem opacidade
  para hierarquia semântica.

ESCOPO DA FASE 05B (FIN-A-051 a 055, 060 a 066)
1. Fechamento de Caixa (051–053): cabeçalho, cards com rótulo do período e
   da origem (cálculo no cliente, inalterado), gráfico de tendência pela
   camada central (ChartCard/ChartTooltip/chartTheme) sem mudar a série,
   tabela por dia com "Por marca", estados (inclusive erro, hoje só toast;
   gráfico com menos de 2 dias), Dialog "Novo/Editar Fechamento" com marcas
   (valor + pedidos/pessoas), resumo, taxas, descontos, "Líquido estimado",
   avisos e a confirmação "Data futura" — mesma soma, mesmas validações,
   mesmo payload.
2. Marcas e dark kitchens (054–055): avisos (sem categoria, sem forma de
   venda), tabela/lista, Switch com nome acessível (continua gravando no
   clique — não acionar), Dialog com forma de venda (SegmentedControl) e
   CategoryCombobox.
3. Cadastros Base (060–064): sub-abas acessíveis; árvore de categorias
   (busca, expandir/recolher, seleção em lote, selos de tipo e "Fora dos
   totais", ações por linha com nome; drag-and-drop e subir/descer sem
   mudar a ordem gravada; teclado onde já existir), estados, Dialog de
   categoria; Plano de Contas e Centros de Custo com tabela ⇄ lista,
   Dialogs, TableActions com nome. PF-009 continua (não mover o Dialog para
   fora de canCreate sem decisão do proprietário).
4. Categorização (065–066): cabeçalho com regras ativas e lançamentos sem
   categoria (contagem do servidor), alerta, tabela ⇄ lista, Dialog
   Nova/Editar Regra com "Testar Regra" (prévia de até 20 itens) e estados.
5. Desktop/celular, claro/escuro, teclado, foco ao fechar diálogos,
   formulário sujo.

FORA DE ESCOPO
Regras do fechamento (soma por marca, forma de venda, quantidade), vínculo
marca→categoria, árvore e flags de categoria (system_key,
excluir_dos_totais), seed, reordenação, regras de categorização e sua
aplicação; payloads, RPC, migration, RLS, permissão; telas da 03, 04A, 04B
e 05A; Fases 06A, 06B e 07; os quatro src/lib/presentation*Export.ts,
pdfFinanceiro.ts e os exports do Fechamento (PDF/Excel saem iguais);
corrigir PF-*.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença. Teste de tela com cliente falso que
  registre qualquer escrita (rpc e insert/update/delete/upsert).
- Em navegador (com a proteção de escrita acima): fechamento com várias
  marcas (pedidos e pessoas), marca sem categoria e sem forma de venda, dia
  legado sem detalhamento por marca, um dia só (sem gráfico), valores
  grandes; árvore com raízes não operacionais, sub-categorias, categoria
  fora dos totais e busca com acento; Plano de Contas e Centros vazios e
  cheios; regras com e sem lançamentos sem categoria e prévia; erros,
  atraso e vazios simulados só no cliente; sem permissão (simulado);
  formulário sujo; todos os diálogos abertos e fechados sem confirmar;
  claro e escuro; 320, 390, 768, 1024, 1366 e 1920 px; sidebar expandida,
  recolhida e redimensionada; teclado e foco ao fechar. Mesmos dados antes
  e depois, com valores e somas idênticos.
- Medir contraste nos dois temas sobre o fundo real.
- Auditoria de módulo (saas-audit-br:module --audit-only) com foco em
  processo de negócio (soma do fechamento, forma de venda, vínculo de
  categoria, reordenação e lote na árvore, aplicação de regras) e estados
  que escondem erro. Corrigir na fase só o que ela introduzir; preexistente
  vira PF. Não tratar leitura de código como teste. Registrar o que não foi
  executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-104. Da 05A: PF-093 a PF-104;
  PF-097 (baixa de Conta a Receber sem conta bancária — espelho some da
  conciliação) tem impacto alto e aguarda decisão do proprietário; PF-088
  (banner da Conciliação) também. Não corrigir nesta fase.
- Observações: PF-072 (503 nas contagens HEAD do menu) continua; a tela de
  login registra dois erros de console antes da autenticação
  (preexistente); o catálogo de desenvolvimento fica em /__catalogo (só com
  bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas da 05B na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/05B-RELATORIO.md e handoffs/05B-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 06A (análises e relatórios financeiros, primeira parte — ver
   PROGRESSO.md e prompts/06-analises-e-relatorios-financeiros.md) se os
   gates passaram com navegador; validação/correção da 05B caso contrário.
4. PARAR. Não iniciar a Fase 06A no mesmo chat.
```
