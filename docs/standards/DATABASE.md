# Banco de dados

> Padrão SaaS v3.1 — documento normativo. Não edite o corpo por projeto; adaptações vão em "Particularidades deste projeto", no final.
> Leia ao criar ou alterar migration, policy, função/RPC, view, índice, query pesada, backup ou operação em produção.
> Complementa: MULTI_TENANCY.md (RLS e FK composta), SECURITY.md §5 (bloqueio de escrita direta).

## 1. Migrations

**[N1] Regras gerais:**

- Forward-only. Nunca edite migration já aplicada em qualquer ambiente compartilhado; crie outra.
- Uma preocupação por migration, com nome descritivo.
- Toda tabela nova em schema exposto recebe, **na mesma migration**: RLS habilitada **e forçada** (`force row level security`), policies e revisão de grants. No Supabase, `anon` e `authenticated` costumam receber privilégios padrão nas tabelas de `public`, então a proteção depende de RLS e grants corretos. Confira os grants reais; não presuma.
- Mudança incompatível segue expand → backfill → contract, em deploys separados, para que código antigo e novo convivam.
- Nada de destruir dados silenciosamente. `drop` e `delete` em massa exigem plano, backup e autorização.

**[N1] Antes de aplicar em produção:**

- Avalie locks e duração em tabelas grandes. Índices com `concurrently` não rodam dentro de transação: verifique como a ferramenta de migration executa.
- Lembre que rollback de deploy **não** reverte migration. Tenha roll-forward ou script de reversão testado.

**[N1] Depois de aplicar localmente:**

- Rode os Advisors/lint de segurança e desempenho do Supabase e trate os achados novos.

## 2. Integridade [N1]

Prefira garantias no banco:

- FK (composta quando a relação é dentro do tenant — MULTI_TENANCY §5);
- `unique`, `check`, `not null`;
- enum ou tabela de controle;
- chaves de idempotência únicas.

Validação só no frontend não é integridade.

## 3. Transações e concorrência [N1]

Invariantes que dependem do estado atual (saldo, estoque, limite, status, vagas) são garantidas **na mesma transação** da mutação. Escolha o mecanismo pelo caso:

| Mecanismo | Quando |
|---|---|
| Escrita condicional (`update … where stock >= $qty`) | Decremento/limite simples; é o mais barato |
| `unique` / `check` / exclusion constraint | Regra expressável como restrição |
| `select … for update` | Ler e decidir sobre a mesma linha antes de gravar |
| Coluna `version` (concorrência otimista) | Edição de documento/registro por usuários |
| Isolamento `serializable` | Regras sobre conjuntos de linhas; trate o erro `40001` com retry |

Verificar em uma requisição e gravar em outra não protege: duas requisições simultâneas passam pela verificação e ambas gravam.

## 4. Operações atômicas no Supabase [N1]

O `supabase-js` não mantém transação entre chamadas. Operação de vários passos vira função Postgres. Escolha **um** de dois modelos e registre em "Particularidades":

- **A — servidor chama com service role.** O caso de uso no servidor autentica, resolve o tenant e autoriza. Depois chama a função passando o `company_id` resolvido. `execute` fica revogado de `anon` e `authenticated`.
- **B — usuário chama direto.** A função é `security definer`, verifica membership e permissão internamente via `auth.uid()` e ignora qualquer `company_id` que não pertença ao usuário.

Exemplo do modelo A, com idempotência, invariante e outbox na mesma transação:

```sql
create or replace function public.baixar_estoque(
  p_company_id   uuid,
  p_product_id   uuid,
  p_qty          integer,
  p_operation_id uuid,
  p_request_hash text
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.idempotency_keys (company_id, operation_id, operation, request_hash)
  values (p_company_id, p_operation_id, 'estoque.baixar', p_request_hash)
  on conflict (company_id, operation_id) do nothing;

  if not found then
    perform 1 from public.idempotency_keys
     where company_id = p_company_id
       and operation_id = p_operation_id
       and request_hash = p_request_hash;
    if not found then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';  -- mesma chave, payload diferente
    end if;
    return 'already_processed';  -- em produção, devolva o resultado original guardado na chave (coluna response)
  end if;

  update public.products
     set stock = stock - p_qty
   where id = p_product_id
     and company_id = p_company_id
     and stock >= p_qty;
  if not found then
    raise exception 'ESTOQUE_INSUFICIENTE' using errcode = 'P0001';     -- desfaz tudo, inclusive a chave
  end if;

  insert into public.outbox (company_id, operation_id, event_type, payload)
  values (p_company_id, p_operation_id, 'estoque.baixado.v1',
          jsonb_build_object('product_id', p_product_id, 'qty', p_qty));

  return 'ok';
end;
$$;

revoke execute on function public.baixar_estoque(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
```

