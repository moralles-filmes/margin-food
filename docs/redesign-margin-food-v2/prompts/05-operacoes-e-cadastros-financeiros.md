# PROMPT — FASE 05 • Contas a pagar/receber, códigos, caixa e cadastros

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Padronizar as operações e cadastros restantes do Financeiro sem perder campos, filtros, rateios, comprovantes e ações.

## Leitura dirigida

Leia ContasPagarSection, ContasReceberSection, CodigosPagamentoSection, FechamentoCaixaSection, AlertasSection, RecorrenciasSection, CategorizacaoSection, CadastroBaseTree, PlanoContasFinSection, CentrosCustoFinSection e todos os diálogos/subcomponentes realmente ligados a essas telas. Divida a fase em subfases quando necessário.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Família visual de `01-dashboard-financeiro.png`, `07-sidebar-e-componentes.png`; `90-colagem-inspiracao.png` apenas para acabamento, nunca para regra ou dados.

## Implementação / entregáveis

1. Revise contas a pagar/receber: resumo, busca, status, períodos, fornecedor/cliente, categoria, vencimento e ações existentes. Diferencie valor previsto, quitado e em aberto somente segundo as fontes atuais.
2. Organize formulário de boleto por seções legíveis, mantendo campos obrigatórios, competência, vencimento, categorias/rateio e vínculo com CMV. Não eliminar seleção por linha de rateio para simplificar o visual.
3. Em códigos de pagamento, exiba resumo e ação de copiar clara, feedback e estados inválidos/vazios. O conteúdo copiado deve ser exatamente o código/PIX original, mesmo se a apresentação visual agrupar caracteres.
4. Refaça fechamento de caixa com números, unidades, período, meios de pagamento e estados bem apresentados. Atualize gráficos sem mudar cálculo nem origem do faturamento.
5. Melhore alertas e recorrências com prioridade, calendário/lista e estado de próxima ocorrência somente quando já existirem. Não alterar geração, agenda, notificações ou automatizações.
6. Reorganize categorização, árvore de categorias, plano de contas e centros de custo preservando hierarquia, vínculos, edição e permissões.
7. Preserve anexos, máscaras, ações em lote, paginação, filtros, exportações, mensagens e guard de formulário sujo. No celular, permitir consultar detalhes e operar controles sem rolagem da página inteira na horizontal.
8. Registre cada tela/diálogo na matriz; não marcar o módulo inteiro apenas por alterar a tabela principal.

## Invariantes específicos

Nenhuma mudança de regra de pagamento, baixa, duplicidade, parcelas, conciliação, competência ou geração recorrente. Nenhum dado ilustrativo vira opção no cadastro. Não fazer chamadas de escrita reais. Não converter códigos longos em número, pois zeros à esquerda e fidelidade do conteúdo são essenciais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar título vencido/aberto/pago/cancelado conforme estados reais, boleto multicategoria com parte fora do CMV, linha sem categoria, código com zeros, PIX, anexos e erros. Copiar e comparar byte a byte o texto esperado em fixture. Validar filtros, calendário, permissões de leitura/edição/exportação, modal longo, teclado e formulário sujo. Confirmar que fechar a tela não executa pagamento nem salva mudanças implicitamente.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/05-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 06. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 05.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
