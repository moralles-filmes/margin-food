# Fase 12 — estabilização integrada

Data: **16–17/09/2026**. Branch: `codex/multiunit-stabilization-f12`. Apó os gates no staging privado `jiufikblnfivgynrbfyq`, o usuário autorizou expressamente a publicação no projeto real `wuzxpbixprrgssoeeaez`. Banco, cinco Edge Functions e frontend foram publicados em 17/09/2026. Não houve `migration repair`, backfill de histórico, disparo de job produtivo, mensagem externa ou cópia de payload Storage. Dumps brutos e credenciais ficaram fora do Git; a evidência versionada contém apenas contagens, hashes e estados.

## Resultado principal

As incompatibilidades F3/F7 foram resolvidas por avanços novos, sem editar migrations históricas:

- F3 aceita o estado atual do Salmão e conserva a assinatura DATE de dez argumentos, o wrapper TEXT com validade, FEFO, locks/uniques, logs e estorno antes do cancelamento. A sobrecarga antiga de nove argumentos continua ausente.
- F7 conserva exatamente as 17 policies do hotfix `20260916153928`, digest `9a49d198cabb2ec4f9fd1984e8c20404`, inclusive `operational_active_lookup` e o comportamento ALLOW granular + DENY legado. A candidata antiga de referências é substituída por verificação sem mutação.
- F6 recebeu somente o avanço de compatibilidade necessário para o `search_path` endurecido já produzido por F5.

O ensaio partiu de clone novo equivalente ao catálogo vivo, aplicou os 16 arquivos na ordem exata do [manifesto](../../../release/multiunit-stabilization-20260916/manifest.generated.json) e passou. Evidência: [release-rehearsal.json](release-rehearsal.json).

O builder agora reproduz duas compatibilidades descobertas no staging: ordenação binária no preflight F6 e comparação canônica das ACLs da notificação F7. O 16º avanço corrige o contrato Storage RH. Regenerar o release conserva os 16 hashes esperados; não há correção manual fora do gerador.

## Staging hospedado — O01–O04

O projeto `Margin Food Staging F12` foi criado na organização autorizada, em `sa-east-1`, e recebeu snapshot lógico completo do banco, Auth, grants, funções e metadados Storage. A origem tinha um bucket, zero objetos e zero bytes, portanto não havia payload Storage para copiar. Auth (26 tabelas/192 linhas no snapshot) e o schema privado (1.245 linhas) conferiram; a diferença pública observada na primeira validação foi limitada a 161 writes que chegaram à produção depois do snapshot. RTO aproximado da criação do projeto à primeira validação: 54 minutos; idade do ponto de recuperação nessa validação: cerca de 14 minutos.

As 16 versões forward foram aplicadas somente no staging, cinco Edge Functions foram implantadas e a matriz hospedada fechou **25/25**, com limpeza completa das identidades, empresas, reservas e segredo sintéticos. Realtime entregou INSERT/UPDATE e o consumidor relê por RLS. As recusas de tenant em `purchase-requisitions`, antes fail-closed como 500, agora retornam 403.

Nenhum scheduler real foi encontrado: sem `pg_cron`, tabela de jobs, workflow GitHub, cron no `vercel.json`, hook de banco ou `CRON_SECRET` persistente. O handler foi ensaiado com segredo efêmero (401/400/200 e auditoria) e o segredo foi removido. Também não foram encontrados roles/grantees externos, foreign servers, logical subscriptions, webhooks de banco ou configuração de BI/cache externo. Os consumidores internos Edge/Realtime/Storage foram inventariados. Essa é uma conclusão negativa delimitada: uma integração fora dos sistemas inspecionados que reutilize credencial padrão não pode ser detectada, mas nenhuma foi informada ou observada.

Evidência sanitizada: [staging-o01-o04.json](staging-o01-o04.json).

## Staging hospedado — O08/O09

O08 foi executado no bundle de produção local apontado exclusivamente ao staging. Chromium cobriu desktop e 390×844, troca A→B com contexto atrasado, falha de transporte + retry, alternância realizado/orçado/projeção, PDF/PPTX reais da apresentação, ata aprovada com 35 itens e seus PDF/PPTX, corrida de filtro no mesmo lifetime, decisão/plano de ação e paginação 20+1. Nenhum screenshot ou byte exportado foi persistido; conta, governança e identidade sintéticas terminaram em zero. Evidência: [staging-o08.json](staging-o08.json).

O09 detectou e corrigiu duas incompatibilidades que a restauração de catálogo não exercitava: a policy aceitava dois segmentos enquanto a UI escrevia `empresa/colaborador/arquivo`, e o DELETE de metadata era sempre negado. O avanço `20260916221500` autoriza o caminho canônico, mantém a compatibilidade legada tenant-scoped durante o rollout e alinha as quatro operações de metadata às permissões granulares. A saga passou upload/delete reais, recusa cruzada, compensação depois de metadata e objeto, rollback de falha de remoção, retry de `DELETING` e reconciliação de `PENDING_UPLOAD`; zero objetos/metadata/identidade sintéticos ao final. Evidência: [staging-o09.json](staging-o09.json).

## Produção autorizada

Antes da janela foi criado backup lógico final de banco e roles fora do Git. Os artefatos têm, respectivamente, 11.364.050 e 5.786 bytes, com SHA-256 `1c0478363cf4ac6cfeb881c7683e027c6e7125e4fe2385cb6171b622c08f6ea5` e `d872a90bdb40e3604eae65ea5eae237945db0b3696ae99cb4b214cfa28cc0e8d`. O dump inclui seis schemas e 3.267 entradas de TOC; o export de roles não contém senhas.

