# Fase 9: drift de schema e histórico

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 9 (drift de schema/histórico)** de docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md. Entregue inventário reconciliado, correções pequenas necessárias, evidências, plano de release e o **prompt completo copiável da Fase 10 (frontend/cache e jornada multiunidade)**. Não inicie a Fase 10.

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, identidade Auth compartilhada, CompanyScopeProvider/useSupabase, header x-company-id validado, clientes imutáveis, cancelamento/caches, saldos/custos/históricos e contratos. Não refaça arquitetura, faça rollback geral, limpe/una/mova dados reais ou altere fórmulas automaticamente.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (idênticos), docs/ARCHITECTURE.md, docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md; resultados F2–6 em faseN-20260915; fase7-20260916/RESULTADOS.md e REVISAO-SQL.md; **fase8-20260916/RESULTADOS.md, MAPA-DE-CONFIANCA.md, RUNBOOK-TESTES.md, publicacao.json, edges.json e catalogo-vivo.json**. Fazer fetch e incorporar mudanças posteriores com segurança, preservando trabalho local. Nenhuma versão/histórico/fonte local sozinha comprova publicação equivalente.

Supabase wuzxpbixprrgssoeeaez. Revalidação F8 em **16/09/2026 15:09:35 UTC**: ausentes no histórico vivo todas as candidatas abaixo; Vercel READY dpl_79oubxDxhgVF4owXmEXiEP6QUV5N, SHA 80dcf4ec527d1a7e86ed3509496638b71219ab43. Branch de entrega F8 codex/multiunit-phase8; commits locais em git log, sem push. Revalidar produção antes de concluir qualquer equivalência.

Versões candidatas não publicadas:
- F2: 20260915140812.
- F3: 20260915144030, 20260915144031.
- F4: 20260915200818.
- F5: 20260915225538.
- F6: 20260915232846.
- F7: 20260916133617, 20260916133618, 20260916133619, 20260916134848, 20260916135928, 20260916141000.
- F8: **20260916143153_phase8_storage_scope.sql**, **20260916144830_phase8_realtime_events.sql**.

Dependência de release: preflight histórico F3 espera corpos/assinaturas antigos de Salmão e aborta no vivo; preflight F7 recusou PHASE7_PREREQUISITES_REQUIRED. Ninguém editou esses guards nem aplicou fases anteriores silenciosamente. Os dois preflights F8 passaram isoladamente em READ ONLY; isso não libera o pacote integrado. 20260910003448 reapareceu no Git/histórico remoto: explicar a rastreabilidade por evidência, não apagar/renumerar automaticamente.

As 17 Edges publicadas permaneceram: admin-users32, ai-chat9, inventario15, check-password8, purchase-requisitions10, requisicao-estoque14, cmv10, rh10, ficha-tecnica11, admin-companies11, scheduled-jobs7, admin-create-user6, rbac-lint/quick/full6, send-whatsapp-zapi5, cotacao-ia4. JWT gateway true em check-password/admin-companies/rbac-lint-quick/full; demais false com validação manual obrigatória.

## Evidência e invariantes anteriores

