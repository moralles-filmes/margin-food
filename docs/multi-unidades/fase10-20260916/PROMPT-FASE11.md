# Fase 11: regressão final, performance e operação

Continue a estabilização multi-tenant do margin.food em `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`. Execute **somente a Fase 11** de `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`: regressão final, performance pertinente, checklist de aceite e operação/publicação/recuo documentados. Não publique implicitamente. Sistema funcional em produção; preserve dados, contratos e trabalho local.

## Leitura e baseline obrigatórias

Antes de editar: git status, leia AGENTS.md/CLAUDE.md (devem continuar idênticos), docs/ARCHITECTURE.md e docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md. Leia resultados F2–6 em faseN-20260915; F7 RESULTADOS/REVISAO-SQL; F8 RESULTADOS/MAPA-DE-CONFIANCA/RUNBOOK-TESTES; F9 RESULTADOS/PLANO-RELEASE/RUNBOOK-TESTES e publicacao, preflights-vivos, cli-historico, matriz-objetos, contratos-types, ensaios, ensaios-guards-recuo JSON. Leia **todos os entregáveis F10 em fase10-20260916**, especialmente RESULTADOS, MATRIZ-FRONTEND, MATRIZ-ARQUIVOS, RUNBOOK-TESTES, PLANO-PUBLICACAO, inventario-frontend, contratos-frontend, comparacao-f9, publicacao, revalidacao-viva, revalidacao-final, ensaios, http e browser/result.json.

Faça fetch e incorpore mudanças posteriores com segurança. Base de entrega F10: branch local `codex/multiunit-phase10`; obtenha commits exatos em git log. Sem push. Foram preservados fora dos commits F10: TAREFAS.md, resultado F7, docs/rbac/stock-reference-access-20260916*, migration/teste de hotfix de estoque. Não descartar nem atribuir esses arquivos à F10. Consulte status atual, não presuma ausência de alterações novas.

Commits de código F10: `338f120` e `fa9ae8c`, seguidos pelo commit de documentação/evidências. Não reaplicar mudanças já presentes.

Supabase `wuzxpbixprrgssoeeaez`. F10 revalidou banco em **16/09/2026 18:35:41 UTC**: 856 versões, 356 funções públicas (assinatura/corpo/owner/ACL), 599 policies; iguais ao snapshot F9 e à coleta F10. Hashes finais em revalidacao-final.json usam ordenação C. Os 17 bundles Edge permaneceram iguais à F9/F8; 54 arquivos rastreáveis em fase8/edges.json. Vercel produção READY `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, SHA `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Revalidar antes de afirmar equivalência atual; não coletar payloads privados/segredos.

## Cadeia backend bloqueada — não contornar

870 arquivos versus 856 versões; exatamente 14 candidatas ausentes no snapshot:

- F2: 20260915140812.
- F3: 20260915144030, 20260915144031.
- F4: 20260915200818.
- F5: 20260915225538.
- F6: 20260915232846.
- F7: 20260916133617, 20260916133618, 20260916133619, 20260916134848, 20260916135928, 20260916141000.
- F8: 20260916143153, 20260916144830.

Hotfix **20260916153928 já publicado**: 17 policies de referências, 22 statements conferidos. Preservar leitura operacional de categorias/locais/setores/turnos/cargos com ALLOW granular e legado DENY. Não remover operational_active_lookup.

F3 espera a atômica Salmão de nove argumentos removida pelo avanço com validade DATE e inclui cancelamentos antigos. Trocar hashes recria overload/regressão de estorno. F7 recusa o hotfix com PHASE7_POLICY_DRIFT/PHASE7_REFERENCE_POLICY_DRIFT mesmo com F2–6 presentes. F2/F4/F8 isolados passaram, sem liberar pacote. Não usar --include-all na raiz, não fazer repair/aplicar F2–8 ou avançar guards implicitamente. Se investigar compatibilidade nesta fase, produzir mudança mínima revisável e ensaio isolado, mantendo bloqueio até prova; publicação exige autorização própria.

