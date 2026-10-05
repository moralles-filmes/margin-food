# Handoff 04B → 05A

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f04b`, criada de `feat/redesign-v2-f04a` em `ae30b6f`. Commits da Fase 04B: `9897f2f` (código) e `eb66ed3` (documentação), mais um commit de documentação registrando estes SHAs.
- Sem push, PR ou merge; `main` intocada em `c6a9774`.
- Fase 04B validada com ressalvas em 2026-10-04. Fase 05A pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. Fases 01 e 02 criaram a base e a estrutura global; a 03 levou o padrão ao Dashboard Financeiro; a 04A, a Contas Bancárias, Livro Razão, Fluxo e Projeção; a 04B, à Conciliação Bancária — sem mudar RPC, parâmetro, ordem de chamada, chave de `sessionStorage`, permissão, regra do banner nem condição de botão. A 05A leva o padrão às telas operacionais de títulos (Pagar, Receber, Códigos, Recorrências, Alertas) e aos diálogos de detalhe e formulário que elas compartilham com o Livro Razão e a Conciliação.

Não reverter: D15–D19, D22–D30, D31–D36, D37–D44 e D45–D50 (tabela ⇄ lista por largura medida com uma só marcação; banner de conferência em painel com a mesma regra; selos com a mesma precedência e sem opacidade; KPIs da conta inteira rotulados como tal; `useRetornoFoco`; campo de arquivo acessível e `SegmentedControl` com ativação manual), D09, D13.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md` (regras de Contas a Pagar/Receber, CMV financeiro, idempotência)
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/04B-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — linhas FIN-A-012, 013, 041 a 050, 056 a 059, 067
7. `docs/redesign-margin-food-v2/prompts/05-operacoes-e-cadastros-financeiros.md` (parte da 05A)

Código a inspecionar: `ContasPagarSection.tsx`, `ContasReceberSection.tsx`, `CodigosPagamentoSection.tsx`, `RecorrenciasSection.tsx`, `AlertasSection.tsx`, `ContaDetailDialog.tsx`, `ContaFormDialog.tsx` e os combos/filtros compartilhados. Exemplo do padrão: `LivroRazaoSection.tsx`, `ConciliacaoBancariaSection.tsx`, `finV2Layout.tsx`, `kpiGrid.ts`, `useRetornoFoco.ts`.

## Já implementado e validado

Conferido em navegador (login "Administrador Principal"; unidade de teste Moralles com conta e OFX sintéticos injetados no cliente; toda escrita interceptada; nenhuma chegou ao servidor):

- Chips, linhas, banner verde e vermelho e visão Lançamentos idênticos antes/depois.
- Diálogos de sugestões, revisão de baixa, boleto, rateio, transferência, criar registro, conta diverge, substituir, saldo do extrato (passos 1 e 2) e edição abertos e fechados sem confirmar; foco volta ao elemento de origem (exceto edição, `ContaFormDialog`).
- Estados de carregamento anunciado, vazio e erro; claro/escuro; 320/390 (iframe), 768, 1024, 1366, 1920 px sem rolagem horizontal; sidebar recolhida e a 437 px; teclado; contraste ≥ 4,80 (claro) e ≥ 5,11 (escuro); 250 linhas sem perda de desempenho (≈135 → ≈137 ms por clique).

Executado em linha de comando: testes 192 / 1.852, typecheck 0, lint 0 erros e 2.016 avisos, build ok (chunk da Conciliação 137,05 kB, `FinanceiroView` 245,69 kB, CSS 122,54 kB). Auditoria de módulo (mapeador, processo de negócio, identidade/acesso, funcional): sem bloqueante; itens introduzidos corrigidos na fase; preexistentes em PF-086 a PF-092.

Só em teste: diálogos "Já no Livro Razão" e de possível duplicata (exigem Processar), erro de leitura do banner, troca de conta com erro. Não executado: leitor de tela, movimento normal, qualquer confirmação de gravação.

Desvios registrados no relatório: "Confirmar valor" do saldo acionado como parte do carregamento do OFX sintético (escritas bloqueadas); botões de linha "Baixar" e "Criar" (e Boleto, Ratear, Transf., sugestões) acionados só para abrir os diálogos, com escrita interceptada.

## Trabalho seguinte

Fase 05A — Contas a Pagar, Contas a Receber, Códigos de Pagamento, Recorrências e Alertas, só apresentação. Critérios: os do prompt 05 (parte da 05A) e a validação do prompt abaixo.

## Bloqueios / riscos / cuidado com dados