As 16 migrations forward `20260916220000`–`20260916221500` foram registradas no histórico real. Dois preflights pararam a execução antes da respectiva mudança porque ACLs semanticamente iguais tinham ordem textual diferente no catálogo. O builder foi corrigido para comparar ACLs de forma canônica, o release completo foi reensaiado e a cadeia restante foi simulada em uma transação produtiva com `ROLLBACK` antes da aplicação final. Nenhuma versão foi reparada, removida ou marcada manualmente.

A validação final do banco confirmou 872 versões, última `20260916221500`, 150 tabelas públicas, 366 funções públicas, 596 policies públicas, 4 policies Storage e 6 tabelas Realtime. O hotfix conserva 17 policies e digest `9a49d198cabb2ec4f9fd1984e8c20404`; a assinatura nova de Salmão existe, a sobrecarga antiga não, `deactivate_produto` e o guard canônico de documentos RH existem. Storage permanece com 0 objetos/0 bytes, não há subscription lógica nem `pg_cron`, e `z_canary_test` continua sem grant de cliente.

As cinco Edge Functions ficaram `ACTIVE`: `purchase-requisitions` v11, `requisicao-estoque` v15, `rh` v11, `scheduled-jobs` v8 e `ficha-tecnica` v12. Todas responderam preflight da origem `https://www.marginfood.com`, devolveram `null` para origem não autorizada e `401` sem autenticação; nenhum job foi executado.

O fast-forward `80dcf4e→2ec5a38` foi publicado em `main`, acionando o Vercel. `https://www.marginfood.com` respondeu 200 pelo Vercel e serviu os mesmos hashes JS/CSS do build local validado. A tela de login carregou em navegador isolado, sem exceção de página. Consultas anônimas iniciadas pelos stores antes do login foram recusadas pelo banco (`42501`/`COMPANY_ACCESS_DENIED`) e geram ruído no console; o comportamento é fail-closed e fica como follow-up de frontend, não como falha de isolamento.

Evidência sanitizada da janela: [production-release.json](production-release.json).

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
- Storage RH usa estado `PENDING_UPLOAD → ACTIVE` e `ACTIVE → DELETING`, path canônico prefixado pela empresa, DELETE tenant-scoped e compensação/retry explícitos.

Os contratos TypeScript incluem os novos RPCs, a tabela de lotes de recebimento e `rh_documentos.storage_state`.

## Ensaios novos

| Camada | Resultado | Limite |
|---|---:|---|
| Sequência SQL integrada | **PASS** | PostgreSQL 17.10, clone `moralles_stabilization_release_20260917040212` |
| F2/F3/F4/F5/F6/F7 | **82 / 175 / 146 / 67 / 80 / 248** | Cada suíte em clone obtido no ponto exato da sequência |
| Residual integrado | **39 PASS** | Transação revertida; fixtures sintéticas, incluindo contrato Storage canônico/legado e DELETE exato |
| Concorrência RFQ | **PASS** | Duas sessões reais: 1 pedido, 1 item, 1 chave; uma criação e um replay |
| Catálogo final | **PASS** | 150 tabelas, 402 funções, 596 policies públicas, 4 Storage; hotfix 17 intacto |
| Vitest | **798/798 em 102 arquivos** | Inclui os 9 testes focais da saga Storage; transporte/UI simulados onde aplicável |
| Saga Storage focal | **9/9 (incluídos acima)** | Estados, conflitos e compensações; complementada por bytes reais no staging |
| TypeScript app/node | **PASS/PASS** | Tipos do candidato local |
| Build | **PASS** | Avisos preexistentes de bundle e Browserslist |
| ESLint | **0 erros / 1.359 warnings** | Inclui worktree local fora deste escopo |
| RBAC | **0 blockers / 1 important / 19 info** | O important em `admin-users` é baseline; 11 ocorrências de `select('*')` permanecem allowlisted |
| `security:check` | **exit 0; SQL SKIPPED** | Sem `SUPABASE_URL`/`SB_SECRET_KEY`; não aprova o banco |
| Produção pós-release | **PASS de catálogo/contratos** | 872 versões; 366 funções públicas; 596 public + 4 Storage policies; 16/16 forward presentes |
| Staging hospedado | **PASS O01–O04, O08 e O09** | 16 versões; gateway/scheduler/Realtime 25/25; browser 12 checkpoints; Storage 8 checkpoints; limpeza sintética completa |

O binário nativo do Deno não está no PATH; `bun x deno 2.9.6` executou `deno check --no-lock` nos cinco handlers implantados e o teste CORS compartilhado, todos com PASS.

Os advisors pós-DDL não reportaram erro de segurança, mas conservaram warnings legados documentados na evidência. A checagem direta encontrou `public.z_canary_test` com RLS desabilitada; `anon` e `authenticated` não possuem privilégio de tabela. Nenhuma correção foi aplicada sem decisão explícita.

## Decisão

Release **publicado em produção** com backup, staging, aplicação forward, Edges, `main` e frontend confirmados. C01/C02/H01/H02/H03/H04/H05/M01 têm agora seus objetos corretivos presentes e os contratos/ACLs pós-release conferidos no banco vivo; as jornadas mutáveis completas permanecem comprovadas no staging, pois não foram repetidas com dados empresariais reais. A ausência de scheduler/consumer externo continua sendo uma invariante operacional: se um deles for criado ou identificado, O02/O03 reabrem.

Não foi executada classificação/backfill do histórico ambíguo de logs. A observação imediata deve acompanhar erros 401/403/42501, timeout, `23505`, falhas de Storage e regressão de isolamento por unidade; sem payload privado.
