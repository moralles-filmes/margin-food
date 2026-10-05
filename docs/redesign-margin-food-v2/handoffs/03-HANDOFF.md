# Handoff 03 → 04A

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f03`, criada de `feat/redesign-v2-f02` em `1227af64d8a2ca62959884b6e7701eb543455d29`. Commits da Fase 03: `8f755dd` (código) e `709688b` (documentação), mais um commit de documentação registrando estes SHAs.
- Sem push, PR ou merge; `main` intocada em `c6a9774`.
- Fase 03 validada com ressalvas em 2026-10-04. Fase 04A pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. Fases 01 e 02 criaram a base (tokens do destaque, `KpiCard` com `appearance`, gráficos, estados) e a estrutura global (sidebar, seletor de loja, cabeçalho, `SegmentedControl`). A Fase 03 levou o padrão à primeira tela de módulo, o Dashboard Financeiro, sem mudar RPC, cálculo, filtros, exportações nem destinos de navegação.

Não reverter: D15–D19 (família de cards), D22–D30 (estrutura global), D31 (grade por container query conforme o valor mais longo), D32 (textos de apoio derivados do contrato das RPCs), D33 (período dos valores × período aplicado × janela do comparativo, sempre identificados), D34 (ranking com Top 8 só no limite da RPC), D35 (receitas/despesas em verde/vermelho; linha monotone com linha de zero), D36 (sem atalhos, links "Ver…" e menu "Exportar" do mockup), D09, D13.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md`
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/03-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — linhas FIN-A-004 a 011, 014, 015 e 036 a 040
7. `docs/redesign-margin-food-v2/prompts/04-contas-bancarias-e-movimentacao-financeira.md` (só a parte 04A)

Código a inspecionar: `src/components/financeiro/ContasBancariasSection.tsx`, `LivroRazaoSection.tsx`, o wrapper de Lançamentos em `src/components/FinanceiroView.tsx`, `FluxoCaixaSection.tsx`, `ProjecaoFluxoSection.tsx` (+ teste), `KpiCard.tsx`, `ChartCard.tsx`, `chartTheme.ts` e, como exemplo do padrão aplicado, `DashboardFinanceiroSection.tsx`, `DashboardCharts.tsx` e `dashboardFinanceiroView.ts`.

Referências: `02-contas-bancarias.png`, `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png` (e o `MANIFESTO.md` da pasta).

## Já implementado e validado

Conferido em navegador (login "Administrador Principal", unidade de teste Moralles confirmada pelo proprietário, só leitura; cenários extremos simulados só no cliente):

- Os oito valores idênticos antes/depois em Outubro e Junho/2026; os oito destinos de clique (Fluxo; Receber "A Receber"; Pagar; Pagar "Vencido"; Livro Razão Receitas/Despesas com datas; Pagar; DRE).
- Dia, Mês, Período (inclusive data final < inicial), Atualizar; loading, erro dos gráficos com nova tentativa, erro do resumo (legenda fica no período dos valores), vazio.
- Claro/escuro; 320/390/768/1024/1366/1920 px sem rolagem horizontal; sidebar recolhida e alargada; nenhum valor cortado (inclusive milhões negativos).
- Contraste no fundo real: card azul ≥ 5,64 (claro) / 6,12 (escuro), apoio sobre os arcos 4,50 / 4,79; summary ≥ 5,15 / 5,59.
- Comparação lado a lado com `01`, `01b` e `01c` (diferenças registradas no relatório).

Executado em linha de comando: testes 180 / 1.779, typecheck 0, lint 0 erros e 2.016 avisos, build ok (`FinanceiroView` 235,26 kB, CSS 120,23 kB). Auditoria de módulo (mapeador, processo de negócio, identidade/acesso, funcional): sem mudança de fronteira; 2 P2 e 4 P3 de texto corrigidos na fase; preexistentes registrados em PF-074 a PF-077.

Só em teste/diff: sem acesso (sem perfil reduzido) e exportação (download não autorizado). Não executado: leitor de tela, movimento normal.

## Trabalho seguinte

Fase 04A — Contas Bancárias, Livro Razão/Lançamentos, Fluxo de Caixa e Projeção. A Conciliação Bancária fica para a 04B (chat próprio; arquivo de ~3.700 linhas com regras caras). Critérios: os do prompt 04 (parte 04A) e a validação descrita no prompt abaixo.

## Bloqueios / riscos / cuidado com dados

- O proprietário precisa reautorizar o uso da sessão (ou logar com usuário de teste) a cada chat; o assistente não digita senha.
- Valores das imagens de referência podem coincidir com dados reais: não usar como fixture nem hardcodar (D09).
- Capturas mostram dados da unidade de teste; não versionar.
- Os cards do Dashboard levam a Lançamentos com `initialTipo`/datas e Contas Bancárias leva com `initialContaId` ("Ver extrato"): preservar essas props na 04A.
- 77 pendências em `PENDENCIAS-FUNCIONAIS.md`; nenhuma deve ser corrigida no redesign.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 04A — Contas Bancárias, Livro Razão
(Lançamentos), Fluxo de Caixa e Projeção. NÃO toque na Conciliação Bancária
(é a Fase 04B, em chat próprio) e não inicie a Fase 05.

