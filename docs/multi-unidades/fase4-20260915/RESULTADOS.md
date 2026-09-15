# Fase 4 — Salmão, funções internas e grants

15/09/2026. Branch `codex/multiunit-phase4`. **Correção implementada e ensaiada localmente. H04 continua aberto em produção até publicação e pós-validação.** Nenhuma escrita, migration, repair, backfill, deploy ou push foi feito em produção nesta execução. Fase 5 não iniciada.

## 1. Atualizações da outra máquina e produção

Checkout inicial limpo em `b62d895`, Fase 3. `git fetch origin` encontrou sete commits novos na main, até `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Integrados pelo merge local `2964ec5`; conflitos somente em AGENTS/CLAUDE, mantendo contexto corrigido das fases anteriores e regras novas. A integração preserva validade do lote, seleção FEFO, Enter no wizard, ordem estorno→cancelamento, listas alfabéticas e Borderô. Último fetch não encontrou novos commits pendentes.

Produção revalidada às **20:28:41 UTC / 17:28 Brasília**, PostgreSQL 17.6, projeto `wuzxpbixprrgssoeeaez`:

- Fases 2 (`20260915140812`), 3 (`20260915144030`, `20260915144031`) e 4 (`20260915200818`) ausentes do histórico remoto. `cleanup_old_audit_logs` ainda executável por anon, refresh por authenticated e `companies_admin` ainda usa `system:admin`. **C01/C02/H01/H02/H03 permanecem pendentes.**
- As cinco migrations recentes de Salmão `20260915160000`–`20260915170000` estão publicadas. A assinatura de criação agora inclui validade; o overload antigo foi removido.
- Vercel: produção READY em `80dcf4e`, deployment `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, com alias `www.marginfood.com`. Não foi confundido com preview.
- Edges: scheduled-jobs v7, inventario v15, requisicao-estoque v14 e **ficha-tecnica v11**. A atualização v11 é ordenação/paginação, não prova publicação dos writers da Fase 3.
- `20260910003448` reapareceu no Git remoto e no histórico do banco. Isso atualiza a constatação de ausência da Fase 1; a rastreabilidade histórica continua para a Fase 9.
- Zero grupos com mais de um produto bruto ativo vinculado e zero movimentos `source_module='salmon'` apontando para produto de outra empresa no snapshot de leitura.

Evidências: [publicação](publicacao.json), [catálogo](catalogo.json), [estrutura](estrutura-anterior.json), [funções anteriores](funcoes-anteriores.json), [dependências](dependencias-anteriores.json), [Edge publicada](edge-publicada.json), [ACLs após ensaio](acls-apos-ensaio.json), [comparação de schema](comparacao-schema.json) e [validação/identificação do candidato](validacao.json).

## 2. Correção e fronteira de autorização

Migration nova: [20260915200818_harden_salmon_internal_functions.sql](../../../supabase/migrations/20260915200818_harden_salmon_internal_functions.sql).

1. **Quatro atômicas e `ensure_salmon_raw_product` ficam internas**: EXECUTE revogado de PUBLIC, anon, authenticated e service_role. O owner postgres mantém os callers SECURITY DEFINER legítimos. Outros grants explícitos não-owner são removidos somente após preflight de ACL. Não foi concedido serviço por suposição.
2. Os quatro wrappers públicos validam `assert_tenant()` antes da operação e exigem a chave granular existente da ação, seus aliases legados efetivamente mapeados ou `system:global:manage`. Usuário granular ALLOW/legado DENY funciona. Admin local sem permissão funcional continua recusado. A permissão de editar entrada não foi ampliada para criar/cancelar.
3. O helper de produto usa lock transacional por empresa antes de procurar/criar, bloqueia a linha existente durante uso e envia empresa explícita. O índice parcial único `produtos_one_active_salmon_raw` garante no máximo um produto bruto **ativo** por empresa, inclusive contra outro writer. Preflight recusa duplicatas; nenhuma linha é removida ou unificada automaticamente.
4. A atualização de custo da entrada exige empresa exata, eliminando a alternativa `company_id IS NULL`. Cancelamento valida empresa do produto do espelho e sua origem `salmon` antes de estornar; inconsistência aborta a transação inteira.
5. `get_salmon_dashboard_summary` é interno ao wrapper de dashboard; as duas funções de validação são internas aos triggers. As demais entradas públicas revisadas ficam exclusivamente em authenticated, conservando seus guards. **16 assinaturas**, owner postgres, sem novos overloads.
6. A RPC pública de sobra mantém upsert por empresa/data, mas deixa de aceitar `salmon:dashboard:view` como autorização de escrita. Exige `salmon:manipulacao:create`, compatibilidade `salmon:write` ou global. O botão e handler em `ManipulationView` usam o mesmo gate.

