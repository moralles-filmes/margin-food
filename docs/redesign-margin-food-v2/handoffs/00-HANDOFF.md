# Handoff 00 → 01

## Estado real

- Repositório `moralles-filmes/margin-food`, branch `main`, SHA `c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2`. Nenhum commit da V2.
- Não commitado: a pasta `docs/redesign-margin-food-v2/` inteira (pacote + documentos da Fase 00), não versionada.
- Fase 00 concluída com ressalva em 2026-10-03: sem baseline em navegador (bloqueio B1). Fase 01 pendente.

## Contexto mínimo

A V2 aplica ao sistema inteiro a identidade aprovada: sidebar clara com bloco de loja, card azul de destaque para o indicador principal, demais cards claros com cor semântica pontual, gráficos legíveis e responsividade real. Muda apresentação, não negócio. As imagens orientam aparência; não são fonte de dados.

Não reverter: D01 (destaque é propriedade opcional, separada de `variant`), D02 (tokens nos dois temas, sem hex em componente), D09 (nada dos mockups vira dado), D13 (sem navegador não há fase validada).

Limitação: tudo que a Fase 00 afirma sobre aparência vem de leitura de código.

## Leitura obrigatória do próximo chat

1. `CLAUDE.md`
2. `docs/redesign-margin-food-v2/PROMPT-MESTRE.md`
3. `docs/redesign-margin-food-v2/PROGRESSO.md`
4. `docs/redesign-margin-food-v2/DECISOES.md`
5. `docs/redesign-margin-food-v2/fases/00-RELATORIO.md`
6. `docs/redesign-margin-food-v2/fases/00-PROPOSTA-VISUAL.md`
7. `docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md` — seção "Estrutura global e primitivas" (GLB-001…008)
8. `docs/redesign-margin-food-v2/prompts/01-fundacao-cards-e-graficos.md`

Código a inspecionar: `src/index.css`, `tailwind.config.ts`, `src/components/ui/{KpiCard,card,button,PageHeader,FilterBar,SegmentedControl,StatusBadge,EmptyState,ChartCard,ChartTooltip,ChartLegend,chart}.tsx`, `src/lib/chartTheme.ts`, `src/components/financeiro/cmv/CmvCards.tsx`.

Referências: `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png`, `01-dashboard-financeiro.png`.

## Já implementado e validado

Implementado: nada (fase de documentação).

Executado de fato nesta fase:

- `bun run test` — 172 arquivos, 1.687 testes passando.
- `tsc --noEmit -p tsconfig.app.json` — 0 erros.
- `bun run lint` — 0 erros, 2.016 avisos.
- `bun run build` — ok, 8,84 s.
- Cruzamento das 114 subtabs do registry com o inventário.

Não executado: qualquer verificação em navegador (tema, viewport, rede, perfis).

## Trabalho seguinte

Fase 01 — fundação: tokens de destaque, `appearance` no `KpiCard`, família de cards, moldura/tooltip/legenda de gráficos, primitivas de "sem permissão" e erro, página de demonstração só em desenvolvimento. Não migrar módulos; sidebar e seletor são da Fase 02; Dashboard Financeiro é da Fase 03.

Critérios de aceite: os de `fases/00-PROPOSTA-VISUAL.md` + validação específica do prompt 01.

## Bloqueios / riscos / cuidado com dados

- B1: sem navegador conectado e sem login de teste. Procedimento em `fases/00-RELATORIO.md`. O proprietário faz o login; o assistente não digita senha.
- D07 aberta (afeta só a Fase 02).
- 71 suspeitas funcionais em `PENDENCIAS-FUNCIONAIS.md`, não reproduzidas; não corrigir dentro do redesign.
- Evidências sem valores reais da empresa.
- Pode haver sessões paralelas no mesmo checkout: conferir `git status` e usar branch própria.

## Prompt completo para colar no próximo chat

O texto integral está em `docs/redesign-margin-food-v2/PROXIMO-CHAT.md` e reproduzido abaixo.

