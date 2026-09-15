# Fase 2 — contenção de acessos globais

Data: 15/09/2026. Projeto revalidado: `wuzxpbixprrgssoeeaez` / Projeto Margin Pro, PostgreSQL 17.6, ACTIVE_HEALTHY. **Correção implementada e ensaiada localmente; produção não alterada. C01/C02 continuam abertos em produção até aplicação e pós-validação.**

## Evidência atual e callers

- Catálogo reconsultado por MCP, sem executar manutenção ou escrita em produção: [catalogo.json](catalogo.json). Definições anteriores preservadas como evidência em [definicoes-anteriores.sql](definicoes-anteriores.sql); não são um rollback executável seguro.
- `cleanup_old_audit_logs(integer)` e `refresh_materialized_views()`: owner postgres, SECURITY DEFINER, PUBLIC EXECUTE e execução efetiva por anon/authenticated/service_role, sem guard. Não há outra função de banco chamando essas rotinas segundo busca nos corpos vivos.
- `companies_admin`: ALL com `system:admin`; `companies_read`: apenas unidade selecionada. A ACL de companies inclui também TRUNCATE, REFERENCES, TRIGGER e MAINTAIN para authenticated; RLS não limita essas operações. Removê-las é necessário para conter C02.
- Sondagem READ ONLY repetida com admin local real: `local_admin=true`, `global_admin=false`, 4 empresas visíveis, 3 sem membership (inclui placeholder), 2 empresas reais sem membership. `audit_log_visible=113` e `audit_logs_other_company=0`; logs permanecem para Fase 3.
- `scheduled-jobs` publicada v7, `verify_jwt=false`: corpo principal igual ao Git antes da correção, CRON_SECRET obrigatório e cliente service_role. Shared CORS remoto é anterior ao arquivo local. Nenhum segredo foi lido ou salvo.
- Não existem extensão pg_cron, tabela cron.job ou tabelas de pgagent/timetable. Não há agendamento correspondente nos workflows GitHub/arquivo Vercel do repositório, nem registros agregados `JOB_RUN`/`JOB_CLEANUP` desses jobs em audit_logs. **Isso não prova ausência de scheduler externo**: origem externa, periodicidade, configuração do segredo e uma execução bem-sucedida não foram comprovadas.
- Há 9 materialized views: 5 em public, 4 em reporting. A RPC referencia erroneamente uma quinta em reporting, `reporting.mv_pedidos_status_resumo`, ausente. A homônima em public existe. Mantido o destino reporting da RPC, retirando somente a referência inexistente; nenhuma definição de view, cálculo financeiro ou saldo foi alterada.
- Único caller frontend de manutenção: `PerformanceMonitorView`, cujo botão chamava refresh diretamente. Agora apenas relê os indicadores. Nenhum caller frontend de cleanup/rpc_create_company foi encontrado além dos tipos gerados.
- Administração principal usa `list_companies`, `update_company` e `onboard_new_company`, já protegidas pela permissão global. `rpc_set_user_company` concede membership por helper interno sem mover profiles.company_id. `admin-companies` valida identidade e permissão global antes do cliente privilegiado; leitura direta de companies pelo serviço continua permitida. `list_my_companies` e o fallback de leitura da empresa original não foram alterados.

## Correção

Migration nova: [20260915140812_contain_global_maintenance_and_companies.sql](../../../supabase/migrations/20260915140812_contain_global_maintenance_and_companies.sql).

1. Manutenção: revoga PUBLIC/anon/authenticated, preserva EXECUTE de service_role, define search_path vazio e qualifica tabelas. Guard confere o papel PostgreSQL da conexão, não um papel no JSON/body/metadata. Também permite conexão cujo session_user seja service_role sem SET ROLE; operador postgres precisa selecionar service_role explicitamente.
2. Cleanup: mantém default de 24 meses, rejeita NULL e valores fora de 24–120 antes do DELETE. Piso preserva o contrato do scheduler; teto limita o intervalo operacional. Mudança futura desses limites exige revisão de retenção. Nenhum histórico foi limpo nesta fase.
3. Empresas: policy exige `system:global:manage` em USING/WITH CHECK com InitPlan e protege placeholder. `companies_read` e descoberta via memberships permanecem intactas. ACL de authenticated fica somente SELECT/INSERT/UPDATE/DELETE; RLS exige global para escrever. A RPC legada exige identidade e permissão global e mantém assinatura/retorno/auditoria.
4. Edge: mantém autenticação por CRON_SECRET e cliente de serviço; exige POST e action explícita válida, evita limpeza como fallback para JSON inválido, retorna 500/ok=false quando RPC ou auditoria falham, registra success conforme resultado. O erro de tipo no catch foi corrigido e CORS passou a ser local à requisição.
5. Dois testes estáticos normalizam CRLF ao ler SQL, sem modificar migrations históricas. Nenhuma mudança de regra financeira, membership, Auth, cache de escopo, Salmão ou fornecedor.

