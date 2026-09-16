# Fase 10 — frontend/cache e jornada multiunidade

Entrega local em `codex/multiunit-phase10`, derivada de `codex/multiunit-phase9` (`3a410c0`). Somente F10 executada. Sem push, deploy, repair, migration produtiva, convite/email, WhatsApp, IA cobrada, pagamento ou job produtivo. O fetch não trouxe commits posteriores à base conhecida. `origin/main` continuou em `80dcf4ec527d1a7e86ed3509496638b71219ab43`.

Commits de código: `338f120` (efeitos/cache por lifetime) e `fa9ae8c` (exports/navegação da apresentação e regressões). O commit seguinte reúne runners/evidências/documentação; consultar git log para seu identificador. Serviços F10 encerrados com backup local de volumes preservado; servidores Vite8085/8086 encerrados após conferir seus PIDs/comandos. Nenhum outro serviço foi parado.

## Resultado e alcance

Foram corrigidos efeitos de respostas de escopos encerrados, cache CMV compartilhado entre lifetimes, eventos sem escopo, rascunhos bancários sem identidade, concorrência entre foco e seleção explícita, retry de contexto e finalização tardia de exports da apresentação. Mantidos cliente imutável, Auth compartilhada, memberships, empresa original do perfil, QueryClient por lifetime, gates e APIs de negócio. Nenhuma fórmula, saldo, custo ou histórico foi alterado.

O inventário por símbolo TypeScript está em `inventario-frontend.json`, seu índice em `MATRIZ-ARQUIVOS.md` e a revisão semântica em `MATRIZ-FRONTEND.md`. São 731 pontos candidatos de chamada em 207 arquivos, incluindo auxiliares Map/Set/URLSearchParams; **não são 731 operações de banco certificadas**. As 193 chamadas RPC estáticas/candidatas são cruzadas com assinaturas vivas e contratos F9 em `contratos-frontend.json`. As quatro ocorrências de RPC ausente no vivo continuam `deactivate_produto`, `upsert_supplier_price` e dois callers de `list_restricted_logs`. Tipos candidatos não foram regenerados.

## Evidência viva somente leitura

Coleta inicial: 16/09/2026 17:56:22 UTC. Revalidação final de banco: **18:35:41 UTC**; Vercel/Edge reconsultados nesta execução. `revalidacao-viva.json`, `comparacao-f9.json`, `publicacao.json` e `revalidacao-final.json` registram metadados, sem dados operacionais.

