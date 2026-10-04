# Handoff 01 → 02

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `feat/redesign-v2-f01`, criada de `main` em `c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2`. Nenhum commit da V2.
- Não commitado: 10 arquivos alterados e 5 novos em `src/` (lista em `fases/01-RELATORIO.md`), mais a pasta `docs/redesign-margin-food-v2/` inteira.
- Fase 01 validada com ressalvas em 2026-10-03. Fase 02 pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada. A Fase 01 criou a base: tokens do destaque, `KpiCard` com `appearance`, moldura/tooltip/legenda de gráficos, estados de "sem permissão" e de erro, e um catálogo só de desenvolvimento. Nenhuma tela foi migrada.

Não reverter: D01/D15 (aparência separada de `variant`; três valores), D16 (sobre o azul só branco), D17 (card compacto intocado), D18 (azul mais escuro que o recorte, por contraste), D19 (família V2 em uma coluna abaixo de 480 px), D09, D13.

Limitação: as primitivas novas foram vistas só no catálogo; nenhuma tela real as usa ainda.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md`
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/01-RELATORIO.md`
6. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — seção "Estrutura global e primitivas"
7. `docs/redesign-margin-food-v2/prompts/02-sidebar-e-seletor-de-loja.md`

Código a inspecionar: `src/components/AppLayout.tsx`, `src/components/CompanySelector.tsx`, `src/contexts/AuthContext.tsx`, `src/contexts/CompanyScopeProvider.tsx`, `src/lib/companySelection.ts`, `src/hooks/useTheme.ts`, `src/contexts/ModuleBadgesContext.tsx`, `src/pages/Index.tsx`, `src/components/ui/{ModuleNav,SubmoduleSwitcher,SegmentedControl}.tsx`, tokens `--sidebar-*` em `src/index.css`.

Referências: `00-sidebar-aprovada.png`, `07-sidebar-e-componentes.png`, `01-dashboard-financeiro.png`.

## Já implementado e validado

Implementado e conferido em navegador (empresa e usuário de teste):

- Card compacto idêntico ao anterior: 27 cards de quatro módulos sem diferença de DOM; RH/Folha e Cotação com a mesma assinatura.
- Card de destaque e card de resumo no catálogo, nos dois temas; contraste medido (pior caso 4,53:1 no claro e 5,04:1 no escuro).
- Teclado e foco no card clicável; 316 px e 500 px sem rolagem horizontal.
- Gráficos do catálogo com 12 séries, negativo, zero, nulo e nome longo.

Executado em linha de comando: testes 174 / 1.719, typecheck 0 erros, lint 0 erros e 2.016 avisos, build com os mesmos tamanhos, catálogo ausente de `dist/`.

Não executado: tema escuro nas telas reais; larguras 390, 768, 1024, 1366 e 1920; movimento normal; leitor de tela.

## Trabalho seguinte

Fase 02 — sidebar, seletor de loja, cabeçalho e navegação contextual. Só apresentação: `setActiveCompany`, permissões, `TabId`, rotas e a proteção de formulário sujo ficam como estão. Critérios: os de `fases/00-PROPOSTA-VISUAL.md` e a validação específica do prompt 02.

## Bloqueios / riscos / cuidado com dados

- D07 aberta: precisa da resposta do proprietário no início da Fase 02.
- A Fase 01 está sem commit: decidir com o proprietário se commita antes de seguir.
- Login é feito pelo proprietário a cada chat; o assistente não digita senha.
- A porta 8080 pode estar ocupada por outra sessão; ler a porta no log do Vite.
- Capturas de tela mostram dados da empresa de teste; não versionar.
- 71 suspeitas funcionais em `PENDENCIAS-FUNCIONAIS.md`, não reproduzidas; não corrigir dentro do redesign.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 02 — Sidebar, cabeçalho, seletor de loja e
navegação. Não inicie a Fase 03.

ESTADO REAL DEIXADO PELA FASE 01 (2026-10-03)
- Branch feat/redesign-v2-f01, criada de main em
  c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2. NENHUM commit: a Fase 01 inteira
  está no diff da branch (10 arquivos alterados, 5 novos em src/, e a pasta
  docs/redesign-margin-food-v2/ ainda não versionada). main intocada.
