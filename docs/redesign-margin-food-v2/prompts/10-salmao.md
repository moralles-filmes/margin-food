# PROMPT — FASE 10 • Dashboard e Controle de Salmão

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Padronizar Dashboard Salmão, Entradas, Manipulação, Estoque, Metas e Planejamento específico, mantendo a rastreabilidade e as métricas próprias.

## Leitura dirigida

Leia SalmonControlView, DashboardView, EntriesView, ManipulationView, StockView, GoalsView, componentes de planejamento usados por Salmão e handlers de navegação, store e testes pertinentes.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Card azul, biblioteca de componentes, referências de estoque/planejamento aplicadas à identidade, não aos cálculos de Salmão.

## Implementação / entregáveis

1. Atualize navegação e cabeçalhos sem modificar UI_TO_REGISTRY, seleção de abas persistidas ou os dois acessos existentes pela sidebar.
2. Renove cards do dashboard mantendo todos os indicadores atuais, unidades, metas e informações auxiliares. Escolha destaque por relevância, sem confundir valor comprado com saldo ou margem.
3. Harmonize gráficos de entradas, custos, consumo, rendimento e comparativos realmente existentes. Identifique R$, kg, percentual e período com precisão.
4. Reorganize a lista e formulário de entradas, mantendo lote/fornecedor/datas/valores e validações existentes.
5. Na manipulação, melhore hierarquia entre item de origem, pesagens, rendimentos, perdas e conclusão. Preserve a pré-seleção ao iniciar a partir do estoque.
6. Renove estoque e metas com status, tabelas e controles consistentes. Reutilize os componentes de planejamento sem duplicá-los.
7. Preserve históricos, detalhes, anexos e exportações presentes. Não inserir métricas novas sem fonte nem trocar dados operacionais por ilustrações.
8. Registre a cobertura de cada aba e seus diálogos no desktop/mobile.

## Invariantes específicos

Pesagens, rendimentos, perdas, custos, lote, saldo e arredondamentos não mudam. Não substituir quilogramas por unidades nem custo total por custo/kg. Preserve onStartManipulation, preSelectedEntryId e qualquer contrato equivalente atual. Não apagar acesso duplicado sem avaliação explícita.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixtures com lotes, rendimento baixo/alto, falta de custo, valores longos e zero. Testar entrada → estoque → manipulação pré-selecionada → retorno, metas e planejamento por categoria, perfis sem uma das abas, filtros e exportações. Confirmar números e payloads intactos; validar gráficos/tabelas em ambos os temas e dispositivos.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/10-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 11. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 10.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
