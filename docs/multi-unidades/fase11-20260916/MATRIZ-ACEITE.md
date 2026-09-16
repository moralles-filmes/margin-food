# Aceite final — decisão por evidência

Data: **16/09/2026 UTC**. Fontes novas F11: `sql.json`/`guards-recuo.json` (PostgreSQL 17.10, nomes de clones dentro dos artefatos), `http.json` (Supabase local API56721), `browser/result.json` (stack API56731), `performance.json` (dois clones com volume), `ensaios.json` (código), `revalidacao-viva.json`/`publicacao.json` (produção READ ONLY). Cada JSON conserva seu timestamp. Referências F2–10 são baselines históricas, com datas próprias, e não foram somadas.

**PASS local** aprova somente o cenário descrito. **PARCIAL/PENDENTE/BLOQUEADO** não fecha o item de produção. Responsáveis abaixo são funções a designar antes do release, não confirmação de que alguém já assumiu a execução.

## Todos os 19 itens da seção 9 da auditoria

| # | Item original | Decisão e prova / ambiente | Limite e responsável/próximo passo |
|---|---|---|---|
| 01 | Nenhuma tabela tenant-sensitive permite leitura cruzada | **PENDENTE integral**. SQL F3–7 e HTTP A/B passaram localmente; catálogo vivo igual F10 | Engenharia backend: resolver logs/readers/definers residuais; cenários aprovados não cobrem todas as tabelas/writers |
| 02 | Três logs protegidos e histórico classificado | **BLOQUEADO no vivo**. F3 175 local; cadeia recusa F3 no clone vivo | Backend + responsável pelos dados: avanço compatível com validade/estorno; classificação histórica separada, sem inferir autoria por perfil |
| 03 | Manutenção/administração inacessíveis ao admin local/anon | **PASS candidato / ABERTO vivo**. F2 aplica local, drifts/recuo passam; HTTP admin local nega, global cria | Plataforma/backend: identificar scheduler, publicar F2 só em operação autorizada e pós-validar; C01/C02 continuam abertos |
| 04 | Salmão com permissão e grants internos revisados | **PASS cenários locais / PENDENTE vivo**. F4 146, herdando fixtures de ciclo/locks/estorno | Backend: resolver F3 e integrar F4 sem sobrecarga antiga, sem reabrir EXECUTE interno/service |
| 05 | Fornecedor/upsert/consumidores por empresa | **PASS cenários locais / PENDENTE vivo**. F5 67; sem mudar nome exato ou fórmula | Backend/frontend: publicar contrato atômico e FKs coordenados; RPC de preço ausente no vivo |
| 06 | Policies de Produtos correspondem às ações | **PASS cenários locais / PENDENTE vivo**. F6 80; hotfix 526 em dois estados | Backend: inativação dedicada, reativação edit; preservar operational_active_lookup. deactivate_produto ausente no vivo |
| 07 | Permissões backend versus registry; fantasmas críticas eliminadas | **PARCIAL**. RBAC 0 blockers, SQL granular+DENY local; inventários F6/F7/F10 | Backend/RBAC: resolver turnos e contratos residuais, sem inventar chaves para liberar teste |
| 08 | Todas SECURITY DEFINER/EXECUTE semanticamente revisadas | **PENDENTE integral**. Matriz F7/F9 completa como inventário; regressões focais F11 | Backend: fechar os grupos de REVISAO-SQL F7; inventário/guard textual não equivale a revisão de todos os ramos |
| 09 | Tabelas/views/INSERTs/integrações classificadas | **PARCIAL**. Inventário F7/F9/F10 revalidado por metadados; inserts e payloads testados localmente | Backend/integrações: resolver FKs simples, globais/legados, lote e callers externos antes de aceite operacional |
| 10 | Storage/Realtime/Edges A/B com sessões reais | **PARCIAL**. Baseline F8 Storage 37/Realtime 16/HTTP 88; F11 Auth/PostgREST+2 handlers 21 | Plataforma: reensaiar gateway hospedado e F8 no pacote integrado. Suites completas F8 não reexecutadas F11; DELETE/TRUNCATE ainda vivo |
| 11 | Imports globais/mutations/cache/persistência auditados | **PARCIAL**. Matriz F10 por símbolo, 789 unitários F11, browser 17 e PDF/PPTX reais | Frontend: fechar exports fora da apresentação e corridas de filtros/lotes; não presumir cleanup só pelo toast |
| 12 | Admin local sem global; super mantém capacidades legítimas | **PASS cenários locais / PENDENTE vivo**. HTTP jornada + SQL F2–7; corpo admin atual recompilado e igual vivo | Backend/plataforma: C02 vivo ainda permite caminhos diretos antigos; menu não substitui ACL/RLS |
| 13 | 1/N empresas e memberships inativos/revogados | **PASS local**. HTTP 0/1/N+inativos/revogados/empresa inativa; browser troca/reload/preferências/logout | QA/plataforma: repetir em staging com gateway e pacote real; não certifica todos os perfis produtivos |
| 14 | Criação/login/vínculo de identidade existente | **PASS local**. HTTP empresa→reserva→admin→usuário→vínculo→revogação→reintrodução | QA/plataforma: GoTrue real local e Deno direto. Convite/email deliberadamente não executados; não criar identidade produtiva de teste |
| 15 | Drift resolvido por schema/histórico | **BLOQUEADO**. Catálogo igual F10; F3/F7 recusados novamente sem alteração parcial; três definições históricas conferem | Backend/release: avanços revisáveis + manifesto substituída→avanço→prova. Sem repair inferido ou alteração das anteriores |
| 16 | Build e TypeScript passaram na baseline | **PASS novo F11**. App/node/build exit0 | Engenharia frontend: resultado deste checkout; registrar hash de qualquer candidato posterior e repetir apenas checks pertinentes |
| 17 | Suíte inteira passou após correções | **PASS unitários F11: 789/101**; SQL/HTTP/browser citados separadamente | QA: não representa suíte integral de todos os gateways/lotes. SQL security:check pulado não é PASS de banco |
| 18 | Performance por company_id após migrations | **PARCIAL local**. 60 EXPLAIN, fixtures 6k/30k/18k, índices/InitPlans/RPC e saldo_atual conferidos | DBA/backend: mesmo candidato após cadeia reconciliada, distribuição/carga representativa e observação real. Sem p95/SLO produtivo inferido |
| 19 | Nenhuma mudança de banco/deploy na fase1 | **PASS histórico**, relatório F1. F11 também apenas leituras remotas | Release: não transformar entrega documental em push main; preservar autorização separada |

