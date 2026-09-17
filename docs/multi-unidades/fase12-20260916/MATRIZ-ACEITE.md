# Matriz única de aceite — Fase 12

Data: **16–17/09/2026**. `PASS candidato` significa o clone, checkout ou staging identificados. A coluna produção usa apenas leituras de catálogo; nenhuma escrita produtiva foi feita. Evidências hospedadas sanitizadas: [O01–O04](staging-o01-o04.json), [O08](staging-o08.json) e [O09](staging-o09.json).

## Dezenove itens da auditoria

| # | Origem / falha confirmada | Correção e evidência nova | Candidato | Produção / próximo passo |
|---|---|---|---|---|
| 01 | Leitura cruzada em tabelas/readers tenant-sensitive | Gates tenant+RBAC, ACLs e FKs residuais; F3–F7 + 39 assertions; gateway A/B hospedado | **PASS staging** | **ABERTO** até publicar e repetir pós-validação em produção |
| 02 | Logs expostos; histórico sem classificação segura | F3 compatível + classificador, 175 assertions | **PASS** | **ABERTO**; publicar avanço, depois classificar histórico em operação separada autorizada |
| 03 | Manutenção/companies acessíveis por caminhos indevidos | F2 byte-idêntica, 82 assertions; handler scheduler 401/400/200 + auditoria | **PASS staging** | **ABERTO C01/C02** até publicar F2; nenhum scheduler real está configurado |
| 04 | Salmão e helpers internos | F3 preserva DATE/TEXT e ordem de estorno; F4 146; replace atômico | **PASS** | **ABERTO H01–H03** até publicação/pós-validação |
| 05 | Fornecedor/preço sem isolamento completo | F5 67, FK/unique e contrato atômico preservados | **PASS** | **ABERTO H04** até publicação e jornada real |
| 06 | Produtos/RBAC divergentes; inativação genérica | F6 compatível, 80 assertions; `deactivate_produto` preservado | **PASS** | **ABERTO H05** até publicação; não conceder UPDATE genérico |
| 07 | Chaves backend fora do registry, turnos | Writers de turno usam `configuracoes:geral:manage`; RBAC 0 blockers | **PASS focal** | **ABERTO** até sincronizar/publicar e pós-validar perfis reais |
| 08 | SECURITY DEFINER/EXECUTE e overloads | readers guardados; debug/service-only; overloads text quebrados removidos | **PASS focal** | **ABERTO M01** até catálogo vivo confirmar ACLs/corpos após release |
| 09 | FKs simples, INSERTs e integrações | FKs compostas de requisição/compra; `company_id` explícito; 39 assertions; inventário externo negativo | **PASS staging no escopo observado** | **ABERTO** até pós-validar produção; nenhum consumer externo foi descoberto |
| 10 | Storage/Realtime/Edges | F8 + avanço de contrato; 4 policies Storage; saga real com compensação/retry; Realtime INSERT/UPDATE + refetch; 5 Edges ativas | **PASS staging** | **ABERTO** até deploy produtivo; origem Storage tem 0 objetos/0 bytes |
| 11 | Imports globais, cache, filtros, exports/lotes | guards de geração; browser hospedado desktop/mobile; corrida de filtro; 35 itens; paginação 20+1; PDF/PPTX da apresentação e ata | **PASS staging** | **ABERTO** somente até publicação e repetição produtiva autorizada |
| 12 | Admin local podia obter capacidade global | F2–F7 e registry conservam global explícito; local=false/global explícito=true no gateway | **PASS staging** | **ABERTO C02** até publicação e repetição produtiva autorizada |
| 13 | 0/1/N empresas, revogação/inatividade | 798 testes + matriz hospedada 0/1/2, A→B→A, inatividade e revogação com mesmo JWT | **PASS staging** | **ABERTO** somente para pós-validação produtiva |
| 14 | Criação/login/vínculo de identidade existente | Contratos preexistentes não alterados; F2–F7 passam | **PASS regressão local** | **ABERTO** no staging; convite/email não será disparado em produção |
| 15 | Drift/histórico F3/F7 | Manifesto 16 passos, builder reprodutível, 16/16 hashes e 16 versões de release no staging; cleanup técnico temporário revertido sem resíduo no histórico | **PASS staging** | **ABERTO**: revalidar drift na janela; não usar repair no pacote de release |
| 16 | Build/TypeScript | app/node/build exit 0 | **PASS** | Não aplicável até deploy; repetir no commit autorizado |
| 17 | Suíte integral após correções | 798 unitários (inclui 9 da saga) + SQL 82/175/146/67/80/248/39 + Deno + gateway 25/25 + O08/O09 hospedados | **PASS técnico/staging** | **ABERTO** somente para repetição pós-publicação produtiva autorizada |
| 18 | Performance/InitPlan/company_id | F2–F7 conservam otimizações e `saldo_atual`; build/SQL sem regressão | **PARCIAL** | Repetir volume/EXPLAIN sobre pacote final em staging; sem p95 produtivo inferido |
| 19 | Nenhuma mutação produtiva durante auditoria | Leitura remota somente de catálogo; nenhuma operação proibida | **PASS** | **PASS desta fase**; publicação continua autorização separada |