- Estas telas gravam com um clique (Aprovar, Pagar, Receber, Gerar parcela) e o estorno usa `window.confirm` nativo, que trava a aba: não acionar. Validar com dados sintéticos e escrita interceptada.
- `ContaFormDialog`/`ContaDetailDialog` são compartilhados com Livro Razão e Conciliação: regressão obrigatória nesses consumidores.
- O proprietário precisa reautorizar sessão e unidade a cada chat; o assistente não digita senha.
- Os valores das imagens de referência coincidem com os de uma unidade real (D09): nunca usar como fixture, no código ou nas docs.
- Capturas mostram dados; ficam fora do repositório.
- 92 pendências em `PENDENCIAS-FUNCIONAIS.md`; nenhuma deve ser corrigida no redesign. PF-088 aguarda decisão do proprietário.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 05A — Contas a Pagar, Contas a Receber,
Códigos de Pagamento, Recorrências e Alertas (com os diálogos de detalhe e
de formulário que essas telas abrem). Somente apresentação. Não mexa de novo
no Dashboard (03), em Contas Bancárias, Livro Razão, Fluxo, Projeção (04A)
nem na Conciliação (04B), e não inicie a Fase 05B (Fechamento de Caixa,
Cadastros Base, Categorização).

ESTADO REAL DEIXADO PELA FASE 04B (2026-10-04)
- Branch feat/redesign-v2-f04b, criada de feat/redesign-v2-f04a em
  ae30b6f. Fase 04B commitada em 9897f2f (código) e eb66ed3
  (documentação), mais um commit de documentação com estes SHAs. Sem push,
  PR ou merge. main intocada (c6a9774).
- Fase 04B validada com ressalvas: bun run test = 192 arquivos / 1.852
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (vendor-charts 555,44 kB;
  FinanceiroView 245,69 kB; index 204,80 kB; Index 41,20 kB; CSS 122,54 kB;
  chunk ConciliacaoBancariaSection 137,05 kB, carregado só na sub-aba).
- Entregue na 04B (D45–D50): Conciliação com cabeçalho/alternador no padrão
  da 04A; banner de conferência em painel (mesma regra e textos; estados
  Conferindo/Atualizando/erro); linhas do extrato com chips acessíveis,
  selos com a mesma precedência e tabela ⇄ lista por largura medida do
  contêiner com UMA marcação (useConteinerEstreito, histerese de 32 px);
  visão Lançamentos com KPIs da conta; diálogos restilizados sem mudar
  textos de decisão nem a ordem de confirmação.
- Peças reutilizáveis criadas na 04B (src/components/financeiro/):
  useRetornoFoco.ts (devolve o foco a quem abriu um diálogo controlado por
  estado, com elemento de reserva), useConteinerEstreito.ts,
  conciliacaoView.ts e ConciliacaoParts.tsx (específicos da Conciliação).
  Da 04A: finV2Layout.tsx (FinScreenHeader, FinSectionGroup, FinKpiGrid,
  FinNote), src/components/ui/kpiGrid.ts, SegmentedControl com ariaLabel e
  manualActivation.
- Ressalvas da 04B (não bloqueiam a 05A): diálogos "Já no Livro Razão" e
  duplicata só em teste; leitor de tela e movimento normal não observados;
  larguras pequenas em iframe; o foco vai ao body ao fechar o
  ContaFormDialog (edição) — isso é da 05A.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a 05A segue em nova branch a partir da atual (ex.: feat/redesign-v2-f05a)
   ou na mesma, com commit separado por fase, e se haverá commit ao final.
   Não reverta nem sobrescreva o que existir. Sem push, merge ou deploy sem
   pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico). ATENÇÃO às regras de Contas a
     Pagar/Receber: baixa exige conta bancária; espelho de baixa não se
     exclui, só se estorna; estorno limpa vínculos da conciliação; rateio
     manda sobre categoria_id; CMV financeiro (cmv_incluir por linha de
     rateio, NULL = pendente, gravado só pelas RPCs; pergunta ligada por
     fin_config.cmv_financeiro_ativo); limite de aprovação por empresa;
     recorrência com p_parcela_esperada; criações idempotentes com
     useChavesPendentes; campos monetários e numéricos; DateInput. Nada
     disso pode mudar.
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D50; em especial
     D37–D44 da 04A e D45–D50 da 04B)
   - docs/redesign-margin-food-v2/handoffs/04B-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/04B-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-A-012, 013, 041 a 050, 056 a 059 e 067
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     que citam Contas a Pagar/Receber, Códigos de Pagamento, Recorrências,
     Alertas, ContaDetailDialog ou ContaFormDialog; não corrigir
   - docs/redesign-margin-food-v2/prompts/05-operacoes-e-cadastros-financeiros.md
     (aplicar só os itens de Pagar, Receber, Códigos, Alertas, Recorrências,
     formulário de boleto e os gerais 7 e 8)