Não alterados: fórmulas de rendimento/custo, validade, seleção FEFO, estatísticas financeiras, memberships, identidade Auth, clientes contextualizados, RLS de outros módulos e contratos internos dos logs da Fase 3. A integração do Borderô exigiu apenas normalizar CRLF/LF no harness `borderoMigration.test.ts`, sem mudar migrations históricas.

## 3. Caminhos e ACLs antes/depois

**Antes:** PUBLIC/anon/authenticated/service_role tinham EXECUTE efetivo em todas as 16 assinaturas desta matriz. As entradas recém-recriadas com validade tinham ACL nula, portanto herdavam o default PUBLIC. Todos os owners eram postgres. **Depois:** owner preservado; internas sem execução desses quatro papéis; públicas com EXECUTE somente em authenticated. Não há grant PUBLIC residual. Os snapshots contêm assinaturas, SECURITY DEFINER, search_path e ACLs completos.

| Função/grupo | Caller comprovado | Classe após correção / permissão |
|---|---|---|
| `_salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)` | useSalmonStore, criar e recriar entrada | Pública; entradas:create + aliases/global |
| `_salmon_cancel_entry_guarded(uuid,text)` | useSalmonStore, excluir/edição | Pública; entradas:delete + aliases/global |
| `_salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)` | useSalmonStore | Pública; manipulacao:create + aliases/global |
| `_salmon_cancel_manipulation_guarded(uuid,text)` | useSalmonStore | Pública; manipulacao:delete + legado/global |
| `create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)` | wrapper de entrada | Interna |
| `cancel_salmon_entry_atomic(uuid,text)` | wrapper de cancelamento | Interna |
| `create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)` | wrapper de manipulação | Interna |
| `cancel_salmon_manipulation_atomic(uuid,text)` | wrapper de cancelamento | Interna |
| `ensure_salmon_raw_product()` | duas atômicas de criação | Interna |
| `_salmon_dashboard_guarded(text,text)` | useSalmonDashboard | Pública; dashboard:view/read + legado/global |
| `get_salmon_dashboard_summary(date,date)` | wrapper de dashboard | Interna |
| `get_salmon_inventory_adjustment_kg()` | useSalmonStore | Pública; estoque:view/dashboard:view/global |
| `get_salmon_reconciliation_kpis()` | EntriesView | Pública; entradas:view/legado/global |
| `upsert_salmon_leftover_atomic(date,numeric,text)` | useSalmonStore → ManipulationView | Pública; manipulacao:create/legado/global |
| `validate_salmon_entry()` | trigger ativo de salmon_entries | Interna; execução do trigger preservada |
| `validate_salmon_manipulation()` | trigger ativo de salmon_manipulations | Interna; execução do trigger preservada |

Cadeia operacional: cliente `useSupabase()` → wrapper → atômica → linha de Salmão + `ensure_salmon_raw_product` → produto/SKU → movimento de estoque → validators + cache `fn_update_product_stock` → `fn_recompute_product_saldo` → auditoria. Entrada também atualiza fornecedor/preço por `(name,company_id)` e vínculos locais; esse caminho já estava correto e foi preservado.

