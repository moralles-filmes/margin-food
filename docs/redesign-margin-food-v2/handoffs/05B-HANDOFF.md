# Handoff 05B → 06A

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f05b`, criada de `feat/redesign-v2-f05a` em `149f4b5`. Commits da Fase 05B: `c102ddb` (código) e `211353b` (documentação), mais um commit de documentação registrando estes SHAs.
- Sem push, PR ou merge; `main` intocada em `c6a9774`.
- Fase 05B validada com ressalvas em 2026-10-05. Fase 06A pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. As fases 01 e 02 criaram a base e a estrutura global. As fases seguintes levaram o padrão a estas telas:

- 03: Dashboard Financeiro.
- 04A: Contas Bancárias, Livro Razão, Fluxo e Projeção.
- 04B: Conciliação.
- 05A: Contas a Pagar/Receber, Códigos, Recorrências, Alertas e os diálogos de conta.
- 05B: Fechamento de Caixa (com marcas), Cadastros Base (árvore de categorias, Plano de Contas, Centros de Custo) e Categorização.

Nenhuma delas mudou RPC, parâmetro, payload, ordem de chamada, permissão nem condição de botão. A 06A começa as análises e relatórios financeiros: DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria e Borderô. A Apresentação Sócios fica para a 06B.

Não reverter estas decisões:

- D15–D58.
- D59–D68:
  - Fechamento:
    - Resumo somado na tela, com o período da última carga.
    - Lista em tabela ⇄ cartões a 1000 px.
    - Exportação desabilitada com leitura em erro.
    - Aviso da PF-105 no diálogo.
  - Marcas: `ErrorState` e forma de venda alcançável pelo teclado.
  - Cadastros Base: sub-abas em `SubmoduleSwitcher` com `ariaLabel`.
  - Árvore:
    - Uma marcação, com ações sempre visíveis e nomeadas.
    - A folha é decidida pela árvore inteira.
    - Esqueleto só na primeira carga.
    - Modelo Padrão só após leitura bem-sucedida.
  - Plano/Centros: `ErrorState` e `AccessDenied`.
  - Categorização: "Situação" com a contagem do servidor e prévia rotulada.
  - `devolverFoco` e `TableActions` devolvem o foco.
- D09 e D13.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md`. Seções desta fase:
   - Só a DRE é competência; o resto é caixa pelo Livro Razão.
   - `DemonstrativoTree`: % sobre a receita do próprio demonstrativo.
   - Rateio manda.
   - Categorias não operacionais.
   - Borderô.
   - Apresentação Sócios — metas e projeção.
   - Chave `financeiro:relatorio-socios:*`.
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/05B-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md`: linhas FIN-B-011 a 038.
7. `docs/redesign-margin-food-v2/prompts/06-analises-e-relatorios-financeiros.md`: itens 1 a 4, 6, 7 e 8. O item 5 vale só na parte do Borderô.

Código a inspecionar:

- Telas:
  - `DRESection.tsx`
  - `DFCSection.tsx`
  - `DemonstrativoTree.tsx`
  - `OrcamentoSection.tsx`
  - `KPIsSection.tsx`
  - `ComparativoSection.tsx`
  - `AuditoriaFinSection.tsx`
  - `BorderoSection.tsx`
  - `bordero/BorderoPeriodFilter.tsx`
  - `bordero/BorderoCategoryTable.tsx`
  - o wrapper `DREDFCSection` em `src/components/FinanceiroView.tsx`
- Exportadores, que não devem ser alterados:
  - `src/lib/exportDemonstrativo.ts`
  - `src/lib/borderoPdfExport.ts`
- Exemplo do padrão: `FechamentoCaixaSection.tsx`, `ContasPagarSection.tsx`, `finV2Layout.tsx`, `kpiGrid.ts`, `useRetornoFoco.ts`, `useConteinerEstreito.ts`, `devolverFoco.ts`.

## Já implementado e validado

Conferido em navegador:

- Ambiente: login "Administrador Principal" e unidade de teste Moralles.
- Dados sintéticos injetados no cliente: fechamentos, marcas, 17 categorias, contas, centros e regras.
- Toda escrita foi interceptada e nenhuma chegou ao servidor.

Resultados:

- Os valores ficaram idênticos antes e depois nas seis telas:
  - os cinco cards;
  - as linhas com marcas, quantidades, taxas, descontos e líquido;
  - a soma das marcas na edição.
- Diálogos abertos e fechados sem confirmar; o foco volta à origem, inclusive o Remover cancelado do `TableActions`, que antes ia para o `body`.
- Estados exercitados: erro, atraso, vazio e um dia só.
- Busca sem acento com a árvore recolhida.
- Claro e escuro.
- Larguras de 320/390 px (iframe), 768, 1024, 1366 e 1920 px sem rolagem horizontal, com a sidebar recolhida e também a 437 px.
- Teclado.
- Contraste ≥ 4,80 no claro (telas) e ≥ 5,11 no escuro.

Executado em linha de comando:

- Testes: 205 / 1.933.
- Typecheck: 0.
- Lint: 0 erros e 2.016 avisos.
- Build ok: `FinanceiroView` 276,52 kB e CSS 123,52 kB.

Auditoria de módulo (mapeador, identidade/acesso, processo de negócio, funcional):

- Nenhum bloqueante.
- Os achados da fase foram corrigidos.
- Os preexistentes foram registrados em PF-105 a PF-110.

Só em teste: sem permissão e o grupo achado só pelo nome na busca.

Não executado: leitor de tela, movimento normal, confirmação "Data futura", Desativar categoria e Excluir selecionadas.

## Trabalho seguinte

Fase 06A — DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria e Borderô, só apresentação. Os critérios estão no prompt 06 e na validação do prompt abaixo.

## Bloqueios / riscos / cuidado com dados

- **Escritas no Orçamento.** Estas ações gravam:
  - Salvar (`_guarded_bulk_upsert_orcamento`);
  - Copiar Mês (`copiar_orcamento_mes`);
  - lixeira de orçamento de pai (`_guarded_delete_orcamento`).
  Não acionar nenhuma delas.
- **Telas só de leitura.** DRE, DFC, KPIs, Comparativo, Auditoria e Borderô só leem. `_guarded_list_fin_audit_logs` é leitura apesar do prefixo, e a fixture precisa respondê-la.
- **Números das telas.** Os regimes têm de continuar assim:
  - a DRE é competência;
  - o DFC, o Orçamento, os KPIs, o Comparativo e o Borderô são caixa.
  - O percentual usa a receita do próprio demonstrativo.
  - O Borderô trabalha em centavos.
  Nada disso muda. Os exportadores PDF/Excel precisam sair iguais.
- **Sessão e unidade.** O proprietário precisa reautorizá-las a cada chat. O assistente não digita senha.
- **D09.** Os valores das imagens de referência coincidem com os de uma unidade real. Nunca usá-los como fixture, no código ou nas docs.
- **Capturas.** Mostram dados; ficam fora do repositório.
- **Pendências.** Há 110 em `PENDENCIAS-FUNCIONAIS.md`, e nenhuma deve ser corrigida no redesign. Aguardam decisão do proprietário:
  - PF-105 (impacto alto);
  - PF-097;
  - PF-108;
  - PF-109;
  - PF-088.
- **Pendências destas telas:**
  - PF-001: links da Auditoria.
  - PF-002: o DFC exige `financeiro:fluxo:view` dentro da aba DRE.
  - PF-007: carga de KPIs/Comparativo.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 06A — análises e relatórios financeiros,
primeira parte: DRE e DFC (com o DemonstrativoTree), Orçamento vs Realizado,
KPIs, Comparativo, Auditoria Financeira e Borderô, com os diálogos que
essas telas abrem. Somente apresentação. Não mexa de novo no Dashboard (03),
nas telas da 04A, 04B, 05A e 05B, não toque na Apresentação Sócios (06B) nem
no CMV Financeiro (07), e não inicie a Fase 06B.

ESTADO REAL DEIXADO PELA FASE 05B (2026-10-05)
- Branch feat/redesign-v2-f05b, criada de feat/redesign-v2-f05a em
  149f4b5. Fase 05B commitada em c102ddb (código) e 211353b
  (documentação), mais um commit de documentação com estes SHAs. Sem push,
  PR ou merge. main intocada (c6a9774).
- Fase 05B validada com ressalvas: bun run test = 205 arquivos / 1.933
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (FinanceiroView 276,52 kB;
  livroRazaoView 34,68 kB; CodigosPagamentoSection 11,13 kB;
  ConciliacaoBancariaSection 136,35 kB; Index 41,24 kB; index 204,76 kB;
  CSS 123,52 kB; vendor-charts 555,44 kB). Os chunks lazy desta fase
  (Orçamento, KPIs, Comparativo, Auditoria, Borderô) não foram anotados:
  rode um build ANTES de editar e registre os tamanhos de partida.
- Entregue na 05B (D59–D68): Fechamento de Caixa com resumo somado na tela
  e rotulado com o período da última carga bem-sucedida, ChartCard com a
  mesma série e estado de "um dia só", lista tabela ⇄ cartões
  (useConteinerEstreito(1000)), exportação desabilitada com qualquer
  leitura em erro, aviso da PF-105 no diálogo; Marcas com ErrorState e
  forma de venda alcançável pelo teclado; Cadastros Base em
  SubmoduleSwitcher com ariaLabel; árvore de categorias em uma marcação,
  ações sempre visíveis e nomeadas, folha decidida pela árvore inteira,
  esqueleto só na primeira carga, Modelo Padrão só após leitura
  bem-sucedida; Plano/Centros com ErrorState e AccessDenied;
  Categorização com "Situação" (contagem do servidor) e prévia rotulada.
- Peças reutilizáveis (src/components/financeiro/): finV2Layout.tsx
  (FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote),
  useRetornoFoco.ts, useConteinerEstreito.ts (histerese opcional),
  devolverFoco.ts (foco depois de useConfirmDialog), fechamentoView.ts,
  contasView.ts, ContasParts.tsx (ListaCarregando/ResumoCarregando); em
  src/components/ui/: kpiGrid.ts, KpiCard (appearance summary/highlight),
  ChartCard + chartTheme, SegmentedControl (ariaLabel, manualActivation;
  sem valor ativo a primeira opção entra no Tab), SubmoduleSwitcher
  (ariaLabel opcional), StatusBadge, EmptyState, ErrorState, AccessDenied,
  TableActions (editLabel/deleteLabel; devolve o foco ao cancelar).
- Ressalvas da 05B (não bloqueiam a 06A): leitor de tela e movimento
  normal não observados; sem permissão só em teste; "Data futura",
  Desativar categoria e Excluir selecionadas não abertos; larguras
  pequenas em iframe. Auditoria de módulo sem bloqueante; achados da fase
  corrigidos; preexistentes em PF-105 a PF-110.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a 06A segue em nova branch a partir da atual (ex.: feat/redesign-v2-f06a)
   ou na mesma, com commit separado por fase, e se haverá commit ao final.
   Não reverta nem sobrescreva o que existir. Sem push, merge ou deploy sem
   pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico). ATENÇÃO às regras destas telas: só a
     DRE é competência — DFC, Orçamento (aba e metas), KPIs, Comparativo e
     Borderô leem fin_lancamentos REALIZADO/CONCILIADO pela data efetiva de
     caixa e precisam fechar com o Livro Razão; Dashboard/KPIs/Comparativo/
     Orçamento excluem não operacionais, Fluxo/Projeção incluem;
     DemonstrativoTree usa a receita/recebimento do PRÓPRIO demonstrativo
     como denominador, com rótulo por regime ("% Receita Líq." no DRE,
     "% Recebimentos" no DFC, via isDFC), e exportDemonstrativo.ts espelha
     a mesma lógica e o mesmo formatPercentBR (2 casas); rateio manda
     (categoria_id do cabeçalho é ignorado quando há rateio); categorias não
     operacionais aparecem no DRE/DFC como seção informativa fora do
     resultado; Borderô (contas a vencer por data_vencimento, pagas = todas
     as despesas do razão pela regra de caixa do DFC, CP nunca somada de
     novo, saldo provisionado desconta só as a vencer, tela e PDF sobre o
     mesmo BorderoReport em centavos em src/domain/financeiro/bordero); a
     chave financeiro:relatorio-socios:* governa Borderô E Apresentação
     Sócios; orçamento pai/filho no mesmo mês é bloqueado e ausência nunca
     vira zero; rótulo de mês a partir de "yyyy-MM" é data local (new
     Date(y, m - 1, 1)), nunca new Date("yyyy-MM-01"); formatDateBR existe
     em dois módulos com semânticas diferentes; seções raras do
     FinanceiroView são React.lazy e exceljs fica em chunk separado. Nada
     disso pode mudar.
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D68; em especial
     D15–D19, D29, D33, D38–D41, D43, D45, D47–D49, D51, D57 e D59–D68)
   - docs/redesign-margin-food-v2/handoffs/05B-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/05B-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-B-011 a FIN-B-038 (e a FIN-A-067, compartilhados, para regressão)
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     que citam DRE, DFC, DemonstrativoTree, Orçamento, KPIs, Comparativo,
     Auditoria ou Borderô (ex.: PF-001 — links da Auditoria; PF-002 — DFC
     exige financeiro:fluxo:view dentro da aba DRE; PF-007 — carga de
     KPIs/Comparativo com guarda de loading); não corrigir
   - docs/redesign-margin-food-v2/prompts/06-analises-e-relatorios-financeiros.md
     (aplicar os itens 1 a 4, 6, 7 e 8; o item 5 só na parte do Borderô —
     a Apresentação Sócios é da 06B)
3. Abra 00-card-azul-aprovado.png, 01-dashboard-financeiro.png e
   07-sidebar-e-componentes.png em docs/redesign-margin-food-v2/referencias/
   (consulte o MANIFESTO.md). Não há prancha própria destas telas: siga a
   família aplicada da 04A à 05B; a estrutura dos demonstrativos não muda
   para imitar um modelo.
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/DRESection.tsx (151 linhas; get_fin_dre_summary,
   Select 1/3/6/12 meses, MonthNavigator, PDF/Excel), DFCSection.tsx (165;
   get_fin_dfc_summary, saldo inicial, rodapé text-[10px], permissão
   financeiro:fluxo:*), DemonstrativoTree.tsx (314; só DRE/DFC usam; já tem
   DemonstrativoTree.test.tsx), OrcamentoSection.tsx (680;
   get_fin_orcamento_arvore, BRLInput por folha, Salvar, Copiar Mês,
   lixeira de pai, PDF/Excel inline), KPIsSection.tsx (354; get_fin_kpis,
   8 KpiCard, BarChart, Top Fornecedores), ComparativoSection.tsx (405;
   comparativo_periodos, 5 Card de linha, BarChart, tabela, 2 Input
   type="month"), AuditoriaFinSection.tsx (544;
   _guarded_list_fin_audit_logs com cursor de 50, 5 cards de contagem
   locais, tabela de 7 colunas, DiffView em grid-cols-2), BorderoSection.tsx
   (264; useBordero/get_fin_bordero, PageHeader, 5 KpiCard em centavos,
   diálogo "Composição do saldo das contas"; já tem
   BorderoSection.test.tsx), bordero/BorderoPeriodFilter.tsx,
   bordero/BorderoCategoryTable.tsx e o wrapper DREDFCSection em
   src/components/FinanceiroView.tsx (dois Button como alternador).
   Exemplo do padrão aplicado: FechamentoCaixaSection, ContasPagarSection,
   LivroRazaoSection, finV2Layout.tsx, kpiGrid.ts, useRetornoFoco.ts,
   useConteinerEstreito.ts, devolverFoco.ts.

CUIDADO COM ESCRITA
- Só o Orçamento grava: Salvar (_guarded_bulk_upsert_orcamento), Copiar Mês
  (copiar_orcamento_mes, no diálogo) e a lixeira de orçamento legado de pai
  (_guarded_delete_orcamento, com useConfirmDialog). Nunca clicar em
  Salvar nem confirmar Copiar/Excluir; digitar num BRLInput só com a
  escrita interceptada e sem salvar. As demais telas só leem — atenção:
  _guarded_list_fin_audit_logs é LEITURA apesar do prefixo, e "Calcular"
  (KPIs) e "Comparar" (Comparativo) disparam leituras.
- Diálogos: abrir e fechar com Esc ou Cancelar. Para abrir um diálogo pelo
  botão da linha, confirme no código que o botão SÓ abre o diálogo, use
  escrita interceptada e registre no relatório. Na dúvida se uma ação
  grava, não clique.
- Use unidade de teste e dados SINTÉTICOS no cliente: intercepte o fetch da
  aba (supabaseFetch chama o fetch global de forma preguiçosa; instale a
  interceptação e só então remonte a tela) e responda com fixtures TODAS as
  leituras destas telas — get_fin_dre_summary, get_fin_dfc_summary,
  get_fin_orcamento_arvore, get_fin_kpis, comparativo_periodos,
  _guarded_list_fin_audit_logs, get_fin_bordero e o que mais o código
  pedir (confira; ex.: saldos das contas no Borderô). Na 05B o modelo foi:
  RPCs de leitura da tela respondidas por nome, tabelas por GET, demais
  get_/count_/list_/has_ repassadas e todo o resto (RPC, INSERT/UPDATE/
  DELETE/UPSERT, Edge Function) bloqueado com resposta simulada e
  registrado. Aqui as get_fin_* da tela precisam vir da fixture, não do
  repasse — senão aparece dado real da unidade. Guarde o código no
  sessionStorage para reinstalar depois de um recarregamento do Vite,
  registre a lista de POSTs vistos, confirme que nenhuma escrita chegou ao
  servidor e remova tudo no fim.
- Fixture mínima por tela: DRE com receita, deduções, custos, despesas,
  subtotais, categoria com rateio e o bloco não operacional, valores
  negativos e grandes, um mês sem movimento; DFC com saldo inicial;
  Orçamento com folha orçada e não orçada, pai com orçamento legado,
  realizado acima do orçado e sem realizado; KPIs com variação positiva,
  negativa e sem base anterior; Comparativo com categoria só em um dos
  meses; Auditoria com mais de 50 eventos (cursor), diff com campos longos
  e JSON aninhado; Borderô com contas vencidas antes do período, conta sem
  saldo, rateio, categoria não operacional e inativa.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080 (o da 05B foi
  parado no fim). Se subir outro, leia a porta no log e pare o seu ao
  terminar.
- Na 05B o Chrome estava no login "Administrador Principal" e o
  proprietário autorizou a unidade de teste Moralles com dados simulados.
  Isso não vale automaticamente para a 06A: pergunte de novo, prefira
  empresa e usuário de teste e nunca digite senha. Download e abertura de
  PDF/Excel só com autorização.
- Atenção (D09): valores das imagens de referência COINCIDEM com dados
  reais de uma unidade. Nada de número da imagem no código, nos testes ou na
  documentação; valores de unidade real não vão para o repositório.
- Capture o "antes" (claro, escuro, desktop e celular) ANTES de alterar
  qualquer arquivo, com os mesmos dados que usará no "depois". Capturas
  ficam na pasta temporária, nunca no repo.
- A janela do Chrome não fica menor que 500 px: use iframe da própria
  página para 320/390 px, com flex-shrink: 0 no iframe, e confirme que a
  fixture está instalada DENTRO do iframe antes de medir. Mantenha a janela
  visível: com a aba em segundo plano o Chrome estrangula os temporizadores
  e a captura falha (na 05B uma rodada leu dados reais por isso e foi
  descartada). Com a janela maximizada não dá para redimensionar: meça
  1366 com sidebar alterada perto disso e registre. O navegador costuma
  estar com prefers-reduced-motion ativo. O texto de cada opção do
  SegmentedControl aparece duplicado no DOM (D29): localize por includes.
  O card highlight (gradiente) não se mede por JS — vale D18.
- A extensão bloqueia o retorno de JS que contenha URL ou query string;
  mascare esses trechos ao ler logs da fixture. Uma edição salva no Vite
  pode remontar a tela e fechar diálogos (a fixture continua instalada).
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da 06A.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard appearance default | summary | highlight; estado
  crítico usa summary + variant semântica. Highlight só para o número
  principal da tela (D59: o bruto no Fechamento); nunca todos os níveis
  de um demonstrativo como cards azuis.
- D19/D31/D38: valor nunca diminui para caber; a grade reorganiza
  (kpiGridClassFor/longestValueLength em src/components/ui/kpiGrid.ts).
- D29/D39/D50: SegmentedControl com visual aprovado; alternância que
  desmonta conteúdo ou recarrega dados usa manualActivation. D63:
  sub-módulos com rótulos longos usam SubmoduleSwitcher (com ariaLabel). O
  alternador DRE/DFC (dois Button) é candidato a um dos dois — registre a
  escolha como decisão, sem mudar a permissão de cada lado (PF-002).
- D33/D41/D48/D51/D57/D59: período e base sempre junto do valor; rótulos
  descrevem os números exibidos; erro nunca vira vazio nem R$ 0,00;
  contagem de lista paginada nunca é total (Auditoria: os 5 cards locais
  contam só o que foi carregado — o rótulo precisa dizer isso, sem trocar
  a fonte); exportação desabilitada com leitura em erro (D43/D59). Na
  variação, diferencie porcentagem de pontos percentuais e realizado de
  orçado/projetado.
- D40: FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote. D41/D45/D52/
  D60: tabela larga vira lista sem rolagem horizontal — container query
  com duas marcações (lista leve e paginada) ou useConteinerEstreito com
  uma marcação (linhas com muitos controles, ex.: o Orçamento com
  BRLInput por folha). Hierarquia com expandir/recolher não se duplica no
  DOM (D64).
- D47/D51: estados por StatusBadge com a mesma precedência e os mesmos
  textos (o status do Orçamento vem da regra existente); sem opacidade;
  chips com aria-pressed.
- D49/D54/D55/D68: diálogo aberto por estado devolve o foco com
  useRetornoFoco; confirmação de useConfirmDialog devolve com
  devolverFoco; foco inicial nunca num botão que grava; rótulos associados
  (useId).
- D64/D66: ações sempre visíveis e nomeadas (nada só no hover); esqueleto
  só na primeira carga (recarga mantém a tela montada); sem permissão →
  AccessDenied.
- D65: convite a ação que grava só depois de uma leitura bem-sucedida.
- D08, D09, D13. Gradiente só no card de destaque e no item ativo da
  sidebar. Nenhum hex em componente; nenhum dark: avulso; sem opacidade
  para hierarquia semântica (ícones de vazio com opacity-30 em KPIs,
  Comparativo, Auditoria e Orçamento viram EmptyState).

ESCOPO DA FASE 06A (FIN-B-011 a FIN-B-038)
1. DRE e DFC (011–019): alternador acessível; cabeçalho com período e
   regime explícitos (DRE = competência; DFC = caixa); DemonstrativoTree
   com totais e subtotais destacados por recuo, peso e borda, abertura de
   nós com nome e aria-expanded, sinais, coluna de % com o mesmo
   denominador e rótulo por regime, bloco "VALORES NÃO OPERACIONAIS" fora
   do resultado; rodapé do DFC legível (sem text-[10px]); estados
   (carregamento, erro — hoje sem estado próprio —, vazio, sem permissão);
   tabela sem rolagem horizontal no celular. Mesma árvore, mesmas somas,
   mesmo exportDemonstrativo (PDF/Excel saem iguais).
2. Orçamento vs Realizado (020–024): cabeçalho com mês e totais rotulados;
   tabela ⇄ lista com BRLInput por folha (mesmos campos, mesmo "Salvar
   (n)"), StatusBadge do status existente, % de execução; diálogo Copiar
   Mês e confirmação de exclusão com retorno de foco; estados (loading com
   esqueleto, erro, vazio, sem permissão). Mesma regra de pai/filho, mesmo
   payload; PDF/Excel inline saem iguais.
3. KPIs (025–026): KpiCards com base e período, variação com sinal e
   unidade certos (% vs p.p.), gráfico pela camada central
   (ChartCard/ChartTooltip/chartTheme) sem mudar a série, Top Fornecedores
   com valores completos; estados.
4. Comparativo (027–028): os cinco indicadores em KpiCard (delta só se a
   fonte já traz a comparação), meses A e B rotulados, gráfico pela camada
   central, tabela ⇄ lista de categorias; estados (inicial, carregamento,
   erro, sem permissão).
5. Auditoria (029–031): filtros rotulados (busca com debounce, entidade,
   ação, período), cards com o rótulo de "carregados", tabela ⇄ lista,
   diff Antes/Depois legível no celular (sem grid-cols-2 fixo), "Carregar
   mais" com contagem honesta; não mascarar campo necessário nem revelar
   informação protegida; links como hoje (PF-001 continua). Estados.
6. Borderô (032–038): já tem PageHeader e KpiCard em centavos — alinhar à
   família (FinScreenHeader se couber, legenda do período), filtro com
   rótulos, alertas por token, diálogo "Composição do saldo das contas"
   com retorno de foco e tabela legível no celular, BorderoCategoryTable
   com Expandir/Recolher tudo e "Mostrar categorias sem despesas"
   acessíveis; o PDF (borderoPdfExport.ts) sai igual.
7. Desktop/celular, claro/escuro, teclado, foco ao fechar diálogos,
   formulário sujo (Orçamento com valores digitados).

FORA DE ESCOPO
Regimes, agregações, hierarquia, sinais, fórmulas e denominadores; RPC,
payload, migration, RLS, permissão (inclusive a do DFC — PF-002);
Apresentação Sócios e componentes Presentation* (06B); CMV Financeiro (07);
telas da 03, 04A, 04B, 05A e 05B; os quatro src/lib/presentation*Export.ts,
exportDemonstrativo.ts, borderoPdfExport.ts, pdfFinanceiro.ts e as
funções de exportação inline (Orçamento, KPIs, Comparativo, Auditoria) —
os arquivos exportados saem iguais; corrigir PF-*.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima (e com os chunks lazy medidos antes de editar) e explicar qualquer
  diferença. Teste de tela com cliente falso que registre qualquer escrita
  (rpc e insert/update/delete/upsert); no Orçamento, provar que digitar e
  fechar não grava. Exportação: como os exportadores não mudam, comparar
  pelo builder/modelo com a mesma entrada antes e depois (ex.:
  buildBorderoPdfModel) e, com autorização do proprietário, baixar os
  arquivos com dados sintéticos.
- Em navegador (com a proteção de escrita acima): as fixtures da seção
  acima; DRE e DFC com 1/3/6/12 meses e troca de mês, expandir/recolher,
  valores negativos e grandes; Orçamento com valores digitados e
  descartados; KPIs e Comparativo com variações positivas, negativas e sem
  base; Auditoria com "Carregar mais" e diff aberto; Borderô em Semana/Mês/
  Período e diálogo de composição; erros, atraso e vazios simulados só no
  cliente; sem permissão (simulado); todos os diálogos abertos e fechados
  sem confirmar; claro e escuro; 320, 390, 768, 1024, 1366 e 1920 px;
  sidebar expandida, recolhida e redimensionada; teclado e foco ao fechar.
  Mesmos dados antes e depois, com valores, linhas, hierarquia e somas
  idênticos.
- Medir contraste nos dois temas sobre o fundo real.
- Auditoria de módulo (saas-audit-br:module --audit-only) com foco em
  processo de negócio (regime de cada relatório, denominador do %,
  não operacionais, rateio, Borderô sem soma dupla, orçamento pai/filho,
  paginação da Auditoria) e estados que escondem erro. Corrigir na fase só
  o que ela introduzir; preexistente vira PF. Não tratar leitura de código
  como teste. Registrar o que não foi executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-110. Destas telas: PF-001, PF-002,
  PF-007. Aguardam decisão do proprietário: PF-105 (editar fechamento com
  a divisão por marca indisponível apaga o detalhamento — impacto alto),
  PF-097, PF-108, PF-109 e PF-088. Não corrigir nesta fase.
- Observações: PF-072 (503 nas contagens HEAD do menu) continua; a tela de
  login registra dois erros de console antes da autenticação
  (preexistente); o catálogo de desenvolvimento fica em /__catalogo (só com
  bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas FIN-B-011 a 038 na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/06A-RELATORIO.md e handoffs/06A-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 06B (Apresentação Sócios — FIN-B-039 a 065, canvas, deep links,
   modo apresentação e exportadores presentation*Export.ts sem reescrita)
   se os gates passaram com navegador; validação/correção da 06A caso
   contrário.
4. PARAR. Não iniciar a Fase 06B no mesmo chat.
```
