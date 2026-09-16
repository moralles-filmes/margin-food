# Fase 10: frontend/cache e jornada multiunidade

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 10 (frontend/cache e jornada multiunidade)** de `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Entregue auditoria, correções pequenas necessárias, ensaios, evidências e o **prompt completo copiável da Fase 11 (regressão final, performance e operação)**. Não inicie a Fase 11.

## Contexto obrigatório e limites

Sistema funcional em produção. Preserve identidade Auth compartilhada, memberships, empresa original do perfil, `CompanyScopeProvider/useSupabase`, header `x-company-id` validado, clientes imutáveis, cancelamento/caches, saldos/custos/históricos e contratos. Não refaça arquitetura, faça rollback geral, limpe/una/mova dados reais ou altere fórmulas automaticamente.

Antes de editar: `git status`; leia AGENTS.md/CLAUDE.md (idênticos), docs/ARCHITECTURE.md, docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md e 03-AUDITORIA-POS-IMPLANTACAO.md; resultados F2–6 em faseN-20260915; fase7-20260916/RESULTADOS.md e REVISAO-SQL.md; fase8-20260916/RESULTADOS.md, MAPA-DE-CONFIANCA.md e RUNBOOK-TESTES.md; **fase9-20260916/RESULTADOS.md, PLANO-RELEASE.md, RUNBOOK-TESTES.md, publicacao.json, preflights-vivos.json, cli-historico.json, matriz-objetos.json, contratos-types.json, ensaios.json e ensaios-guards-recuo.json**. Fazer fetch e incorporar mudanças posteriores com segurança, preservando trabalho local.

Supabase `wuzxpbixprrgssoeeaez`. Baseline F9: catálogo de **16/09/2026 17:04:09 UTC**; preflights de 17:07:13–17:07:50 UTC. Consulte publicacao.json para revalidação final. Vercel produção READY `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, SHA `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Os 17 hashes de bundles Edge coincidiram com F8; seus 54 arquivos continuam rastreáveis em fase8/edges.json. Revalidar produção antes de afirmar equivalência.

Branch de entrega F9: `codex/multiunit-phase9`; commits locais em git log, sem push. Foram preservadas alterações alheias em TAREFAS.md, resultado F7 e arquivos do hotfix de estoque; verificar status atual, não descartar nem atribuir esses arquivos à F9.

## Backend pendente: não contornar

856 versões vivas/870 arquivos no snapshot F9. Exatamente 14 candidatas não publicadas:

- F2: `20260915140812`.
- F3: `20260915144030`, `20260915144031`.
- F4: `20260915200818`.
- F5: `20260915225538`.
- F6: `20260915232846`.
- F7: `20260916133617`, `20260916133618`, `20260916133619`, `20260916134848`, `20260916135928`, `20260916141000`.
- F8: `20260916143153`, `20260916144830`.

**Hotfix `20260916153928` já publicado:** 17 policies de referência alteradas/adicionadas; 22 statements conferem com o arquivo. Preservar leitura operacional de categorias/locais/setores/turnos e cargos, inclusive ALLOW granular com legado DENY. Não retirar `operational_active_lookup` para fazer F7 passar.

A cadeia integrada segue bloqueada. F3 espera a atômica de Salmão de nove argumentos, removida pelo avanço com validade DATE; contém também cancelamentos antigos. Trocar hashes recriaria overload/regressão de estorno. F7 recusa o hotfix mesmo com F2–6 presentes (`PHASE7_POLICY_DRIFT`; referências: `PHASE7_REFERENCE_POLICY_DRIFT`). F2/F4/F8 passaram isolados, sem liberar pacote. CLI dry-run recusa candidatas anteriores à última versão viva; **não usar --include-all na raiz para contornar**. Nenhum repair, aplicação F2–8 ou avanço desses guards é autorizado implicitamente pela F10.

`20260910003448` foi rastreada no Git/histórico: três definições administrativas compiladas; a recomposição `20260915120000` coincide com corpo/ACL vivos. Não apagar/renumerar/reaplicar as anteriores. Cinco históricos sem statements e 215 comparações textuais inconclusivas não são prova de aplicação parcial. Timestamp não prova ordem real.

## 1. Auditoria de frontend e contratos

Inventariar por arquivo/operação: cliente usado, origem de companyId/userId/mode, lifetime, queryKey, cancelamento, mutations e efeitos após resposta, cache manual, persistência, eventos locais, canais Realtime, permissões e exports. Resolver aliases/sombreamento: import global pode ser somente Auth/tipo; não substituir cegamente. Cruzar RPCs/tabelas/overloads com contratos-types e catálogo efetivo; tipos gerados não provam publicação. Não regenerar os tipos candidatos do banco vivo atrasado.

Revisar AuthContext, CompanyScopeProvider/createCompanyClient, useCompanyId/useSupabase, seletor, logout/relogin, revalidação de membership, fallback legado, stores de todos os módulos, QueryClients, CMV, dataEvents/BroadcastChannel, localStorage/sessionStorage, rascunhos e conciliação por conta. Preferências visuais podem ser globais; dados operacionais não. Não usar profiles.company_id como preferência de navegação.

Examinar queries em voo e writes já confirmados: resposta de A após trocar para B não pode repintar/invalidar B, emitir toast enganoso ou gravar persistência de B. Abort não desfaz commit no servidor; retry precisa respeitar idempotência. CacheKey com empresa não substitui descarte de cliente/lifetime.

## 2. Jornada e apresentação independente

Exercitar uma/várias/zero unidades, preferência válida/forjada/obsoleta, reload, troca A→B→A, logout/relogin com outra identidade, roles diferentes, ALLOW granular com DENY legado, admin local versus global explícito, membership inativo/revogado e empresa inativa. URL/header adulterados devem falhar no backend; nenhuma permissão pode ser deduzida só da UI.

Apresentação Sócios: escopo local `presentationUnit` abrange filtros, queries, permissões, detalhes, retorno, gráficos, planejamento, decisões/atas e exports PDF/PPTX/impressão. Global A/apresentação B deve manter override B na troca global; selecionar global remove override. IDs da loja anterior devem ser limpos; filtros temporais preservados quando válidos. Total recalcula limites. Export identifica a empresa correta e descarta trabalho após encerramento do escopo.

Cadastro administrativo em ambiente isolado: criar empresa/admin/usuário, vincular e-mail existente sem alterar senha/nome/e-mail/ID compartilhado, revogar somente membership, reintroduzir sem restaurar grants antigos. Respeitar reserva administrativa pré-Auth. Não convidar, enviar email ou criar identidade real produtiva para testar.

## 3. Implementação e testes

Corrigir apenas falhas demonstradas dentro de F10, preservando providers/clientes/cancelamento e APIs. Inserts tenant recebem empresa explícita de useCompanyId/withCompanyId; não adicionar singleton ou fallback que reutilize cliente encerrado. Novas permissões devem existir no registry; não ampliar gate apenas para fazer teste passar.

Banco/Supabase real isolado, schema atual/candidato identificado e fixtures próprias; sem mock de banco ou cópia de dados privados. Clones separados por cenário. Os runners F9 constroem schema público vivo equivalente e mostram os bloqueios; o template candidato F7 é uma baseline separada, não resultado de release integrado. Não reaplicar as seis migrations multiunidade sobre estado já migrado. Não remover guard de identificação do descartável.

Usar browser real para jornada/UI, incluindo desktop/mobile, sidebar recolhida, loading/erro e ausência de flash de dados de outra unidade. Testar atraso/falha/retry e eventos após cleanup com ferramentas de controle de rede ou testes determinísticos de componente; não transformar mocks de componente em prova de RLS/HTTP. Guardar evidências sem JWT, segredos ou payloads pessoais. Se serviço/fixture/credencial de teste estiver indisponível, registrar limitação exata e continuar trabalho local independente.

F8: 88 HTTP de 17 handlers Deno com Auth/PostgREST reais, Storage37, Realtime16, drift10, recuo6; não gateway cloud. F9 repetiu SQL hotfix526 em dois estados, F3/4/5/6/7=175/146/67/80/248, 22 checkpoints, quatro drifts sintéticos e recuos F2/F7 preservando 149 tabelas+Auth. Recuos fecharam os clones; não presumir grants/publication abertos ao reutilizar.

Baseline aplicativo F8: 781/781 unitários em 100 arquivos, TypeScript app/node/build PASS, lint0 erros/1.354 warnings, RBAC0 blockers/2 important/19 info, Deno17 + CORS1. Não foram reexecutados na F9 porque não houve alteração de aplicativo. Reexecutar regressões afetadas e checks apropriados ao diff F10. security:check exit0 pode pular SQL lint: não declarar banco aprovado.

## 4. Invariantes e pendências preservadas

Storage rh-documentos privado mantém colaboradorUUID/arquivo; não mover objetos. Candidato F8 exige empresa contextual e rejeita NULL/path inválido. Realtime candidato publica só INSERT/UPDATE em seis tabelas; não reabrir DELETE/TRUNCATE nem usar replica identity FULL como defesa. Cinco consumers têm proteção de lifetime; notifications/mentions verificam destinatário/empresa.

Preservar F4–7: validade/FEFO, estorno antes de cancelamento, locks/unique Salmão, helpers internos sem EXECUTE público/service, fornecedor exato+empresa, FKs/preços/RPC atômica, deactivate_produto para inativar e edit para reativar, saldo_atual como fonte de leitura, caches globais contidos e uniques por tenant.

Aceite SQL integral F7 permanece pendente: leitores tenant-only, overloads legados quebrados, FKs simples e turnos. F8 não certificou todas as ações/lotes: RH e auditorias podem engolir falhas; purchase-requisitions/editar filtra item.id sem validar requisition_id; operações multi-chamada/efeitos externos não são atômicos. Planejamento delete, inventário rápido, Salmão em duas chamadas, cancelamento distribuído, ordem de estorno Compras, gate approve, itens livres parciais e primeira conversão concorrente23505 continuam limites conhecidos. Não escondê-los por contagem de testes.

## Entrega

Entregar matriz frontend/cache/jornadas com fonte/escopo/risco, correções e evidências antes/depois, testes reais separados de unitários/baselines, limitações e plano de publicação/recuo coordenado. Não enviar WhatsApp/email, chamar IA cobrada, pagamentos/cancelamentos nem job global produtivo. Backup restaurável, scheduler externo, consumers reporting/DELETE e gateway permanecem sem evidência; indisponível não significa inexistente.

Commits pequenos locais; varrer JWT/segredos/arquivos proibidos antes de git add/commit/push. Preservar trabalho alheio. Manter AGENTS/CLAUDE idênticos e enxutos. Sem push automático em main (Vercel auto-deploy), deploy ou repair. C01/C02/H01/H02/H03/H04/H05/M01 não estão resolvidos no vivo por teste local. Encerrar com resumo curto, commits e **prompt completo copiável da Fase 11**, sem iniciá-la.