`generate_next_sku(text)` tem caller público legítimo no catálogo, além do helper interno de Salmão. Foi inspecionado e seu corpo/ACL entra no preflight; não foi convertido em API interna nem houve auditoria geral do catálogo. `log_audit` é chamado pelas atômicas/helpers como owner; não foi reaberto. Não há caller ativo de `log_integration_error`/`salmon_to_stock` no fluxo SQL inventariado.

A Edge **requisicao-estoque v14 publicada** foi lida: cancelamento externo escreve via serviço, com filtro de empresa, e propaga status para Salmão. Não chama atômicas nem o helper; portanto não precisa de EXECUTE nessas funções. **Não existe trigger de cascata estoque→Salmão no catálogo atual**: esse trecho mora na Edge. O ensaio exerceu essas escritas reais como service_role, inclusive o no-op ao excluir depois pelo módulo. Isso não equivale a um teste HTTP da Edge.

## 4. Evidências operacionais e testes reais

PostgreSQL **17.10**, `127.0.0.1:15440`. Template vazio final `moralles_phase3_test_phase4_current`; bancos novos `moralles_phase4_test_final` (concorrência/recuo) e `moralles_phase4_test_committed` (candidato final, sem recuo).

Preparação: schema vazio das fases anteriores, Fases 2/3 aplicadas **só no banco descartável**, seguidas das migrations já publicadas na main. Nenhuma das seis migrations originais de multiunidade foi reaplicada. Comparação das **321 definições SQL/PLpgSQL públicas vivas** encontrou somente 12 diferenças esperadas das Fases 2/3, nenhuma diferença adicional nas funções públicas preexistentes. Preflight corrobora 27 funções e metadados atuais de seis tabelas relevantes, policies, índices, triggers, callers e overloads; passou também em produção READ ONLY.

| Check | Resultado |
|---|---|
| Reprodução anterior, fixtures revertidas | Membro sem permissão executa helper + quatro atômicas; anon possui ACL mas `assert_tenant` recusa |
| [SQL Fase 4](../../../supabase/tests/database/phase4_salmon.sql) | **146 assertions PASS**, ROLLBACK |
| [Runner de drift](../../../scripts/test-phase4-db.ps1) | **8 recusas PASS**: corpo, ACL, overload, trigger, coluna/default, policy, índice e caller novo |
| [Concorrência/recuo](../../../scripts/test-phase4-concurrency.mjs) | **15 checks PASS**, conexões reais; dados sintéticos conservados somente no banco descartável |
| Regressão Fase 3 | **175 assertions PASS** sobre o schema atual + Fase 4 |
| Vitest | **773/773 PASS**, 97 arquivos |
| TypeScript app/node | PASS |
| ESLint | **0 erros / 1.355 warnings** após integração; seis a mais que a baseline anterior à main nova |
| RBAC | PASS; zero blockers, avisos preexistentes |
| Build Vite/PWA | PASS; avisos de bundle e Browserslist |
| Deno 2.9.6 | `check --no-lock` PASS em ficha-tecnica, que recebeu merge |
| security:check | PASS estático; **SQL lint pulado** por ausência de SUPABASE_URL/SB_SECRET_KEY |
| Advisors remotos | 1 INFO / 6 WARN no banco vivo ainda anterior à correção |

Cobertura: anon, A, B, admin A, multi A/B, super, membro sem permissão e serviço; ALLOW granular/DENY legado; claims de serviço forjadas; membership revogado/inativo; empresa inativa; header inválido/cruzado/placeholder; recurso de B no contexto A; produto de B num espelho corrompido; RPCs de log/origem/empresa forjadas; comparação integral antes/depois das recusas; sobra com somente view negada.

