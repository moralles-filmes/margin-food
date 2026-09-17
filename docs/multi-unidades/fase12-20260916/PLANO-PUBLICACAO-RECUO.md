# Publicação, observação e recuo

Estado produtivo: **publicado e pós-validado em 17/09/2026**, após autorização expressa. Staging privado: `jiufikblnfivgynrbfyq`. Projeto produtivo: `wuzxpbixprrgssoeeaez`. O fast-forward de `main` para o código `2ec5a38` acionou o Vercel e o domínio público passou a servir os assets correspondentes.

## Gates externos obrigatórios

1. **Backup — fechado no staging e na janela:** snapshot lógico completo restaurado no privado; banco, Auth, grants, funções e metadados validados. Storage tinha 1 bucket/0 objetos/0 bytes na origem e no destino. RTO ≈54 min; idade do ponto de recuperação na primeira validação ≈14 min. Um backup final de banco/roles foi criado imediatamente antes da publicação e identificado por hash.
2. **Scheduler — fechado por ausência configurada:** repo/Vercel, banco, secrets e hooks não contêm scheduler real. Owner/cadência/timezone/retry/alertas são N/A; o handler passou ensaio efêmero e o secret foi removido. Reabrir este gate se qualquer scheduler for criado ou identificado.
3. **Consumidores — fechado por inventário negativo delimitado:** nenhum BI/webhook/cache externo, role/grantee customizado, foreign server ou subscription foi encontrado. Consumers internos Edge/Realtime/Storage foram inventariados e Realtime INSERT/UPDATE + refetch passou. Reabrir se surgir integração fora das superfícies inspecionadas.
4. **Gateway — fechado no staging e publicado:** cinco Edges produtivas ACTIVE; matriz sintética staging 25/25, CORS real 5/5 e autenticação ausente 401.
5. **Frontend O08 — fechado no staging e publicado:** desktop/mobile, atraso, retry, planejamento, quatro exports, detalhe volumoso, corrida de filtro e paginação passaram no bundle real; produção serviu os mesmos assets do build e carregou a tela pública sem exceção.
6. **Storage O09 — fechado no staging e publicado:** caminho canônico/legado, upload/delete reais, compensações e retries passaram no staging; contrato/policies foram conferidos no vivo. A origem continua com 0 objetos/0 bytes.
7. **Drift final — fechado:** 16/16 forward versions, assinaturas/ACL/corpos, 17 policies do hotfix, cinco Edge bundles e assets Vercel foram conferidos. A baseline anterior continua em [live-readonly.json](live-readonly.json) e o resultado em [production-release.json](production-release.json).

Evidências sanitizadas: [O01–O04](staging-o01-o04.json), [O08](staging-o08.json), [O09](staging-o09.json) e [janela produtiva](production-release.json). Os gates de staging não autorizaram a publicação por si só; a autorização veio depois, explicitamente, nesta operação.

## Janela de publicação autorizada

Executada. As etapas abaixo permanecem como runbook de auditoria/repetição; não reaplicar as migrations já registradas.

1. Registrar commit candidato, operador, aprovadores, backup e critérios de parada. Pausar writers incompatíveis, scheduler e consumers declarados; não alterar identidades ou dados.
2. Usar **somente** `release/multiunit-stabilization-20260916/sql`, conferir SHA-256 do manifesto e aplicar as versões `20260916220000`–`20260916221500` na ordem. Nunca `--include-all` na raiz e nunca repair para contornar guard.
3. Parar no primeiro erro/timeout/drift. Como abort do cliente não desfaz commit, consultar versão/objeto/idempotency key antes de retry.
4. Implantar juntos os bundles afetados (`purchase-requisitions`, `requisicao-estoque`, `rh`, `scheduled-jobs`, `ficha-tecnica` e shared imports) e o frontend do mesmo commit. Não disparar jobs, mensagens ou integrações pagas como smoke test.
5. Executar pós-validação de cada fase, catálogo final, matriz tenant/RBAC, Storage/Realtime/gateway e jornadas funcionais. Confirmar explicitamente as 17 policies pelo digest.
6. Retomar consumers por grupo, depois scheduler legítimo. Observar erros, latência/timeout e métricas por endpoint/unidade durante período definido pela operação; sem payload privado.

## Critérios de parada

- hash/preflight/versão inesperados;
- overload Salmão antigo reaparece, hotfix deixa de ter 17 policies ou `operational_active_lookup` muda;
- admin local obtém global, granular ALLOW + legado DENY falha, ou qualquer A lê/escreve B;
- saldo/custo/histórico/fórmula diverge; estorno duplica ou vem depois de cancelamento;
- auditoria/notification/metadata confirma sem a mutação principal, ou vice-versa;
- replay cria segundo pedido/inventário/lote; primeira RFQ concorrente retorna `23505`;
- consumer/scheduler novo ou não inventariado, gateway divergente ou backup final fora do RPO aceito;
- `public.z_canary_test` receber grants de cliente enquanto continuar sem RLS; o staging atual não tem grants para `anon`/`authenticated` e nenhuma mutação corretiva foi autorizada.

## Recuo fail-closed

1. Interromper rollout e novos writers; pausar scheduler/consumers. Identificar a última versão realmente confirmada no catálogo.
2. Aplicar somente o script fail-closed da última fase confirmada, após conferir seu preflight e cobertura. O objetivo é indisponibilidade controlada, não restaurar ACL vulnerável.
3. Preservar Auth, empresa original, memberships/grants por empresa, todas as linhas operacionais/financeiras, `saldo_atual`, custos, logs, FKs/uniques e objetos/paths Storage. Nunca DELETE/TRUNCATE/deduplicação/reseed.
4. Para frontend/bundles incompatíveis, retirar tráfego ou voltar ao artefato compatível sem reabrir helpers, caches globais, DELETE/TRUNCATE Realtime ou remover o hotfix.
5. Writes com resposta perdida exigem consulta de estado/idempotência; não repetir, cancelar, pagar ou estornar cegamente.
6. URL assinada e arquivo já baixado não são revogáveis retroativamente; respeitar TTL e tratar exposição conforme resposta a incidente.
7. Comparar invariantes antes/depois, registrar indisponibilidade e recuperar somente por novo avanço revisado. Não apagar versão nem executar migration repair.

## Pós-validação viva

C01/C02/H01/H02/H03/H04/H05/M01 têm agora suas correções publicadas e os contratos/ACLs conferidos no catálogo vivo. A cobertura mutável completa continua sendo a do staging; não foram criadas identidades nem linhas sintéticas no banco empresarial. O backfill/classificação de logs históricos não fez parte da janela.

Observar após a janela: 401/403/42501 fora do login anônimo esperado, timeout, `23505`, erros de compensação Storage, divergência de tenant e falhas das cinco Edges. Não registrar payload, identidade, token ou dado financeiro em evidência.
