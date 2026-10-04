# Handoff 02 → 03

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f02`, criada de `feat/redesign-v2-f01` em `7bf08a740a411ad6a53e90bba1a6891082e7101b`. Commits da Fase 02: `11ae4d6` (código) e `(SHA no commit seguinte)` (documentação), mais um commit de documentação com estes SHAs.
- Sem push, PR ou merge; `main` intocada em `c6a9774`.
- Fase 02 validada com ressalvas em 2026-10-03. Fase 03 pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. A Fase 01 criou a base (tokens do destaque, `KpiCard` com `appearance`, gráficos e estados). A Fase 02 aplicou a estrutura global: sidebar clara com cartão da loja, item ativo com o gradiente do destaque, conta no rodapé (D07), gaveta acessível no celular, cabeçalho branco e `SegmentedControl` em pílula clara. Nenhuma tela de módulo foi migrada ainda; o Dashboard Financeiro é a primeira (Fase 03).

Não reverter: D15–D19 (família de cards), D22 (item ativo), D23 (`CompanySelector` com `appearance`; o modo `inline` serve a Apresentação Sócios), D26 (largura padrão 256 px), D28 (gaveta: `key` distinta nos dois `<aside>`), D29 (`SegmentedControl`), D09, D13.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md`
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/02-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — linhas FIN-B-001 a FIN-B-010
7. `docs/redesign-margin-food-v2/prompts/03-dashboard-financeiro.md`

Código a inspecionar: `src/components/financeiro/DashboardFinanceiroSection.tsx`, `DashboardCharts.tsx`, `src/components/FinanceiroView.tsx`, `src/components/ui/KpiCard.tsx` (+ teste), `ChartCard.tsx`, `ChartTooltip.tsx`, `ChartLegend.tsx`, `src/lib/chartTheme.ts`.

Referências: `01-dashboard-financeiro.png`, `01b-dashboard-detalhamento.png`, `01c-dashboard-mobile.png`, `00-card-azul-aprovado.png`.

## Já implementado e validado

Conferido em navegador (sessão do proprietário, quatro unidades reais, uso só de leitura autorizado):

- Sidebar comparada lado a lado com o recorte aprovado; contraste do item ativo 6,14:1 (claro) / 6,66:1 (escuro) e do cartão da loja 16,05 / 17,28 (nome) e 5,09 / 7,75 (apoio).
- Troca A → B → A sem quadro com cabeçalho de uma unidade e dados de outra; duplo clique = uma troca; falha simulada no cliente cai na tela de erro existente; formulário sujo protegido.
- Recolhida, 160–480 px com largura salva, gaveta do celular (foco, Escape, `inert`), teclado, claro/escuro, 320/390/768/1024/1366/1920 px sem rolagem horizontal.
- `SegmentedControl` nos 4 consumidores (Dashboard, Borderô, cadastro de marca, folha do CMV).

Executado em linha de comando: testes 177 / 1.741, typecheck 0, lint 0 erros e 2.016 avisos, build com os mesmos tamanhos, catálogo ausente de `dist/`. Auditoria de módulo (identidade/acesso): aprovada com ressalvas; os dois P3 foram corrigidos com teste.

Só em teste automatizado: uma loja, perfil com menos permissões, busca do seletor (4 unidades < limiar 8). Não executado: leitor de tela, movimento normal.

## Trabalho seguinte

Fase 03 — Dashboard Financeiro completo: oito indicadores em dois grupos (Saldo em `highlight`, demais em `summary`), cabeçalho da tela, gráficos com `ChartCard`, ranking de despesas por categoria e explicação de Despesas Provisionadas — sem mudar RPC, cálculo, filtros, exportações ou destinos dos cliques. Critérios: os do prompt 03 e a validação descrita no prompt abaixo.

## Bloqueios / riscos / cuidado com dados

- O proprietário precisa reautorizar o uso da sessão (ou logar com usuário de teste) a cada chat; o assistente não digita senha.
- Os valores das imagens de referência coincidem com dados reais de uma unidade: não usar como fixture nem hardcodar (D09).
- Capturas mostram dados reais; não versionar.
- PF-072 (contagens HEAD dos badges com 503) e PF-073 (calculadora sobre a gaveta) registradas, não corrigidas.
- 73 pendências em `PENDENCIAS-FUNCIONAIS.md`; as do Dashboard (PF-003, PF-004, PF-005, PF-008) não devem ser corrigidas no redesign.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 03 — Dashboard Financeiro completo. Não inicie
a Fase 04.

