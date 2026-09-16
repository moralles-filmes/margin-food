# Operação, publicação e recuo — bloqueado, não executado

Projeto exclusivo `wuzxpbixprrgssoeeaez`. O aceite local F11 não autoriza publicação. Não há migration F11, patch de compatibilidade F3/F7 ou manifesto integrado aprovado. Push em main publica automaticamente Vercel. Não fazer push de documentação para main como se fosse neutro.

## Condições antes de pedir autorização de publicação

| Ordem | Trabalho concreto e prova de saída | Responsável a designar |
|---|---|---|
| 1 | Confirmar commit candidato, diff, projeto, versões/ACL/corpos/policies, alias/SHA Vercel, hashes dos 17 bundles e pendências CLI; comparar com F11 e parar em drift | Coordenador do release + backend |
| 2 | Backup completo recente de dados/Auth/grants/metadados Storage e prova de restauração, com RPO/RTO, acesso privado e operador; dumps schema/fixtures não substituem backup | Operação/DBA |
| 3 | Identificar scheduler (URL/action/timezone/retry/cadência/alarme), consumidores reporting/DELETE e responsável por cada um; validar comportamento no staging | Operação/integrações |
| 4 | Reconciliar F3 em avanço revisável a partir do vivo+F2, preservando DATE/TEXT de validade, estorno antes de cancelamento, logs e nenhuma atômica antiga de 9 argumentos | Backend |
| 5 | Reconciliar F7 em avanço revisável a partir das dependências+hotfix; preservar as 17 policies e operational_active_lookup, ALLOW granular/legado DENY, readers/cache/uniques/FKs | Backend/RBAC |
| 6 | Resolver contratos residuais pertinentes e montar manifesto versão substituída→avanço real→hash→objetos→ensaios→recuo. Sem marcar candidata aplicada por equivalência suposta | Backend + revisor |
| 7 | Diretório de release separado, cópias por hash do histórico já aplicado e somente pendências aprovadas. Ensaiar sequência EXATA em novo clone vivo equivalente, gateway hospedado de staging e fixtures próprias | Plataforma/QA |
| 8 | Reexecutar matriz de aceite e recuos do pacote, incluindo backup/restauração, todas as dependências alteradas, performance e endpoints/consumers. Definir janela/operador/limites de parada | QA/DBA/coordenador |
| 9 | Apresentar plano final com arquivos, hashes, comandos, efeitos, indisponibilidade e recuo para autorização própria de publicação | Coordenador |

Não substituir hashes nos guards históricos para cumprir 4/5. F3 contém corpos antigos além do preflight; só trocar a condição reintroduz overload/estorno incorreto. F7 não pode remover hotfix para passar. Não apagar/renumerar/reaplicar `20260910003448`, `20260915120000` ou o hotfix. Cinco históricos sem statements e 215 comparações textuais inconclusivas não justificam repair.

## Ordem de aplicação futura, após todos os gates

O [plano F9](../fase9-20260916/PLANO-RELEASE.md) contém o detalhamento por objeto. A sequência abaixo permanece condicional; uma falha interrompe as etapas seguintes.

1. Pausar writers e consumidores incompatíveis, criação/edição de memberships e scheduler conforme janela acordada. Registrar catálogo e invariantes autorizados: identidades, empresa original, memberships/grants por unidade, saldos/custos/ledger, vínculos e metadados Storage. Não copiar payloads para Git/chat.
2. F2 `20260915140812`: contenção de manutenção/companies, com scheduler previamente validado. Pode formar release separado explicitamente autorizado. Executar preflight e pós-validação F2; confirmar execução de manutenção somente por serviço legítimo.
3. Avanço reconciliado de F3 substitui candidata incompatível `20260915144030`; classificador `20260915144031` só depois dos writers/readers. Instalar classificador não autoriza backfill. Revisão de histórico ambíguo é operação própria.
4. F4 `20260915200818`, F5 `20260915225538`, F6 `20260915232846`, pelos contratos reconciliados e preflights. Preservar lock/unique Salmão, fornecedor exato+empresa, RPC atômica de preço, inativação dedicada e helpers internos sem EXECUTE público/service. Pós-validar cada transação; não reaplicar o lote em retry.
5. Avanços F7 substituem candidatas incompatíveis `20260916133617`/`20260916133618`; então writers/FKs `20260916133619`, conflitos por empresa `20260916134848`, leitores `20260916135928`, notificações `20260916141000`, somente conforme manifesto ensaiado. Writers RH antigos precisam estar pausados durante a troca de unique.
6. F8 Storage `20260916143153` e Realtime `20260916144830`, com preflight atualizado. Bucket privado e path colaboradorUUID/arquivo preservados; publicar somente INSERT/UPDATE nas seis tabelas, sem FULL como defesa de DELETE.
7. Bundles candidatos coerentes: admin-companies, admin-create-user, ai-chat, check-password, cmv, cotacao-ia, ficha-tecnica, inventario, purchase-requisitions, rbac-lint/quick/full, requisicao-estoque, rh, send-whatsapp-zapi e scheduled-jobs, com shared imports. admin-users32 só dispensa redeploy se corpo/imports continuarem equivalentes. Preservar verify_jwt: true em check-password/admin-companies/quick/full, demais conforme config com autenticação manual; scheduler usa seu segredo. Não expor valores de secrets.
8. Frontend coerente até F10 (F11 não muda produto), após garantir contratos `deactivate_produto`, `upsert_supplier_price`, `list_restricted_logs`, novos conflitos RH e APIs contidas. Não regenerar tipos contra um backend atrasado para mascarar ausência.
9. Antes da retomada: pós-validações SQL de cada fase, ACL efetiva/PUBLIC/service, owners/overloads, policies paralelas/constraints, histórico local/remoto e catálogo, hashes Edge e alias/SHA Vercel. Repetir A/B/multi/granular-DENY, revogação, identidade e exports com cenário autorizado; conferir invariantes agregados. Gateway deve estar comprovado. Não usar super-admin para mascarar RBAC funcional.
10. Retomar consumidores gradualmente e observar execução legítima do scheduler e erros. Registrar horários, operador, resultados e estado final. Só evidência viva permite fechar cada achado C/H/M; nenhuma contagem de testes substitui essa prova.

