# Fase 8 — Edges, Storage, Realtime, integrações e jobs

**Concluída a entrega local; publicação e aceite integral continuam pendentes.** Nenhuma mutation de produção, push, deploy, mensagem, email ou chamada de IA foi executada. Fase 9 não iniciada. As correções não alteram fórmulas, dados reais, identidade compartilhada, providers ou clientes imutáveis.

## Estado vivo e evidências

Revalidação final em **16/09/2026 15:09:35 UTC**, projeto wuzxpbixprrgssoeeaez: as 14 versões candidatas das Fases 2–8 abaixo seguem ausentes; Vercel READY dpl_79oubxDxhgVF4owXmEXiEP6QUV5N em 80dcf4ec527d1a7e86ed3509496638b71219ab43. As 17 versões Edge não mudaram desde o início desta fase. [publicacao.json](publicacao.json) e [endpoints.md](endpoints.md) registram IDs/versões; ausência no histórico não substitui comparação de corpos.

Foram baixados 54 arquivos dos 17 bundles. Comparação LF contra baseline local 2b93c73 encontrou cinco arquivos distintos: entradas inventario, requisicao-estoque, ficha-tecnica, scheduled-jobs e cópia de cors.ts do bundle scheduled-jobs. Os corpos distintos estão em published/*.txt; os demais são reconstruíveis pelo comando git show registrado em [edges.json](edges.json). Hash bruto e hash normalizado separam CRLF de mudança real. Hashes candidatos e imports do novo wrapper constam no inventário; não confundir com hash publicado.

[Catálogo vivo](catalogo-vivo.json): definições/ACLs de 356 funções, Storage, policies, publicação/replica identity, extensions/histórico. [inventario.sql](inventario.sql) é READ ONLY. Nenhum conteúdo de objeto ou payload pessoal coletado. [secrets-metadata.json](secrets-metadata.json) guarda somente nomes/datas.

Mapa humano revisável: [MAPA-DE-CONFIANCA.md](MAPA-DE-CONFIANCA.md); índice por ação: [acoes.md](acoes.md). SQL de todas as tabelas não foi recertificado nesta fase.

## Correções locais comprovadas

| Achado | Antes | Candidato/evidência |
|---|---|---|
| CORS concorrente | 15 handlers alteravam corsHeaders compartilhado entre requests assíncronos | Wrapper por requisição preserva stream/status e sobrescreve CORS com a origem correta. Teste concorrente + 17 preflights reais. admin-users/jobs já tinham escopo local. |
| Storage sem escopo escolhido | Multi de origem A podia baixar documento B sem header | 20260916143153 exige empresa contextual autorizada e colaborador da empresa. Reprodução antes e 37 checks Auth/Storage depois. Não move paths. |
| DELETE Realtime | Subscriber A sem filtro recebeu UUID de B | 20260916144830 limita publicação a INSERT/UPDATE, com guard exato. 16 checks WebSocket após contenção, incluindo reconexão/renovação. |
| Callback atrasado | Canais/refs e busca inicial podiam trabalhar após cleanup | Cinco consumers protegem lifetime; notifications/mentions conferem destinatário e empresa. Dois testes de evento atrasado. |
| Compras role bypass | purchase-requisitions aceitava admin mesmo com DENY funcional | Gate global explícito substitui papel; ALLOW granular com legado DENY funciona. Cabeçalho/itens criados levam company_id. |
| Vínculo de fornecedor externo | WhatsApp não comprovava fornecedor na mesma cotação antes de enviar | Consulta por id+cotacao_id+company_id antes da configuração/envio; fornecedor de B ou outra cotação A retorna404. Cotação IA também valida vínculo antes do LLM; limite de teste abaixo. |
| Erro parcial de envio | Log/status podiam falhar após envio sem sinalização adequada | Timeout20s, sem redirect; erro de transporte não grava URL com token. Falha em log/status retorna DELIVERY_REVIEW_REQUIRED. Ramos após provedor não foram disparados. |
| Notificação de requisição | Upsert sem company_id e conflito genérico contra unique parcial | Insert explícito, verifica erro; 23505 só é idempotência após consultar mesmo tenant/recurso/destinatário/tipo. Duas negações HTTP deixam uma notificação correta. |
| ai-chat sem configuração | Chave ausente precedia validação Auth | Auth/tenant/gate vêm antes da checagem; anon/JWT inválido retornam401 sem depender da chave. |

Migrações novas, criadas via CLI:

1. 20260916143153_phase8_storage_scope.sql — preflight de quatro definições, owner/overload/ACL do helper, quatro policies exatas, bucket privado e paths; alteração do helper; validação explícita das colunas mesmo sem auth.uid.
2. 20260916144830_phase8_realtime_events.sql — owner, flags, conjunto exato das seis tabelas e filtros antes de mudar publish.

Os dois preflights isolados passaram no vivo em READ ONLY às 15:09 UTC. Isso não resolve a incompatibilidade da Fase 3 nem autoriza release integrado. Dez drifts sintéticos provocaram recusa. Nenhuma migration histórica foi editada.

## Testes e cobertura real

Ambiente novo margin-food-phase8, API127.0.0.1:56521/DB56522, Supabase real em Docker (PostgreSQL17.6, Auth2.196, Storage1.73.1, Realtime2.130, PostgREST16.2); schema candidato vazio proveniente do descartável F7. Apenas sete identidades example.test, duas empresas e arquivos sintéticos. Não foi copiada linha de produção.

| Verificação | Resultado / limite |
|---|---|
| Handlers HTTP reais + Auth/PostgREST | **88 checks PASS**, 17 handlers Deno. OPTIONS/anon/JWT inválido em todos; positivos em Compras, admin list, Cotação sem config, self-service/negação e scheduler. Handler direto, sem gateway Edge hospedado. |
| Storage real | **37 PASS**; papéis, headers, caminhos, upload/download/list/copy/move/upsert/remove cruzados, revoke/inactive/company inactive, URL3s. |
| Realtime real | **16 PASS**; A/B/multi, RLS sem filtro, atraso/cleanup, revogação, token renovado/reconexão, UPDATE, logout, DELETE contido. |
| Drift F8 | **10 recusas PASS**, cada alteração dentro de transação revertida. |
| Recuo F8 | **6 PASS**; 152 tabelas com mesmos hashes, incluindo identidades/memberships e tabelas de saldos/custos/histórico/metadados; algumas tabelas estavam vazias; download negado e seis tabelas retiradas da publicação. |
| Regressão SQL F7 | **248 PASS** na stack Supabase completa com ACLs alinhadas ao template. |
| Regressões SQL F3/4/5/6 | **175/146/67/80 PASS** em clone PostgreSQL local vazio separado, com helper Storage candidato. Sem pretensão de HTTP dessas fases. |
| Vitest | **781/781 PASS, 100 arquivos**; inclui 2 novos testes de lifetime. |
| Deno | check dos17 handlers PASS; teste CORS1 PASS; runner HTTP antigo scheduled_jobs_auth8 PASS (deno run, sem banco HTTP disponível). |
| TypeScript app/node e build | PASS. Build conserva avisos de tamanho/Browserslist; Vitest avisou sourcemap ausente de TypeScript, sem falha. |
| Lint | 0 erros/1.354 warnings, com .phase8.local excluída; lint de src+supabase/functions:0 erros/661 warnings. |
| RBAC | PASS,0 blockers/2 important/11 allowlisted/19 info. |
| security:check | exit0; componente SQL pulado sem configuração de serviço. Não significa SQL aprovado. |
| git diff --check; AGENTS=CLAUDE | PASS. |

[validacao.json](validacao.json) lista casos/status sem tokens. Runners scripts/test-phase8-*.mjs; [RUNBOOK-TESTES.md](RUNBOOK-TESTES.md) explica ambiente, comandos e limites.

Incidentes do ensaio, não ocultados: restauração inicial faltou log_private; pg_dump aplica GRANT aditivamente e a stack nova manteve grants bootstrap excessivos. F7 detectou o problema; ACLs foram reconstruídas do template e os248 checks passaram. Primeiras tentativas F3–6 na stack com fixtures F8 falharam por INSERT SELECT de todos auth.users e expectativa de roles vazias; rerun em clone vazio passou. Realtime teve espera curta antes dos eventos; runner agora aguarda entrega positiva até10s e estabiliza assinatura. Logout/rotação da fixture invalidava token para o próximo runner; sessão sintética é renovada sem impressão. O runner legado scheduled_jobs_auth usa Deno.exit e deve rodar com deno run; executá-lo dentro de deno test deixou servidor vivo, encerrado e repetido no modo correto. Lint inicial leu runtime gerado em .phase8.local e falhou; não era erro do código do app.

## Limites que impedem aceite integral

- Não houve jornada completa em browser/gateway hospedado nem onboarding/convite Auth. A matriz foi exercitada nos endpoints pertinentes descritos; não em todas as ações/arrays/lotes das17 Edges.
- Integrações pararam em configuração ausente; nenhum provedor externo foi chamado. Cotação IA valida fornecedor no código, mas o ramo com config válida/fornecedor cruzado e falhas pós-LLM não foi exercitado. WhatsApp após entrega/log/status exige ensaio isolado próprio e contrato de idempotência; não repetir cegamente.
- RH pode retornar success após erro de upsert/log; inventario e writeAudit de ficha/requisição têm writes de auditoria que não propagam erro. Há operações multi-chamada sem atomicidade. Não foram alteradas fórmulas nem criada nova arquitetura transacional para resolver isso.
- purchase-requisitions/editar atualiza itens por item.id via RLS, sem amarrar cada UPDATE ao requisition_id do cabeçalho; um lote com item de outra requisição da mesma unidade precisa de validação específica. converter e algumas auditorias também não propagam todos os erros. A passagem de listar não aprova edição/conversão/lotes.
- check-password tem rate limit só no processo e HIBP fail-open; limites distribuídos/body/método não são uniformes. AI/WhatsApp não têm quota/idempotência durável comprovada.
- Upload/registro e remove/metadado de RH são separados; falhas deixam órfãos/inconsistência. Não se apagaram objetos reais. URLs pré-assinadas e downloads já concluídos sobrevivem até TTL/vida do arquivo.
- Contenção Realtime retira notificações de exclusão física para todas as seis tabelas. Soft delete UPDATE permanece. Antes de publicar, inventariar consumidores externos e validar refetch para exclusão física.
- Scheduler externo, timezone/retry/URL, consumidores de reporting e backup restaurável não foram disponibilizados. Job retorna falha quando auditoria falha, mas efeitos anteriores não são desfeitos. Refresh concorrente não significa exactly-once.
- Permanecem os limites F7: leitores tenant-only, overloads quebrados, FKs simples, gestão de turnos; planejamento delete com deleted_at inexistente, inventário rápido com tipo incompatível, Salmão em duas chamadas, cancelamento distribuído, ordem de estorno Compras, gate approve no recebimento e itens livres parciais. Não se aprovam por teste de outra rotina.
- C01/C02/H01/H02/H03/H04/H05/M01 não foram declarados resolvidos no vivo. Recalc_product_costs continua exposto no snapshot vivo. As fases anteriores locais não foram publicadas implicitamente.

## Sequência de publicação condicionada

**Não executada.** Não usar db push sobre todos os pendentes antes de reconciliar release. Não editar guard antigo, marcar applied por nome nem fazer push em main (auto-deploy).

1. Confirmar projeto, janela e backup restaurável; pausar scheduler/consumidores afetados. Reconsultar corpos/ACLs/policies/overloads/versões e Vercel. Validar gateway, callbacks, URLs assinadas, consumidores DELETE/reporting e dependências SQL residuais em staging equivalente. Sem isso, manter entrega local.
2. Reconciliar separadamente o preflight F3 incompatível com Salmão já publicado. A ordem nominal das dependências é **20260915140812 → 20260915144030 → 20260915144031 → 20260915200818 → 20260915225538 → 20260915232846 → 20260916133617 → 20260916133618 → 20260916133619 → 20260916134848 → 20260916135928 → 20260916141000**. Cada versão precisa de equivalência semântica demonstrada e do runbook original; essa lista NÃO autoriza reaplicar seis migrations multiunidade nem contornar guards.
3. Após release de dependências aprovado, executar preflight.sql e preflight-realtime.sql desta pasta em READ ONLY atualizado; aplicar **20260916143153 → 20260916144830**; executar pos-validacao.sql. Interromper em drift. CLI preferível; se MCP for necessário, reconciliar versão MCP/local com migration repair na mesma sessão conforme AGENTS, só após equivalência comprovada.
4. Publicar bundles candidatos de **admin-companies, admin-create-user, ai-chat, check-password, cmv, cotacao-ia, ficha-tecnica, inventario, purchase-requisitions, rbac-lint, rbac-lint-full, rbac-lint-quick, requisicao-estoque, rh, send-whatsapp-zapi**, incluindo request-cors/cors/company-scope e demais imports. scheduled-jobs também precisa do candidato seguro das dependências (v7 viva diverge); admin-users32 foi equivalente à baseline, revalidar corpo antes de dispensar redeploy. Manter verify_jwt conforme config e validação manual. Números futuros de versão são atribuídos pelo serviço, não previstos aqui.
5. Publicar frontend candidato coordenado (cinco consumers) após SQL/Edges verificados; reexecutar smoke autorizado sem efeitos externos, testes de revogação/troca, hash dos bundles e SHA Vercel. Só então retomar scheduler/consumidores. Integrações reais exigem autorização específica e confirmação no provedor, não envio automático de teste.

## Recuo que preserva dados

Pausar consumers e novas operações afetadas. Executar supabase/rollback/phase8_fail_closed.sql **apenas com projeto/backup/guards confirmados**: revoga EXECUTE do helper Storage de clientes/serviço e retira as seis tabelas da publicação; não apaga bucket/objetos/dados/identidades, não restaura DELETE/TRUNCATE nem grants antigos. Recusa publicação com tabelas inesperadas. URLs assinadas já emitidas ainda podem valer até expiração.

Edges: bloquear os endpoints afetados no gateway/retirar consumer e suspender scheduler enquanto prepara correção; não redeployar automaticamente bundles antigos com bypass/CORS mutável. Frontend pode voltar a um build compatível com contenção, mas não reabrir singleton/global/cache antigo. Se uma entrega WhatsApp já ocorreu, reconciliar pelo provedor antes de repetir. Retomada exige nova pós-validação/canário; “rollback SQL” não desfaz trabalho externo.

## Git e próxima fase

Branch codex/multiunit-phase8 a partir de2b93c73; fetch incorporou nenhuma novidade (origin/main permanece80dcf4e). Commits locais separados de correção/testes/documentação; IDs na entrega e git log. AGENTS.md e CLAUDE.md continuam idênticos e sem diário de execução.

Commits de implementação/evidência: 50b6eda (Edges), 67ca613 (Storage/Realtime) e a85df42 (ensaios/inventário). A documentação e o prompt seguem em commit próprio. A stack margin-food-phase8 foi parada com backup de volumes habilitado; nenhuma outra stack foi encerrada.

Prompt completo: [11-PROMPT-FASE-9.md](../11-PROMPT-FASE-9.md). Não iniciar Fase9 nem atualizar histórico remoto por inferência de timestamps.

Referências de contrato: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) e [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). As conclusões do projeto derivam dos corpos, catálogo e ensaios acima.
