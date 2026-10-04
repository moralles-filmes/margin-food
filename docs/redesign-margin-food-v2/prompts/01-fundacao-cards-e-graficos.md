# PROMPT — FASE 01 • Fundação visual, cards e gráficos compartilhados

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Criar a base reutilizável da identidade V2, mantendo compatibilidade e sem migrar indiscriminadamente todos os módulos.

## Leitura dirigida

Leia os consumidores atuais de `src/components/ui/KpiCard.tsx`, `card.tsx`, `button.tsx`, `PageHeader`, `FilterBar`, `SegmentedControl`, `ChartCard`, `ChartTooltip`, `ChartLegend`, `ui/chart.tsx`, `src/lib/chartTheme.ts`, `src/index.css` e `tailwind.config.ts`. Verifique o componente específico de cards do CMV Financeiro antes de decidir abstrações.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png`, `01-dashboard-financeiro.png`.

## Implementação / entregáveis

1. Formalize tokens de superfície, borda, texto, marca, destaque, semântica, sombra, raio e tipografia nos dois temas. Não criar um segundo arquivo global de tema desconectado do existente.
2. Adicione a aparência azul de destaque como opção explícita compatível com a API do KPI, sem reinterpretar a variante `primary` de todos os consumidores. Separe tom do indicador, tom do delta e aparência.
3. Implemente decorações leves com CSS/SVG local, ícone translúcido, valor e textos brancos com contraste. Não usar um PNG do card como interface.
4. Harmonize o card branco e os estados semânticos, preservando `sub`, `delta`, acessibilidade e onClick. Permita valores longos, sinal negativo, várias linhas de apoio e conteúdo especializado sem forçar perda de informações.
5. Evolua a moldura dos gráficos, título/subtítulo, área de ações, legenda, skeleton, empty/error e tooltip. Preserve cores categóricas distinguíveis e tokens de projeção tracejada.
6. Padronize em componentes existentes botões, campos, badges, filtros e cabeçalhos. Faça mudanças globais somente após mapear impacto; preferir variante opt-in para alterações ainda não testadas.
7. Crie uma página de demonstração apenas no ambiente de desenvolvimento/teste ou aproveite o catálogo já existente. Ela serve para testar as primitivas, não vira um módulo público.
8. Registre contratos, exemplos de uso e critérios para escolher destaque versus card padrão em `DECISOES.md`. Migre somente exemplos e superfícies necessárias à validação desta fundação.

## Invariantes específicos

Não introduzir dados reais em demos, SDK novo, fonte proprietária, biblioteca de ícones concorrente nem gráfico novo sem necessidade. Componentes especializados podem continuar especializados. Não retirar contraste de alertas em nome do azul. Não transformar todo card em botão nem aninhar controles interativos.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar APIs antigas e novas, teclado, foco, valor negativo, zero, nulo conforme contrato, R$ 123.456.789,12 como fixture, rótulo longo e 320 px. Testar temas claro/escuro, preferência de movimento reduzido, tooltip/legenda com muitas séries e consumidor legado não migrado. Medir contraste na região mais clara do gradiente. O catálogo isolado não substitui smoke tests dos consumidores reais.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/01-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 02. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 01.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
