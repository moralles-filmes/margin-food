# Margin Food — Prompts do Redesign Visual V2

## Comece aqui

Copie esta pasta inteira para `docs/redesign-margin-food-v2/` dentro do repositório do Margin Food. A pasta contém instruções e referências; copiá-la não altera o funcionamento do aplicativo.

Abra o Claude Code na raiz do repositório e cole o conteúdo de `PROMPT-INICIAL.txt`. O primeiro chat deve executar SOMENTE a Fase 00. As fases seguintes implementam a alteração em sequência.

Não envie os 18 prompts juntos como ordem de execução em um único chat. O arquivo `TODOS-OS-PROMPTS.txt` é uma cópia integral para consulta/arquivamento. O mestre orienta todas as etapas e os arquivos em `prompts/` detalham uma fase por vez.

Ao concluir uma fase, o Claude deve criar `PROXIMO-CHAT.md` e mostrar seu conteúdo na resposta. Abra outro chat no mesmo repositório e cole esse prompt de continuidade. Quando o handoff se perder, use `PROMPT-RETOMADA.txt` para reconciliar o estado documentado.

## Conteúdo

- `PROMPT-INICIAL.txt`: primeira mensagem pronta.
- `PROMPT-MESTRE.md`: contratos de segurança, visual, cobertura, testes e continuidade.
- `PLANO-DE-FASES.md`: sequência 00–17.
- `prompts/`: 18 instruções detalhadas por fase.
- `referencias/`: 14 imagens existentes, com manifesto de prioridade.
- `templates/`: modelos para o Claude criar progresso, cobertura, decisões, pendências, relatório e handoff.
- `TODOS-OS-PROMPTS.md` e `.txt`: mestre e fases na íntegra.
- `FONTES-E-LIMITES.md`: fontes consultadas, limites e critérios.

## Primeiro marco

As fases 00, 01, 02 e 03 entregam, respectivamente, diagnóstico, componentes, sidebar/troca de loja e Dashboard Financeiro. A Fase 03 é o prompt específico do dashboard solicitado. As demais fazem a migração integral dos módulos.

Os oito cards financeiros ficam preservados. A identidade azul vale para todos os módulos, mas não significa pintar todos os indicadores de azul. Nenhum prompt autoriza mudar cálculos, permissões, dados ou publicar em produção.

## Controle de execução

Os templates começam como não executados e ficam separados para não sobrescrever progresso real. O Claude deve criar os documentos de trabalho na raiz desta pasta durante a Fase 00. O histórico antigo do projeto permanece intacto.

A existência deste pacote não significa que o sistema já foi alterado ou validado. Cada fase precisa produzir evidência dos componentes reais e parar antes de iniciar a próxima.