Preferir CLI com plano exato conferido no diretório de release. Nunca `--include-all` na raiz. Se CLI exigir o flag no diretório isolado, a allowlist completa precisa de revisão explícita. Fallback MCP somente na publicação autorizada, SQL integral comprovado e **repair dos dois timestamps na mesma sessão**, com versão remota realmente observada. Nunca repair para resolver recusa de guard. Nem a lista de versões nem seu timestamp provam ordem real de execução.

## Critérios de parada e observação

Parar em qualquer drift/preflight/exit não zero; retorno de unidade indevida; perda/alteração inesperada de identidade/origem/grants; ação granular autorizada recusada; permissão global obtida por admin local; custo/saldo/histórico divergente; erro de RPC ou falha parcial; rollback não ensaiado; falta de backup/gateway/consumidor responsável. Não avançar para o frontend para compensar falha SQL.

Antes da janela, operação deve preencher SLO/limites de latência/timeout/erro e duração de observação segundo tráfego real. Os 60 planos F11 e 119ms de retry local não são limites de produção. Métricas agregadas por endpoint/unidade, sem conteúdo privado. Consultar estado/idempotência na unidade original após abort/timeout de write: abort não desfaz commit e retry cego pode duplicar efeitos.

## Recuo que preserva dados e identidade

1. Interromper rollout e novos writers/consumers afetados; pausar scheduler. Identificar a última etapa realmente confirmada por catálogo, não só pelo terminal. Manter artefatos/backup e registrar estado parcial.
2. Selecionar o fail-closed pertinente às etapas aplicadas (`supabase/rollback/phase2_fail_closed.sql` a `phase8_fail_closed.sql`), com preflight de projeto/estado e ensaio do pacote. F11 reexecutou somente F2/F7; os outros conservam baseline anterior e precisam nova validação integrada.
3. F2 fecha manutenção/administração; F3 restringe logs; F4 fecha APIs de Salmão; F5 fecha writers de fornecedor/preço/recebimento; F6 fecha catálogo; F7 fecha DML/APIs alteradas; F8 revoga helper Storage e remove as seis tabelas da publicação. Conferir o script exato e sua cobertura antes de operar: owner/service/callers internos podem continuar, portanto recuo não é paralisação universal.
4. Preservar Auth, empresa original, memberships e grants arquiváveis por empresa, dados operacionais/financeiros, saldo_atual, custos, histórico, FKs/uniques, objetos/paths Storage. Não usar rollback geral multiunidade, DELETE/TRUNCATE, deduplicação ou mudança de fórmula. Nunca reabrir helpers/caches/materializadas ou retirar operational_active_lookup.
5. Bloquear endpoints afetados no gateway/suspender consumers em vez de redeploy automático de bundles vulneráveis. Frontend só volta a build compatível com contenções; não restaurar comportamento global de cache/rascunhos/exports já corrigido F10. Recarregar abas controladamente. F11 não exige rollback de produto porque só adiciona harness/evidência/documentação.
6. URLs assinadas anteriores podem sobreviver ao TTL; arquivos baixados não são revogados. Envio externo já ocorrido/commit confirmado exige reconciliação antes de retry. Não estornar/pagar/cancelar automaticamente para desfazer UI.
7. Comparar digests/contagens autorizadas antes/depois, ACLs, logins, unidade original e acessos; registrar indisponibilidade deliberada. Recuperar por avanço revisado e reensaiado. Não marcar migration aplicada como inexistente nem eliminar snapshots para liberar o próximo deploy.

**Estado desta entrega:** nenhum passo de publicação/recuo produtivo foi executado. Falta prova dos gates 1–8, especialmente compatibilidade F3/F7, backup, scheduler/consumers e gateway. Não pedir aprovação de deploy enquanto o pacote concreto ainda não satisfizer esses gates.