É um exemplo ilustrativo: adapte nomes, tipos e o retorno ao esquema real.

## 5. Armadilhas do Supabase/Postgres que vazam dados [N1]

- **View** em schema exposto sem `with (security_invoker = true)` executa com os privilégios do dono e **ignora a RLS** de quem consulta.
- **Função `security definer`** precisa de:
  - `set search_path = ''` e nomes qualificados (`public.tabela`);
  - checagem de tenant interna;
  - ficar fora de schema exposto, salvo intenção explícita.
- **Funções novas** recebem `execute` para `PUBLIC` por padrão. Revogue (`revoke execute … from public, anon, authenticated`) e conceda só a quem deve chamar.
- **Policies** usam `(select auth.uid())` em vez de `auth.uid()` direto, para avaliar uma vez por consulta e não por linha. Indexe as colunas usadas.
- **Checagens de FK, unique e PK ignoram RLS.** Use FK composta para manter o tenant e não confie em RLS para impedir referência cruzada.
- **Tabela sem RLS** em schema exposto está pública para quem tem a anon key.
- **`force row level security`** faz a RLS valer também para o dono da tabela. Os helpers `security definer` dependem de o dono das funções ter `BYPASSRLS` (no Supabase, o papel `postgres` tem). Confira com `select rolname, rolbypassrls from pg_roles where rolname = current_user;` antes de forçar nas tabelas de membership e permissões: sem `BYPASSRLS`, os helpers passam pela RLS dessas tabelas e as policies entram em recursão.

## 6. Desempenho de queries

**[N1]** Antes de criar índice, identifique:

- a query e a frequência;
- o volume e o plano (`explain analyze` em ambiente seguro);
- a seletividade;
- o custo de escrita;
- a interação com RLS e a ordenação.

Não indexe tudo.

**[N1]** Boas práticas:

- projeção explícita;
- paginação por cursor em conjuntos grandes;
- agregação no banco;
- limite máximo por query.

**[N1]** Em serverless, conecte pelo pooler (Supavisor) em modo transação. Nesse modo não há prepared statements persistentes; configure o driver de acordo.

**[N2]** Monitore as queries mais lentas e o uso de conexões.

## 7. Dinheiro, datas e precisão [N1]

- Valores monetários em `numeric(…)` ou inteiro em centavos. Nunca `float`/`real`.
- Regra de arredondamento documentada e aplicada num único lugar.
- Datas em `timestamptz`. O fuso de negócio (ex.: `America/Sao_Paulo`) é explícito nos cálculos de dia, mês e competência.
- Competência e caixa são distinguidos quando o domínio exige.
- Lançamento confirmado não é apagado nem editado: corrige-se por estorno. Trilha de auditoria preservada.
- Cálculos críticos no servidor, testados com exemplos reais.

## 8. Backup e recuperação

**[N1]**

- Backups automáticos ativos.
- Backup ou snapshot antes de qualquer operação de risco.
- **O backup do banco não inclui os objetos do Supabase Storage.** Arquivos precisam de estratégia própria.

**[N2]** Defina e registre em `docs/runbooks/RECOVERY.md`:

| Item | Exemplo de decisão |
|---|---|
| Escopo | banco, objetos do Storage, configuração de Auth, secrets, Edge Functions (código no Git) |
| RPO (perda máxima aceitável) | ex.: 5 min com PITR; 24 h sem |
| RTO (tempo para voltar) | ex.: 2 h |
| Retenção | ex.: 7 / 30 dias |
| Procedimento | passo a passo executável, com comandos |
| Verificação | restaurar em ambiente isolado e conferir dados, arquivos e integrações |

**[N2]** Teste a restauração conforme a criticidade e após mudanças relevantes de esquema ou de infraestrutura. Backup nunca restaurado é hipótese.

## 9. Produção [N1]

- Durante auditoria, produção é somente leitura.
- Antes de qualquer alteração em produção, confirme:
  - ambiente correto;
  - backup;
  - impacto de lock e duração;
  - compatibilidade com o código em execução;
  - plano de roll-forward/reversão;
  - observabilidade;
  - **autorização explícita**.

## 10. Retenção e limpeza [N1]

Tabelas técnicas crescem para sempre se ninguém apagar. Cada uma tem prazo e um job de limpeza (pg_cron ou o runner do projeto), idempotente e em lotes pequenos:

| Tabela | Retenção típica (ajuste em "Particularidades") |
|---|---|
| `idempotency_keys` | 30 dias após a operação, ou o prazo de repetição do provedor |
| outbox processada | 30 dias |
| inbox de webhooks processados (payload) | 30–90 dias; o registro de dedup pode ficar mais, sem payload |
| dead-letter | até ser resolvida; alerta acima de N itens |
| convites expirados, sessões de exportação | 7 dias |
| logs e auditoria técnica | conforme SECURITY §10 e obrigação legal |