ESTADO REAL DEIXADO PELA FASE 03 (2026-10-04)
- Branch feat/redesign-v2-f03, criada de feat/redesign-v2-f02 em
  1227af64d8a2ca62959884b6e7701eb543455d29. Fase 03 commitada em 8f755dd
  (código) e 709688b (documentação), mais um commit de documentação com
  estes SHAs. Sem push, PR ou merge. main intocada (c6a9774).
- Fase 03 validada com ressalvas: bun run test = 180 arquivos / 1.779
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (vendor-charts 555,44 kB;
  FinanceiroView 235,26 kB; index 204,80 kB; Index 41,05 kB; CSS 120,23 kB).
- Entregue na Fase 03: Dashboard Financeiro com cabeçalho reorganizado,
  dois grupos de quatro cards (Saldo em highlight, demais em summary),
  grade por container query conforme o valor mais longo
  (kpiGridClassFor em src/components/financeiro/dashboardFinanceiroView.ts),
  textos e notas derivados do contrato das RPCs, gráficos em ChartCard,
  ranking de categorias e explicação de Despesas Provisionadas.
- Ressalvas da Fase 03 (não bloqueiam a 04A): sem acesso e exportação só
  em teste/diff (sem perfil reduzido; download não autorizado); leitor de
  tela e movimento normal não observados; larguras pequenas em iframe.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a Fase 04A segue em nova branch a partir da atual (ex.:
   feat/redesign-v2-f04a) ou na mesma, com commit separado por fase, e se
   haverá commit ao final. Não reverta nem sobrescreva o que existir. Sem
   push, merge ou deploy sem pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico por regra do projeto)
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D19, D22–D30 e D31–D36)
   - docs/redesign-margin-food-v2/handoffs/03-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/03-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     da Fase 04A: FIN-A-004 a FIN-A-011, FIN-A-014, FIN-A-015 e FIN-A-036
     a FIN-A-040 (as FIN-A-016 a 035 são da 04B)
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     de "Financeiro — operações e cadastros" que citam Contas Bancárias,
     Livro Razão, Fluxo de Caixa ou Projeção (ex.: PF-010); não corrigir
   - docs/redesign-margin-food-v2/prompts/04-contas-bancarias-e-movimentacao-financeira.md
     (aplicar só à parte 04A)
3. Abra 02-contas-bancarias.png, 00-card-azul-aprovado.png e
   07-sidebar-e-componentes.png em docs/redesign-margin-food-v2/referencias/
   (consulte o MANIFESTO.md da pasta).
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/ContasBancariasSection.tsx,
   src/components/financeiro/LivroRazaoSection.tsx e o wrapper de
   Lançamentos usado em src/components/FinanceiroView.tsx (aba
   lancamentos, props initialContaId/initialDateFrom/initialDateTo/
   initialTipo — são o destino dos cards do Dashboard e de "Ver extrato"),
   src/components/financeiro/FluxoCaixaSection.tsx,
   src/components/financeiro/ProjecaoFluxoSection.tsx (+ teste),
   KpiCard, ChartCard, chartTheme e os formatadores usados. Consulte RPCs
   de saldo só para entender a semântica; não altere.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080. Se subir
  outro, leia a porta no log e pare o seu ao terminar.
- Na Fase 03 o Chrome estava no login "Administrador Principal" e o
  proprietário confirmou a unidade Moralles como unidade de teste, só
  leitura. Isso NÃO vale automaticamente para a 04A: pergunte de novo,
  prefira empresa e usuário de teste e nunca digite senha. Nada de salvar,
  criar/editar/desativar conta, lançar, pagar, conciliar, exportar ou
  enviar para validar estética; abrir PDF/Excel só com autorização do
  download.
- Atenção (D09): valores das imagens de referência podem coincidir com
  dados reais. Nada de número da imagem no código ou nos testes.
- Capture o "antes" (claro, escuro, desktop e celular) de Contas Bancárias,
  Livro Razão, Fluxo de Caixa e Projeção ANTES de alterar qualquer arquivo,
  com a mesma unidade, filtros e período que usará no "depois".
- A janela do Chrome não fica menor que 500 px: use iframe da própria
  página para 320/390 px, com 4 px a mais por causa da borda (o iframe de
  772 px dá viewport de 768). Para casos extremos (conta negativa, zerada,
  nome longo, muitas contas), a Fase 03 interceptou o fetch SÓ na aba
  (cliente), sem tocar no banco — repita esse método e registre-o.
- O navegador costuma estar com prefers-reduced-motion ativo.
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da 04A.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard com appearance default | summary | highlight; o compacto
  (default) não muda; no highlight tudo é branco/highlight-muted e o
  negativo se identifica pelo sinal (D16). Família V2 em Inter 24 px
  tabular-nums.
