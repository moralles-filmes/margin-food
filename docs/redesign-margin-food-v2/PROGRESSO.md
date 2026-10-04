# Progresso — Margin Food V2

- Branches: `feat/redesign-v2-f01` (de `main` em `c6a9774`; Fase 01 em `875514a`, `ce512d4`, `7bf08a7`) → `feat/redesign-v2-f02` (de `7bf08a7`; Fase 02 em `11ae4d6`, `1b381c6`, `1227af6`) → `feat/redesign-v2-f03` (de `1227af6`; Fase 03 em `8f755dd`, `709688b`, `197dea7`) → `feat/redesign-v2-f04a` (de `197dea7`; Fase 04A em `a170be6`, `PENDENTE_SHA_DOCS` e um commit registrando estes SHAs). Sem push nem PR; `main` intocada.
- Fase atual: 04A validada em 2026-10-04, com as ressalvas do relatório.
- Última fase validada em navegador: 04A (Chrome, servidor local na porta 8080, login "Administrador Principal", unidade de teste Moralles e, com autorização do proprietário só nesta fase, leitura da unidade real Ren Sushi; nada gravado; cenários extremos simulados só no cliente).
- Bloqueios: nenhum.
- Decisões abertas: nenhuma.
- Próximo prompt: `PROXIMO-CHAT.md` → Fase 04B (Conciliação Bancária).

| Fase | Estado | Relatório | Evidências | Pendências |
|---|---|---|---|---|
| 00 | Concluída com ressalva (sem baseline em navegador) | `fases/00-RELATORIO.md` | Testes 172/1.687 ok; typecheck 0 erros; lint 0 erros e 2.016 avisos; build ok; matriz com 408 linhas | B1; D07; 71 suspeitas funcionais não reproduzidas |
| 01 | Validada com ressalvas | `fases/01-RELATORIO.md` | Testes 174/1.719 ok; typecheck 0 erros; lint 0 erros e 2.016 avisos; build ok com os mesmos tamanhos; 27 cards reais sem diferença antes/depois; contraste medido nos dois temas | 320 px medido em iframe de 316 px; movimento normal não observado (navegador com movimento reduzido); tema escuro só no catálogo |
| 02 | Validada com ressalvas | `fases/02-RELATORIO.md` | Testes 177/1.741 ok; typecheck 0 erros; lint 0 erros e 2.016 avisos; build ok com os mesmos tamanhos; sidebar, seletor, gaveta e cabeçalho em navegador (claro/escuro, 320–1920 px); troca A → B → A sem flash; falha simulada; formulário sujo; contraste medido | Uma loja, perfil reduzido e busca só em teste; leitor de tela e movimento normal não observados; PF-072, PF-073 |
| 03 | Validada com ressalvas | `fases/03-RELATORIO.md` | Testes 180/1.779 ok; typecheck 0 erros; lint 0 erros e 2.016 avisos; build ok (`FinanceiroView` +13,42 kB, CSS +2,51 kB); 8 valores idênticos antes/depois (Out e Jun/2026); 8 destinos de clique; filtros, loading, erro, vazio; claro/escuro; 320–1920 px; sidebar recolhida/alargada; contraste medido; auditoria de módulo sem bloqueante | Sem acesso e exportação só em teste/diff; leitor de tela e movimento normal não observados; PF-074 a PF-077 |
| 04A | Validada com ressalvas | `fases/04A-RELATORIO.md` | Testes 187/1.821 ok; typecheck 0 erros; lint 0 erros e 2.016 avisos; build ok (`FinanceiroView` +11,99 kB, CSS +1,43 kB); valores idênticos antes/depois nas quatro telas; total de contas = todas as ativas; navegação, estados, fixtures extremas, claro/escuro, 320–1920 px, sidebar, teclado e contraste em navegador; auditoria de módulo sem bloqueante | Exportação, diálogos destrutivos e sem acesso só em teste/diff; leitor de tela e movimento normal não observados; foco ao fechar o detalhe; PF-078 a PF-085 |
| 04B | Não iniciada | — | — | — |
| 05A, 05B | Não iniciadas | — | — | — |
| 06A, 06B | Não iniciadas | — | — | — |
| 07 | Não iniciada | — | — | — |
| 08A, 08B | Não iniciadas | — | — | — |
| 09A, 09B | Não iniciadas | — | — | — |
| 10 | Não iniciada | — | — | — |
| 11A, 11B | Não iniciadas | — | — | — |
| 12A, 12B | Não iniciadas | — | — | — |
| 13A, 13B | Não iniciadas | — | — | — |
| 14A, 14B | Não iniciadas | — | — | — |
| 15 | Não iniciada | — | — | — |
| 16A, 16B | Não iniciadas | — | — | — |
| 17 | Não iniciada | — | — | — |

Estados de fase: não iniciada / em andamento / implementada, aguardando validação / validada / bloqueada.
Os estados concluídos de `docs/redesign/` não valem para a V2.
