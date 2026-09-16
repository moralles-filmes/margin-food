# Fase 9 — drift de schema e histórico

**Inventário e ensaios locais entregues; a cadeia de release ainda não é aplicável ao estado vivo.** F3/Salmão e F7/hotfix são bloqueios reproduzidos, não liberações para alterar guards históricos. Nenhum DDL, repair, backfill, efeito externo, deploy ou push produtivo foi executado pela F9. Fase 10 não iniciada.

## Estado verificado

Projeto `wuzxpbixprrgssoeeaez`. Catálogo principal em **16/09/2026 17:04:09 UTC**; preflights vivos de 17:07:13 a 17:07:50 UTC. [Publicação](publicacao.json), [preflights](preflights-vivos.json) e [conferência CLI](cli-historico.json) registram coletas distintas, sem fingir snapshot transacional único entre serviços.

**Revalidação final em 17:45:12 UTC:** mesmas versões, 356 definições/ACLs/owners e policies públicas/Storage, mesmos 17 bundles Edge e mesmo deployment Vercel; [comparação final](revalidacao-final.json). Projeto confirmado ACTIVE_HEALTHY, PostgreSQL 17.6. O dry-run CLI recusou a fila anterior à última versão viva com `LegacyDbPushMissingRemoteError`; a sugestão `--include-all` não foi seguida ([evidência](cli-dry-run.json)).