## Lacunas operacionais e funcionais preservadas

| ID | Evidência/ambiente/data | Estado, responsável e próxima prova |
|---|---|---|
| O01 Backup | F9/F10 documentam ausência de prova atual; F11 não copiou dados privados | **PENDENTE**, operação/DBA: backup completo recente, Auth/grants/Storage, ensaio de restauração em ambiente autorizado, responsável e RPO/RTO registrados |
| O02 Scheduler | F8 mapa e snapshot vivo; existência/configuração externa não demonstradas | **PENDENTE**, operação/integrações: origem/URL/action/timezone/cadência/retry/alertas/versão, execução legítima em staging; nenhum job produtivo de teste |
| O03 Consumers externos | Reporting/DELETE não inventariados fora do repo | **PENDENTE**, integrações: confirmar donos e refetch com INSERT/UPDATE, sem reabrir DELETE/TRUNCATE ou caches globais |
| O04 Gateway | HTTP F11 usa Deno direto; browser usa Auth/PostgREST local | **PENDENTE**, plataforma: verify_jwt/CORS/headers/JWT/revogação sob gateway hospedado equivalente |
| O05 Lotes/efeitos externos | Limites F8 revisados; nenhuma integração externa acionada F11 | **PENDENTE**, backend/integrações: RH/auditoria propagando erros, item.id validando pai, atomicidade/idempotência e reconciliação antes de retry |
| O06 Contratos SQL | REVISAO-SQL F7 e tipos F9/F10 | **PENDENTE**, backend: leitores tenant-only, overloads text/text quebrados, FKs simples/turnos; tipos candidatos conservados |
| O07 Operações compostas | Resultados F3–8, sem nova prova geral F11 | **PENDENTE**, donos dos módulos: planejamento delete, rápido, Salmão duas chamadas/cancelamento distribuído, estorno Compras, approve, itens livres parciais, primeira conversão 23505 |
| O08 Frontend residual | F10 matriz; F11 browser e unitários cobrem cenários nomeados | **PENDENTE**, frontend/QA: filtros no mesmo lifetime, todos os exports externos, detalhes/atas/decisões/planejamento/lotes com dados completos |
| O09 Storage | Baseline F8 paths/NULL/A-B/TTL | **PENDENTE integrado**, RH/plataforma: upload/metadado e delete/metadado separados; não mover objetos, não inferir revogação de download pronto/URL antes do TTL |

**Decisão:** aceitar os artefatos e cenários locais nomeados; manter release e aceite global bloqueados. C01/C02/H01/H02/H03/H04/H05/M01 não encerrados no vivo. Próximas ações em [PLANO-OPERACAO.md](PLANO-OPERACAO.md), sem autorização automática.
