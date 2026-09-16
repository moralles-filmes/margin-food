# Fase 11 — regressão final, performance e operação

**Entrega local concluída; aceite integral e publicação bloqueados.** Somente F11 executada. Nenhuma mudança de produto, migration histórica, guard, fórmula, identidade ou dado produtivo. Sem push, deploy, repair, aplicação remota, convite, email, WhatsApp, IA paga, pagamento, cancelamento ou job produtivo. Nenhuma auditoria externa foi executada.

Branch `codex/multiunit-phase11`, base F10 `483c332b896b299c822972ff01822ce4aa7613a9`, após `338f120` e `fa9ae8c`. Fetch de origin não encontrou novidades; `80dcf4ec527d1a7e86ed3509496638b71219ab43` continua ancestral. [Baseline](baseline.json) guarda hashes do trabalho alheio, conferidos ao finalizar: TAREFAS, resultado F7, docs/teste/migration do hotfix de estoque. Esses arquivos não integram os commits F11. AGENTS/CLAUDE continuam idênticos e sem acréscimos. [Fontes](fontes-baseline.json) identifica os entregáveis anteriores consultados.

## Estado vivo

Coleta READ ONLY em **16/09/2026 20:20:19 UTC**: [revalidacao-viva.json](revalidacao-viva.json) e [comparacao-f10.json](comparacao-f10.json). As listas completas de 856 versões, 356 funções públicas (assinatura/corpo MD5/owner/ACL) e 599 policies public/storage coincidem com F10. São 870 arquivos locais, com as mesmas 14 candidatas ausentes. A comparação normaliza ordem de objetos, não corpos ou expressões SQL.

[Publicação](publicacao.json): mesmos 17 hashes de bundle, versões e verify_jwt; preservada a rastreabilidade dos 54 arquivos F8. Alias `www.marginfood.com` resolveu para `dpl_79oubxDxhgVF4owXmEXiEP6QUV5N`, READY, production, SHA `80dcf4e`. Coletas entre serviços têm horários próprios; não são um snapshot distribuído atômico. A [revalidação final](revalidacao-final.json), com banco às **20:41:55 UTC**, confirmou novamente a igualdade integral do catálogo, dos bundles e do deployment.

Hotfix `20260916153928` preservado, inclusive `operational_active_lookup`. F3 ainda espera a atômica antiga e corpos antigos de cancelamento; F7 recusa as policies do hotfix. Os bloqueios foram reproduzidos em clones novos, sem editar hashes nem reaplicar as seis migrations multiunidade. `20260910003448`/`20260915120000` permanecem intactas; cinco históricos sem statements e 215 comparações textuais inconclusivas continuam sem inferência de aplicação parcial. Tipos candidatos não foram regenerados do vivo atrasado.

## Execuções novas — não somar às baselines

| Camada F11 | Resultado | Fonte e limite |
|---|---|---|
| Vitest | **789/789, 101 arquivos**, 49,67s | Suíte completa atual; componentes simulam transporte/exports, não provam RLS |
| TypeScript app/node e build | PASS | Build mantém avisos de bundle/Browserslist; sourcemap TypeScript ausente não falhou a suíte |
| ESLint | **0 erros / 1.357 warnings** | Mesmo resultado F10; scratch `**/*.local/**` excluído |
| RBAC | **0 blockers / 2 important / 19 info**, 11 allowlisted | Sem novas permissões; avisos anteriores preservados |
| security:check | exit 0, **SQL SKIPPED** | Faltam SUPABASE_URL/SB_SECRET_KEY nesse runner; não é aprovação SQL |
| Deno/CORS | 17 handlers check PASS; 1 teste CORS PASS | Sem invocação de gateway cloud; wrapper concorrente preserva stream/origem |
| Splitter SQL | 8 testes PASS | Ferramenta de harness, fora dos 789 |
| PostgreSQL real | 22 checkpoints PASS | [sql.json](sql.json): 526 assertions do hotfix em cada um de dois estados; F3/F4/F5/F6/F7 = 175/146/67/80/248 no candidato; compilação histórica e recusas atômicas |
| Drift e recuo PostgreSQL | 8 checkpoints PASS | [guards-recuo.json](guards-recuo.json): quatro drifts e recuos F2/F7 preservando 149 tabelas + Auth; grande parte vazia |
| Auth/PostgREST + handlers Deno reais | **21 checkpoints PASS** | [http.json](http.json); stack nova independente, sem gateway Edge hospedado |
| Chromium real | **17 jornadas PASS**, 11 PNGs, PDF/PPTX reais | [browser/result.json](browser/result.json); 1440×1000 e 390×844, tráfego externo bloqueado |
| Performance | **60 planos SELECT ANALYZE**, 10 consultas × 3 × 2 estados | [performance.json](performance.json), [análise](PERFORMANCE.md); fixtures com volume, sem p95 produtivo |

