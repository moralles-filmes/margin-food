# Plano de release — bloqueado, não executado

Projeto exclusivo: `wuzxpbixprrgssoeeaez`. Não usar `db push` na raiz para publicar toda a fila. As 14 candidatas ausentes são mudanças reais não aplicadas, não entradas esquecidas que possam ser marcadas applied. O hotfix `20260916153928` já está vivo e deve ser preservado. Nenhuma repair é necessária para `20260910003448` ou para o hotfix no estado observado.

## Sequência por objetos e consumers

| Ordem lógica | Versão candidata | Dependência/caller e decisão |
|---|---|---|
| 1 | 20260915140812 | Contém manutenção/companies; scheduled-jobs passa a exigir action e POST. Preflight vivo PASS; ainda requer backup, scheduler identificado, integração e janela. Pode ser release separado autorizado. |
| **PARAR** | 20260915144030 | Logs/writers/readers; depende da contenção F2. Guard e corpos de Salmão estão obsoletos. Não aplicar arquivo histórico nem mudar seus hashes. |
| 2b | 20260915144031 | Classificador depende de writers/log_private de F3. Instalação não autoriza backfill de dados reais; revisão de correlações e lotes é separada. |
| 3 | 20260915200818 | Wrappers/atômicas de Salmão; preservar validade DATE, wrapper TEXT, FEFO, estorno primeiro, lock/unique e helpers internos. Isolado PASS não satisfaz F3. |
| 4 | 20260915225538 | Fornecedores/preços, FK composta, recebimento e RPC de preço; depende de logs internos F3 e Salmão F4. Readers/escritores de preço devem migrar juntos. |
| 5 | 20260915232846 | Gates de produtos, deactivate_produto, SKU e custo owner-only; depende de F3–5. Sem restaurar EXECUTE em recalc_product_costs. |
| **PARAR** | 20260916133617 | Contenção de privilégios/caches; seu guard abrangente recusa policies do hotfix, mesmo com F2–6. Exige avanço revisado. |
| **PARAR** | 20260916133618 | Policies de referência antigas; conflita com 17 alterações do hotfix. Não reverter hotfix para aplicar este arquivo. |
| 6c | 20260916133619 | Writers SQL + oito FKs; exige definições/ACL/constraints equivalentes e logs internos. Compras/Ficha/Financeiro são callers. |
| 6d | 20260916134848 | Uniques por empresa de Planning/RH. Pausar writers antigos antes da troca; frontend antigo de RH usa conflito global e falha. |
| 6e | 20260916135928 | Readers de estoque/contas; conserva saldo_atual e fórmulas. Gates por tela; consumidores precisam de permissões granulares corretas. |
| 6f | 20260916141000 | mark_all_notifications_read por destinatário+unidade; caller de notificações e header contextual. |
| 7 | 20260916143153 | Helper Storage por unidade/colaborador, sem mover paths. Preflight isolado PASS; não libera cadeia. |
| 8 | 20260916144830 | Realtime somente INSERT/UPDATE; confirmar consumers externos de DELETE e comportamento de refetch. |
| 9 | Edges | Publicar bundles candidatos e imports coerentes com SQL, preservando verify_jwt. Ver lista abaixo. |
| 10 | Frontend | Publicação coordenada após contratos SQL/Edges; client contextualizado, conflicts RH, APIs fechadas e teardown devem coincidir com o bundle efetivo. |

Essa ordem é por dependência, não uma autorização para ordenar os arquivos por timestamp e executá-los. Cada migration é transacional individualmente: uma recusa em F3 deixa F2 aplicada. Em falha posterior, não reaplicar o lote inteiro nem apagar entradas de histórico.

## Avanços necessários antes de um pacote integrado

1. Criar via `supabase migration new <nome>` uma migration de avanço para logs, baseada no **estado vivo atual + F2**. Gerar o timestamp real pelo CLI; não reservar número fictício. O preflight deve reconhecer exatamente os corpos atuais, owners, ACLs, overloads, policies, defaults, triggers e callers. Preservar o contrato de validade/estorno que chegou por `20260915160200/160300/170000`; não recriar a antiga atômica de nove argumentos. Comparar o resultado depois de F4 com o candidato aprovado, incluindo auditoria/UUIDs e saldos/custos.
2. Preparar avanço de F7 para o estado **F2–6 reconciliado + hotfix**, reconhecendo suas policies exatas e preservando `operational_active_lookup`/permissões adicionais. Separar contenção das alterações que ainda faltam; não criar policies permissivas paralelas por conveniência. A presença de uma policy com nome parecido não prova equivalência. Reexecutar 526 assertions do hotfix e suites F3–7; guards devem recusar alteração adicional/ACL/overload/default/índice/constraint/caller inesperado.
3. As candidatas substituídas continuam arquivadas e rastreáveis no Git, **sem marcar applied/reverted no vivo**. Um manifesto aprovado deverá relacionar versão substituída → avanço real → equivalência por objeto/teste. Nenhuma migration já aplicada será editada, renumerada ou reaplicada. Uma migration de avanço grande não deve ser disfarçada de troca de hash: precisa de revisão própria.
4. Montar diretório de release isolado, contendo cópias verificadas por hash dos 856 arquivos já registrados e somente os avanços/candidatas efetivamente escolhidos. Não remover nada do checkout original. A allowlist deve corresponder ao manifesto revisado; candidatos substituídos ficam fora desse diretório. Isso evita que o CLI tente executar um candidato obsoleto que permaneceu preservado no Git.
5. Ensaiar a sequência exata em **clone novo do estado vivo**, sem atalhos de template candidato e sem dados privados. Confirmar que a ordem real de aplicação mantém todas as dependências; se versões antigas remanescentes exigirem `--include-all`, somente usá-lo no diretório de release cuja allowlist foi verificada. Não usar esse flag na raiz para contornar o aviso atual. O ensaio F9 parou corretamente em F3, portanto este requisito ainda está pendente.