- Mestre §5 + D15: uma grade de contas pode repetir o card azul, porque as
  contas têm o mesmo papel; saldo negativo continua com sinal e, se o
  estado for crítico, use summary + variant semântica, não highlight.
- D18: gradiente do destaque calibrado (pior caso do texto de apoio ~4,5:1
  sobre os arcos no claro). D19/D31: valor nunca diminui para caber; a
  grade reorganiza. kpiGridClassFor (Fase 03) mede ~13,5 px por caractere
  e pode ser reaproveitado para grades de saldo — se for usar fora do
  Dashboard, mova para um módulo compartilhado e mantenha os testes.
- D29: SegmentedControl já tem o visual aprovado. D33: período e datas de
  referência sempre identificados junto do valor; nunca descrever um
  período que os números não são.
- D08 (sem barra inferior), D09 (nada de dados/textos dos mockups), D13
  (sem navegador não há validação). Gradiente só no card de destaque e no
  item ativo da sidebar. Nenhum hex em componente; nenhum dark: avulso.
  Gráficos pelo chartTheme/ChartCard/ChartTooltip/ChartLegend (D12, D21,
  D35: receitas/despesas mantêm verde/vermelho).

ESCOPO DA FASE 04A (detalhe em prompts/04-..., só a parte 04A)
1. Contas Bancárias: cards de conta na família aprovada (nome, tipo,
   saldo, informações existentes, status e ações), saldo negativo visível,
   ações administrativas sem competir com o saldo; estados (skeleton,
   vazio, vazio por filtro); diálogo de conta e confirmação de desativar
   só revisados visualmente (sem submeter).
2. Distinguir saldo atual do sistema, saldo inicial, saldo do extrato e
   saldo na data de referência quando esses dados existirem, com rótulo e
   data junto do valor. Não somar só as contas visíveis como total geral.
3. Lançamentos/Livro Razão: wrapper com as sub-abas (sem mexer na
   Conciliação), lista agrupada por dia, tabela com valores alinhados,
   receita/despesa identificadas, filtros claros, estados e diálogos
   existentes (editar classificação, excluir, possível duplicidade) — só
   visual. Preservar initialContaId/initialDateFrom/initialDateTo/
   initialTipo (destinos do Dashboard e de "Ver extrato").
4. Fluxo de Caixa e Projeção: cards, molduras, filtros e tabelas com
   saldo inicial/final, períodos, ordenação e navegação preservados;
   gráficos pelo tema compartilhado.
5. Desktop/celular, claro/escuro, modais, guard de alterações não salvas.

FORA DE ESCOPO
Conciliação Bancária (Fase 04B), RPC, migration, RLS, permissão, cálculo
de saldo, importadores, matching, payloads, dependência ou configuração de
produção; Dashboard (Fase 03 concluída); outras telas do Financeiro
(Fases 05–07); os quatro src/lib/presentation*Export.ts; corrigir PF-*.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença.
- Em navegador, mesma unidade/filtros/período antes e depois: saldos e
  totais idênticos; abrir extrato pela conta certa ("Ver extrato" e os
  cards do Dashboard que levam a Lançamentos com tipo e datas); busca,
  filtros, ordenação, paginação; estados de loading/erro (simulado só no
  cliente)/vazio; conta positiva, negativa, zerada, nome longo e caixa
  físico (fixture no cliente se a unidade não tiver); claro e escuro; 320,
  390, 768, 1024, 1366 e 1920 px; sidebar expandida, recolhida e
  redimensionada; teclado.
- Medir contraste dos cards azuis de conta e dos summary nos dois temas
  sobre o fundo real. Comparar com 02-contas-bancarias.png lado a lado.
- Auditoria de módulo (saas-audit-br:module --audit-only) se o roteador
  pedir. Não tratar leitura de código como teste. Registrar o que não foi
  executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-077 (PF-074 a PF-077 vieram da
  auditoria da Fase 03: RPC do Dashboard sem permissão, chave de exportação
  do Dashboard fora do registry, card Vencidas × lista, guarda que descarta
  troca de período). PF-010: Fluxo de Caixa → Contas a Pagar/Receber perde
  a data. Não corrigir nesta fase.
- O Dashboard chama get_fin_dashboard_charts duas vezes (FIN-B-007),
  preexistente.
- Observações da Fase 03 para outras fases: SegmentedControl sem nome
  acessível no radiogroup; títulos h3 achatados (CardTitle); foco do
  Recharts ao clicar no gráfico mostra contorno preto; botão flutuante da
  calculadora cobre conteúdo no celular (PF-073).
- A tela de login registra dois erros de console de consultas antes da
  autenticação (permission denied for table produtos). Preexistente.
- O catálogo de desenvolvimento fica em /__catalogo (só com bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas FIN-A da Fase 04A na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/04A-RELATORIO.md e handoffs/04A-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 04B (Conciliação) se os gates passaram com navegador;
   validação/correção da 04A caso contrário.
4. PARAR. Não iniciar a Fase 04B no mesmo chat.
```