- Fase 01 validada com ressalvas: bun run test = 174 arquivos / 1.719 testes;
  tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0 erros e
  2.016 avisos; bun run build ok (vendor-charts 555,4 kB; FinanceiroView
  221,9 kB; index 204,7 kB).
- Em navegador (empresa e usuário de teste): 27 KpiCards de Financeiro,
  Estoque, Relatórios e Centro de CMV sem nenhuma diferença antes/depois;
  contraste do card azul medido nos dois temas.
- Não observado na Fase 01: tema escuro nas telas reais, larguras 390/768/
  1024/1366/1920, movimento normal (o navegador estava com movimento
  reduzido), leitor de tela.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. Se a Fase 01 ainda estiver
   sem commit, PERGUNTE ao proprietário se ele quer commitar a Fase 01 antes
   (commit separado por fase) e em qual branch a Fase 02 deve seguir. Não
   reverta nem sobrescreva o diff existente. Sem push, merge ou deploy.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico por regra do projeto)
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md
   - docs/redesign-margin-food-v2/handoffs/01-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/01-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente a seção
     "Estrutura global e primitivas" (linhas GLB-*)
   - docs/redesign-margin-food-v2/prompts/02-sidebar-e-seletor-de-loja.md
3. Abra 00-sidebar-aprovada.png, 07-sidebar-e-componentes.png e
   01-dashboard-financeiro.png em docs/redesign-margin-food-v2/referencias/.
4. Inspecione o código real antes de propor mudanças:
   src/components/AppLayout.tsx, src/components/CompanySelector.tsx,
   src/contexts/AuthContext.tsx, src/contexts/CompanyScopeProvider.tsx,
   src/lib/companySelection.ts, src/hooks/useTheme.ts,
   src/contexts/ModuleBadgesContext.tsx, src/pages/Index.tsx,
   src/components/ui/ModuleNav.tsx, SubmoduleSwitcher.tsx,
   SegmentedControl.tsx e os tokens --sidebar-* de src/index.css.

DECISÃO QUE O PROPRIETÁRIO PRECISA TOMAR NO INÍCIO (D07, aberta)
- Conta do usuário: fica no cabeçalho (como hoje) ou vai para o rodapé da
  sidebar (como no recorte aprovado)?
- Seletor de loja: só na sidebar, ou repetido no cabeçalho (como em
  01-dashboard-financeiro.png)? Proposta registrada: usuário no rodapé,
  mantendo o menu atual, e seletor NÃO duplicado.
Pergunte antes de implementar essa parte; o restante não depende dela.

NAVEGADOR
- bun run dev sobe em http://127.0.0.1:8080; se a porta estiver ocupada, o
  Vite escolhe outra — leia a porta no log. Peça ao proprietário que faça o
  login com usuário e empresa de TESTE (o assistente não digita senha), de
  preferência um usuário com acesso a duas ou mais lojas e outro com uma só.
- Capture o "antes" da sidebar, do seletor e do cabeçalho (expandida,
  recolhida, celular, claro e escuro) ANTES de alterar qualquer arquivo.
- A janela do Chrome não fica menor que 500 px: para 320/390 px use um
  iframe da própria página com a largura desejada.
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da Fase 02.

DECISÕES VIGENTES (não reverter sem registrar)
- D04: item ativo da sidebar passa a fundo azul cheio com texto branco, pelos
  tokens --sidebar-active*. Módulos, ordem, agrupamentos, aria-current,
  badges, tooltips, recolhimento e largura persistida (app:sidebar:width,
  160–480 px) ficam como estão. Não reescrever com ui/sidebar.tsx.
- D05: evoluir o CompanySelector existente (modo cartão + modo compacto).
  Fonte única: accessibleCompanies / activeCompanyId / setActiveCompany do
  AuthContext. Uma só loja: bloco informativo, sem menu. Busca local só com
  lista grande (fixar o limiar nesta fase).