Os avanços acima são especificação de trabalho bloqueante, não arquivos prontos. A F9 não alterou guards históricos ou gerou SQL produtivo que ainda não tivesse equivalência comprovada. O histórico atual não precisa de alteração administrativa para permitir esse trabalho local.

## Comandos e histórico

CLI instalado: 2.111.0, flags consultadas via `--help`. Com autenticação segura já configurada, sem fornecer chaves/senhas pelo chat:

```powershell
git fetch --all --tags
git status --short
supabase migration list --linked
supabase db push --linked --dry-run
```

A saída do dry-run não compila PL/pgSQL, não executa guards e não prova segurança. O pacote só poderá avançar após projeto/backup/janela/allowlist e ensaio aprovados. No diretório de release preparado e vinculado ao projeto confirmado:

```powershell
supabase migration list --linked --workdir .phase9.local/release
supabase db push --linked --dry-run --workdir .phase9.local/release
# Aplicação somente após satisfazer todas as condições e autorização de publicação:
supabase db push --linked --workdir .phase9.local/release
supabase migration list --linked --workdir .phase9.local/release
```

Se o CLI necessitar `--include-all`, revisar novamente a lista completa antes de autorizar; o diretório de release deve conter somente as pendências aprovadas. Interromper em exit code diferente de zero; não continuar para próxima fase em falha.

Fallback MCP, **somente em publicação futura autorizada e após comprovar DDL completo**, um arquivo aprovado por vez: obter a versão realmente gerada de nova consulta de histórico; comparar antes/depois e statements/corpos; executar os dois repairs na mesma sessão. Variáveis são preenchidas com versões observadas, não presumidas:

```powershell
supabase migration repair --linked --status applied $phase9ApprovedLocalVersion --yes --workdir .phase9.local/release
supabase migration repair --linked --status reverted $phase9ObservedMcpVersion --yes --workdir .phase9.local/release
supabase migration list --linked --workdir .phase9.local/release
```

Não executar esses comandos para “resolver” `PHASE3_FUNCTION_DRIFT`/`PHASE7_POLICY_DRIFT`, nem marcar uma candidata substituída como se tivesse sido aplicada. Sem prova do DDL completo, tratar como estado parcial desconhecido, parar e comparar catálogo/histórico; nunca tentar apenas repair.

## Edges, pós-validação e retomada

Publicar as candidatas de `admin-companies`, `admin-create-user`, `ai-chat`, `check-password`, `cmv`, `cotacao-ia`, `ficha-tecnica`, `inventario`, `purchase-requisitions`, `rbac-lint`, `rbac-lint-full`, `rbac-lint-quick`, `requisicao-estoque`, `rh`, `send-whatsapp-zapi` e `scheduled-jobs`, incluindo seus imports compartilhados. `admin-users32` coincide com a baseline; dispensar redeploy somente após nova comparação. Gateway JWT true em check-password/admin-companies/rbac-lint-quick/full; demais false com autenticação manual, salvo scheduler autenticado por segredo de job. Preservar nomes/configuração de secrets; não ler valores.

Antes de reabrir writers: pós-validações SQL das fases, catálogo completo/ACL efetiva/PUBLIC/overloads, RLS e políticas paralelas, constraints validadas, invariantes agregados de identidade/memberships/dados/saldos/custos/históricos, histórico local/remoto, hashes dos bundles Edge e SHA/alias Vercel. Testar caminhos A/B/multi/granular-DENY e falhas/retries autorizados em staging equivalente. Não disparar WhatsApp/email/LLM/pagamento/cancelamento/job global produtivo para fechar lacuna de teste.

Backup restaurável atual, gateway/consumers externos/scheduler e jornada browser continuam condições não satisfeitas. O backup histórico documentado em outra máquina não é evidência disponível de restauração atual.

## Recuo restritivo

Pausar writers/consumers afetados e scheduler. Usar, conforme a etapa efetivamente publicada, os scripts `supabase/rollback/phase2_fail_closed.sql` a `phase8_fail_closed.sql`, com preflight de estado e backup confirmado. Os ensaios F9 repetiram F2/F7; os demais conservam evidência anterior e precisam de ensaio do pacote final.

F2 fecha manutenção/administração; F7 fecha DML/APIs afetadas preservando dados, FKs e uniques. F8 revoga helper Storage e retira as seis tabelas da publicação, preservando objetos e paths; URLs já assinadas sobrevivem até TTL. Não reabrir PUBLIC/service EXECUTE em helpers internos, TRUNCATE, materializadas ou DELETE Realtime, nem restaurar bundles antigos vulneráveis. Recuo não desfaz envio externo, escrita já confirmada ou todas as operações de owner/service. Recuperação por avanço revisado, sem rollback geral multiunidade.
