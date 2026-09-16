# Matriz única de aceite — Fase 12

Data: **16/09/2026**. `PASS candidato` significa apenas o clone e checkout identificados. A coluna produção usa a leitura de catálogo de `2026-09-16T22:16:35.827436Z`; nenhuma escrita remota foi feita.

## Dezenove itens da auditoria

| # | Origem / falha confirmada | Correção e evidência nova | Candidato | Produção / próximo passo |
|---|---|---|---|---|
| 01 | Leitura cruzada em tabelas/readers tenant-sensitive | Gates tenant+RBAC, ACLs e FKs residuais; F3–F7 + 35 assertions | **PASS nos objetos corrigidos** | **ABERTO** até publicar e executar matriz A/B no gateway |
| 02 | Logs expostos; histórico sem classificação segura | F3 compatível + classificador, 175 assertions | **PASS** | **ABERTO**; publicar avanço, depois classificar histórico em operação separada autorizada |
| 03 | Manutenção/companies acessíveis por caminhos indevidos | F2 byte-idêntica, 82 assertions | **PASS** | **ABERTO C01/C02**; validar scheduler e publicar F2 |
| 04 | Salmão e helpers internos | F3 preserva DATE/TEXT e ordem de estorno; F4 146; replace atômico | **PASS** | **ABERTO H01–H03** até publicação/pós-validação |
| 05 | Fornecedor/preço sem isolamento completo | F5 67, FK/unique e contrato atômico preservados | **PASS** | **ABERTO H04** até publicação e jornada real |
| 06 | Produtos/RBAC divergentes; inativação genérica | F6 compatível, 80 assertions; `deactivate_produto` preservado | **PASS** | **ABERTO H05** até publicação; não conceder UPDATE genérico |
| 07 | Chaves backend fora do registry, turnos | Writers de turno usam `configuracoes:geral:manage`; RBAC 0 blockers | **PASS focal** | **ABERTO** até sincronizar/publicar e pós-validar perfis reais |
| 08 | SECURITY DEFINER/EXECUTE e overloads | readers guardados; debug/service-only; overloads text quebrados removidos | **PASS focal** | **ABERTO M01** até catálogo vivo confirmar ACLs/corpos após release |
| 09 | FKs simples, INSERTs e integrações | FKs compostas de requisição/compra; `company_id` explícito; 35 assertions | **PASS focal** | **ABERTO** para consumers externos não inventariados |
| 10 | Storage/Realtime/Edges | F8 exata; Storage privado; Realtime só INSERT/UPDATE; saga RH | **PASS catálogo/local** | **BLOQUEADO** por gateway/bytes Storage/consumers externos |
| 11 | Imports globais, cache, filtros, exports/lotes | guards de geração em 3 fluxos; decisões/lotes de Compras atômicos; 789 testes | **PASS alterações; parcial global** | **ABERTO**: gateway/browser integrado e exports não exercitados nesta fase |
| 12 | Admin local podia obter capacidade global | F2–F7 e registry conservam global explícito | **PASS local** | **ABERTO C02** até publicação e jornada admin local/global hospedada |
| 13 | 0/1/N empresas, revogação/inatividade | Sem regressão: 789 testes; identidade/membership não alterados | **PASS regressão local** | **ABERTO** para repetição no staging do pacote |
| 14 | Criação/login/vínculo de identidade existente | Contratos preexistentes não alterados; F2–F7 passam | **PASS regressão local** | **ABERTO** no staging; convite/email não será disparado em produção |
| 15 | Drift/histórico F3/F7 | Manifesto 15 passos, hashes, substituições e clone vivo-equivalente novo | **PASS** | **ABERTO**: registrar só versões forward, sem repair; revalidar drift na janela |
| 16 | Build/TypeScript | app/node/build exit 0 | **PASS** | Não aplicável até deploy; repetir no commit autorizado |
| 17 | Suíte integral após correções | 789 unitários + SQL 82/175/146/67/80/248/35 | **PASS nas camadas listadas** | **PARCIAL**: Deno/gateway/browser hospedado faltam |
| 18 | Performance/InitPlan/company_id | F2–F7 conservam otimizações e `saldo_atual`; build/SQL sem regressão | **PARCIAL** | Repetir volume/EXPLAIN sobre pacote final em staging; sem p95 produtivo inferido |
| 19 | Nenhuma mutação produtiva durante auditoria | Leitura remota somente de catálogo; nenhuma operação proibida | **PASS** | **PASS desta fase**; publicação continua autorização separada |

