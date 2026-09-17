# Fase 7 — registro pré-publicação, reconciliado pela Fase 12

> **Situação posterior (17/09/2026):** o [hotfix de cadastros para perfis limitados](../../rbac/stock-reference-access-20260916.md), migration `20260916153928`, foi reconciliado e preservado pela publicação integrada da Fase 12. A Fase 7 entrou em produção pelos forwards `20260916220600`–`20260916221100`; evidências, hashes e recuo estão em [Fase 12](../fase12-20260916/RESULTADOS.md). O restante deste documento preserva o registro histórico anterior à publicação.

**16/09/2026.** Inventário atualizado de todas as relações/funções cobertas, seis migrations novas e correções de 34 INSERTs/UPSERTs sem empresa explícita. Ensaios reais passaram. **Produção não foi alterada; os achados vivos anteriores continuam abertos.** O aceite integral da revisão SECURITY DEFINER e das relações restantes continua condicionado aos contratos/ensaios listados em [REVISAO-SQL.md](REVISAO-SQL.md). Não se declara isolamento universal com base em um inventário textual.

Branch `codex/multiunit-phase7`, derivada de `c898ac2` da Fase 6. Fetch inicial/final sem commits posteriores de origin/main a incorporar. Main remoto permanece `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Não houve push, deploy, saneamento, alteração de dados reais, edição de migration histórica, sincronização destrutiva de permissões ou início da Fase 8.

## Produção e evidências

- Projeto confirmado: `wuzxpbixprrgssoeeaez`, ACTIVE_HEALTHY, PostgreSQL 17.6.1. Catálogo capturado às **13:31:22 UTC**. Fases 2–6 permanecem ausentes do histórico vivo; corpos/ACLs conferidos além dos números de versão.
- Vercel READY: `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, SHA `80dcf4ec527d1a7e86ed3509496638b71219ab43`.
- Edges relevantes: scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14 e purchase-requisitions v10. Foram baixados corpos de **17 Edges publicadas exclusivamente para callers SQL**, com versões, hashes e localizadores em [edge-sql-callers.json](edge-sql-callers.json). Não é auditoria de JWT/Storage/Realtime/jobs.
- Preflight vivo READ ONLY da Fase 7 recusou com **`PHASE7_PREREQUISITES_REQUIRED`**. O bloqueio histórico da Fase 3 por diferenças de Salmão não foi contornado. Backup restaurável de produção não foi comprovado.

| Artefato | Conteúdo |
|---|---|
| [inventario.sql](inventario.sql), [catalogo-vivo.json](catalogo-vivo.json) | 158 relações (149 tabelas + 9 materializadas), 356 funções, 595 policies, 2.127 colunas, 446 índices, 543 constraints, 224 triggers, 32 roles, 22 vínculos e 18 default ACLs; grants efetivos/diretos/por coluna, dependências e corpos |
| [matriz.md](matriz.md), [matriz.json](matriz.json) | Todas as relações/funções; 187 chamadas locais INSERT/UPSERT/UPDATE/DELETE, sendo 47 INSERTs/UPSERTs frontend; callers SQL transitivos e Edge no artefato separado |
| [integridade.sql](integridade.sql), [integridade.json](integridade.json) | Agregados por tabela e 120 FKs tenant↔tenant; nenhuma linha operacional privada exportada |
| [permissoes.json](permissoes.json), [permissoes.md](permissoes.md), [comparacao-permissoes.json](comparacao-permissoes.json) | Seis classes de ocorrências, fontes/assinaturas/linhas/operações e comparação com Fase 6 |
| [comparacao-schema.json](comparacao-schema.json) | Comparação vivo→template local por assinatura/hash; diferenças das Fases 2–6 separadas de extensões locais |
| [alteracoes-locais.json](alteracoes-locais.json) | Antes/depois de funções, ACLs, policies e constraints; hashes das seis migrations |
| [definicoes-anteriores.sql](definicoes-anteriores.sql) | Corpos/ACLs anteriores dos alvos, somente evidência; **não executar como rollback** |

Classificação: **119 tenant operacionais, 6 globais reais, 32 mistas/legadas, 1 indeterminada** (`z_canary_test`, sem acesso cliente). Identidade `profiles` é compartilhada; memberships são tenant. Backups/logs/caches não receberam company_id/NOT NULL/FORCE por conveniência. Não há views comuns no snapshot. As quatro materializadas de reporting são owner-only; as cinco de public tinham acesso cliente. Configuração de schemas expostos do gateway não está comprovada por `current_setting` nulo: public/reporting e dependências pertinentes foram inventariados, não se presume ausência de outro schema exposto externamente.

