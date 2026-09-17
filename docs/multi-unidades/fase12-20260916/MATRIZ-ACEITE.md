# Matriz única de aceite — Fase 12

Data: **16–17/09/2026**. `PASS candidato` significa o clone, checkout ou staging identificados. A coluna produção registra a publicação expressamente autorizada de 17/09/2026. Evidências sanitizadas: [O01–O04](staging-o01-o04.json), [O08](staging-o08.json), [O09](staging-o09.json) e [release produtivo](production-release.json).

## Dezenove itens da auditoria

| # | Origem / falha confirmada | Correção e evidência nova | Candidato | Produção / próximo passo |
|---|---|---|---|---|
| 01 | Leitura cruzada em tabelas/readers tenant-sensitive | Gates tenant+RBAC, ACLs e FKs residuais; F3–F7 + 39 assertions; gateway A/B hospedado | **PASS staging** | **PUBLICADO / PASS catálogo**; matriz mutável A/B permanece comprovada no staging |
| 02 | Logs expostos; histórico sem classificação segura | F3 compatível + classificador, 175 assertions | **PASS** | **PUBLICADO**; classificação/backfill do histórico ambíguo não executado |
| 03 | Manutenção/companies acessíveis por caminhos indevidos | F2 byte-idêntica, 82 assertions; handler scheduler 401/400/200 + auditoria | **PASS staging** | **PUBLICADO / PASS ACL**; nenhum scheduler real configurado ou acionado |
| 04 | Salmão e helpers internos | F3 preserva DATE/TEXT e ordem de estorno; F4 146; replace atômico | **PASS** | **PUBLICADO / PASS contratos**; overload antigo ausente |
| 05 | Fornecedor/preço sem isolamento completo | F5 67, FK/unique e contrato atômico preservados | **PASS** | **PUBLICADO / PASS catálogo**; jornada mutável comprovada no staging |
| 06 | Produtos/RBAC divergentes; inativação genérica | F6 compatível, 80 assertions; `deactivate_produto` preservado | **PASS** | **PUBLICADO / PASS contratos**; sem UPDATE genérico novo |
| 07 | Chaves backend fora do registry, turnos | Writers de turno usam `configuracoes:geral:manage`; RBAC 0 blockers | **PASS focal** | **PUBLICADO**; observar perfis reais sem gravar grants automaticamente |
| 08 | SECURITY DEFINER/EXECUTE e overloads | readers guardados; debug/service-only; overloads text quebrados removidos | **PASS focal** | **PUBLICADO / PASS ACL/corpos** no catálogo vivo |
| 09 | FKs simples, INSERTs e integrações | FKs compostas de requisição/compra; `company_id` explícito; 39 assertions; inventário externo negativo | **PASS staging no escopo observado** | **PUBLICADO**; nenhum consumer externo descoberto |
| 10 | Storage/Realtime/Edges | F8 + avanço de contrato; 4 policies Storage; saga real com compensação/retry; Realtime INSERT/UPDATE + refetch; 5 Edges ativas | **PASS staging** | **PUBLICADO**; 5 Edges ACTIVE, Storage 0 objetos/0 bytes |
| 11 | Imports globais, cache, filtros, exports/lotes | guards de geração; browser hospedado desktop/mobile; corrida de filtro; 35 itens; paginação 20+1; PDF/PPTX da apresentação e ata | **PASS staging** | **PUBLICADO**; smoke público 200 e assets iguais ao build |
| 12 | Admin local podia obter capacidade global | F2–F7 e registry conservam global explícito; local=false/global explícito=true no gateway | **PASS staging** | **PUBLICADO / PASS catálogo**; matriz local/global comprovada no staging |
| 13 | 0/1/N empresas, revogação/inatividade | 798 testes + matriz hospedada 0/1/2, A→B→A, inatividade e revogação com mesmo JWT | **PASS staging** | **PUBLICADO**; sem criar identidades sintéticas no vivo |
| 14 | Criação/login/vínculo de identidade existente | Contratos preexistentes não alterados; F2–F7 passam | **PASS regressão local** | **ABERTO** no staging; convite/email não será disparado em produção |
| 15 | Drift/histórico F3/F7 | Manifesto 16 passos, builder reprodutível, 16/16 hashes e 16 versões de release no staging; cleanup técnico temporário revertido sem resíduo no histórico | **PASS staging** | **PASS**: 16/16 forward no vivo, sem repair; ACLs canônicas reensaiadas |
| 16 | Build/TypeScript | app/node/build exit 0 | **PASS** | **PASS**; assets Vercel iguais ao build do commit `2ec5a38` |
| 17 | Suíte integral após correções | 798 unitários (inclui 9 da saga) + SQL 82/175/146/67/80/248/39 + Deno + gateway 25/25 + O08/O09 hospedados | **PASS técnico/staging** | **PASS de publicação**; banco/Edges/frontend pós-validados sem jornada mutável real |
| 18 | Performance/InitPlan/company_id | F2–F7 conservam otimizações e `saldo_atual`; build/SQL sem regressão | **PARCIAL** | Repetir volume/EXPLAIN sobre pacote final em staging; sem p95 produtivo inferido |
| 19 | Nenhuma mutação produtiva sem autorização | Auditoria/staging permaneceram isolados; produção só mudou após autorização expressa | **PASS** | **PASS**; sem repair, job, mensagem, backfill ou dados sintéticos no vivo |