Ciclo operacional medido no cache do produto: **10 → 6 → 10 → 0 kg**, entrada de 10 kg, manipulação de 4 kg brutos/3 kg limpos, cancelamento da manipulação e da entrada. Validade preservada, vínculos tenant consistentes e uma reversão por original. Falha no INSERT do espelho/estorno reverte recurso, produto/custos/SKU, fornecedor/preços e logs da chamada. Concorrência: duas entradas iniciais compartilham um produto; duas tentativas de cancelar geram um estorno; manipulação versus cancelamento do pai se serializa e recusa pai com filha ativa.

Cancelamentos repetidos conservam o erro **“já cancelada”** que o frontend trata como no-op. **Criação não tem chave de idempotência de requisição**: duas chamadas independentes criam duas entradas legítimas; não foi inventada deduplicação por lote/conteúdo. A garantia verificada é unicidade de espelho por referência, produto e reversão, não idempotência HTTP de criação.

`produtos.saldo_atual` foi a fonte de leitura em todos os testes de saldo; nenhum corpo de recomputação ou leitor de estoque foi modificado. A captura também registra leitores legados de Salmão com totais do ledger por `source_module` e ajustes de inventário; esses cálculos existentes não foram reescritos para fazer o ensaio passar. Sua equivalência geral com o saldo do produto, inclusive fora do módulo, permanece uma revisão distinta.

### Reproduzir nesta máquina

```powershell
./scripts/test-phase4-db.ps1 -TemplateDatabase moralles_phase3_test_phase4_current -Database moralles_phase4_test_novo
node scripts/test-phase4-concurrency.mjs moralles_phase4_test_novo
bun run test --maxWorkers=4
bunx tsc --noEmit -p tsconfig.app.json
bunx tsc --noEmit -p tsconfig.node.json
bun run lint
bun run rbac:lint
bun run security:check
bun run build
```

O template local é schema vazio corroborado, **não backup restaurável de produção** e não acompanha Git. Em outra máquina, preparar novo banco isolado com o schema atual e contratos das Fases 2/3 ensaiados, depois passar os preflights; não usar o runner antigo de implantação nem remover guards para aceitar drift. O runner exige nomes descartáveis, host loopback, template sem dados das tabelas verificadas e cria um banco novo; nunca apaga/reutiliza o existente. O operador ainda deve garantir que o template completo não contenha dados reais.

## 5. Dependências e limites

- **Preflight histórico da Fase 3 já não aceita a produção atual**: exige assinatura antiga de criação sem validade e corpos antigos dos cancelamentos. Seu bloco está também dentro da migration histórica. A Fase 4 não removeu essas proteções nem reescreveu a migration. A publicação conjunta depende de uma entrega específica que reconcilie esses pré-requisitos com os corpos atuais e reensaie o candidato completo. Aplicar a Fase 4 antes também altera ACLs que o preflight antigo da Fase 3 espera; não evita essa dependência.
- Não houve integração HTTP/JWT/PostgREST, browser autenticado ou chamada de cancelamento pela Edge publicada. O banco testa papéis reais e contextos SQL; não prova gateway, CORS ou entrega HTTP. O cancelamento da Edge é uma sequência de requisições, com falhas de cascata apenas logadas; não foi convertido em transação distribuída.
- Edição existente de entrada/manipulação continua cancelamento + recriação em duas chamadas; exige as permissões correspondentes e pode ter falha parcial. Não foi redesenhada nesta fase.
- A classificação/autoria dos logs só fica garantida com a Fase 3 publicada. H04 fechado no ensaio não fecha H01/H02/H03 no banco vivo. As APIs genéricas de auditoria não foram liberadas para testes.
- Catálogo global, SKU público, unicidade/RLS geral de fornecedores, problemas preexistentes de planejamento/inventário rápido e chaves de categorias continuam em seus escopos. O caso fornecedor/preço gerado pela entrada foi apenas preservado/verificado.
- Backup restaurável não comprovado. Nenhum teste de escrita foi realizado com dados reais.

## 6. Ordem exata de publicação e contenção