3. Abra 00-card-azul-aprovado.png, 01-dashboard-financeiro.png e
   07-sidebar-e-componentes.png em docs/redesign-margin-food-v2/referencias/
   (consulte o MANIFESTO.md). Não há prancha própria destas telas: siga a
   família aplicada na 04A/04B.
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/ContasPagarSection.tsx, ContasReceberSection,
   CodigosPagamentoSection (e o componente CodigoPagamento), RecorrenciasSection,
   AlertasSection, ContaDetailDialog, ContaFormDialog (rateio, CMV,
   CmvDecisaoToggle, repetição, condição de pagamento, anexos, justificativa),
   DateRangePresets, MonthNavigator, CategoryCombobox e SupplierCombobox.
   ContaFormDialog e ContaDetailDialog também são usados pelo Livro Razão e
   pela Conciliação: qualquer mudança neles exige conferir esses consumidores.
   Exemplo do padrão aplicado: LivroRazaoSection.tsx,
   ConciliacaoBancariaSection.tsx, finV2Layout.tsx, kpiGrid.ts,
   useRetornoFoco.ts.

CUIDADO COM ESCRITA
- Estas telas gravam com um clique ou um diálogo: Aprovar, Pagar
  (pay_conta_pagar), Receber (receive_conta_receber), Estornar (confirmação
  NATIVA window.confirm — não dispare: trava a aba), Gerar parcela
  (gerar_parcela_recorrente), Salvar/Excluir conta, limite de aprovação
  (fin_set_limite_aprovacao), "Aplicar a todas" (CMV da série).
- Nunca clicar Aprovar, Pagar, Receber, Estornar, Gerar parcela, Salvar,
  Excluir, Aplicar a todas nem confirmar diálogo. Para abrir um diálogo
  pelo botão da linha (ex.: Pagar abre "Registrar pagamento"), confirme no
  código que o botão SÓ abre o diálogo, use escrita interceptada e registre
  no relatório. Diálogos: abrir e fechar com Esc ou Cancelar. Na dúvida se
  uma ação grava, não clique.
- Use unidade de teste e dados SINTÉTICOS no cliente: intercepte o fetch da
  aba (supabaseFetch chama o fetch global de forma preguiçosa; instale a
  interceptação e só então remonte a tela), responda com fixtures as
  leituras necessárias e bloqueie com resposta simulada TODA escrita
  (RPCs _guarded_*, pay_*, receive_*, gerar_*, fin_set_*, fin_cmv_*,
  INSERT/UPDATE/DELETE). Registre a lista de POSTs vistos e confirme que
  nenhuma escrita chegou ao servidor. A fixture da 04B não foi versionada;
  monte a desta fase. Guarde o código dela no sessionStorage para
  reinstalar depois de um recarregamento do Vite e remova tudo no fim.
- "Copiar" em Códigos de Pagamento só usa a área de transferência: compare
  byte a byte com o código da fixture (zeros à esquerda, PIX). A tela de
  Códigos se atualiza sozinha a cada 30 s.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080. Se subir
  outro, leia a porta no log e pare o seu ao terminar.
- Na 04B o Chrome estava no login "Administrador Principal" e o
  proprietário autorizou a unidade de teste Moralles com dados simulados.
  Isso não vale automaticamente para a 05A: pergunte de novo, prefira
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
  aparece duplicado no DOM (D29): localize por includes.
- A extensão bloqueia o retorno de JS que contenha URL ou query string;
  mascare esses trechos ao ler logs da fixture.
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da 05A.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard appearance default | summary | highlight; no highlight
  tudo é branco e o negativo se identifica pelo sinal (D16); estado
  crítico usa summary + variant semântica.
- D19/D31/D38: valor nunca diminui para caber; a grade reorganiza
  (kpiGridClassFor em src/components/ui/kpiGrid.ts).
- D29/D39/D50: SegmentedControl com visual aprovado; alternância que
  desmonta conteúdo, recarrega dados ou muda o tipo do registro usa
  manualActivation.
- D33/D41/D48: período e data sempre junto do valor; rótulos descrevem os
  números exibidos (parâmetros da resposta; contagem da conta inteira diz
  isso); erro nunca vira vazio.
- D40: FinScreenHeader, FinSectionGroup, FinKpiGrid, FinNote. D41/D45:
  tabela larga vira lista empilhada sem rolagem horizontal — container
  query com duas marcações (lista leve, paginada) ou useConteinerEstreito
  com uma marcação (linhas com muitos controles).
- D44/D46: conferência "Confere"/"Pendente"/"Não confere", mesma data,
  comparação em centavos; nunca "-R$0,00".