## Lacunas O01–O09

| ID | Estado candidato | Estado produção / dependência exata / próximo passo |
|---|---|---|
| O01 Backup | **PASS staging e produção** | Snapshot restaurável ensaiado no privado; backup final pré-release de banco/roles criado fora do Git e identificado por SHA-256 em `production-release.json`. |
| O02 Scheduler | **PASS — nenhum scheduler real configurado** | Sem cron em repo/Vercel, `pg_cron`, tabela de jobs, hook ou secret persistente. Metadados owner/cadência/timezone/retries/alertas são N/A. Handler hospedado passou 401/400/200 + auditoria com secret efêmero removido. Reabrir se surgir scheduler. |
| O03 Consumers | **PASS — inventário negativo delimitado** | Sem roles/grantees customizados, foreign servers, logical subscriptions, webhooks, BI/cache externo ou configuração declarada. Consumers internos Edge/Realtime/Storage inventariados; INSERT/UPDATE + refetch passaram. Reabrir se integração fora do escopo for declarada. |
| O04 Gateway | **PASS staging e produção** | Matriz staging 25/25; cinco Edges produtivas ACTIVE, CORS real 5/5, origem externa bloqueada e autenticação ausente 401. |
| O05 Lotes/efeitos | RH, requisição de estoque e requisição de compra agora propagam erro/atomicidade; Compras persiste lote idempotente | **PUBLICADO**; falhas intermediárias e replay continuam comprovados no staging. |
| O06 Contratos SQL | Readers, overloads, ACLs, FKs e turno corrigidos; tipos atualizados | **PUBLICADO / PASS catálogo vivo**. |
| O07 Operações compostas | Planejamento, rápido, Salmão, cancelamento, estorno, approve, item livre e corrida RFQ corrigidos/testados | **PUBLICADO**; concorrência e falhas exercitadas no staging. |
| O08 Frontend residual | **PASS staging**: Chromium sobre bundle real e staging hospedado cobriu desktop/mobile, A→B atrasado, erro/retry, planejamento, PDF/PPTX da apresentação e ata, 35 itens, decisão/ação, corrida de filtro e paginação 20+1; limpeza zero. | **PUBLICADO**: Vercel 200, hashes iguais ao build, login carregou sem exceção; jornadas autenticadas permanecem na prova staging. |
| O09 Storage | **PASS staging**: contrato canônico `empresa/colaborador/arquivo`, compatibilidade legada, RLS de DELETE e saga metadata/objeto com upload/delete reais, três falhas compensadas, `DELETING` recuperável, retry e reconciliação de `PENDING_UPLOAD`; limpeza zero. | **PUBLICADO / PASS catálogo**; origem permanece 0 objetos/0 bytes, logo nenhum payload real foi usado como smoke. |

## Pendências adicionais encontradas

| Item | Resolução |
|---|---|
| `purchase-requisitions` ainda fazia quatro mutações multi-chamada e ignorava falha de auditoria | `mutate_purchase_requisition_atomic`; pai/filhos/total/audit na mesma transação, FK composta e teste de item de outro pai |
| F6 esperava hash anterior de `receive_purchase_order_atomic` | Avanço F6 valida o corpo endurecido de F5 semanticamente; migration histórica intacta |
| Tipos gerados não conheciam Storage state/lotes/RPCs novos | Contrato TypeScript local atualizado; `tsc` app/node passa |
| Preflight F6 dependia da collation padrão | Builder e forward usam `COLLATE "C"`; pacote regenerado e reensaiado |
| Preflight F7 comparava ACL como texto ordenado pelo catálogo | Builder e forward comparam array ACL canônico; pacote regenerado e reensaiado |
| Recusa de tenant na Edge retornava 500 | `purchase-requisitions` traduz `403: COMPANY_ACCESS_DENIED` para HTTP 403; matriz hospedada repetida 25/25 |
| `public.z_canary_test` sem RLS | Achado de follow-up; sem privilégios para `anon`/`authenticated`; nenhuma mutação aplicada sem autorização |

**Aceite:** release publicado e pós-validado nas superfícies seguras de produção. C01/C02/H01/H02/H03/H04/H05/M01 têm correções presentes e contratos/ACLs conferidos no vivo. Os cenários que exigem identidade ou dados sintéticos mutáveis continuam sustentados pela matriz do staging, não por dados empresariais reais.