F8 baixou 54 arquivos dos 17 bundles, hashes bruto/LF/candidato, imports, ações e27 arquivos consumidores em edges.json. Cinco arquivos remotos diferiam da baseline 2b93c73: inventario, requisicao-estoque, ficha-tecnica, scheduled-jobs e cors.ts do bundle scheduled-jobs; snapshots distintos em published/*.txt, demais reconstruíveis pelo git show indicado. Não confundir CRLF com mudança semântica. Secrets somente nomes/datas; não ler ou imprimir valores.

F8 local:
- CORS por requisição em 15 handlers; wrapper preserva stream/status; admin-users/jobs já locais.
- Storage rh-documentos privado: mantém colaboradorUUID/arquivo; resolve empresa contextual via get_current_company_id, valida colaborador e permissão, rejeita paths/NULL inválidos. Antes multi sem header acessava B apesar de origem A. Não mover/renomear objetos.
- Realtime publica somente INSERT/UPDATE no candidato. DELETE de B vazava PK para A sem filtro na configuração antiga; não reabrir DELETE/TRUNCATE ou usar replica identity FULL como defesa. Seis tabelas: produtos, movimentacoes_estoque, notifications, purchase_orders, cotacoes, cotacao_fornecedores.
- Cinco consumers com proteção de lifetime; notifications/mentions conferem destinatário/empresa. Preservar providers/clientes/cancelamento.
- Compras remove bypass por role admin e inclui empresa em inserts; global explícito preservado. WhatsApp valida fornecedor+cotação+tenant antes do envio, POST-only/timeout 20s/sem redirect, falha de log/status exige revisão de entrega. IA Cotação valida fornecedor antes do LLM. Requisição insere notificação tenant com retry contra unique parcial verificado. ai-chat autentica antes de checar chave.
- Recuo F8 somente contém: revoga helper Storage dos clientes/serviço e retira seis tabelas da publicação, preservando dados. URLs assinadas já emitidas sobrevivem até TTL.

Preserve F4–7: Salmão p_expiration_date date + wrapper text, FEFO/wizard, estorno antes de cancelamento, lock por empresa, produtos_one_active_salmon_raw, helpers internos sem EXECUTE público; fornecedor por nome exato+empresa, FKs preços/cotação e RPC manual atômica; catálogo deactivate_produto para inativar, edit para reativar, delete sem UPDATE genérico/DELETE físico; recalc_product_costs owner-only candidato, exposto no snapshot vivo; caches/materializadas globais contidos; oito FKs compostas, uniques por empresa, INSERTs explícitos e notificações da unidade ativa. Não restaurar grants antigos para adequar job/Edge.

Aceite integral SQL F7 continua pendente: leitores tenant-only sem gate funcional, overloads legados quebrados, FKs simples restantes, turnos e consumers externos. F8 não certificou todos os lotes/ações: RH pode responder success após erro de upsert/log; inventário e writeAudit de ficha/requisição têm falhas de auditoria engolidas; purchase-requisitions/editar filtra item.id sem amarrar requisition_id e precisa validar lote misto na mesma unidade; converter/auditorias não propagam todos os erros. Operações multi-chamada e efeitos externos não são atômicos. Planejamento delete com deleted_at inexistente, inventário rápido com tipo incompatível, Salmão em duas chamadas, cancelamento distribuído, ordem de estorno Compras, gate approve no recebimento, itens livres parciais e primeira conversão concorrente 23505 continuam limites conhecidos.

## 1. Inventário de histórico e estado efetivo

READ ONLY primeiro. Comparar:
- Arquivos locais e todos os refs Git relevantes após fetch: nomes/versões, duplicações, renames, versões ausentes/reaparecidas e conteúdo. Não alterar commits públicos nem históricos.
- supabase_migrations.schema_migrations vivo: version/name/statements quando disponíveis, hashes de conteúdo, ordem real e evidência de apply_migration/repair anterior. Não imprimir secrets de statements históricos.
- Schema vivo atual: funções e overloads por identidade completa (args/tipos/defaults, retorno, language, owner, SECURITY DEFINER/INVOKER, volatility, search_path, ACL inclusive PUBLIC), tabelas/colunas/defaults/generated, constraints/FKs, índices/uniques parciais, policies permissivas/restritivas, RLS/FORCE, grants, sequences, views/materializadas, triggers/event triggers, schemas/extensões.
- Contratos dependentes: Supabase generated types, RPC calls frontend/Edges/jobs, bodies Edge publicados, verify_jwt/CORS, bucket/policies/helper, Realtime publication/identity. Reusar F8 como snapshot, revalidar mudanças posteriores; não refazer efeitos externos.
- Deployments Vercel/Supabase e SHA/hash real; arquivos em main não provam bundle publicado. Configuração/scheduler externa indisponível é limite, não “não existe”.

Criar matriz por versão/objeto: origem/evidência, esperado no Git, efetivo no vivo, ACL/owner/assinatura, callers, classificação (equivalente, CRLF, renomeado, parcialmente aplicado, aplicação manual, histórico divergente, candidato local, desconhecido), risco e ação proposta. Não tratar timestamp como prova de causalidade.

Priorizar incompatibilidade F3/Salmão, 20260910003448, diferenças MCP timestamp/local e objetos das fases corretivas. Distinguir migrations aplicadas que foram legitimamente sobrescritas por posteriores de drift não explicado. Não presumir que todo objeto deve voltar ao corpo da sua migration de criação.

## 2. Reconciliação segura

Derivar ordem de dependência por objetos/callers reais, não apenas datas. Identificar qual estado vivo cada guard espera, quais mudanças já existem por caminhos diferentes e quais testes provam equivalência. Explicar por que guard falha antes de propor qualquer adaptação.

Não:
- editar migrations históricas para fazer db push passar;
- marcar applied/reverted, apagar linha de histórico, renumerar ou copiar versão sem prova;
- aplicar F2–8 silenciosamente;
- dropar overload usado ou restaurar EXECUTE público/service em helper interno;
- recalcular saldo/custo, limpar dados ou recriar schema produtivo.

Se precisar de SQL novo, migration via CLI, preflight de definições/ACLs/overloads/callers, guard de dados pertinente, validação de colunas PL/pgSQL e recuo restritivo. SECURITY DEFINER com assinatura alterada exige tratar explicitamente a antiga; não criar overload sem querer. Novas policies embrulham resolvers/permissões em(select...). Não impor company_id/NOTNULL/FORCE em globais/logs sem classificação.

Preparar plano concreto para histórico sem executá-lo em produção: comandos/versionamento, justificativa verificável e forma de validar antes/depois. Se a publicação autorizada posteriormente usar MCP, repair do timestamp MCP e versão local é na mesma sessão, após comprovação. A Fase 9 não possui autorização implícita para repair remoto só por o CLI reclamar.

## 3. Ensaios

Usar banco/Supabase real isolado com schema atual e fixtures próprias; sem mock de banco ou cópia de dados privados. Criar clones separados para cenários; não reexecutar as seis migrations multiunidade sobre estado já migrado. Não apontar runners para produção nem remover guards sem substituir identificação segura do descartável.

Exercitar:
- reconstrução/reconciliação a partir dos estados relevantes (vivo equivalente e candidato), guard recusando drift/overload/ACL/policy paralela inesperados;
- reaplicação/retry conforme contrato sem mascarar migration parcialmente aplicada;
- preservação de dados/histórico/owner/ACL/constraints e regressão dos callers afetados;
- recuo sem reabrir exposição ou apagar dados, comparação antes/depois;
- cadeia de release proposta sem pular dependências que falham.

Baseline F8:
- 88 checks HTTP de 17 handlers Deno com Auth/PostgREST reais; não gateway cloud.
- Storage 37; Realtime 16; drift 10; recuo 6 com hashes de 152 tabelas intactos.
- SQL F7 248; regressões F3/4/5/6=175/146/67/80. F7 drift 14 e concorrência/recuo 12 são baseline anterior, não repetidos na F8.
- 781/781 unitários em 100 arquivos; TypeScript app/node/build PASS; lint 0 erros/1.354 warnings excluindo .phase8.local; RBAC 0 blockers/2 important/19 info; Deno check 17 + teste CORS 1 + runner HTTP scheduler 8.
- security:check exit 0 pulou SQL lint sem configuração: não declarar banco aprovado.
- RUNBOOK-TESTES documenta ACLbootstrap aditiva de pg_dump, schema privado, fixtures e suites que precisam de base vazia. Stack F8 foi fechada pelo recuo, não pressupor que downloads/publication continuam abertos.

Reexecutar regressões afetadas e checks apropriados às mudanças; não usar contagem de testes para afirmar cobertura de fluxos externos, browser, onboarding ou todas as ações SQL.

## 4. Limites de produção e entrega

Não enviar WhatsApp/email, chamar IA cobrada, pagamentos/cancelamentos ou executar job global produtivo para validar. Scheduler externo (URL/timezone/retry/versão), consumers reporting/DELETE, gateway e backup restaurável continuam sem evidência. Usar metadados, nunca segredos/payloads pessoais. Não pedir segredo no chat.

Concluir trabalho local seguro e registrar bloqueios exatos se publicação/evidência faltar. C01/C02/H01/H02/H03/H04/H05/M01 continuam sem resolução viva comprovada. Produção exige projeto confirmado, backup restaurável, preflight atualizado, dependências equivalentes/publicadas e ensaio aprovado; não fazer push automático em main (Vercel auto-deploy).

Entregar relatório/matriz de drift revisáveis, scripts READ ONLY/reprodução, correções necessárias, riscos e evidências faltantes, sequência exata por versão/caller, pós-validação e recuo. Commits pequenos locais; varrer JWT/segredos/arquivos proibidos antes de git add/commit/push. Manter AGENTS/CLAUDE idênticos e enxutos; não diário.

Encerrar a Fase 9 com resumo curto, commits e prompt completo copiável da Fase 10; **não iniciar Fase 10**.
