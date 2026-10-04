# PROMPT — FASE 14 • RH / Pessoas

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Aplicar o padrão de cards, gráficos, tabelas e formulários a todas as áreas de RH identificadas, com sigilo e clareza de valores/períodos.

## Leitura dirigida

Leia RhView, `rh/DashboardRhSection.tsx`, cadastros e todas as abas/diálogos reais de colaboradores, ponto, banco de horas, folha, benefícios, férias/afastamentos e demais recursos encontrados. Não assumir cobertura pelo dashboard apenas.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `06-rh-pessoas.png`, biblioteca de componentes e card azul. Todos os indicadores atuais prevalecem sobre simplificações do mockup.

## Implementação / entregáveis

1. Preserve os oito indicadores atuais do dashboard: Headcount, Custo Total/mês, Custo Médio/colab, Benefícios/mês, Horas Extras, Absenteísmo, Atrasos (min) e Férias Pendentes, ou os equivalentes atuais confirmados.
2. Reorganize em grupos de equipe/custos e jornada/atenção. Use destaque coerente e mantenha alerta por regra existente, sem tratar todo custo de equipe como ocorrência crítica nova.
3. Renove distribuição por setor, custo da folha e horas extras com unidades R$/horas/minutos/% explícitas. Não depender apenas de nomes abreviados se isso gera ambiguidade.
4. Padronize seletores de período, lista de pessoas, ações, formulários e estados. Preserve permissões específicas para dados salariais e administrativos.
5. Revise todas as abas de ponto, jornada, folha, benefícios e férias encontradas, mantendo campos, validações e confirmações.
6. Não criar total consolidado por soma das primeiras páginas. Se a fonte atual for parcial, registrar a limitação funcional; não alterar consultas no escopo visual nem apresentar um total inventado.
7. Use somente pessoas e salários sintéticos nas evidências. Screenshots de dados reais precisam ser saneados.
8. Adapte desktop/mobile e tema escuro sem tornar tabelas de folha ilegíveis.

## Invariantes específicos

Não alterar fórmula de absenteísmo, folha, encargos, jornada, horas extras, benefícios ou férias. Não tratar revisão visual como revisão trabalhista. Não remover campos por serem sensíveis; respeitar a autorização de exibição vigente. Nenhuma aprovação/cálculo/pagamento real de RH para teste.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar perfil de acesso limitado, setores e nomes longos, headcount zero, grande equipe/paginação, custo e horas negativos quando suportados, período sem folha, férias pendentes e avisos. Conferir valores/units antes/depois, acesso às abas e exportações, formulários e foco no mobile. Identificar explicitamente falta de validação de módulos bloqueados por credenciais.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/14-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 15. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 14.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