```text
Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 01 — Fundação visual, cards e gráficos
compartilhados. Não inicie a Fase 02.

ESTADO REAL DEIXADO PELA FASE 00 (2026-10-03)
- Branch main, SHA base c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2. Nenhum
  commit da V2. A pasta docs/redesign-margin-food-v2/ está não versionada.
- Nenhum arquivo de src/ foi alterado. Nada visual foi implementado.
- Baseline técnico: bun run test = 172 arquivos / 1.687 testes passando;
  tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0 erros e
  2.016 avisos; bun run build ok (vendor-charts 555,4 kB; FinanceiroView
  221,9 kB; index 204,7 kB).
- NÃO existe baseline em navegador: a extensão do Chrome estava desconectada
  e o projeto não tem Playwright (bloqueio B1). Nenhuma tela foi vista.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. Registre o que já existir;
   não reverta nem sobrescreva. Crie uma branch própria para a fase
   (ex.: feat/redesign-v2-f01). Sem push, merge ou deploy.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico por regra do projeto)
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md
   - docs/redesign-margin-food-v2/handoffs/00-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/00-RELATORIO.md
   - docs/redesign-margin-food-v2/fases/00-PROPOSTA-VISUAL.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente a seção
     "Estrutura global e primitivas" (linhas GLB-001 a GLB-008)
   - docs/redesign-margin-food-v2/prompts/01-fundacao-cards-e-graficos.md
3. Abra as imagens 00-card-azul-aprovado.png, 07-sidebar-e-componentes.png e
   01-dashboard-financeiro.png em docs/redesign-margin-food-v2/referencias/.
4. Inspecione o código real antes de propor mudanças:
   src/index.css, tailwind.config.ts, src/components/ui/KpiCard.tsx,
   card.tsx, button.tsx, PageHeader.tsx, FilterBar.tsx, SegmentedControl.tsx,
   StatusBadge.tsx, EmptyState.tsx, ChartCard.tsx, ChartTooltip.tsx,
   ChartLegend.tsx, chart.tsx, src/lib/chartTheme.ts e
   src/components/financeiro/cmv/CmvCards.tsx.

NAVEGADOR (pré-requisito de validação)
- Verifique se há navegador disponível. Se houver: suba bun run dev
  (http://127.0.0.1:8080), peça ao proprietário que ele mesmo faça o login
  com usuário e empresa de TESTE, e capture o "antes" do KpiCard em telas
  reais ANTES de alterar qualquer arquivo.
- Não digite senhas, não use service_role, não forje perfil.
- Se não houver navegador ou login: implemente, rode os gates de linha de
  comando, e encerre a fase como "implementada, aguardando validação". O
  próximo prompt será então de VALIDAÇÃO da Fase 01, não a Fase 02.

DECISÕES VIGENTES (não reverter sem registrar)
- D01: o destaque azul é uma propriedade nova e opcional do KpiCard
  (appearance: 'default' | 'highlight'), independente de variant. Sem a
  propriedade o card fica idêntico ao atual. variant="primary" (usado em 14
  arquivos) NÃO vira card azul.
- D02: tokens novos em src/index.css + tailwind.config.ts, nos dois temas.
  Nenhum hex em componente; nenhum dark: avulso.
- D03: a regra antiga "sem gradiente decorativo" ganha duas exceções
  nomeadas — card de destaque e item ativo da sidebar. Registrar a exceção
  em CLAUDE.md e AGENTS.md (idênticos) quando o token existir, em uma linha.
- D10: raio maior (16–20 px) só na família de cards de resumo, por classe
  própria. Não alterar --radius nem o Card do shadcn globalmente.
- D11: manter Inter e Space Grotesk. Decidir em navegador se o valor do KPI
  continua em font-display. Acrescentar tabular-nums ao valor.
- D12: evoluir chartTheme/ChartTooltip/ChartLegend e preparar ChartCard
  (hoje com 0 consumidores). Recharts permanece.
- D13: sem navegador, a fase não é marcada como validada.
- D09: nada de dados ou textos dos mockups no produto.

ESCOPO DA FASE 01
1. Tokens de destaque (fundo/gradiente, texto, texto secundário, tint do
   ícone, sombra) nos temas claro e escuro.
2. KpiCard: appearance opcional; arcos decorativos em CSS/SVG atrás do
   conteúdo, com aria-hidden e pointer-events-none; valor com tabular-nums;
   label, value, sub, delta, icon, variant, onClick, ariaLabel e o
   comportamento de teclado preservados.
3. Card padrão e estados semânticos harmonizados sem mudar consumidores.
4. Moldura de gráfico (ChartCard), tooltip e legenda prontos para adoção.
5. Um componente único de "sem permissão" e o padrão de erro com nova
   tentativa — só a primitiva; a adoção fica para as fases de módulo.
6. Página de demonstração apenas em desenvolvimento/teste, com dados
   sintéticos, fora da navegação pública.
7. Não migrar módulos. O Dashboard Financeiro é da Fase 03.

FORA DE ESCOPO
Sidebar, seletor de loja e cabeçalho (Fase 02); qualquer RPC, migration,
RLS, permissão, cálculo, dependência ou configuração de produção; os quatro
arquivos src/lib/presentation*Export.ts (paleta impressa literal).

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com o baseline
  acima e explicar qualquer diferença.
- Teste de componente do KpiCard: cada variant sem appearance (mesma saída
  de antes) e com appearance="highlight".
- Em navegador: valor negativo, zero, R$ 123.456.789,12, rótulo longo,
  320 px, claro e escuro, teclado e foco, prefers-reduced-motion, contraste
  medido no ponto mais claro do gradiente, legenda/tooltip com muitas séries.
- Smoke de consumidores não migrados do KpiCard: Dashboard Financeiro,
  Dashboard de Estoque, Centro de CMV, Relatórios, RH/Folha, Cotação.
- Não tratar leitura de código como teste. Registrar o que não foi executado.

PENDÊNCIAS CONHECIDAS
- docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md tem 71 suspeitas
  funcionais levantadas por leitura de código, nenhuma reproduzida. Não
  corrigir nenhuma nesta fase.
- Decisão D07 (usuário no rodapé da sidebar; seletor repetido no cabeçalho)
  continua aberta e só afeta a Fase 02.

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas GLB-001 a GLB-008 da
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/01-RELATORIO.md e handoffs/01-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 02 se os gates passaram com navegador; validação/correção da Fase 01
   caso contrário.
4. PARAR. Não iniciar a Fase 02 no mesmo chat.
```