O audit log de negócio **não** entra nesta limpeza: segue a retenção decidida para ele. A limpeza não apaga linha ainda referenciada por processamento pendente.

## Particularidades deste projeto

- PostgreSQL 17 (Supabase `wuzxpbixprrgssoeeaez`, sa-east-1). PITR: não verificado. Restore de snapshot lógico (banco, Auth, grants, metadados de Storage) ensaiado em staging no release F12, RTO de cerca de 54 min, e backup lógico pré-release fora do Git (`docs/multi-unidades/fase12-20260916/RESULTADOS.md`).
- Helpers de RLS ficam em `public` (não em `private`) e são chamados dentro de `(select …)`.
- Dia de negócio em `America/Sao_Paulo` (regra completa: AGENTS.md §12); `src/test/migrationsDataNegocioFuso.test.ts` barra o padrão UTC em migration nova.
- Testes de banco: SQL próprio em `supabase/tests/database/` (não pgTAP), executados por `scripts/test-*`, fora do CI.

### Migrations (movidas do AGENTS.md em 2026-10-07)

- **Migrações**: novo arquivo em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS_nome.sql`.
- **`supabase db push` está estruturalmente bloqueado neste repo desde o release F12 — NUNCA rodar o repair que o CLI sugere.** O erro `LegacyDbPushMissingLocalError` lista 16 versões `20260916220000`–`20260916221500` "faltando"; elas são o pacote *forward* publicado em produção (SQL versionado em `release/multiunit-stabilization-20260916/sql/`, fora de `supabase/migrations/` de propósito). A divergência é simétrica e projetada: as 16 candidatas F2–F8 que ficaram em `supabase/migrations/` foram **substituídas** por esse pacote e nunca aplicadas. Aceitar a sugestão do CLI (`repair --status reverted` nas 16 forward) apagaria o registro do release e faria o `db push` seguinte aplicar as candidatas superadas em produção — várias têm preflight incompatível com o catálogo vivo e uma recriaria as 17 policies que o hotfix `20260916153928` substituiu. Migration nova vai por MCP `apply_migration`, com o arquivo local renomeado para a versão que o MCP gravar. Regra do release: `docs/multi-unidades/fase12-20260916/MANIFESTO-RELEASE.md`.
- **Aplicação de migrations**: com o `db push` bloqueado (item acima), migration nova vai por MCP `apply_migration` + `supabase migration repair`, **sempre na mesma sessão**: o MCP grava a versão com timestamp próprio (não o do nome do arquivo local), e sem o repair imediato o histórico do CLI diverge do arquivo local em silêncio — só aparece rodando `supabase migration list` (já aconteceu em 8 migrations sem ninguém notar). Repair de cada divergência: `supabase migration repair --status applied <versão do arquivo local> --yes` + `supabase migration repair --status reverted <versão gerada pelo MCP> --yes`.
- **Alterar parâmetros de função `SECURITY DEFINER` já em produção**: `DROP FUNCTION IF EXISTS` da assinatura antiga antes do `CREATE OR REPLACE` — assinatura de parâmetros diferente cria overload, não substitui.
- **PL/pgSQL só valida colunas na 1ª execução** — migration que altera RPC com JOIN deve incluir `DO`-block que força a resolução de colunas na aplicação da migration (evita crash em produção em vez de no deploy).
- **GRANTs obrigatórios em toda nova tabela**: conceder a `authenticated` apenas o DML necessário (`SELECT, INSERT, UPDATE, DELETE`) e `ALL` a `service_role`; não usar `ALL` para clientes, pois inclui `TRUNCATE` e outros privilégios fora da RLS. Sem o GRANT de leitura, PostgREST nega SELECT mesmo com policy permissiva.

### RLS e policies

- RLS não protege `TRUNCATE` nem materialized views; clientes não recebem privilégios de DDL/manutenção, e caches globais ficam atrás de APIs autorizadas. Chaves de conflito de recursos por período incluem `company_id`.
- Tabelas novas exigem RLS e FORCE RLS; há exceções legadas no banco vivo, inventariadas em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. FORCE RLS não protege contra funções de owner com BYPASSRLS.
- **Toda policy nova DEVE embrulhar `get_current_company_id()`/`has_permission()`/`has_any_permission()` em `(select ...)` na `USING`/`WITH CHECK`.** Mesmo `STABLE`, o Postgres reavalia essas chamadas linha a linha dentro de um `Filter`; `has_any_permission` chama `get_effective_permissions()` (4 CTEs, VOLATILE) — sem o `(select ...)` isso vira `InitPlan` avaliado 1x por execução em vez de 1x por linha. Sem isso, um `SELECT ... LIMIT N` pode multiplicar o tempo em ordens de grandeza e estourar `statement_timeout` (caso real: `fin_lancamentos.tenant_read`, 8,7s → 47ms, 185x — migration `20260806171500`). Audit completo do schema já corrigiu 388/426 policies em 111 tabelas (`20260806173000`). Em 2026-10-07, 587 das 588 policies de `public` estavam assim; a exceção era `fin_conciliacao_vinculos_tenant_select` (pendência no `TAREFAS.md`). O lint `auth_rls_initplan` dos Advisors acusa centenas de policies; nelas o `auth.uid()` aparece como argumento dentro de `(select has_any_permission(auth.uid(), …))`, que já é avaliado uma vez. Confira pelo texto da policy em `pg_policies`, não pela contagem do lint.
- Toda nova tabela com coluna pesquisável por usuário: adicionar coluna gerada `*_unaccent` + índice `gin (col_unaccent gin_trgm_ops)` na mesma migration (wrapper `public.immutable_unaccent(text)` já existe).
- Chave de permissão usada na policy e gates do banco: ACCESS_CONTROL, "Particularidades". Isolamento em `SECURITY DEFINER`: MULTI_TENANCY, "Particularidades".

### Escrita, idempotência e armadilhas de SQL

- **Chave de idempotência precisa identificar a OPERAÇÃO, não só a tentativa** — reconhecer o reenvio só por `reference_id` deixa um buraco: se o servidor grava mas a resposta se perde, o cliente mostra erro sem renovar a chave; o operador troca de produto e confirma, e o caminho rápido devolve `idempotente=true` apontando para o lançamento ANTERIOR — sucesso na tela, nada gravado para o produto novo, e o cache de saldo não tem como detectar depois. `op_registrar_movimentacao` compara produto/setor/tipo/quantidade com o lançamento achado e levanta `REQUEST_ID_REUTILIZADO` quando não batem. No cliente a chave é **derivada** da semente + conteúdo, e a semente é **por conteúdo pendente** (`useChavesPendentes(escopo)` sobre `criarChavesPendentes` de `@/lib/chaveOperacao`; no operacional, `chaveSaida`): `chave(conteudo)` no envio, `confirmar(conteudo)` só no sucesso DAQUELE conteúdo, `renovar` só no reenvio consciente (WhatsApp sem confirmação). Nunca estado em `useState` nem uma semente por tela girada no sucesso — "A grava sem resposta → B dá certo → reenvio de A" duplicava A, e fechar/reabrir o modal também. As sementes vivem fora do componente (registro da aba + `sessionStorage`, por empresa, validade de 12h sem uso), e o `conteudo` é o que o servidor compara no reenvio, em forma canônica. Registro editável depois de criado (sessão e decisão da Apresentação Sócios) compara o reenvio com o `idempotency_fingerprint` do pedido original, nunca com a linha atual, e dado recapturado a cada tentativa (snapshot, `capturedAt`) fica fora da chave e do fingerprint — senão o retry vira `REQUEST_ID_REUTILIZADO` ou um 2º registro. Efeito colateral depois do commit (auditoria, alerta, notificação, refresh da tela) nunca vira erro na resposta, senão a tela convida a reenviar o que já foi gravado.
- **Diff de lista filha decide a remoção pelo `id`, nunca pelo valor de negócio** — em `diffCodigos`, remover um código e readicionar o MESMO número (para trocar o rótulo) não gerava DELETE: o valor continuava presente na lista nova, a linha antiga sobrevivia e o INSERT batia no índice único. Vale para qualquer lista filha editada por diff; e o DELETE roda sempre antes do INSERT, senão os dois disputam a mesma chave única.
- **INSERT em `audit_logs` resolve o tenant pelo registro** (`log_private.stamp_log` → `resource_company(entity, entity_id)`): `entity_id` precisa ser o id de uma linha existente da entidade, senão `LOG_RESOURCE_TENANT_REQUIRED` derruba a transação inteira da RPC.
- **`min()` não existe para `uuid` no Postgres** — para escolher "o id do candidato mais próximo" use `(array_agg(id ORDER BY id))[1]`. `min(id)` sobre uuid passa no `CREATE FUNCTION` e só quebra na chamada real (42883 `function min(uuid) does not exist`), derrubando a RPC inteira: foi o que manteve "Marcar como Transferência" e o auto-bind de contrapartida quebrados por dias (migration `20260818150000`).
- Saldo de estoque é o cache `produtos.saldo_atual` (fonte única): `docs/modules/estoque.md`. Notificação nasce só no servidor: `docs/modules/ui.md`, "Componentes padronizados".