O gerador de permissões cobre **517 fontes e 867 migrations**. Fase 6→7: VÁLIDA 3214→3302; LEGADA 1602→1674; FANTASMA 688→717; NÃO ENCONTRADA 1022→1024; DIVERGENTE 9→9; GLOBAL 1657→1714. Aumento de ocorrências inclui guards que citam políticas antigas, não aumento comprovado de gates inválidos. O artefato de permissões continua baseado em fontes Edge locais; os callers publicados são evidência separada. Nenhuma chave funcional nova foi inventada.

## Correções locais

| Migration | Mudança / contrato |
|---|---|
| `20260916133617_phase7_contain_non_rls_privileges.sql` | Remove TRUNCATE/REFERENCES/TRIGGER/MAINTAIN de clientes em 140 tabelas; fecha cinco materializadas de public e cinco helpers internos. Mantém DML com RLS, serviço nas tabelas e callers definer internos. Preflight exige Fases 2–6 e fingerprints de corpos/overloads/callers, ACLs, roles, defaults, views, policies, índices, colunas, constraints e triggers relevantes. |
| `20260916133618_phase7_align_reference_catalogs.sql` | Categorias/locais/setores usam estoque:cadastros por ação/manage, aliases legados existentes e global; SELECT suporta ações com RETURNING. Leituras de dropdown por ação funcional apenas para registros ativos. Turnos ativos ficam legíveis para as ações do Inventário. Fronteiras restritivas tenant preservadas. |
| `20260916133619_phase7_guard_sql_writers.sql` | Gates em criação/edição de pedidos, composição de ficha, reordenação de categorias e auditoria financeira. Saldo unitário passa ao cache. Oito FKs compostas em itens de pedidos, fichas e inventários; quatro uniques auxiliares. Reutiliza índice existente de produtos, mantém FKs antigas e efeitos CASCADE/NO ACTION. |
| `20260916134848_phase7_scope_upsert_conflicts.sql` | Uniques de planning_metas_compra, rh_custos_mensais e rh_escalas incluem company_id. Adiciona chave correta antes de remover global; recusa nulos/duplicatas/drift. Preserva UUIDs e dados. |
| `20260916135928_phase7_guard_stock_readers.sql` | Gates das telas em cinco leitores de estoque e um financeiro. get_stock_top_consumed/get_inactive_stock_items leem saldo_atual; consumo histórico/custos continuam com as fórmulas anteriores. Assinaturas/defaults/retornos preservados. |
| `20260916141000_phase7_scope_notification_writer.sql` | mark_all_notifications_read limita a atualização ao destinatário e à unidade ativa validada; mantém auditoria interna e idempotência sequencial. |

Frontend: `withCompanyId()` vincula payload ou lote ao escopo capturado, sem mutá-lo, recusa ausência de unidade e sobrescreve empresa embutida obsoleta. Aplicado a 34 chamadas em RH, Financeiro, lembretes, notificações de Compras e registros auxiliares de Salmão. Os 47 INSERTs/UPSERTs frontend localizados agora têm empresa no objeto resolvido ou no helper. Outros payloads já explícitos foram mantidos. `useAuth()` dentro do provider entrega o profile contextualizado: não se confundiu esse profile com `profiles.company_id` bruto do banco.

`ControleCustosRhSection` usa `onConflict: company_id,periodo`. `StockCadastrosSection` usa companyId e gates separados de create/edit/delete/manage. Nada alterou clientes imutáveis, cancelamento, chaves de cache, memberships ou identidade Auth. Callbacks que capturam o novo companyId receberam dependência correspondente. Nenhuma Edge foi alterada.

AGENTS/CLAUDE continuam idênticos. A recomendação antiga de `GRANT ALL` a authenticated foi substituída por DML necessário: ela recriaria a exposição de TRUNCATE. Há uma regra curta para caches materializados e conflitos por empresa.

## Integridade e ensaio real

As 120 FKs verificadas têm zero órfãos e zero cruzamentos operacionais no snapshot. Quatro referências company_memberships.user_id→profiles têm empresas diferentes: **legítimas**, identidade de origem compartilhada. Não foram “corrigidas”. `audit_logs` contém 37.339 linhas, 35.811 com company_id nulo; preservadas como histórico misto. O vínculo adicional ficha→componente filho tem zero linhas/órfãos/cruzados. As três novas chaves não têm duplicatas por tenant. Os DO-blocks das migrations repetem a validação antes do DDL e abortam em divergência; não limpam registros.

