# Publicação, observação e recuo

Estado: **bloqueado; não executado**. Projeto alvo único `wuzxpbixprrgssoeeaez`. Push em `main` aciona Vercel e requer autorização separada.

## Gates externos obrigatórios

1. **Backup:** operação/DBA fornece backup completo recente e destino privado isolado; restaura banco, Auth, grants, funções, metadados e bytes Storage; mede RPO/RTO e guarda a evidência fora do Git.
2. **Scheduler:** owner confirma origem, URL/action, autenticação, timezone, cadência, retry, concorrência/idempotência, alertas e versão. Executa sucesso e recusas somente no staging.
3. **Consumidores:** owners externos assinam inventário de reporting, materialized views/caches, Storage, Realtime e eventos DELETE; validam INSERT/UPDATE + refetch sem reabrir privilégios.
4. **Gateway:** plataforma fornece staging hospedado equivalente e identidades sintéticas; QA executa a matriz indicada no runbook.
5. **Drift final:** comparar versões, assinaturas/ACL/corpos, policies, Edge bundles e Vercel SHA com [live-readonly.json](live-readonly.json); qualquer diferença exige novo manifesto/ensaio.

## Janela de publicação autorizada

1. Registrar commit candidato, operador, aprovadores, backup e critérios de parada. Pausar writers incompatíveis, scheduler e consumers declarados; não alterar identidades ou dados.
2. Usar **somente** `release/multiunit-stabilization-20260916/sql`, conferir SHA-256 do manifesto e aplicar as versões `20260916220000`–`20260916221400` na ordem. Nunca `--include-all` na raiz e nunca repair para contornar guard.
3. Parar no primeiro erro/timeout/drift. Como abort do cliente não desfaz commit, consultar versão/objeto/idempotency key antes de retry.
4. Implantar juntos os bundles afetados (`purchase-requisitions`, `requisicao-estoque`, `rh`, `ficha-tecnica` e shared imports) e o frontend do mesmo commit. Não disparar jobs, mensagens ou integrações pagas como smoke test.
5. Executar pós-validação de cada fase, catálogo final, matriz tenant/RBAC, Storage/Realtime/gateway e jornadas funcionais. Confirmar explicitamente as 17 policies pelo digest.
6. Retomar consumers por grupo, depois scheduler legítimo. Observar erros, latência/timeout e métricas por endpoint/unidade durante período definido pela operação; sem payload privado.

## Critérios de parada

- hash/preflight/versão inesperados;
- overload Salmão antigo reaparece, hotfix deixa de ter 17 policies ou `operational_active_lookup` muda;
- admin local obtém global, granular ALLOW + legado DENY falha, ou qualquer A lê/escreve B;
- saldo/custo/histórico/fórmula diverge; estorno duplica ou vem depois de cancelamento;
- auditoria/notification/metadata confirma sem a mutação principal, ou vice-versa;
- replay cria segundo pedido/inventário/lote; primeira RFQ concorrente retorna `23505`;
- consumer/gateway/scheduler sem owner ou backup sem restauração comprovada.

## Recuo fail-closed

1. Interromper rollout e novos writers; pausar scheduler/consumers. Identificar a última versão realmente confirmada no catálogo.
2. Aplicar somente o script fail-closed da última fase confirmada, após conferir seu preflight e cobertura. O objetivo é indisponibilidade controlada, não restaurar ACL vulnerável.
3. Preservar Auth, empresa original, memberships/grants por empresa, todas as linhas operacionais/financeiras, `saldo_atual`, custos, logs, FKs/uniques e objetos/paths Storage. Nunca DELETE/TRUNCATE/deduplicação/reseed.
4. Para frontend/bundles incompatíveis, retirar tráfego ou voltar ao artefato compatível sem reabrir helpers, caches globais, DELETE/TRUNCATE Realtime ou remover o hotfix.
5. Writes com resposta perdida exigem consulta de estado/idempotência; não repetir, cancelar, pagar ou estornar cegamente.
6. URL assinada e arquivo já baixado não são revogáveis retroativamente; respeitar TTL e tratar exposição conforme resposta a incidente.
7. Comparar invariantes antes/depois, registrar indisponibilidade e recuperar somente por novo avanço revisado. Não apagar versão nem executar migration repair.

## Pós-validação viva

Somente após a janela podem C01/C02/H01/H02/H03/H04/H05/M01 mudar de estado. A evidência deve conter ambiente, horário, commit/migration/Edge version, executor, resultado e limite; contagem local não é substituta.