Os 22 checkpoints SQL contêm as suites citadas: não somar checkpoints e assertions. O mesmo vale para as 17 jornadas, que incluem os dois exports e os casos novos de retry/preferência. F8 Storage 37/Realtime 16/HTTP 88/drift10/recuo6 continuam **baseline anterior, não reexecução F11**. Os números anteriores F9/F10 não são execuções adicionais desta fase.

## Ambientes e cobertura

PostgreSQL 17.10 real em 127.0.0.1:15440, clones `moralles_phase11_test_*` novos. O runner recusa nomes não descartáveis, usa host fixo e confere vazio de todas as tabelas public/reporting + Auth antes de clonar. Templates F7 candidatos e F9 equivalente ao vivo são distinguíveis e identificados; o candidato **não** deriva de uma cadeia de release integrada aprovada. Recuos só afetam clones desta execução.

Supabase Docker real: `margin-food-phase11` API56721/DB56722 para HTTP e `margin-food-phase11-browser` API56731/DB56732 para UI. Schema candidato F7 + 22 statements do hotfix + DDL privado da reserva Auth; restauração de ACLs explícita. As duas stacks nasceram vazias; não foram reabertas F8/F9 contidas ou reutilizadas fixtures F10. Cinco identidades de bootstrap @example.test, três empresas, contas 100/200 e fechamentos 111/222; jornada HTTP cria outras identidades exclusivamente sintéticas. Tokens/senhas/dumps ficam nos diretórios `.local` ignorados, nunca nos artefatos públicos.

HTTP cobre 0/1/N unidades, A→B→A, granular ALLOW/legado DENY, header inválido/forjado/placeholder, origem sem header autorizada, admin local versus global explícito, empresa/membership inativos/revogados com mesmo JWT. Jornada: empresa→reserva pré-Auth→primeiro admin→login→usuário→vínculo de identidade existente, conservando ID/nome/email/senha/origem→revogação só membership→reintrodução com novos grants.

Browser cobre seleção/reload/logout/outra identidade, preferência válida/forjada/obsoleta, contexto B atrasado com foco, loading sem conta A, revogação real, mobile/sidebar recolhida, apresentação B independente da global A, remoção de override e URL sem acesso. Novos casos: falha de transporte real no contexto remove dados; retry revalida Auth/PostgREST e remonta A (119ms observados neste host); preferência antes válida torna-se inválida após inativar membership. Nenhum payload de banco é substituído. A simulação de indisponibilidade usa abort de transporte, explicitamente distinta da RLS real.

PDF/PPTX gerados pelos botões reais contêm `F11 Shopping` e R$222,00, sem `F11 Centro`. Bytes PDF e XMLs internos do PPTX foram conferidos; arquivos estão em browser. Tema escuro/claro e capturas foram inspecionados; não é certificação de contraste ou de todos os breakpoints. Cleanup de export/eventos, StrictMode, caches CMV e navegação tardia continuam exercitados na suíte de componentes. Todas as atas/ações/planejamento/exports externos à apresentação e corridas de filtro no mesmo lifetime não receberam aceite por extrapolação.

## Incidentes de ferramenta e limitações

agent-browser retornou timeout Windows10060; Chromium/Playwright do runner revisado concluiu as jornadas. A primeira adaptação de paths mudou `phase10`, mas não `fase10` nos destinos de HTTP/browser: os resultados novos foram movidos para F11 e os arquivos F10 originalmente limpos foram restaurados byte a byte do HEAD; o adaptador foi corrigido. [Registro](incidentes-harness.json). Nenhum dado/serviço produtivo foi afetado. O browser final foi repetido já com o destino correto.

Nenhuma correção funcional nova foi necessária para os caminhos exercitados. Isso não elimina os riscos conhecidos: leitores tenant-only, overloads quebrados, FKs simples/turnos; falhas engolidas RH/auditoria; item de requisição sem validar pai; operações multi-chamada; planejamento delete; inventário rápido; Salmão em duas chamadas/cancelamento distribuído; ordem de estorno Compras; gate approve; itens livres parciais; primeira conversão concorrente23505. C01/C02/H01/H02/H03/H04/H05/M01 continuam abertos no vivo.

O aceite item por item está em [MATRIZ-ACEITE.md](MATRIZ-ACEITE.md). Backup restaurável atual, scheduler externo, consumidores reporting/DELETE e gateway cloud seguem sem prova; indisponível não significa inexistente. [Plano operacional](PLANO-OPERACAO.md) estabelece responsáveis, paradas, publicação futura e recuo preservando dados/identidade. [Runbook](RUNBOOK-TESTES.md) descreve reprodução e encerramento. As duas stacks foram encerradas com backup de volumes; Vite e tentativa agent-browser foram interrompidos, sem listeners nas portas dos ensaios. PostgreSQL compartilhado e clones de evidência foram preservados. Lint final dos dois scripts: zero erros e warnings. [Ensaios e encerramento](ensaios.json), [scan de segurança](security-scan.json). Não há liberação produtiva nem autorização implícita de publicação.
