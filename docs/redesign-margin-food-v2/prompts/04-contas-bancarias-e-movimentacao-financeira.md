# PROMPT — FASE 04 • Contas bancárias, lançamentos, conciliação e fluxo

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Levar o padrão aprovado aos saldos de contas e às telas de movimentação financeira, com clareza entre posição de saldo, extrato e conciliação.

## Leitura dirigida

Leia `financeiro/ContasBancariasSection.tsx`, `LivroRazaoSection.tsx`, `ConciliacaoBancariaSection.tsx`, `FluxoCaixaSection.tsx`, integração com FinanceiroView, consulta de saldo e `loadSaldoExtrato` ou equivalentes atuais. Inspecione formulários, máscaras, permissões e controles de edição.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `02-contas-bancarias.png`, `00-card-azul-aprovado.png`, `07-sidebar-e-componentes.png`.

## Implementação / entregáveis

1. Redesenhe os cards de contas com a família azul aprovada onde pertinente: nome, tipo, saldo, informações existentes, status e ações. A grade pode ter múltiplos cards azuis de mesmo papel, sem esconder saldo negativo.
2. Distinga saldo atual do sistema, saldo inicial, saldo do extrato e saldo na data de referência quando esses dados existirem. Rótulo e data devem estar próximos do valor.
3. Preserve a leitura do extrato por conta, pesquisa, filtro por tipo, criação/edição e exportação. Ações administrativas não podem competir visualmente com o saldo.
4. Organize o Livro Razão e lançamentos com filtros claros, valores alinhados, identificação de receita/despesa, detalhes acessíveis e ações existentes.
5. Harmonize conciliação e importação: estados, tabelas de correspondência/divergência, etapas e prévias. Não executar confirmação ou conciliação real para testar.
6. Refaça molduras, filtros e tabelas do fluxo de caixa mantendo saldo inicial/final, períodos, ordenação e navegação.
7. Preserve unidades e datas de referência. Se houver resumo agregado no mockup sem fonte confiável, não somar apenas as contas visíveis/paginadas como total geral.
8. Revise desktop/mobile, dark e modais de cadastro; conserve guard de alterações não salvas e concorrência.

## Invariantes específicos

Comparar banco e sistema na mesma data, conforme regra já existente. Não trocar saldo calculado por saldo inicial nem chamar de “disponível” um valor com semântica diferente. Não modificar importadores, matching, transações, atualização de saldo, permissões ou payloads. Sem pagamentos/transferências reais.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture com conta positiva, negativa, zerada, nome longo, caixa físico e saldo de referência histórica. Validar abrir extrato com conta correta, busca/filtros, modais, erros de importação e actions existentes em ambiente isolado. Comparar saldos e filtros antes/depois; testar acesso restrito à conciliação, teclado e mobile.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/04-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 05. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 04.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