## Preflight, ensaio e limites

[preflight.sql](preflight.sql) passou no projeto vivo em transação READ ONLY. O mesmo bloco está embutido na migration: compara hashes exatos de definições, owner, ACLs normalizadas (ordem não importa), assinaturas, RLS/ACL de companies, as duas policies, presença das quatro views, ausência da referência obsoleta e novos callers/cron. Drift causa abort antes de alterar objetos; não simplesmente atualize hashes para ignorar diferenças.

Ensaio: PostgreSQL **17.10 real**, cluster novo em 127.0.0.1:15439, banco descartável criado do catálogo atual. Foram reconstruídos 149 tabelas públicas, enums, constraints/FKs, índices, 318 funções da aplicação, 591 policies, triggers e 9 materialized views, sem dados de produção. As seis migrations antigas **não** foram reaplicadas. Auth usa a superfície SQL do fixture existente; não há GoTrue, gateway PostgREST, Storage/Reatime ou snapshots privados históricos nesse ensaio.

O schema de ensaio está no arquivo local ignorado `.phase2.local/schema.sql`, SHA256 `89360CDC5F0213FF9ECA374F0295AD2D29128474BA6762CB959DEDE00F05BD5B`. Não é backup restaurável de produção. O runner aceita schema atual vazio compatível, sem dados, e sempre cria banco novo local:

```powershell
./scripts/test-phase2-db.ps1 -SchemaFile .phase2.local/schema.sql -Database moralles_phase2_test_novo
```

Para outro ambiente, obter novamente um schema atual de public/reporting com seus enums, funções, índices, triggers, policies e ACLs; preparar as dependências Auth do fixture. O preflight impede usar dump anterior à multiunidade ou schema já com a Fase 2 aplicada. O arquivo de schema de ensaio é local, não acompanha Git; não apontar o runner legado test-multiunit-db.sh para o estado atual.

| Verificação | Resultado |
|---|---|
| SQL [phase2_global_containment.sql](../../../supabase/tests/database/phase2_global_containment.sql) | **82 assertions PASS**, fixtures revertidas por ROLLBACK |
| Perfis SQL | anon, usuário comum, admin A com legado e DENY global, multi A/B, super admin com ALLOW global e sem legado, service_role |
| Casos | manutenção negada; admin não lê/escreve B nem cria empresas; descoberta, troca, revogação/inatividade; RPCs globais, onboarding real com seeds, vínculo sem mover perfil; retenção, cleanup e refresh reais somente em fixtures |
| Defesa adicional | Com EXECUTE concedido temporariamente a authenticated no ensaio, claims `role=service_role` forjadas continuam recusadas pelo guard |
| DELETE global | Autorização alcança a FK real de categorias, que continua recusando apagar empresa com dependências; nenhuma FK removida |
| Drift | 5 casos negativos PASS: corpo/search_path, ACL, sobrecarga, policy adicional, grants de tabela; rollback das alterações sintéticas comprovado |
| Recuo seguro | [phase2_fail_closed.sql](../../../supabase/rollback/phase2_fail_closed.sql) aplicado no banco descartável e verificado: fecha manutenção/RPC legada/escritas diretas, preserva leitura de unidade; não reabre C01/C02 |
| HTTP da Edge real local | **8 checks PASS**: métodos, CORS, credencial ausente/inválida, papel no body, JSON/action inválidos e falha real de transporte propagada como 500. Sem mock de SDK/banco |
| Deno 2.9.6 check | PASS em scheduled-jobs |
| Vitest baseline reexecutada | 713/719 PASS, seis falhas CRLF iguais às da Fase 1 |
| Vitest final | **719/719 PASS**, 91 arquivos |
| TypeScript app | PASS |
| Build | PASS; avisos preexistentes de bundle/Browserslist |
| ESLint | 0 erros; 1.349 warnings preexistentes |
| RBAC lint | PASS: 0 blockers, 2 important, 11 allowlisted, 14 info |
| security:check | Exit 0 apenas para checagem estática: **SQL lint pulado por ausência de SUPABASE_URL/SB_SECRET_KEY** |