- 856 versões vivas / 870 arquivos; mesmas 14 candidatas F2–8 ausentes.
- 356 funções públicas (corpo MD5/owner/ACL), 599 policies public/storage e versões coincidem com F9 e com a revalidação final. Hashes agregados usam ordenação `C`; a tentativa inicial sem collation explícita produziu ordem diferente e foi substituída, sem mudar objetos.
- 17 bundles Edge iguais; Vercel `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, READY, SHA `80dcf4ec527d1a7e86ed3509496638b71219ab43`.
- Hotfix `20260916153928` permanece vivo. Não retirado `operational_active_lookup` nem alterados guards F3/F7. Equivalência de metadados não certifica dados privados, tráfego, gateway ou consumers externos.

## Correções e antes/depois

| Falha / evidência anterior | Correção | Evidência posterior |
|---|---|---|
| PDF resolvia depois de sair da apresentação e ainda clicava no download; ensaio anterior: 1 falha / 11 passes | Checar abort imediatamente antes do download PDF/PPTX/impressão; atas checam atividade depois da geração | Regressão de download tardio passa; exportadores recebem empresa B com global A |
| CMV usava Map global por parâmetros, que sobrevivia A→B→A e aceitava resultado tardio | WeakMap por instância de cliente; leitura/escrita/invalidação recusadas após abort | Teste de cache encerrado, B preservado e A nova vazia |
| Eventos locais/cross-tab não carregavam identidade/unidade/mode | Emissores e listeners vinculados ao escopo; legados sem escopo ignorados; foco atualiza somente escopos montados nesta aba | Eventos de B/outro usuário e pós-abort não invalidam A |
| Toast global em callbacks operacionais poderia aparecer depois da troca ou desmontagem | `useScopedToast` + `useScopeActivity`; associação mecânica nos consumidores, dependências de hooks revistas | Teste de sucesso/erro tardio suprimidos; suite completa passa |
| Rascunhos de conciliação/saldo indexados só por conta | Namespace v2 usuário+empresa+conta; updater checa conta capturada e lifetime; conferência descarta resposta de efeito anterior | Teste de não adoção do legado e isolamento entre identidades/unidades |
| Refresh de foco podia disputar com seleção explícita ainda em voo | Seleção em andamento tem precedência; geração continua descartando respostas antigas | Regressão determinística e Chromium com B atrasada + evento de foco |
| Falha de revalidação não encerrava recurso imediatamente; retry podia reaproveitar lifetime | Fecha cliente/cache na falha; retry cria novos recursos e revalida sem perfil inicial | Teste de falha fechada/retry; StrictMode permanece passando |
| Atas/decisões navegavam via callback capturado depois de mutateAsync | Navegação de estado de URL checa atividade; criação confirmada no servidor não é desfeita | Suíte focal de escopo/atas/decisões: 22 passes |

Os vínculos de toast/eventos alcançam vários componentes, mas são mudanças locais e mecânicas. Não houve refatoração de arquitetura nem substituição cega de imports globais: Auth e imports de tipo permanecem. Cancelamento **não desfaz commit**; não foi adicionado retry automático de writes. Escrita confirmada em A pode precisar ser consultada novamente em A.

Rascunhos bancários antigos por conta permanecem no storage, mas não são atribuídos automaticamente a uma identidade: o usuário pode precisar reimportar o arquivo. Não são dados persistidos de conciliação no servidor e não são apagados pela mudança.

## Ensaios desta fase

| Camada | Resultado | Limite |
|---|---|---|
| Unitários/componentes | **789/789, 101 arquivos** | Incluem transporte simulado; não provam RLS |
| Escopo/atas/decisões após últimos guards de navegação | **22/22, 3 arquivos** | Subconjunto, não somar aos 789 |
| HTTP real local | **21 checkpoints PASS** em `http.json` | JWT Auth/PostgREST reais e 2 handlers Deno diretos; não gateway cloud |
| Chromium real | **12 jornadas PASS**, `browser/result.json` e 9 imagens finais | Desktop 1440×1000/mobile 390×844; backend real em stack separada |
| TypeScript app/node | PASS | App repetido após últimos guards |
| Build | PASS | Avisos de chunks/Browserslist preservados |
| Lint | 0 erros / 1.357 warnings | Baseline F8: 1.354; não é limpeza geral de warnings |
| RBAC | 0 blockers / 2 important / 19 info | Sem permissões novas |
| security:check | exit 0 | SQL lint pulado porque SUPABASE_URL/SB_SECRET_KEY não estavam definidos no runner; não certifica SQL |

`ensaios.json` fixa resultados e comandos. Dois ambientes reais independentes: `margin-food-phase10` (HTTP, API56621/DB56622) e `margin-food-phase10-browser` (UI, API56631/DB56632). Ambos derivam do template vazio candidato F7, com hotfix e DDL privado de reserva Auth restaurado explicitamente. **Nenhum foi obtido aplicando com sucesso a cadeia bloqueada ao vivo.** Templates F9 vivos e stacks F8 encerradas não foram reabertos nem modificados.

Na primeira preparação HTTP faltou a tabela privada `pending_identity_companies`, ausente no template público, e o primeiro admin respondeu 500. O runner final restaura somente o DDL dessa tabela; não reaplica as seis migrations multiunidade. Uma referência errada a `stock_categories.nome` também foi corrigida para `name`. A fixture HTTP inicial ficou com duas contas sintéticas A após recuperação; a stack browser foi criada do zero e tem uma por unidade. Nada disso foi falha produtiva ou correção de fórmula.

Browser: login pela UI, uma/várias/zero unidades, preferência válida/forjada, reload, A→B→A, sidebar recolhida, loading sem dados A, foco durante seleção, logout/relogin, revogação real, global A/apresentação B, remoção de override e URL sem acesso. Apresentação B exibiu R$222 contra fixture A R$111. Imagens foram inspecionadas; capturas mobile foram refeitas depois de completar a animação da sidebar. O CLI agent-browser falhou com timeout de daemon Windows; usou-se Chromium real via Playwright. Rede do browser restrita a loopback; tentativa de fonte Google foi bloqueada.

## Limites e pendências preservadas

Não se declara aceite integral nem prontidão produtiva. F3 continua incompatível com validade DATE/estorno; F7 recusa o hotfix. F2/F4/F8 isolados não liberam o pacote. Não usar `--include-all`, trocar hashes, repair ou reabrir permissões para passar ensaio. `20260910003448` e `20260915120000` conservados; históricos sem statements/comparações textuais inconclusivas não provam aplicação parcial.

Aceite SQL F7 ainda pendente: leitores tenant-only, overloads legados quebrados, FKs simples e turnos. Mantidos riscos F8 de falhas engolidas RH/auditorias, item de requisição sem validar pai, operações multi-chamada e efeitos externos não atômicos. Planejamento delete, inventário rápido, Salmão em duas chamadas, cancelamento distribuído, ordem de estorno Compras, gate approve, itens livres parciais e primeira conversão concorrente23505 permanecem limites.

Storage privado rh-documentos conserva colaboradorUUID/arquivo; candidato F8 exige tenant e rejeita NULL/path inválido. Realtime candidato conserva apenas INSERT/UPDATE em seis tabelas; DELETE/TRUNCATE não foram reabertos. Os cinco consumers seguem com cleanup/lifetime e notifications/mentions checam empresa/destinatário. Suites Storage/Realtime/17 handlers completas da F8 e SQL F9 **não foram recontadas como executadas em F10**.

Faltam evidências de backup restaurável, scheduler externo, consumers reporting/DELETE e gateway cloud. A fixture visual não certifica todas as ações/lotes, detalhes/atas com dados volumosos, todos os exports fora da apresentação nem todas as corridas de filtros dentro de um mesmo lifetime. Revisão estática não fecha essas lacunas. C01/C02/H01/H02/H03/H04/H05/M01 continuam sem resolução comprovada no vivo.

Plano de publicação/recuo coordenado em `PLANO-PUBLICACAO.md`; reprodução em `RUNBOOK-TESTES.md`; próximo pedido completo em `PROMPT-FASE11.md`. F11 não iniciada. Trabalho alheio em TAREFAS, resultado F7 e hotfix/docs/testes de estoque preservado fora dos commits F10. AGENTS/CLAUDE permaneceram idênticos, sem adições.