PostgreSQL **17.10 real** local, `127.0.0.1:15440`. Template vazio `moralles_phase7_test_base`, derivado de `moralles_phase5_test_phase6_current`, já com Fases 2–5, recebeu **somente a migration da Fase 6** para preparar esta fase. As seis migrations originais multiunidade não foram reaplicadas. Não se chamou isso de backup de produção. Comparação de todos os corpos com o vivo está no artefato; extensões C/pgcrypto adicionais pertencem ao cluster local. Nenhum hash histórico foi alterado para contornar o guard de Salmão.

Banco final de aceite: `moralles_phase7_test_acceptance`; banco final de concorrência/recuo: `moralles_phase7_test_final4`. Fixtures próprias; suites SQL fazem ROLLBACK. Concorrência deixa apenas fixtures sintéticas no descartável, após contenção.

| Check | Resultado |
|---|---|
| Fase 7 SQL | **248 assertions PASS** |
| Drift Fase 7 | **14 recusas PASS**: corpo, ACL, overload, caller, trigger, coluna/default, policy, índice, grant tabela/coluna, papel herdado, default ACL, view owner, pré-requisito |
| Regressões Fases 3/4/5/6 | **175 + 146 + 67 + 80 = 468 PASS** |
| Concorrência/recuo Fase 7 | **12 checks PASS**: upsert mesma unidade/A-B, corrida de pedido/retry, digest de recursos/vínculos/estoque/custos/logs e contenção |
| Pós-validação do candidato | PASS, corpos, ACLs críticas e 15 constraints novas validadas |
| Vitest | **779/779, 99 arquivos**; inclui três testes novos do payload, sem mock de banco |
| TypeScript app/node | PASS |
| ESLint | **0 erros / 1.355 warnings**, baseline preservada |
| RBAC | PASS, zero blockers, dois important anteriores |
| Build | PASS; avisos anteriores de bundle/Browserslist |
| security:check | Parte estática PASS; **SQL lint pulado**, configuração de serviço ausente |
| Deno | Não aplicável: nenhuma Edge alterada |

A primeira execução Vitest foi impedida pelo sandbox/esbuild; a execução autorizada fora do sandbox completou os 779 testes. A suíte de CompanyScope/transporte existente passou; isso não é teste de JWT/PostgREST/browser real. Nenhum segredo foi solicitado.

Matriz SQL: anon, A, B, admin A, multi A/B, super, sem permissão, granular-only/legado DENY e serviço real; headers cruzados/inválidos/placeholder, membership revogado, empresa inativa e claim de serviço falsificada. Escrita direta/RETURNING, RPC, internos, views, oito FKs cruzadas, NULL, lote misto revertido inteiro, upserts A/B, notificação própria e saldo cacheado com ledger vazio. Regressões anteriores incluem membership inativo e falha intermediária de auditoria.

Dois testes históricos foram adaptados **sem mudar migrations históricas**: Fase 3 passa a esperar sucesso do upsert quando a chave nova existe (exclusão por deleted_at inexistente continua sendo limite); Fase 5 espera a recusa antecipada da FK quando ela existe, preservando o cenário antigo antes da Fase 7. Não se apagou assertion para mascarar falha.

```powershell
./scripts/test-phase7-db.ps1 -Database moralles_phase7_test_novo
psql -X -w -h 127.0.0.1 -p 15440 -U postgres -d moralles_phase7_test_novo -v ON_ERROR_STOP=1 -f docs/multi-unidades/fase7-20260916/pos-validacao.sql
node scripts/test-phase7-concurrency.mjs moralles_phase7_test_novo
node scripts/audit-phase7.mjs
bun scripts/audit-permission-inventory.ts docs/multi-unidades/fase7-20260916/catalogo-vivo.json docs/multi-unidades/fase7-20260916/permissoes.json
```

Runners recusam nome fora do padrão, host diferente, template com dados e banco já existente; não apagam banco. Outra máquina exige preparar schema vazio atual + dependências revisadas, não apontar para produção.

## Limites que permanecem