20260910003448 foi rastreada no Git/histórico; três definições administrativas compilam e 20260915120000 coincide com corpo/ACL vivos. Não apagar, renumerar ou reaplicar as anteriores. Cinco históricos sem statements e 215 comparações textuais inconclusivas não provam aplicação parcial. Timestamp não prova ordem real.

## Estado do frontend após F10

Preservar identidade Auth compartilhada, memberships por empresa, empresa original do perfil e preferência por userId. CompanyScopeProvider/useSupabase e clientes imutáveis validam userId/companyId/mode e header x-company-id. QueryClients/canais encerram com o lifetime; retry após erro cria recursos novos. Foco não sobrepõe seleção explícita em voo.

CMV usa WeakMap por instância de cliente e rejeita cache após abort. dataEvents liga emissor/listener a usuário+empresa+mode e ignora eventos legados sem escopo; foco atualiza só a aba. Toasts operacionais verificam montagem/lifetime. Conciliação persiste v2 usuário+empresa+conta, não adota rascunhos antigos sem autor; resposta de outra conta não deve persistir/recalcular a conta atual. Abort não desfaz commit: consultar estado/idempotência antes de retry de write.

Apresentação tem escopo local presentationUnit, filtros/permissões/detalhes/planejamento/atas/decisões/exports herdados. Global A/apresentação B permanece B após troca global; selecionar global remove override; IDs anteriores são limpos, filtros temporais válidos preservados e Total recalcula bounds. PDF/PPTX/impressão e atas descartam finalização após cleanup; navegação tardia de decisões/atas é guardada. Não substituir imports globais Auth/tipo cegamente; o inventário F10 resolve aliases/sombreamento.

F10 deixou limitações explícitas: não certifica todas as corridas de filtros no mesmo lifetime, todos os exports externos à apresentação, todos os dados/ações de atas/planejamento e lotes. Há quatro ocorrências de RPC ausente no vivo: deactivate_produto, upsert_supplier_price e dois callers list_restricted_logs. Tipos candidatos não foram regenerados do vivo atrasado.

## Regressão final e performance

1. Reexecutar checks apropriados ao diff/base atual: unitários, TypeScript app/node, build, lint, RBAC, Deno/CORS quando pertinente. Separar execução nova de baseline e de transporte simulado. security:check exit0 pode pular SQL lint por falta de env; não declarar banco aprovado.
2. Ensaiar em **banco/Supabase real isolado**, schema identificado e fixtures próprias, clones separados por cenário. Não mockar banco/copy dados privados/reaplicar seis migrations sobre estado já migrado. Runners devem recusar host/nome não descartável. Templates F7 candidatos não são release integrado; recuos F8/F9 fecharam grants/publicações, não presumir reutilização aberta.
3. Regressão de isolamento/RBAC: 0/1/N unidades, preferência válida/forjada/obsoleta, A→B→A, reload/logout/outra identidade, granular ALLOW+legado DENY, local admin/global explícito, empresa/membership inativos/revogados, URL/header adulterado. Jornada isolada de empresa/primeiro admin/usuário, reserva pré-Auth, e-mail existente sem alterar identidade/senha/origem, revogação só membership/reintrodução sem grants antigos. Nunca convidar/criar identidade produtiva para teste.
4. Regressão browser desktop/mobile/sidebar recolhida, loading/erro/retry, respostas atrasadas, eventos/exports pós-cleanup, ausência de repintura de outra unidade; incluir apresentação independente e discrepâncias ainda não cobertas. Distinguir RLS/HTTP real dos testes de componente.
5. Performance: EXPLAIN pertinente e comparações antes/depois em fixtures representativas e identificadas; medir queries críticas por company_id, indexes, planos de RLS com subselect/InitPlan, paginação e agregações no servidor, troca de escopo/cancelamento e caches. Evitar carga destrutiva/cara em produção, writes via EXPLAIN ANALYZE e inferência de p95 produtivo a partir de fixture vazia. Não alterar fórmula nem regredir saldo_atual para somar ledger.
6. Fechar checklist da auditoria item por item com fonte, prova, ambiente, data, limite e responsável/próximo passo. Ausência de evidência permanece pendente, não PASS por contagem de testes.