- D47: estados por StatusBadge com a mesma precedência e os mesmos textos;
  sem opacidade; chips com aria-pressed; botões de ação nem fundidos nem
  separados.
- D49: diálogo aberto por estado devolve o foco com useRetornoFoco.
- D08, D09, D13. Gradiente só no card de destaque e no item ativo da
  sidebar. Nenhum hex em componente; nenhum dark: avulso; sem opacidade
  para hierarquia semântica.

ESCOPO DA FASE 05A (FIN-A-012, 013, 041 a 050, 056 a 059, 067)
1. Contas a Pagar (041–046): cabeçalho, resumo (vencidas, total pendente,
   total filtrado, limite de aprovação) só com as fontes atuais, filtros,
   lista/tabela, estados (inclusive erro, hoje ausente) e os diálogos
   "Registrar pagamento", "Aplicar às outras recorrências?" e "Limite de
   aprovação". A confirmação de estorno é window.confirm nativo: trocar por
   AlertDialog só com o mesmo texto, a mesma ordem e registrado como
   decisão.
2. Contas a Receber (049, 050): idem, com "Registrar recebimento".
3. Códigos de Pagamento (047, 048): resumo, copiar claro com retorno,
   estados; o texto copiado é exatamente o código original.
4. Recorrências (058, 059) e Alertas (056, 057): prioridade e estados; o
   erro de Alertas hoje cai no vazio "Tudo sob controle" — vira erro com
   nova tentativa.
5. ContaDetailDialog (012) e ContaFormDialog (013): seções legíveis,
   rateio e CMV sem perder a seleção por linha, foco ao fechar
   (useRetornoFoco), acentos dos textos ("Editar Lancamento" etc.), guard
   de formulário sujo.
6. Compartilhados (067): DateRangePresets, MonthNavigator e os combos de
   categoria/fornecedor — nome acessível (aceitar id/aria-label, observação
   da 04B) sem mudar busca nem filtro.
7. Desktop/celular, claro/escuro, teclado, foco ao fechar diálogos.

FORA DE ESCOPO
Regras de pagamento, baixa, estorno, aprovação, duplicidade, parcelas,
competência, recorrência e CMV; payloads, chaves de idempotência
(useChavesPendentes), RPC, migration, RLS, permissão; Fechamento de Caixa,
Cadastros Base e Categorização (05B); Dashboard, 04A e 04B (exceto a
regressão dos consumidores de ContaFormDialog/ContaDetailDialog); Fases
06–07; os quatro src/lib/presentation*Export.ts e pdfFinanceiro.ts;
corrigir PF-*.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença. Se um teste travar, procure mock de
  cliente instável (aconteceu na 04A). Teste de tela com cliente falso que
  registre qualquer escrita (rpc e insert/update/delete/upsert).
- Em navegador (com a proteção de escrita acima): títulos vencido, aberto,
  pago, cancelado; boleto com várias categorias e parte fora do CMV; linha
  sem categoria; código com zeros à esquerda e PIX (copiar e comparar);
  anexos sem upload real; erros e atraso simulados só no cliente; vazios;
  filtros e calendário; sem permissão (simulado); modal longo; formulário
  sujo; todos os diálogos abertos e fechados sem confirmar; claro e
  escuro; 320, 390, 768, 1024, 1366 e 1920 px; sidebar expandida,
  recolhida e redimensionada; teclado e foco ao fechar. Mesmos dados antes
  e depois, com valores idênticos.
- Regressão: Livro Razão e Conciliação abrindo ContaFormDialog/
  ContaDetailDialog depois das mudanças.
- Medir contraste nos dois temas sobre o fundo real.
- Auditoria de módulo (saas-audit-br:module --audit-only) com foco em
  processo de negócio (baixa, estorno, aprovação, CMV, idempotência,
  estados que escondem título vencido). Não tratar leitura de código como
  teste. Registrar o que não foi executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-092. Da Conciliação (04B): PF-086
  a PF-092; PF-088 (banner verde com saldo projetado e regra em ponto
  flutuante) aguarda decisão do proprietário. Não corrigir nesta fase.
- Observações: foco e acentos do ContaFormDialog/ContaDetailDialog (agora
  no escopo); combos sem nome acessível (agora no escopo); PF-072 (503 nas
  contagens HEAD do menu) continua; a tela de login registra dois erros de
  console antes da autenticação (preexistente); o catálogo de
  desenvolvimento fica em /__catalogo (só com bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas da 05A na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/05A-RELATORIO.md e handoffs/05A-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 05B (Fechamento de Caixa, Cadastros Base, Categorização) se os
   gates passaram com navegador; validação/correção da 05A caso contrário.
4. PARAR. Não iniciar a Fase 05B no mesmo chat.
```