- **Aceite global de SQL não concluído.** Contratos residuais detalhados em [REVISAO-SQL.md](REVISAO-SQL.md): leitores tenant-only sem gate funcional definido, sobrecargas legadas quebradas, FKs simples restantes e gestão de turnos. São pendências explícitas; não foram aprovados por testes de outras rotinas.
- A corrida de duas primeiras chamadas de create_purchase_order_atomic com a mesma chave gera um pedido e uma recusa 23505; repetir depois retorna idempotent. Integridade foi comprovada, **não** sucesso transparente de ambas as chamadas. Idempotência geral de itens livres/recebimentos parciais continua sem certificado.
- Falta integração candidata com gateway/JWT/PostgREST e browser autenticado, incluindo os dropdowns/RH/Compras e novos leitores. Não se alegam códigos HTTP nem jornada completa observados.
- Planejamento: conflito de upsert corrigido; delete ainda usa coluna deleted_at ausente. Inventário rápido: tipo legado incompatível permanece. Salmão em duas chamadas, cancelamento externo, ordem do estorno de Compras e gate de aprovação no recebimento continuam nos limites anteriores.
- Oito FKs compostas não demonstram que todos os recursos relacionados estão protegidos; zero cruzamentos hoje não é prova contra escritores futuros. Publicação anterior e controle de callers externos continuam dependências.
- Frontend antigo de custos RH usa chave global e falhará após a migration de unique. Coordenar publicação com writers pausados. Não adicionar fallback que reabra escopo.

## Publicação e recuo — sequência exigida

1. Confirmar projeto, candidato/commits integrados, janela, responsável e **backup completo restaurável**. Recapturar catálogo, definições, ACLs, agregados e deployments. Resolver os contratos residuais pertinentes e comprovar integração HTTP/browser antes de aceitar o conjunto como estabilizado.
2. Reconciliar explicitamente release das Fases 2–6 e o guard antigo da Fase 3 com Salmão vivo, por avanço revisado. Não editar histórico nem aplicar fases anteriores silenciosamente. Pós-validar dependências: Fase 7 deve continuar recusada enquanto ausentes.
3. Executar READ ONLY [preflight.sql](preflight.sql), [preflight-readers.sql](preflight-readers.sql), [preflight-notifications.sql](preflight-notifications.sql). Revalidar guards de colunas/constraints e agregados da quarta migration. Diferença de hash exige diff/revisão, não substituição automática. Repetir ensaio no mesmo candidato integrado; configurações/callers novos podem mudar o plano.
4. Com dependências realmente publicadas, revisar `supabase migration list` e plano antes de CLI. Lote exclusivo, nesta ordem: **20260916133617 → 20260916133618 → 20260916133619 → 20260916134848 → 20260916135928 → 20260916141000**. Não executar `db push` cego que inclua fases pendentes. Cada arquivo é transacional; lock_timeout de 5s recusa contenção prolongada. DDL com novas FKs pode exigir janela; sem saneamento automático.
5. Preferir CLI com plano conferido. Se houver necessidade de MCP apply_migration, aplicar um arquivo aprovado por vez e reparar **na mesma sessão**, para cada versão: `supabase migration repair --status applied <versão-local> --yes` e `supabase migration repair --status reverted <versão-real-gerada-pelo-MCP> --yes`. Conferir lista final e corpos, não só versões.
6. Publicar frontend coordenadamente, mantendo escrita pausada durante mudança dos conflitos RH. Nenhuma Edge nova é necessária nesta fase. Não reverter para cliente antigo que depende de comportamento inseguro. Executar [pos-validacao.sql](pos-validacao.sql), conferir policies/ACLs/overloads/callers e smoke tests autorizados A/B no candidato publicado. Conferir SHA ativo e invariantes de custos/saldos/histórico. Só evidência viva permite encerrar achados em produção.
7. Em incidente, pausar consumidores afetados e executar [phase7_fail_closed.sql](../../../supabase/rollback/phase7_fail_closed.sql): suspende DML de referência/upserts e APIs alteradas; preserva dados, FKs, uniques, leitura das tabelas e contenções prévias. Não restaura grants de caches/TRUNCATE/helpers nem reabre logs. Owner/serviço e callers internos podem continuar: **não é uma paralisação universal dos módulos**. Recuperar com migration de avanço ensaiada; não desfazer memberships, mudar saldo/custo nem marcar migration aplicada como inexistente.

## Entrega

Commits locais: **`6f798df`** (correções/migrations), **`8953779`** (ensaio/inventário), seguidos pelo commit deste relatório/evidências; consultar `git log c898ac2..codex/multiunit-phase7`. [Evidência compacta](validacao.md). Próxima tarefa: [prompt completo copiável da Fase 8](../10-PROMPT-FASE-8.md). **Fase 8 não iniciada.**

Referência consultada: [RLS e grants no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). As conclusões acima derivam do catálogo, código e ensaios do projeto.