1. Confirmar projeto `wuzxpbixprrgssoeeaez`, commits revisados, release candidata, versões realmente publicadas e backup completo **restaurável**. Registrar saldo/cache e vínculos operacionais de referência por consultas read-only. Não fazer push automático em main.
2. Resolver e publicar **Fase 2 separadamente**, pela sequência do seu RESULTADOS: confirmar scheduler legítimo, ensaio, migration `20260915140812`, Edge scheduled-jobs/frontend e pós-validação. Não concluir C01/C02 pela existência dos arquivos.
3. Reconciliar a **publicação da Fase 3** com o drift documentado, sem editar migrations históricas nem reabrir helpers. Preparar artefato de avanço com preflight atualizado e candidato completo ensaiado. Publicar writers/readers/Edges e mecanismo de classificação pela ordem revisada da Fase 3. Backfill é operação separada e explícita; histórico ambíguo permanece restrito.
4. Reexecutar [preflight da Fase 4](preflight.sql) no projeto correto e o ensaio isolado do mesmo candidato. Revalidar callers SQL/Edges/frontend e as oito recusas de drift. Se houver mudança funcional, revisar antes de atualizar fingerprints. Novo trigger ou overload bloqueia aplicação. Observar tempo/locks para o índice único, com timeout de cinco segundos.
5. Conferir o histórico/lista de migrations e preparar um lote contendo **somente** a migration autorizada da Fase 4 (`20260915200818`). Seu timestamp é anterior a migrations de Borderô já publicadas; **não executar db push cego do checkout inteiro**, que também contém Fases 2/3 pendentes. Preferir CLI com plano de pendências conferido. Se necessário MCP `apply_migration`, aplicar somente o SQL aprovado e executar, na mesma sessão, `migration repair --status applied 20260915200818 --yes` e `migration repair --status reverted <versão-real-gerada-pelo-MCP> --yes`; confirmar os dois lados do histórico.
6. Aplicar a Fase 4 em transação; executar [pós-validação](pos-validacao.sql). Conferir ACLs efetivos, owner, índice e corpos. Publicar o frontend revisado para esconder escrita de sobra sem permissão. Esta fase não requer Edge nova; não redeployar versões antigas por conveniência.
7. Validar HTTP/JWT em ambiente de integração autorizado: criar com validade, manipular, cancelar, excluir após cancelamento externo, permissões A/B, denied sem efeitos, logs e saldo cacheado. Conferir o commit da produção e versões de Edges. Só então declarar **H04 resolvido no banco vivo**, mantendo as pendências das demais fases explícitas.
8. Em falha, pausar o rollout e usar [phase4_fail_closed.sql](../../../supabase/rollback/phase4_fail_closed.sql): revoga acesso às 16 RPCs/funções de Salmão, inclusive leitura por wrapper, preservando dados, logs, índice único, triggers e serviço de escrita direta. Não restaura ACLs antigas nem apaga produto/espelho. Registrar indisponibilidade do módulo e recuperar por migration corretiva revisada. Conferir que os mesmos usuários permanecem sem EXECUTE direto e que digests/contagens foram preservados. Não executar snapshots anteriores como rollback.

O preflight da Fase 4 é independente do mecanismo de classificação; sua aprovação no banco atual não significa que a Fase 3 esteja publicada. A ordem acima é para uma publicação conjunta segura e revisada, não autorização automática para fases anteriores.

## 7. Entrega

Commits locais: `2964ec5` (integração da main), `11c70fe` (harness CRLF), `275c63d` (correção) e `c4c117e` (testes), seguidos pelo commit deste relatório/evidências. Listar com `git log b62d895..codex/multiunit-phase4`. Sem push. Próxima execução: [prompt completo copiável da Fase 5](../07-PROMPT-FASE-5.md).

Referência técnica: [funções e privilégios no Supabase](https://supabase.com/docs/guides/database/functions). As conclusões deste relatório vêm do código, catálogo vivo e ensaio real, não apenas da documentação da plataforma.
