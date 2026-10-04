# Fase 00 — Proposta visual, primeira migração e critérios de aceite

Proposta derivada das referências e da leitura do código. Nada foi implementado. Os pontos "a confirmar em navegador" não são defeitos comprovados.

## Referências consultadas nesta fase

Abertas e lidas: `00-card-azul-aprovado.png`, `00-sidebar-aprovada.png`, `01-dashboard-financeiro.png`, `01b-dashboard-detalhamento.png`, `01c-dashboard-mobile.png`, `07-sidebar-e-componentes.png`, `09-visao-geral-referencias.png` (que contém miniaturas de 02 a 06).

Não abertas em tamanho real: `02`, `03`, `04`, `05`, `06`, `08` e `90`. Cada uma deve ser lida na fase do seu módulo (04A, 08A, 07, 13A, 14A, 09A) antes de qualquer edição.

## Divergências entre as referências e o sistema real

| # | O que a imagem mostra | O que o código tem | Tratamento |
|---|---|---|---|
| 1 | Saldo em Caixa em card azul | `KpiCard variant="success"` (`DashboardFinanceiroSection.tsx:261`) | Aplicar o destaque azul (D01). O saldo negativo mantém sinal e rótulo. |
| 2 | Cards em duas linhas de quatro, com títulos "Posição Financeira" e "Desempenho do Período" | Uma grade única `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8` (`:335`) | Reorganizar em dois grupos de quatro, na ordem atual dos cards. |
| 3 | Ranking de despesas por categoria com barra | Pizza + lista "Despesas por Categoria (Top 8)" | Trocar a representação, mantendo fonte, Top 8 e o aviso de que o percentual é sobre o Top 8. |
| 4 | Bloco "Entenda as despesas provisionadas" | Valor derivado no cliente: `resumo.despesa + resumo.aPagar` (`:92`) | Explicar a composição com os dois valores já carregados. Sem nova consulta e sem somar de novo. |
| 5 | "Histórico ilustrativo", "Unidade principal", cartão "Outubro em andamento" | Não existem como dado | Não implementar (D09). |
| 6 | Seletor de loja também no cabeçalho | Seletor só na sidebar | Decisão aberta D07. |
| 7 | Usuário no rodapé da sidebar | Usuário no cabeçalho | Decisão aberta D07. |
| 8 | Barra de navegação inferior no celular | `ModuleNav` no topo do módulo | Não criar (D08). |
| 9 | Subtítulo "Gestão para restaurantes" e logotipo "margin food" | Quadrado "M" + texto "Margin Food" | Aplicar o estilo da marca com os textos atuais; subtítulo só se o proprietário confirmar o texto. |
| 10 | Atalhos "Do resumo para a operação" | Não existe no dashboard | É funcionalidade nova de navegação. Não implementar sem pedido explícito; registrar como opção para o proprietário. |
| 11 | Breadcrumb "Margin Food › Financeiro" | Título do módulo no cabeçalho (`tabLabels`) | Pode ser derivado do `activeTab` atual; decidir na Fase 02. |
| 12 | Linha "vs. período anterior" em vários cards | Só Receita, Despesa e Resultado têm comparativo; sem base anterior o card fica sem a linha | Manter a regra atual. Não inventar comparativo. |

## Primeira migração opt-in (Fase 01)

1. **Tokens de destaque** em `src/index.css` e `tailwind.config.ts`, nos dois temas: fundo/gradiente do destaque, texto e texto secundário sobre o destaque, tint translúcido do ícone, sombra. Contraste medido no fundo real, inclusive no ponto mais claro do gradiente.
2. **`KpiCard`**: propriedade opcional `appearance` (`'default' | 'highlight'`). Sem a propriedade, o resultado é idêntico ao atual. Arcos decorativos atrás do conteúdo, com `aria-hidden` e `pointer-events-none`. Valor com `tabular-nums`.
3. **Família de cards de resumo**: raio maior por classe própria, sem tocar `--radius` (D10).
4. **Gráficos**: revisar `chartTheme`/`ChartTooltip`/`ChartLegend`; deixar `ChartCard` pronto para adoção (hoje sem consumidores).
5. **Estados padrão**: definir um componente único de "sem permissão" e o padrão de erro com nova tentativa; adoção fica para as fases de módulo.

Como validar que consumidores antigos não mudaram:

- Teste de componente do `KpiCard` cobrindo cada `variant` sem `appearance` (mesmas classes de antes) e com `appearance="highlight"`.
- Conferência em navegador de ao menos uma tela por variante hoje em uso: Dashboard Financeiro, Dashboard de Estoque, Centro de CMV, Relatórios, RH/Folha, Cotação.
- `bun run test`, `tsc -p tsconfig.app.json`, `bun run lint` e `bun run build` comparados com o baseline da Fase 00.

## Proposta por módulo

