# Fase 12 — estabilização integrada

Data: **16/09/2026**. Branch local: `codex/multiunit-stabilization-f12`. A entrega fecha as correções tecnicamente acessíveis e produz um pacote de release integrado; **não libera produção**. Não houve push, deploy, migration/repair remoto, job produtivo, mensagem externa nem cópia de dados privados.

## Resultado principal

As incompatibilidades F3/F7 foram resolvidas por avanços novos, sem editar migrations históricas:

- F3 aceita o estado atual do Salmão e conserva a assinatura DATE de dez argumentos, o wrapper TEXT com validade, FEFO, locks/uniques, logs e estorno antes do cancelamento. A sobrecarga antiga de nove argumentos continua ausente.
- F7 conserva exatamente as 17 policies do hotfix `20260916153928`, digest `9a49d198cabb2ec4f9fd1984e8c20404`, inclusive `operational_active_lookup` e o comportamento ALLOW granular + DENY legado. A candidata antiga de referências é substituída por verificação sem mutação.
- F6 recebeu somente o avanço de compatibilidade necessário para o `search_path` endurecido já produzido por F5.

O ensaio partiu de clone novo equivalente ao catálogo vivo, aplicou os 15 arquivos na ordem exata do [manifesto](../../../release/multiunit-stabilization-20260916/manifest.generated.json) e passou. Evidência: [release-rehearsal.json](release-rehearsal.json).

## Correções funcionais e de segurança

- leitores de catálogo, saldo, requisições e análise de estoque agora exigem tenant + RBAC; helpers internos/debug e overloads de relatórios quebrados deixam de ser contratos públicos;
- FKs compostas amarram itens/auditoria ao pai e tenant; turno simples foi removido; writers de turnos usam chaves existentes no registry;
- planejamento deixa de referenciar colunas inexistentes; inventário rápido usa tipo válido e `produtos.saldo_atual`, com replay idempotente;
- edição de Salmão é uma transação; cancelamento de estoque, cascata Salmão, estorno e auditoria são uma transação, na ordem correta;
- checklist, recebimento e exclusão de Compras são atômicos; o recebimento exige também `approve`, cobre item livre, persiste lote idempotente e recalcula total determinístico;
- criação/edição de pedido inclui notificação na transação; conversão de cotação usa chave determinística e passou corrida real sem `23505`;
- requisição de compra cria/edita/ignora/converte pai, filhos, total e auditoria em uma transação, validando `item.id` contra pai + tenant;
- RH propaga erros de leitura e persiste banco de horas + auditoria em uma transação; auditorias de ficha técnica e requisição de estoque deixam de ser silenciosas;
- filtros de pedidos, planejamento e inventário descartam respostas atrasadas; paginação fallback de pedidos desempata por `(created_at,id)`;
- Storage RH usa estado `PENDING_UPLOAD → ACTIVE` e `ACTIVE → DELETING`, path prefixado pela empresa e compensação/retry explícitos.

Os contratos TypeScript incluem os novos RPCs, a tabela de lotes de recebimento e `rh_documentos.storage_state`.

## Ensaios novos

| Camada | Resultado | Limite |
|---|---:|---|
| Sequência SQL integrada | **PASS** | PostgreSQL 17.10, clone `moralles_stabilization_release_20260916221043` |
| F2/F3/F4/F5/F6/F7 | **82 / 175 / 146 / 67 / 80 / 248** | Cada suíte em clone obtido no ponto exato da sequência |
| Residual integrado | **35 PASS** | Transação revertida; fixtures sintéticas |
| Concorrência RFQ | **PASS** | Duas sessões reais: 1 pedido, 1 item, 1 chave; uma criação e um replay |
| Catálogo final | **PASS** | 150 tabelas, 402 funções, 596 policies públicas, 4 Storage; hotfix 17 intacto |
| Vitest | **789/789 em 101 arquivos** | Transporte/UI simulados onde aplicável |
| TypeScript app/node | **PASS/PASS** | Tipos do candidato local |
| Build | **PASS** | Avisos preexistentes de bundle e Browserslist |
| ESLint | **0 erros / 1.363 warnings** | Inclui worktree local fora deste escopo |
| RBAC | **0 blockers / 2 important / 19 info** | Um important em `admin-users` é baseline; o detector de delete não reconhece a confirmação interna de `TableActions` |
| `security:check` | **exit 0; SQL SKIPPED** | Sem `SUPABASE_URL`/`SB_SECRET_KEY`; não aprova o banco |
| Produção READ ONLY | **856 versões, 356 funções, 595 public + 4 Storage policies** | [live-readonly.json](live-readonly.json); candidato ainda ausente |

Deno não está instalado no PATH desta sessão; os handlers alterados foram analisados por ESLint/TypeScript do projeto e os caminhos transacionais foram exercitados no PostgreSQL, mas o `deno check`/gateway hospedado não foi reexecutado nesta fase.

## Decisão

O **candidato local está pronto para revisão técnica**, com cadeia F2–F8 + residual aplicável em clone equivalente ao vivo. Produção permanece bloqueada por quatro dependências externas: restauração de backup privado autorizada, configuração/ensaio do scheduler real, confirmação dos consumidores externos e gateway hospedado de staging. Essas dependências, responsáveis e próximos passos estão na [matriz](MATRIZ-ACEITE.md) e no [plano operacional](PLANO-PUBLICACAO-RECUO.md).

C01/C02/H01/H02/H03/H04/H05/M01 continuam abertos no vivo até publicação autorizada e pós-validação real; teste local não os encerra.
