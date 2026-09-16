# Publicação e recuo — plano, não execução

**Não liberar automaticamente esta branch.** Há 14 candidatas F2–8 pendentes e incompatibilidades F3/F7 documentadas. F10 não autorizou resolver esses guards, publicar SQL, fazer repair, push ou deploy. O checklist abaixo é para a decisão coordenada futura.

1. Revalidar catálogo, histórico CLI, Edge hashes e Vercel/SHA antes de qualquer proposta. Preservar o hotfix vivo e as definições atuais de validade/estorno; não alterar hash esperado para aceitar corpo incompatível.
2. Resolver divergências por novas mudanças revisáveis, exercitar cadeia em clone vivo equivalente com fixtures e preflights. Não inferir ordem histórica de timestamp, não apagar/renumerar versões e não usar `--include-all` na raiz. Manter gate granular+legado+global e INITPLAN nas policies novas.
3. Cruzar calls F10 com contratos publicados: especialmente deactivate_produto, upsert_supplier_price e list_restricted_logs. Não regenerar tipos candidatos contra banco atrasado. Somente após contratos e dependências compatíveis propor lote mínimo backend/Edge/frontend com ordem explícita.
4. Obter prova de backup restaurável, scheduler/consumers externos/gateway e critérios de parada. Não atribuir disponibilidade desses recursos porque o teste local passou. Ensaiar recuo preservando Auth, memberships, empresa original, 149 tabelas, saldos/custos/histórico e Storage.
5. Propor publicação concreta para revisão, com checks, riscos e observação de 0/1/N unidades, troca, relogin, contexto perdido, rascunhos e exports. Nunca usar super-admin na UI para mascarar problema de granular ALLOW/legado DENY.

## Recuo frontend específico

Reverter o conjunto coerente de commits F10; não reverter apenas assinaturas de dataEvents/cache deixando consumidores novos. Um deploy anterior pode voltar a ler o namespace bancário legado; a versão nova não migrou nem apagou esses rascunhos. Não copiar rascunhos automaticamente entre namespaces/identidades para recuperar conveniência. A troca de bundle exige recarga controlada para eliminar closures/caches anteriores; eventos sem escopo vindos de abas antigas são ignorados pela versão nova.

Writes já confirmados no servidor permanecem confirmados. Após abort/timeout, consultar o estado em sua unidade antes de tentar novamente; respeitar optimistic lock e idempotência. Não executar estorno/duplicação automática como parte de recuo de UI. Nenhum DDL de F10 exige rollback de banco.

Backend continua com seu plano próprio F9/F2–8. Recuo não pode reabrir helpers internos, caches globais, TRUNCATE/DELETE Realtime, Storage público ou retirar operational_active_lookup. Fixtures encerradas continuam disponíveis em volumes locais; nenhuma é backup de produção.