- `origin/main=80dcf4ec527d1a7e86ed3509496638b71219ab43`, já ancestral da F8; fetch não exigiu merge. Branch F9 criada sobre `70edc0c`, preservando trabalho local alheio.
- Vercel produção `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, READY, SHA `80dcf4e`. Alias `www.marginfood.com` também foi resolvido para esse deployment.
- Os **17 hashes de bundle**, versões e `verify_jwt` coincidem com F8. Assim, os 54 arquivos/ações/imports de `../fase8-20260916/edges.json` continuam evidência aplicável; não se confundiu apenas número de versão com conteúdo. Cinco arquivos diferem da baseline Git F8, como documentado naquela fase. CORS/consumers candidatos não foram publicados pela F9.
- **856 versões vivas / 870 arquivos locais**; todas as vivas possuem arquivo no checkout. As únicas 14 ausentes são as candidatas F2–8. CLI 2.111.0 confirmou os mesmos pares. O campo `time` da lista é derivado da versão, não data de execução.
- O hotfix **`20260916153928` está publicado** e modifica/adiciona 17 policies de categorias, locais, setores, cargos e turnos. Seus 22 statements conferem com o arquivo local. O timestamp MCP `20260916154447` não consta no histórico atual; o relatório alheio registra o repair na mesma sessão. A F9 não o repetiu.

## Inventário reconciliado e limites da classificação

| Evidência | Cobertura |
|---|---|
| [matriz-versoes.json](matriz-versoes.json), [git-refs.json](git-refs.json) | 75 refs, 957 blobs distintos, versões/nomes/hash bruto/LF, ocorrências por ref, duplicações de nome e situação local/viva |
| [historico-vivo.json](historico-vivo.json), [historico-normalizado.json](historico-normalizado.json) | 856 entradas; hashes por statement e agregado, disponibilidade de metadados; nenhum valor de segredo/ator histórico |
| [catalogo-vivo.json](catalogo-vivo.json) | 149 tabelas e nove materializadas public/reporting; colunas/defaults/generated, constraints/FKs, índices, triggers, policies, ACL/RLS/FORCE, definições de 356 funções |
| [catalogo-complementar.json](catalogo-complementar.json) | 465 identidades de função em todos os schemas não-sistema: args/defaults/retorno, linguagem, owner, definer, volatility, search_path e ACL expandida inclusive PUBLIC; quatro sequences, seis event triggers, extensões/publicações |
| [catalogo-plataforma.json](catalogo-plataforma.json), [enums-privados.json](enums-privados.json) | 52 relações/456 colunas de Auth, Storage, Realtime e schemas privados; sem linhas privadas; enum e metadados dos snapshots privados |
| [matriz-objetos.json](matriz-objetos.json) | Cada função/relação com evidência e localizadores de callers frontend/Edges/SQL; diferenças estruturais completas desde F7 |
| [contratos-types.json](contratos-types.json) | 254 contratos de Functions nos tipos gerados, overloads vivos por identidade e callers; não sobrescreve tipos candidatos usando banco atrasado |

Classificação textual: **613 sequências de statements iguais após apenas LF/delimitadores/bordas; 23 arquivos iguais ao agregado integral; 215 comparações inconclusivas; cinco históricos sem statements; 14 candidatas.** Igualdade textual não prova execução ou estado efetivo; divergência textual não prova aplicação parcial. As 215 entradas conservam hashes/refs e são explicitamente desconhecidas quanto à equivalência integral; não houve alegação de reconstrução semântica de todo o histórico de fevereiro–setembro. Não há versão duplicada no checkout. [17 grupos de nomes repetidos](nomes-repetidos.json) não são 17 duplicatas de execução: nome sozinho não identifica migration.

Sem statements: `20260228192635`, `20260818170000`, `20260818171000`, `20260818172000`, `20260910133325`. Ausência de texto não autoriza reaplicação. Não há `applied_at` em schema_migrations; a ordem histórica real e o operador exato não podem ser recuperados apenas dessa tabela.

Os 356 corpos/owners/ACLs de função coincidem com F8. Desde F7, relações, colunas, constraints, índices e triggers públicos não mudaram; as 17 diferenças de policy correspondem ao hotfix. Esse resultado é comparação de catálogo, não certificação de todas as operações. Storage permanece privado com helper antigo, Realtime continua publicando DELETE/TRUNCATE no vivo, e `recalc_product_costs(uuid)` continua exposto. C01/C02/H01/H02/H03/H04/H05/M01 não foram encerrados em produção.

## Rastreabilidade prioritária

### `20260910003448`: reaparecimento explicado, sem reparo

O merge `49394b6b34465abd7df14cd2080471c5e039767f` registra a integração de duas correções paralelas e adiciona o arquivo em relação aos pais; a PR de Salmão `f00cd584e55b6a40038d3dfd2052e9414c497177` o leva à linhagem de main. Os refs disponíveis não provam quando um arquivo não versionado foi originalmente escrito. A ausência observada na auditoria inicial foi real naquele snapshot; não foi convertida retroativamente em presença.

Os cinco statements vivos de `20260910003448` conferem com o arquivo. Compilamos os CREATEs do Git e do histórico em transações revertidas de clone vazio, usando `pg_get_functiondef` para comparação canônica:

| Versão | MD5 da definição compilada | Estado |
|---|---|---|
| 20260910003448 | `606fb890b92975a13cdffdfb800f4851` | Guard anterior de delegação local/global |
| 20260912164600 | `27384e68ba2a3e84ed10ed218f45b68e` | Substituição que perdeu a defesa de delegar admin local |
| 20260915120000 | `353ed3cb9f163776b94a8ef322845915` | Recombina ambas; igual ao vivo |

Identidade completa: `admin_upsert_company_membership(uuid,uuid,uuid,app_role,text[],text,uuid,text,boolean)`, postgres, SECURITY DEFINER, search_path vazio, EXECUTE somente postgres/service_role. Os CREATEs não alteram a ACL herdada; a ACL viva é também conferida contra o catálogo. [Fontes focais](historico-foco.json) e [compilação](ensaios.json). **Não reaplicar o corpo antigo para fazê-lo coincidir com sua migration de origem.**

### F3 e Salmão

O guard F3 procura a atômica com nove argumentos e MD5 `4bfd1b10fad566394a388214cea10362`. `20260915160200` removeu essa identidade e criou dez argumentos, com `p_expiration_date date DEFAULT NULL`; `20260915160300` mantém wrapper textual com validade opcional. `20260915170000` troca a ordem de estorno e cancelamento. Os statements dessas três versões conferem com Git e estão no histórico vivo.

F3 também contém os corpos antigos das duas rotinas de cancelamento. Trocar só o hash/assinatura do guard recriaria overload morto e poderia restaurar UPDATE antes do estorno. A recusa é correta. F4 isolada passa porque foi preparada depois desses avanços; sua passagem não comprova os writers/logs de F3 publicados. Não existe permutação simples dos arquivos históricos que resolva o conflito.

### F7 e hotfix posterior

O preflight F7 vivo para primeiro em `PHASE7_PREREQUISITES_REQUIRED`. No clone com F2–6 presentes, o hotfix faz o preflight **e a primeira migration** falharem em `PHASE7_POLICY_DRIFT`. No candidato F7 já contido, a migration de referências falha em `PHASE7_REFERENCE_POLICY_DRIFT`. Categorias/locais possuem permissões operacionais adicionais legítimas no hotfix; revertê-las para permitir o guard regrediria seletores que acabaram de ser corrigidos.

As duas famílias de policies coexistem e as suites passam no clone candidato acrescido do hotfix. Isso demonstra compatibilidade dos casos exercitados; não prova que aplicar F7 a partir do vivo funcionará. É necessário avanço explícito preservando o hotfix e substituindo os candidatos conflitantes no plano de release; não marcar esses candidatos como applied.

### Reparos anteriores

`7c03335c6df29d91eb48d42f9dbbb7b448e7faa5` documenta 11 arquivos reconstruídos de statements e quatro versões registradas por repair (`20260818210000`, `20260819120000`, `20260819130000`, `20260820120000`). Elas e as contrapartes MCP permanecem inventariadas. O commit `c42be0b` documenta um incidente com oito divergências, sem identificar nele os oito pares; não fabricamos esse mapeamento. Todos esses nomes/versões serem visíveis hoje não prova que cada arquivo foi executado separadamente. Preservar a correção financeira posterior, sem reexecutar versões antigas.

## Ensaios e correções pequenas

PostgreSQL 17.10 real, TCP local `127.0.0.1:15440`; schema público reconstruído do catálogo atual, fixtures próprias, nenhum dado privado copiado. O runner cria clones separados e recusa templates com linhas em qualquer tabela pública/reporting ou Auth. As seis migrations originais multiunidade não foram reaplicadas.

| Ensaio F9 | Resultado |
|---|---|
| Reconstrução atual | 356 definições/owner/ACL, relações/colunas/constraints/índices/triggers/policies públicos iguais ao vivo |
| Cadeia real a partir desse estado | F2 aplica; repetição é recusada; F3 e retry recusados sem alteração parcial, F2 permanece aplicada no clone |
| Hotfix versus F7 | Recusas descritas acima; hashes antes/depois iguais nas falhas |
| Hotfix SQL | 526 assertions no vivo equivalente + 526 no candidato F7 |
| Regressões SQL no candidato + hotfix | F3 175, F4 146, F5 67, F6 80, F7 248; todas passam |
| Histórico administrativo | Três pares Git/history compilados iguais; última definição igual à viva |
| Drifts sintéticos | Corpo, ACL, overload e policy paralela: quatro recusas; dados/metadados restaurados |
| Recuos F2 e F7 | 149 tabelas + Auth com hashes intactos, incluindo fixtures de unidade, identidade compartilhada, memberships, saldo e custo; helpers permanecem fechados |
| Ferramentas locais | Oito testes do splitter SQL e `node --check` dos scripts passam |

[22 checkpoints](ensaios.json), [oito checks adicionais de drift/recuo](ensaios-guards-recuo.json). A maior parte das tabelas estava vazia: hashes não são prova de restauração de um backup real. A fixture Auth é SQL; não simula banco, mas também não é emissão de JWT/GoTrue. F8 HTTP/Storage/Realtime é baseline anterior, não repetida aqui.

O restore detectou owners/ACL de extensões diferentes e timestamps de constraints exibidos no fuso local. Corrigimos o gerador de fixture e fixamos UTC nas consultas de comparação, sem modificar constraints produtivas. Isso evita falso drift causado pela representação do catálogo. O splitter preserva corpos dollar-quoted, strings e comentários; não interpreta a semântica do SQL.

Correções documentais: removida a alegação de NOT NULL/FORCE universais em ARCHITECTURE e atualizada a rastreabilidade M03. AGENTS/CLAUDE permanecem idênticos e intactos. Nenhum tipo gerado, contrato aplicativo, migration histórica ou fórmula foi alterado. Build/lint/Vitest do aplicativo não foram repetidos porque o diff F9 é ferramentas/evidência/documentação; os números F8 não são apresentados como execução F9.

## Entrega e pendências

O [plano de release](PLANO-RELEASE.md) define a ordem por dependência, condições, versões bloqueadas, estratégia de histórico, pós-validação e recuo. [Runbook](RUNBOOK-TESTES.md) permite reproduzir os ensaios. **Não há migration F9 produtiva pronta:** apenas atualizar hashes seria incorreto, e a reconciliação exige um avanço de writers/policies com equivalência demonstrada. O release integrado não recebeu aceite.

Continuam sem evidência: backup completo restaurável atual, scheduler externo (URL/timezone/retry/versão), consumers de reporting/DELETE, gateway publicado, jornadas browser/onboarding, todos os lotes/ações Edge e contratos SQL residuais F7. Preservar os limites F8 de falhas parciais em RH/auditorias/edição de requisição, integrações não atômicas e efeitos externos.

Commits locais: `4f57838` (ferramentas/ensaios) e `9ba46a4` (catálogos/evidências), seguidos pela documentação; consultar `git log 70edc0c..codex/multiunit-phase9`. Alterações alheias iniciais em TAREFAS, relatório F7 e hotfix de estoque foram preservadas fora dos commits F9. Próxima execução: [prompt completo Fase 10](../12-PROMPT-FASE-10.md).

Referência consultada: [CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair). A versão/flags usados foram confirmados pelo CLI instalado; os achados do projeto derivam dos catálogos e ensaios acima.