Advisors remotos consultados antes da aplicação: 1 INFO e 6 WARN agregados (RLS sem policy, search_path, extensão em public, views na API, EXECUTE de definers, proteção de senha). São baseline do banco vivo, não certificação pós-correção. Referências: [funções e privilégios](https://supabase.com/docs/guides/database/functions), [advisor de SECURITY DEFINER](https://supabase.com/docs/guides/database/database-advisors?lint=0011_function_search_path_mutable).

**Limites de cobertura:** sucesso end-to-end de scheduler → Edge → PostgREST com chave real não foi executado; a autorização das RPCs e seus efeitos foram testados diretamente como papéis PostgreSQL reais. HTTP da Edge valida handler/autenticação/erros; não comprova gateway/JWT ou scheduler externo. Não houve login/browser de produção nem novo ensaio de criação Auth por admin-companies; o caminho SQL de compatibilidade foi exercitado. Não se deve chamar manutenção destrutiva em produção para preencher esse limite.

## Sequência exata de produção

1. Confirmar projeto `wuzxpbixprrgssoeeaez`, branch/commit aprovados e backup completo restaurável. Capturar definições/ACLs e versões atuais, e verificar histórico com `supabase migration list`. O backup de 09/09 citado em documentação anterior não está nesta máquina e não foi presumido disponível.
2. Identificar o scheduler externo/operador legítimo e validar em staging o POST com action explícita, CRON_SECRET configurado e SB_SECRET_KEY. Não copiar valores para chat/Git. Validar o caminho autenticado de admin-companies/seleção de empresas em staging. Sem isso, o scheduler continua pendência de compatibilidade.
3. Reexecutar `preflight.sql` no projeto e o ensaio isolado com schema atualizado. Revisar qualquer drift. Garantir que o CLI vá aplicar **apenas a nova migration** (versões pendentes inesperadas bloqueiam aplicação).
4. Aplicar `20260915140812_contain_global_maintenance_and_companies.sql` com `supabase db push` na janela acordada. CLI usado nesta fase: 2.111.0. Se for necessário `apply_migration` por falha do CLI, executar imediatamente os dois `migration repair` com a versão local e a versão efetivamente gerada pelo MCP, conforme AGENTS; nunca inventar timestamp remoto.
5. Executar `pos-validacao.sql` e repetir `../auditoria-20260915/sondagem-admin-leitura.sql`: admin local deve ver apenas A, zero empresas sem membership. Conferir novamente histórico. Não executar cleanup/refresh em produção como teste de falha.
6. Publicar somente `scheduled-jobs`, preservando secrets e `verify_jwt=false`; a mudança de action explícita precisa estar compatível com o caller identificado. Publicar o frontend da branch após revisão para trocar o botão do monitor. Push em main dispara deploy e **não foi realizado automaticamente**.
7. Observar a execução regular legítima e seus erros, mantendo janela/backup. Em incidente, usar o recuo de contenção `phase2_fail_closed.sql` e pausar scheduler. Ele reduz capacidades; não restaura as funções/policy vulneráveis. Recuperar por migration de avanço revisada e reconciliar histórico. Não usar rollback geral de multiunidade.

## Status final

- Branch local: `codex/multiunit-phase2`. Commits de código: `09d9de1` (harness CRLF) e `b3f58ea` (contenção, callers, ensaio e evidências); relatório/prompt em commit documental separado. Sem push.
- **C01/C02: corrigidos e testados no código/ambiente isolado; implantação e comprovação no ambiente vivo pendentes.**
- Produção recebeu somente consultas de leitura. Nenhuma migration, limpeza, refresh, backfill, Edge ou frontend foi publicada nesta execução.
- Fase 3 não foi executada. Seu prompt está em [05-PROMPT-FASE-3.md](../05-PROMPT-FASE-3.md).