## Lacunas O01–O09

| ID | Estado candidato | Estado produção / dependência exata / próximo passo |
|---|---|---|
| O01 Backup | Runbook e invariantes prontos; clone não é backup | **BLOQUEADO**: falta destino privado isolado e operador autorizado para restaurar backup recente com dados, Auth, grants, funções, metadados e bytes Storage. Medir RPO/RTO e registrar checks sem versionar dados. |
| O02 Scheduler | Handler confirma POST, `CRON_SECRET`, ações allowlisted, falha/auditoria; F2 testa papel legítimo | **BLOQUEADO**: scheduler externo não está no repo/API disponível. Operação deve fornecer somente metadados de origem, URL/action, timezone, cadência, retries, lock, alertas e owner; ensaiar staging sem acionar job global vivo. |
| O03 Consumers | Chamadores internos/Reatime inventariados; pacote não reabre DELETE/TRUNCATE | **BLOQUEADO**: ausência no repo não exclui BI/webhook/consumer externo. Donos devem confirmar reporting, caches, Storage e DELETE; validar refetch sob INSERT/UPDATE em staging. |
| O04 Gateway | CORS/auth manual preservados; 17 Edges vivas catalogadas | **BLOQUEADO**: falta projeto/URL hospedado de staging autorizado e credenciais sintéticas. Executar preflight, JWT inválido/expirado, header forjado, revogação, CORS e limites sob o gateway real. |
| O05 Lotes/efeitos | RH, requisição de estoque e requisição de compra agora propagam erro/atomicidade; Compras persiste lote idempotente | **PASS candidato**; publicar bundles+SQL juntos e provocar falha intermediária no staging. |
| O06 Contratos SQL | Readers, overloads, ACLs, FKs e turno corrigidos; tipos atualizados | **PASS candidato**; produção ainda exibe overloads text e não contém residual. |
| O07 Operações compostas | Planejamento, rápido, Salmão, cancelamento, estorno, approve, item livre e corrida RFQ corrigidos/testados | **PASS candidato**; produção permanece com corpos anteriores até release. |
| O08 Frontend residual | Filtros de pedidos/planejamento/inventário corrigidos; atas/decisões/exports têm baseline F10/F11, não reexecução F12 | **PARCIAL**: repetir browser desktop/mobile, atrasos, detalhes volumosos, todos os exports e lotes sobre staging integrado. |
| O09 Storage | Saga metadata/objeto e estados recuperáveis implementados; path inclui empresa | **PASS lógica local / BLOQUEADO operacional**: faltam bytes/bucket de staging e teste sob gateway; URL assinada já emitida continua válida até TTL. |

## Pendências adicionais encontradas

| Item | Resolução |
|---|---|
| `purchase-requisitions` ainda fazia quatro mutações multi-chamada e ignorava falha de auditoria | `mutate_purchase_requisition_atomic`; pai/filhos/total/audit na mesma transação, FK composta e teste de item de outro pai |
| F6 esperava hash anterior de `receive_purchase_order_atomic` | Avanço F6 valida o corpo endurecido de F5 semanticamente; migration histórica intacta |
| Tipos gerados não conheciam Storage state/lotes/RPCs novos | Contrato TypeScript local atualizado; `tsc` app/node passa |

**Aceite:** candidato técnico aceito; publicação global **bloqueada** por O01–O04 e pelas pós-validações vivas. Nenhum PASS local encerra C01/C02/H01/H02/H03/H04/H05/M01 em produção.