| Módulo | Estado atual (leitura de código) | Proposta |
|---|---|---|
| Sidebar e seletor | Marca e seletor na mesma linha, seletor em `text-xs`; ativo com tint claro | Bloco de loja próprio abaixo da marca; item ativo azul cheio; usuário no rodapé (D07); tudo o mais preservado |
| Dashboard Financeiro | 8 `KpiCard` em grade única; gráficos em `Card` cru; janela dos gráficos sem rótulo | Dois grupos de 4; Saldo em destaque; `ChartCard` com período visível; ranking no lugar da pizza; explicação das provisionadas |
| Contas Bancárias, Livro Razão, Fluxo, Projeção | Nenhum `KpiCard`; cards à mão em tamanhos diferentes; Livro Razão sem classes responsivas | Saldos em cards de destaque (grade de contas pode repetir o azul); totais em `KpiCard`; tabela com rolagem localizada |
| Conciliação | Alternador feito à mão; sem tratamento mobile | Só apresentação: sub-navegação padrão, status com `StatusBadge`, banner de saldo preservado |
| Pagar / Receber / Códigos / Recorrências / Alertas | Totais no subtítulo; badges de status com mapa local repetido | Totais em `KpiCard`; `StatusBadge`; `PageHeader`; ações de linha sempre visíveis |
| Fechamento, Cadastros, Categorização | `Button` default/outline como sub-abas | `SubmoduleSwitcher`/`SegmentedControl`; formulários inalterados |
| DRE/DFC, Orçamento, KPIs, Comparativo, Auditoria, Borderô | Sete variantes de card de indicador fora do `KpiCard` | Unificar em `KpiCard` quando o contrato couber; `ChartCard`; `DemonstrativoTree` mantém regras de % |
| Apresentação Sócios | Muita opacidade como hierarquia | Trocar por tokens; exports com paleta literal ficam como estão |
| CMV Financeiro | Tooltip e legenda próprios | `ChartTooltip`/`ChartLegend`; um destaque (faturamento) conforme `04-cmv-financeiro.png`; denominadores intactos |
| Controle de Estoque | Três implementações de indicador; grades sem breakpoint; texto de 8–10 px | `KpiCard`; destaque em "Valor em estoque"; grades responsivas; texto mínimo de 12 px |
| Movimentação Operacional | Já mobile-first | Ajuste de tokens e raio; alvos de toque mantidos |
| Inventário Geral | Contagem por código já mobile-first | Cards e status padronizados; fluxo intacto |
| Salmão | Cards locais; opacidade pesada em Manipulação; poucas classes responsivas | `KpiCard` e tokens; grades responsivas; duas entradas da sidebar preservadas |
| Compras e Fornecedores | Quatro padrões de sub-navegação; tabelas de 7–10 colunas sem versão mobile | Sub-navegação única; rolagem localizada identificada; `StatusBadge` |
| Centro de CMV / Ficha Técnica | Sem título de página; emojis como ícone | `PageHeader`; ícones Lucide; `KpiCard` nos diálogos onde couber |
| Planejamento | Todos os indicadores em cards locais; dois `StatusBadge` locais homônimos | `KpiCard` com destaque em "Meta de compras" conforme `05-planejamento.png`; realizado sólido e projetado tracejado |
| Relatórios Gerais | 28 usos de opacidade; gráfico de dias da semana em `div` | Tokens; `ChartCard`; gráfico em Recharts só se a fonte e a agregação ficarem idênticas |
| RH | Gráficos em `Card` cru de altura fixa; 11 subseções devolvem tela em branco sem permissão | `ChartCard`; estado "sem permissão" padrão; destaque em Headcount conforme `06-rh-pessoas.png` |
| Central de IA | Chat com `h-[600px]` | Altura relativa à viewport; bolhas com tokens |
| Usuários / Configurações / Admin | Controles nativos misturados (`select`, `table`, `prompt()`) | Componentes do design system onde a troca não altera comportamento; `prompt()` vira pendência se exigir novo diálogo |
| Acesso e globais | `NotFound` em inglês; calculadora flutuante sobre o Login | Identidade nova no Login/Reset; texto do 404 em português; posição da calculadora a confirmar em navegador |

## Critérios de aceite visual (toda fase de implementação)

- Larguras 320, 390, 768, 1024, 1366 e 1920 px; sidebar expandida, recolhida e redimensionada; temas claro e escuro.
- Sem rolagem horizontal da página; rolagem localizada só em tabela ou matriz.
- Valores completos: sem reticências em dinheiro, sem centavos removidos, sem quebra no meio do número.
- Zero, negativo, valor longo, vazio, carregando, erro e sem permissão conferidos em cada tela tocada.
- Teclado: foco visível, ordem lógica, Enter/Espaço em cards clicáveis, fechamento de diálogo devolve o foco.
- Contraste: texto normal ≥ 4,5:1, texto grande e elementos gráficos essenciais ≥ 3:1, medido no fundo real.
- Mesma empresa, perfil, filtro e período no antes e no depois.

## Rollback seletivo

Cada fase altera um conjunto fechado de arquivos, listado no relatório da fase. Reverter = `git restore`/`git revert` desses arquivos ou do commit da fase. Nunca `reset --hard` nem `clean`. Como o destaque é opt-in, remover a propriedade `appearance` de um consumidor devolve o card ao estado anterior sem tocar a primitiva.
