# PROMPT — FASE 03 • Dashboard Financeiro completo

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Implementar a tela financeira aprovada, preservando os oito indicadores, os cálculos, as ações e os três conjuntos de análises existentes.

## Leitura dirigida

Leia `DashboardFinanceiroSection.tsx`, `DashboardCharts.tsx`, `FinanceiroView.tsx`, `KpiCard`, formatadores, função de variação, callbacks de navegação e testes atuais. Consulte o contrato das RPCs apenas para compreender a semântica; não o altere.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `01-dashboard-financeiro.png`, `01b-dashboard-detalhamento.png`, `01c-dashboard-mobile.png`, `00-card-azul-aprovado.png`.

## Implementação / entregáveis

1. Reorganize o cabeçalho: título, descrição, filtros Dia/Mês/Período, seleção de data, Atualizar e exportações PDF/Excel. Todos continuam ligados aos handlers e permissões existentes.
2. Agrupe Posição Financeira: Saldo em Caixa; Contas a Receber; Contas a Pagar; Contas Vencidas. Agrupe Desempenho do Período: Receita do Período; Despesa Realizada; Despesas Provisionadas; Resultado.
3. Use duas linhas de quatro no desktop, responsivas à largura real do conteúdo. Preserve ordem e todos os indicadores no mobile, em duas colunas quando couberem e uma quando necessário. Não usar carrossel.
4. Aplique o card azul ao saldo e cards claros com semântica aos demais. Números, sinal, centavos, quantidade de vencidos, descrições e comparativos devem permanecer completos. Não fazer vencido zero parecer ocorrência crítica ativa.
5. Preserve clique e destino de cada indicador: saldo/fluxo; receber/status; pagar; vencidas/status; receita/despesa com tipo e período; provisionadas; resultado/DRE, conforme mapeamento confirmado no código. Não prometer filtro que o destino não recebe.
6. Renove Receitas vs Despesas e Resultado Mensal com eixos, legenda, espaço e tooltip consistentes. A janela histórica mantém sua semântica separada do período do resumo. Identifique cada intervalo claramente.
7. Apresente Despesas por Categoria preferencialmente como ranking horizontal com valor completo e nome acessível, usando a mesma fonte e recorte. Se o percentual for calculado sobre o Top 8 recebido, rotule “participação no Top 8”. Não exibir esse subtotal como a despesa realizada total.
8. Acrescente a explicação visual de despesas provisionadas usando somente os dados já carregados e a fórmula confirmada. Não tratar esse total como terceira despesa somável a realizada e a pagar.
9. Atalhos para submódulos existentes podem ser adicionados desde que usem o fluxo real, respeitem permissões e não façam consulta nova. Não criar módulos, últimas transações ou metas fictícias para preencher o layout.
10. Preserve loading, atualização por eventos, erro, sem acesso, exportando e estados vazios. Período em andamento pode ganhar aviso informativo derivado do recorte real; não mudar comparativos por conta própria.
11. Capture versões desktop, detalhamento e mobile. Compare com as imagens específicas do dashboard, não com os valores diferentes da colagem inspiracional.

## Invariantes específicos

Nenhum dos oito cards pode ser removido, renomeado para mudar significado, ocultado no mobile ou substituído por “resumo”. Não hardcodar os valores R$ 87.519,20 etc. Não sincronizar silenciosamente filtros com semânticas distintas. Não alterar fórmulas, regime, RPC ou exportação para adequar o desenho. Não atribuir resultado do dashboard e resultado de DRE como idênticos sem verificar seus contratos.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Com mesma fixture/empresa/filtro, verificar igualdade dos oito valores antes/depois, inclusive resultado negativo e provisionadas. Testar Dia, Mês, intervalo customizado, datas inválidas, Atualizar e todos os cliques. Comparar conteúdo e permissões de PDF/Excel. Validar card com valor grande, nomes longos, zero, ausência de comparação, erro e loading; gráfico com ponto único e série negativa; categorias cujo Top 8 não corresponde ao total. Testar seis larguras, zoom, temas e sidebar redimensionada. Falha de navegação preexistente deve ser evidenciada separadamente, não escondida.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/03-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 04. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 03.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
