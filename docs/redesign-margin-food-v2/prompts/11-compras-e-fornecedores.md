# PROMPT — FASE 11 • Compras, cotações e fornecedores

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar a V2 ao fluxo completo de compras e seus cadastros, mantendo comparações, aprovação e navegação por registros.

## Leitura dirigida

Leia ComprasView, PedidosComprasMercadoView, ShoppingChecklistView, AlertasFaltaEstoqueView, CalendarioLembretesView, RankingFornecedoresView, SuppliersView, CotacaoView e componentes internos. Confira badges, requestNavigation, seletores e permissões de cada ação.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Biblioteca de componentes, estilo de listas/tabelas das referências de estoque e financeiro; colagem apenas como inspiração secundária.

## Implementação / entregáveis

1. Harmonize Pedidos & Compras Mercado, Checklist Compra, Itens em Falta, Cotação, Calendário, Ranking e Fornecedores.
2. Revise cards/resumos somente com fontes confiáveis; status e contagens devem manter a mesma definição do backend/store.
3. Organize pedidos com identificação, fornecedor, status, datas, itens, totais e ações existentes; detalhes devem ser acessíveis sem cortar informação importante.
4. Na cotação, torne comparações de fornecedores legíveis, com unidades e critérios atuais. Matrizes largas podem ter scroll interno e identificação de colunas; não esconder concorrentes necessários à comparação.
5. Renove checklist, prioridades e vínculo para pedido sem alterar criação/aprovação. Preservar abertura de pedido específico por notificação ou atalho.
6. Padronize calendário/lembretes, cadastro de fornecedor e ranking; não inventar score, prazo ou economia garantida.
7. Preserve filtros, paginação, ações em lote, importação/anexos, exportação e máscaras presentes. A paleta deve ajudar a distinguir pendência e conclusão, não reclassificá-las.
8. Garanta uso móvel para conferência de itens e interação com formulários.

## Invariantes específicos

Não alterar cálculo de preço, impostos, unidade, aprovação, status, envio de cotação, integração ou geração de pedido. Sem disparos reais a fornecedores. Não mascarar as permissões por exibir ações sempre desabilitadas quando a regra atual exige ocultação.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar cotação com vários fornecedores, itens em unidades diferentes, pedidos longos, valor zero/ausente conforme contrato, filtro vazio, perfil leitor/aprovador, badges e abrir registro por deep link/notification. Confirmar que botões permanecem associados às ações originais, sem duplo submit. Validar a matriz larga no mobile sem scroll global.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/11-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 12. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 11.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
