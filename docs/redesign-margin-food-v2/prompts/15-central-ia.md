# PROMPT — FASE 15 • Central de IA

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Melhorar a apresentação e a operação da Central de IA existente, sem criar agentes, ferramentas ou contratos de integração novos.

## Leitura dirigida

Leia CentralIAView, hooks/componentes de chat, renderizadores, ações e configurações realmente referenciados, permissões e mecanismos existentes de confirmação. Verifique se há assistente flutuante neste produto antes de incluí-lo no escopo.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Sidebar, cards brancos, botões e estados da biblioteca. Não usar telas do aplicativo pessoal como fonte funcional.

## Implementação / entregáveis

1. Reorganize navegação, histórico e conversas, cabeçalho contextual, seletor de opções existentes e área de mensagens.
2. Harmonize balões/painéis, markdown, listas, tabelas e blocos de código, com quebra de linha e scroll localizado. Não permitir que uma resposta longa alargue a página inteira.
3. Mantenha composer acessível com anexos/ações já existentes, estado de envio, progresso, streaming, erro e retry. Não apresentar confirmação de ação antes do retorno real.
4. Se já houver cartões de resultado, sugestões ou ações, use a família visual comum sem inventar conteúdo ou métricas de IA.
5. Preserve aprovação, contexto da empresa, limites de permissão e resultados das ferramentas. Não converter uma ação de confirmação explícita em execução automática.
6. Revise responsividade com teclado virtual e conversa longa; nada deve cobrir o campo de envio. Mantenha scroll estável sem puxar o usuário para baixo continuamente.
7. Se houver widget flutuante no Margin Food, harmonize-o e valide abrir/fechar, posição e sobreposição; se não houver, não criar o widget do sistema pessoal.
8. Mantenha sanitização de conteúdo, links e proteções atuais, mesmo quando o visual sugerir HTML rico.

## Invariantes específicos

Sem mudança de provedor/modelo/prompts de negócio, backend de IA, tracking, tokens, custos, ferramentas ou integrações. Sem enviar dados reais a provedor durante QA sem autorização. Não remover autorização/confirmar ferramenta automaticamente. Não executar HTML arbitrário de mensagens para reproduzir formato.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Fixture de conversa curta/longa, tabela larga, código, link, resposta em streaming, erro, cancelamento se existir, anexo inválido, teclado e empresa trocada. Testar segurança de renderização conforme testes atuais, preservação de confirmações e acesso. Não afirmar que uma integração real foi validada com um mock visual.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/15-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 16. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 15.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