Baselines que não devem ser somadas: F8 88 HTTP/17 handlers Deno, Storage37, Realtime16, drift10, recuo6; não gateway cloud. F9 SQL hotfix526 em dois estados, F3/4/5/6/7=175/146/67/80/248, 22 checkpoints, quatro drifts, recuos F2/F7 preservando149 tabelas+Auth. F10 **789/789 unitários em101 arquivos**, 22 focais (subconjunto), TypeScript/build PASS, lint0 erros/1357 warnings, RBAC0 blockers/2 important/19 info; **21 HTTP reais locais e12 jornadas Chromium** em stacks separadas, 9 screenshots sintéticos. Reprodução e ferramentas no runbook F10. Os serviços F10 foram encerrados conservando volumes; conferir ensaios.json antes de reutilizar. Nenhuma baseline prova gateway cloud.

## Invariantes e riscos ainda abertos

Preservar validade/FEFO, estorno antes de cancelamento, locks/unique Salmão, helpers internos sem EXECUTE público/service, fornecedor exato+empresa, FKs/preços/RPC atômica, deactivate_produto para inativar/edit para reativar, saldo_atual fonte de leitura, caches globais contidos e uniques por tenant. Permissão nova precisa registry; policy nova embrulha helpers em SELECT. Inserts tenant têm empresa explícita; não ampliar gate para liberar teste.

Storage rh-documentos privado mantém colaboradorUUID/arquivo; não mover objetos. Candidato F8 exige tenant contextual e rejeita NULL/path inválido. Realtime candidato publica só INSERT/UPDATE em seis tabelas; não reabrir DELETE/TRUNCATE nem usar replica identity FULL como defesa. Cinco consumers têm lifetime; notifications/mentions checam empresa/destinatário.

Aceite SQL integral F7 pendente: leitores tenant-only, overloads legados quebrados, FKs simples e turnos. F8 não certificou todos os lotes; RH/auditorias podem engolir falhas, purchase-requisitions/editar filtra item.id sem validar requisition_id, operações multi-chamada/efeitos externos não atômicos. Planejamento delete, inventário rápido, Salmão em duas chamadas, cancelamento distribuído, ordem de estorno Compras, gate approve, itens livres parciais e primeira conversão concorrente23505 permanecem riscos. Não ocultá-los por contagem.

Backup restaurável, scheduler externo, consumers reporting/DELETE e gateway permanecem sem prova. Indisponível não significa inexistente. C01/C02/H01/H02/H03/H04/H05/M01 não estão resolvidos no vivo por teste local.

## Entrega e limites operacionais

Entregar relatório final, matriz de aceite com evidências, resultados novos separados das baselines, análise de performance com planos e limites, lacunas explícitas e plano concreto ordenado de publicação/pós-validação/recuo preservando dados e identidade. Fazer apenas correções mínimas demonstradas dentro do escopo; não redesenhar arquitetura, limpar/unir/mover dados reais ou alterar fórmulas automaticamente.

Não enviar email/WhatsApp, chamar IA paga, efetuar pagamentos/cancelamentos ou job global produtivo. Sem push automático/main (auto-deploy Vercel), deploy, repair ou aplicação produtiva. Antes de git add/commit/push varrer JWT/segredos e arquivos proibidos (.env*, settings.local.json, supabase/.temp). Commits pequenos locais, sem amend público, preservando trabalho alheio. AGENTS/CLAUDE idênticos e enxutos. Não declarar liberação da produção enquanto os bloqueios e evidências operacionais faltantes persistirem.
