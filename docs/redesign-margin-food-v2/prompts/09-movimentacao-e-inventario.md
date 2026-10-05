# PROMPT — FASE 09 • Movimentação Operacional e Inventário Geral

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Organizar as telas de operação e contagem para rapidez e clareza, preservando leitor físico, câmera, etapas e efeitos no estoque.

## Leitura dirigida

Leia a implementação real de Movimentação Operacional e InventarioView, suas seções, listas, modais, serviços de leitura, permissões e regras. Inclua solicitações, requisições e telas de detalhes efetivamente ligadas a esses módulos.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. Família de estoque, mobile e componentes; essas referências não especificam novos fluxos de inventário.

## Implementação / entregáveis

1. Padronize cabeçalho, contexto de unidade/setor, filtros, tabelas, status e ação principal de cada tela.
2. Organize formulários de movimentação em blocos com origem/destino, itens, quantidades e confirmação apenas quando esses campos já fizerem parte do fluxo.
3. Em inventário, preserve criação, listagem, detalhes, progresso, divergências e conclusão. A apresentação deve deixar claro o estado atual e quais ações estão disponíveis.
4. Dê destaque consistente à escolha Lista/Via Código e à interação de leitura. Mensagens de produto encontrado, não encontrado e duplicidade devem ser reconhecíveis e acessíveis.
5. Revise a interface da câmera sem alterar decoder, formato de código, integração com leitor ou evento de confirmação. Garanta área visível, botão de fechar, erro de permissão e alternativa já existente.
6. No celular, campos e ações devem permanecer utilizáveis com teclado virtual e câmera. Não cobrir confirmação/contador com footer fixo.
7. Reorganize o resumo de divergências, sem transformar valor absoluto ou quantidade em outro conceito. Preserve dados salvos e retomada conforme comportamento atual.
8. Documente e valide fluxos com o hardware disponível; mantenha limitações explícitas quando só houver emulação.

## Invariantes específicos

Não iniciar/finalizar inventário real, não criar ajustes de estoque para teste e não remover confirmações. Não alterar significado de contagem, deduplicação, reconciliação, código, lote ou persistência. Não afirmar que leitor/câmera físicos foram testados se foram apenas simulados.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Em ambiente isolado: criar/abrir/editar/retomar/encerrar conforme permissões, contagem por lista e leitura, códigos repetidos, produto ausente, câmera negada, modal fechado e orientação móvel. Verificar foco do leitor físico e atualização visual sem perda de entradas. Sem hardware, registrar teste simulado e pendência física separadamente. Comparar payloads/eventos e saldos esperados antes/depois.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/09-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 10. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 09.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