- D06: linha secundária do seletor só com dado real. AccessibleCompany tem
  apenas id e nome: "Unidade principal" do mockup não existe.
- D08: sem barra de navegação inferior no celular.
- D09: nada de dados ou textos dos mockups no produto.
- D03 + D18: gradiente só no card de destaque e no item ativo da sidebar.
  Tokens prontos da Fase 01: --highlight-from / --highlight-to /
  --gradient-highlight (claro: hsl(223 80% 50%) → hsl(226 75% 43%); escuro:
  hsl(224 76% 48%) → hsl(226 71% 40%)), bg-gradient-highlight,
  shadow-highlight, rounded-summary (18 px). Branco sobre esse gradiente
  mede 6,1:1 no claro e 6,7:1 no escuro. Reaproveite-os no item ativo em vez
  de criar um segundo gradiente; se precisar de token próprio da sidebar,
  crie-o nos DOIS temas apontando para esses valores.
- D13: sem navegador, a fase não é marcada como validada.
- D15–D17: KpiCard tem appearance default | summary | highlight; o card
  compacto não muda. Não migrar cards nesta fase.
- Nenhum hex em componente; nenhum dark: avulso.

ESCOPO DA FASE 02
1. Sidebar clara: marca atual, bloco de loja próprio abaixo da marca, seções
   com espaçamento, ícones alinhados, item ativo azul arredondado.
2. Seletor de loja com aparência de cartão: nome real, ícone, chevron, marca
   de selecionada, lista rolável, teclado e toque. Reutilizar o fluxo
   assíncrono existente; sem requests ou subscriptions duplicadas.
3. Estados de carregamento e erro da troca, sem mostrar cabeçalho da loja B
   com dados da loja A. Preservar a proteção de formulário sujo.
4. Recolhida: módulo e unidade identificáveis. Celular: gaveta com overlay,
   rolagem e foco corretos.
5. Cabeçalho e navegação contextual (ModuleNav, SubmoduleSwitcher,
   SegmentedControl) harmonizados sem mudar autorização nem resolução de
   aba. Pendência herdada da Fase 01: a prancha 07 mostra o item ativo do
   SegmentedControl como pílula branca com texto azul; o código usa azul
   cheio (4 consumidores). Decidir, e se mudar, conferir os 4.
6. Preservar notificações, tema, offline, ações de conta, as duas entradas
   de Salmão e todos os TabId/rotas.

FORA DE ESCOPO
Dashboard Financeiro e qualquer migração de cards ou gráficos (Fase 03);
RPC, migration, RLS, permissão, cálculo, dependência ou configuração de
produção; os quatro src/lib/presentation*Export.ts; busca global, breadcrumb
ou subtítulo da marca que não existam hoje, salvo pedido do proprietário.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença.
- Em navegador: uma loja e várias lojas; nome longo; busca sem resultado;
  troca A → B → A; cliques rápidos; falha na troca; perfil com menos
  permissões; formulário sujo; badges; ausência de flash de dados da loja
  anterior; sidebar de 160 a 480 px, largura salva, recolhida; teclado e
  foco; claro e escuro; 320, 390, 768, 1024, 1366 e 1920 px.
- Comparar o recorte 00-sidebar-aprovada.png com o resultado lado a lado.
- Medir o contraste do item ativo e do cartão de loja nos dois temas.
- Não tratar leitura de código como teste. Registrar o que não foi executado.

PENDÊNCIAS CONHECIDAS
- docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md: 71 suspeitas
  funcionais não reproduzidas. Não corrigir nenhuma nesta fase.
- A tela de login registra dois erros de console de consultas feitas antes
  da autenticação (permission denied for table produtos). Preexistente; não
  investigar dentro do redesign.
- O catálogo de desenvolvimento fica em /__catalogo (só com bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas GLB-* afetadas da
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/02-RELATORIO.md e handoffs/02-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 03 se os gates passaram com navegador; validação/correção da Fase 02
   caso contrário.
4. PARAR. Não iniciar a Fase 03 no mesmo chat.
```