ESTADO REAL DEIXADO PELA FASE 02 (2026-10-03)
- Branch feat/redesign-v2-f02, criada de feat/redesign-v2-f01 em
  7bf08a740a411ad6a53e90bba1a6891082e7101b. Fase 02 commitada em 11ae4d6
  (código) e (SHA no commit seguinte) (documentação), mais um commit de documentação com
  estes SHAs. Sem push, PR ou merge. main intocada (c6a9774).
- Fase 02 validada com ressalvas: bun run test = 177 arquivos / 1.741
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (vendor-charts 555,44 kB;
  FinanceiroView 221,84 kB; index 204,80 kB; Index 41,09 kB; CSS 117,72 kB).
- Entregue na Fase 02: sidebar clara com cartão da loja, item ativo com o
  gradiente do destaque, conta no rodapé (D07 resolvida: seletor só na
  sidebar), gaveta do celular acessível, cabeçalho branco sem a conta,
  SegmentedControl em pílula clara (já aparece no Dia/Mês/Período do
  Dashboard Financeiro), grupo inativo do ModuleNav sem preenchimento.
- Ressalvas da Fase 02 (não bloqueiam a 03): uma loja, perfil com menos
  permissões e busca do seletor só em teste automatizado; leitor de tela e
  movimento normal não observados; larguras pequenas vistas em iframe.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a Fase 03 segue em uma nova branch a partir da atual (ex.:
   feat/redesign-v2-f03) ou na mesma, com commit separado por fase. Não
   reverta nem sobrescreva o que existir. Sem push, merge ou deploy sem
   pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico por regra do projeto)
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D19 e D22–D30)
   - docs/redesign-margin-food-v2/handoffs/02-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/02-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-B-001 a FIN-B-010 (Dashboard, seção "Financeiro — Dashboard")
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só PF-003,
     PF-004, PF-005 e PF-008 (Dashboard; não corrigir)
   - docs/redesign-margin-food-v2/prompts/03-dashboard-financeiro.md
3. Abra 01-dashboard-financeiro.png, 01b-dashboard-detalhamento.png,
   01c-dashboard-mobile.png e 00-card-azul-aprovado.png em
   docs/redesign-margin-food-v2/referencias/.
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/DashboardFinanceiroSection.tsx,
   src/components/financeiro/DashboardCharts.tsx,
   src/components/FinanceiroView.tsx (navegação dos cards),
   src/components/ui/KpiCard.tsx (+ KpiCard.test.tsx), ChartCard.tsx,
   ChartTooltip.tsx, ChartLegend.tsx, src/lib/chartTheme.ts, os
   formatadores usados pelos cards e os testes atuais do dashboard.
   Consulte o contrato de get_fin_dashboard_summary e
   get_fin_dashboard_charts só para entender a semântica; não altere.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080 (na Fase 02 a
  8082 não respondia). Se subir outro, leia a porta no log e pare o seu ao
  terminar.
- Na Fase 02 o Chrome já estava logado pelo proprietário numa conta com
  quatro unidades REAIS, e ele autorizou uso só de leitura. Isso NÃO vale
  automaticamente para a Fase 03: pergunte de novo, prefira empresa e
  usuário de teste, e nunca digite senha. Nada de salvar, exportar,
  pagar ou enviar para validar estética; abrir PDF/Excel só se o
  proprietário autorizar o download.
- Atenção (D09): os valores das imagens de referência coincidem com os
  dados reais de uma das unidades. Isso não os torna fixture: nada de
  número da imagem no código ou nos testes.
- Capture o "antes" do Dashboard Financeiro (claro, escuro, desktop e
  celular) ANTES de alterar qualquer arquivo, com a mesma unidade, filtro e
  período que usará no "depois".
- A janela do Chrome não fica menor que 500 px: para 320/390 px use um
  iframe da própria página. Na Fase 02 o navegador estava com
  prefers-reduced-motion ativo.
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da Fase 03.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard tem appearance default | summary | highlight; o card
  compacto (default) não muda. No highlight tudo é branco/highlight-muted;
  negativo se identifica pelo sinal e pela seta (D16). Família V2 em Inter
  24 px tabular-nums.