## Lacunas O01–O09

| ID | Estado candidato | Estado produção / dependência exata / próximo passo |
|---|---|---|
| O01 Backup | **PASS staging** | Snapshot lógico restaurado no projeto privado com banco/Auth/grants/funções/Storage metadata; RTO ≈54 min, idade do recovery point ≈14 min; origem e staging com 1 bucket/0 objetos/0 bytes. Evidência bruta fora do Git. |
| O02 Scheduler | **PASS — nenhum scheduler real configurado** | Sem cron em repo/Vercel, `pg_cron`, tabela de jobs, hook ou secret persistente. Metadados owner/cadência/timezone/retries/alertas são N/A. Handler hospedado passou 401/400/200 + auditoria com secret efêmero removido. Reabrir se surgir scheduler. |
| O03 Consumers | **PASS — inventário negativo delimitado** | Sem roles/grantees customizados, foreign servers, logical subscriptions, webhooks, BI/cache externo ou configuração declarada. Consumers internos Edge/Realtime/Storage inventariados; INSERT/UPDATE + refetch passaram. Reabrir se integração fora do escopo for declarada. |
| O04 Gateway | **PASS staging** | Cinco Edges afetadas ativas; matriz hospedada 25/25: CORS, JWT, 0/1/N, A→B→A, header forjado/placeholder, admin local/global, inatividade e revogação. Resíduos sintéticos zero. |
| O05 Lotes/efeitos | RH, requisição de estoque e requisição de compra agora propagam erro/atomicidade; Compras persiste lote idempotente | **PASS candidato**; publicar bundles+SQL juntos e provocar falha intermediária no staging. |
| O06 Contratos SQL | Readers, overloads, ACLs, FKs e turno corrigidos; tipos atualizados | **PASS candidato**; produção ainda exibe overloads text e não contém residual. |
| O07 Operações compostas | Planejamento, rápido, Salmão, cancelamento, estorno, approve, item livre e corrida RFQ corrigidos/testados | **PASS candidato**; produção permanece com corpos anteriores até release. |
| O08 Frontend residual | **PASS staging**: Chromium sobre bundle real e staging hospedado cobriu desktop/mobile, A→B atrasado, erro/retry, planejamento, PDF/PPTX da apresentação e ata, 35 itens, decisão/ação, corrida de filtro e paginação 20+1; limpeza zero. | Evidência: [staging-o08.json](staging-o08.json). Repetir como pós-validação após publicação produtiva autorizada. |
| O09 Storage | **PASS staging**: contrato canônico `empresa/colaborador/arquivo`, compatibilidade legada, RLS de DELETE e saga metadata/objeto com upload/delete reais, três falhas compensadas, `DELETING` recuperável, retry e reconciliação de `PENDING_UPLOAD`; limpeza zero. | Evidência: [staging-o09.json](staging-o09.json). Produção continua sem mutação até autorização. |

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

**Aceite:** candidato técnico aceito; O01–O04 e O08–O09 estão fechados no staging autorizado. Publicação global continua **bloqueada** até autorização específica, drift final, aplicação/deploy coordenados e pós-validações produtivas. Nenhum PASS de staging encerra C01/C02/H01/H02/H03/H04/H05/M01 em produção.