- D15: um highlight por grupo de indicadores — aqui, Saldo em Caixa; os
  demais usam summary com a variant semântica atual.
- D18: gradiente do destaque já calibrado (branco 6,14:1 claro / 6,66:1
  escuro). D19: família V2 em uma coluna abaixo de 480 px; duas colunas a
  partir daí.
- D29: SegmentedControl já tem o visual aprovado; não recriar o
  Dia/Mês/Período.
- D08: sem barra de navegação inferior no celular. D09: nada de dados ou
  textos dos mockups ("Histórico ilustrativo", "Outubro em andamento",
  totais das pranchas). D13: sem navegador, a fase não é validada.
- Gradiente só no card de destaque e no item ativo da sidebar. Nenhum hex
  em componente; nenhum dark: avulso. Gráficos pelo chartTheme/ChartCard/
  ChartTooltip/ChartLegend existentes (D12, D21).

ESCOPO DA FASE 03 (detalhe em prompts/03-dashboard-financeiro.md)
1. Cabeçalho da tela: título, descrição, Dia/Mês/Período, data, Atualizar,
   PDF e Excel — mesmos handlers e permissões.
2. Dois grupos de quatro: Posição Financeira (Saldo em Caixa, Contas a
   Receber, Contas a Pagar, Contas Vencidas) e Desempenho do Período
   (Receita do Período, Despesa Realizada, Despesas Provisionadas,
   Resultado). Saldo em highlight; os outros em summary com a semântica
   atual. Nenhum card removido, renomeado ou escondido no celular; sem
   carrossel. Valores, sinal, centavos, "3 boletos" e comparativos
   completos; vencido zero não pode parecer crítico.
3. Cliques e destinos dos cards exatamente como hoje (confirmar no código).
4. Receitas vs Despesas e Resultado Mensal com ChartCard e tema
   compartilhado; a janela histórica (3/6/12 meses) continua separada do
   período do resumo e ambos ficam identificados.
5. Despesas por Categoria como ranking horizontal (ou lista com barra) com
   valor completo; se o percentual for do Top 8 recebido, rotular
   "participação no Top 8"; nunca apresentar como total da despesa.
6. Explicação de Despesas Provisionadas só com os dados já carregados e a
   fórmula confirmada no código.
7. Estados: loading, erro, sem acesso, exportando, vazio — sem mudar a
   regra (PF-004 continua pendência, não corrigir).

FORA DE ESCOPO
RPC, migration, RLS, permissão, cálculo, regime, fórmula, exportação,
dependência ou configuração de produção; outras telas do Financeiro
(Fases 04–07); sidebar/seletor (Fase 02 concluída); os quatro
src/lib/presentation*Export.ts; corrigir PF-003/004/005/008.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença.
- Em navegador, mesma unidade/filtro/período antes e depois: os oito
  valores idênticos (inclusive negativo e provisionadas); Dia, Mês,
  Período customizado, datas inválidas, Atualizar e todos os cliques dos
  cards; loading, erro (simulado só no cliente), sem acesso se houver
  perfil; gráfico com um ponto e série negativa; categorias cujo Top 8 não
  é o total; claro e escuro; 320, 390, 768, 1024, 1366 e 1920 px; sidebar
  expandida, recolhida e redimensionada.
- Medir contraste do card azul e dos cards summary nos dois temas sobre o
  fundo real.
- Comparar com 01-dashboard-financeiro.png, 01b e 01c lado a lado.
- Não tratar leitura de código como teste. Registrar o que não foi
  executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-073 (PF-072: contagens HEAD dos
  badges voltam 503; PF-073: calculadora sobre a gaveta). Não corrigir
  nesta fase.
- O Dashboard chama get_fin_dashboard_charts duas vezes (FIN-B-007),
  preexistente; não "otimizar" dentro do redesign.
- A tela de login registra dois erros de console de consultas antes da
  autenticação (permission denied for table produtos). Preexistente.
- O catálogo de desenvolvimento fica em /__catalogo (só com bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas FIN-B-001 a FIN-B-010
   da MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/03-RELATORIO.md e handoffs/03-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 04 se os gates passaram com navegador; validação/correção da Fase 03
   caso contrário.
4. PARAR. Não iniciar a Fase 04 no mesmo chat.
```
