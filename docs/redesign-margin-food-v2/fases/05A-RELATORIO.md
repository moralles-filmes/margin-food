# Relatório — Fase 05A • Contas a Pagar, Contas a Receber, Códigos, Recorrências e Alertas

## Identificação

- Fase: 05A. Data: 2026-10-04.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f05a`, criada a pedido do proprietário a partir de `feat/redesign-v2-f04b` em `2079f94`. `git status` no início: limpo. Commits a pedido do proprietário: `be5a67e` (código) e `DOCS_SHA` (documentação), mais um commit de documentação registrando os SHAs. Sem push, PR, merge ou deploy; `main` intocada em `c6a9774`.
- Ambiente: Windows 11, Bun, Vite do projeto já em execução em `http://127.0.0.1:8080`, Chrome com a extensão, `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: login "Administrador Principal", unidade de teste **Moralles**, com autorização do proprietário nesta fase para usá-la com **dados simulados**. Nenhuma unidade real foi aberta; nenhuma senha digitada; nenhum download.
- Dados: sete contas a pagar (vencida, aguardando aprovação, aprovada com PIX copia-e-cola e recorrência, paga com três linhas de rateio — uma fora do CMV e uma sem categoria —, cancelada, rascunho sem categoria e fornecedor, valor de oito dígitos com descrição longa), cinco contas a receber, quatro códigos (boleto com zeros à esquerda, chave PIX, PIX copia-e-cola, outro), quatro recorrências, alertas com truncamento e saldo negativo e dois lançamentos do Livro Razão — todos sintéticos, injetados **só no cliente** interceptando o `fetch` da aba. Erros, atrasos e vazios também simulados no cliente.
- Proteção de escrita: toda RPC fora da lista de leitura, todo INSERT/UPDATE/DELETE/UPSERT em tabela e toda chamada a Edge Function recebiam resposta simulada na própria aba e eram registrados. **Nenhuma escrita foi tentada** (lista de bloqueadas vazia do começo ao fim); POSTs vistos: só leituras (`list_my_companies`, `get_my_company_context`, `count_requisicoes_with_pending_items`, `get_salmon_inventory_adjustment_kg`, dashboard antes da fixture e as leituras sintéticas das telas). A área de transferência também foi interceptada para comparar a cópia sem tocar a do proprietário.
- Botões acionados só para abrir diálogos (confirmado no código que não gravam): "Pagar" (abre "Registrar pagamento" e lê a conta do boleto), "Receber", "Estornar" (agora só abre a confirmação), "Alterar limite", "Nova Conta", editar da linha, "Excluir" da linha (só abre a confirmação do `TableActions`; cancelada). Nenhum diálogo confirmado; "Aprovar", "Gerar", "Salvar", "Confirmar…" e "Aplicar a todas" nunca clicados. Terceira passagem, depois das correções da auditoria, com a mesma fixture reinstalada: "Nova Conta" com "Habilitar rateio" e "+ Linha" (só estado do formulário; fechado com Esc), busca em Contas a Pagar, "Atualizar" em Alertas e a lista de Códigos — bloqueadas vazias, só POSTs de leitura.
- Estado restaurado no fim: unidade Moralles, tema claro, aba do Financeiro em "Dashboard", sem largura de sidebar salva, sem a fixture nem os registros dela no `sessionStorage`, página recarregada.
- Capturas (antes e depois, claro/escuro, larguras, diálogos) só na pasta temporária `C:\Users\Yuri\AppData\Local\Temp\claude-chrome-screenshots-EJWJUO`, fora do repositório.
- Roteamento (ai-router): primeira classificação TIER 1 → Codex com um pacote resumido; com a especificação completa, **TIER 0 → agente principal**, auditoria exigida. Executado pelo agente principal.

## Escopo entregue e preservado

Entregue:

1. **Contas a Pagar e a Receber (D51, D52):** `FinScreenHeader`; resumo em `KpiCard` com as fontes atuais e legenda do recorte; painel de filtros rotulado; lista "Contas" em tabela ou cartões pela largura do contêiner; selos com a mesma precedência; linha focável; ações com nome acessível; estados de carregamento anunciado, erro com nova tentativa (antes zero/vazio) e vazio com "Limpar filtros"; `AccessDenied`.
2. **Estorno (D53):** `window.confirm` → `AlertDialog` com o mesmo texto, a mesma ordem e trava síncrona.
3. **Diálogos de pagamento, recebimento, limite e série:** rótulos associados e retorno de foco.
4. **`ContaDetailDialog` (D54) e `ContaFormDialog` (D55):** títulos reais, seções legíveis, lista de definição no lugar da tabela de pagamento, rateio em lista/cartões sem perder a decisão do CMV por linha, foco inicial seguro, retorno de foco (com encadeamento detalhe → editar) e acentos.
5. **Códigos (D56):** cópia com retorno "Copiado", nome contextual e legenda de amostra.
6. **Recorrências e Alertas (D57):** cabeçalho, selos, legendas, chips; erro dos alertas com nova tentativa.
7. **Compartilhados (D58):** nomes acessíveis em presets, navegador de mês, combos e `TableActions`.
8. **Peças novas:** `contasView.ts` (funções puras de selo/legenda), `ContasParts.tsx` (skeletons), `contaDialogFoco.ts` (encadeamento de foco).

Preservado (conferido no diff pelo mapeador e por grep, e em navegador): todas as chamadas `supabase.rpc`/`.from`, parâmetros e ordem; `useChavesPendentes`, `salvandoRef`, `useTravaEnvio` da série, payloads de criação/edição; condição de cada botão de escrita; `exportExcel`/`gerarPDF*` e os rótulos que o Excel usa (`STATUS_CONFIG` sem acento); intervalo de 30 s e `requestVersion` de Códigos; `gerandoRef` de Recorrências. Estado novo só de apresentação: `totaisStatus`, `listaErro`, `estornoAlvo`, `erro`/`carregado` (Alertas) e o módulo de foco.

Fora do escopo e não tocado: regras de baixa, estorno, aprovação, duplicidade, parcelas, competência, recorrência e CMV; RPC, migration, RLS, permissão; Fechamento de Caixa, Cadastros Base e Categorização (05B); telas da 03, 04A e 04B (exceto os diálogos compartilhados, conferidos); `presentation*Export.ts`, `pdfFinanceiro.ts`; nenhuma PF corrigida.

## Arquivos reais

Alterados (16): `src/components/financeiro/ContasPagarSection.tsx`, `ContasReceberSection.tsx`, `CodigosPagamentoSection.tsx`, `CodigoPagamento.tsx`, `CodigoPagamento.test.tsx`, `RecorrenciasSection.tsx`, `AlertasSection.tsx`, `ContaDetailDialog.tsx`, `ContaFormDialog.tsx`, `DateRangePresets.tsx`, `MonthNavigator.tsx`, `CategoryCombobox.tsx`, `SupplierCombobox.tsx`, `useConteinerEstreito.ts` (histerese opcional; padrão mantido), `useConteinerEstreito.test.tsx`, `src/components/ui/TableActions.tsx`.

Novos (11): `contasView.ts`, `ContasParts.tsx`, `contaDialogFoco.ts` e os testes `contasView.test.ts` (7), `ContasPagarSection.test.tsx` (9), `ContasReceberSection.test.tsx` (4), `AlertasSection.test.tsx` (5), `RecorrenciasSection.test.tsx` (2), `CodigosPagamentoSection.test.tsx` (2), `ContaDetailDialog.test.tsx` (4), `FinanceiroCompartilhados.test.tsx` (4).

Documentação: `PROGRESSO.md`, `DECISOES.md` (D51–D58), `MATRIZ-DE-COBERTURA.md` (FIN-A-012, 013, 041–050, 056–059, 067; nota na 035), `PENDENCIAS-FUNCIONAIS.md` (PF-093 a PF-104), este relatório, `handoffs/05A-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md`/`AGENTS.md` sem alteração.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 200 arquivos, 1.893 testes, todos passando (rodado de novo depois das correções da auditoria) | Base 192 / 1.852 + 8 arquivos e 41 testes (3 a mais em `CodigoPagamento.test.tsx`, 1 em `useConteinerEstreito.test.tsx`) | — |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual à base; os avisos dos arquivos tocados são anteriores (`any`, dependências de hooks, `react-refresh` do `MonthNavigator`) | — |
| Build | `bun run build` (depois das correções) | ok; `FinanceiroView` 245,69 → 261,90 kB; chunk compartilhado `livroRazaoView` 29,48 → 34,99 kB; `finV2Layout` 4,75 → 2,64 kB; `CodigosPagamentoSection` 10,07 → 11,09 kB; Conciliação 137,05 → 136,35 kB; CSS 122,54 → 123,23 kB; `index` 204,80 → 204,77 kB; `Index` 41,20 e `vendor-charts` 555,44 kB iguais | Base reconstruída numa worktree isolada de `2079f94` no mesmo dia (removida depois) | Contas a Pagar/Receber, Recorrências e Alertas ficam no chunk do `FinanceiroView` (não são lazy, como antes): o aumento vem da nova marcação (resumo, cartões, estados, diálogo de estorno) |
| Hex, `dark:`, opacidade de cor, valores das referências | grep nas linhas adicionadas | 0 ocorrências nas linhas adicionadas (as que restam nos arquivos tocados já existiam: hover de botão sólido `bg-success/90` e `bg-destructive/10` do `STATUS_CONFIG` mantido para o Excel) | Rodado de novo no diff staged do commit de código | — |
| Segredos | `git diff --cached` com `eyJ`, `sb_secret_`, `password`, `api_key`; arquivos `.env*`, `settings.local.json`, `supabase/.temp/` | Nenhuma ocorrência e nenhum arquivo proibido (commit de código; repetido no de documentação) | Saída do grep | — |
| Antes | Cinco telas, detalhe (pago rateado, vencido, sem categoria, recebido), edição, Nova Conta com rateio, pagamento, recebimento, limite; claro, escuro, desktop e 390 px; Livro Razão (detalhe e edição) | Capturado antes de editar | Pasta temporária | Mesma fixture usada no depois |
| Valores antes/depois | Texto lido por JS das cinco telas e dos detalhes | **Idênticos** (lista de Pagar: 9 valores e todas as datas; Receber: 6 valores e 5 datas; Códigos, Recorrências e Alertas: valores, datas, parcelas e contadores; detalhes: datas, valores e percentuais) | JS + capturas | Dados sintéticos |
| Cópia | Os quatro "Copiar" de Códigos, antes e depois | Os quatro códigos idênticos byte a byte nas duas passagens; "Copiado" por 2 s, com o nome do botão acompanhando ("Copiado: código de …") | Área de transferência interceptada | — |
| Escrita | Interceptação do `fetch` | Nenhuma escrita tentada nas duas passagens | Registro da fixture | — |
| Diálogos | Detalhe, editar (linha e detalhe), Nova Conta, pagamento, recebimento, limite, estorno (Pagar e Receber), confirmação de exclusão, guard de formulário sujo | Abertos e fechados com Esc/Cancelar/Voltar; textos de decisão iguais (só acentos) | Capturas + JS | "Aplicar às outras recorrências?" não aberto (exige salvar) |
| Foco | `document.activeElement` após fechar | Detalhe → linha; detalhe → editar → sair → linha; pagamento → "Pagar <descrição>"; limite → "Alterar limite"; estorno → "Estornar…"; Nova Conta → "Nova Conta"; recebimento → "Receber <descrição>" (antes: `body` em todos os medidos). Foco inicial do detalhe no próprio diálogo (antes no botão "Pagar"/"Estornar") | JS | — |
| Estados | Erro, atraso e vazio simulados no cliente | Erro do resumo e da lista com "Tentar novamente" (antes R$0,00 e "Nenhuma conta a pagar"); skeleton dos cards e da lista anunciados; vazio; Alertas com erro e nova tentativa (antes "Tudo sob controle! 🎉"). Depois da auditoria: lista de Pagar em erro com busca aplicada → "Total filtrado" mostra "—" e "Indisponível: a lista não carregou" (antes da correção, R$ 0,00); Alertas com carga vazia seguida de falha → só "Não foi possível carregar os alertas" | Capturas + JS | Erro/vazio de Códigos, Recorrências e Receber só em teste |
| Filtros | Busca, "Este mês", mês seguinte | Mesmos parâmetros; "Total filtrado" com contagem; `aria-pressed` no atalho ativo | JS | Calendário nativo do `DateInput` não aberto |
| Larguras | Iframe 320 (conteúdo 312) e 390; iframe 768 e 1024; janela 1366 e 1920 | Sem rolagem horizontal da página nem interna em nenhuma das cinco telas; 320–1024 px (com sidebar) em lista; 1366 e 1920 px em tabela; detalhe e formulário sem rolagem a 390 px; valor de oito dígitos inteiro no cartão de 320 px. Rateio do formulário com a coluna do CMV (depois da auditoria): janela 1384 → tabela de 770 px sem rolagem; 884 e 784 → cartões, sem rolagem no corpo nem na página; de volta a 1384 → tabela (antes da correção, 658–758 px de área mostravam a tabela de 736 px rolando) | Capturas + `scrollWidth` | Iframe, não aparelho |
| Sidebar | Recolhida; alargada a 437 px | Tabela, resumo em 3 colunas, sem rolagem | Medição | Largura restaurada |
| Teclado | Linha focável + Enter; Esc nos diálogos; chips | Enter abre o detalhe; Esc fecha; foco visível na linha (`outline`) | Capturas | — |
| Contraste, claro | Medido por JS sobre o fundo real, cinco telas e quatro diálogos | Mínimo 4,80 (selos de sucesso); Alertas 4,91; formulário 5,04 | JS | Sobre tokens, não por pixel |
| Contraste, escuro | Idem | Mínimo 4,93 ("Limpar" dos atalhos, estilo anterior); detalhe 7,22; Alertas 5,11 | JS | Idem |
| Regressão Livro Razão | Detalhe pelo teclado, editar pelo detalhe | Valores idênticos; "Detalhes do lançamento"; selo "Previsto" legível; foco volta à linha nos dois fluxos | JS + capturas | — |
| Regressão Conciliação | Editar na visão Lançamentos (conta e lançamento sintéticos) | "Editar Lançamento" acentuado, justificativa presente; foco volta ao botão da linha (ressalva da 04B resolvida) | JS + capturas | — |
| Console | Avisos dos diálogos | Avisos "Missing Description" vistos numa passagem não se repetiram com o console limpo; todos os diálogos da fase têm descrição associada | Console + JS | — |
| Sem permissão | — | Só em teste (`AccessDenied`, nenhuma consulta) | — | Não simulado em navegador |
| Leitor de tela / movimento normal | — | **Não executados** | Só nomes acessíveis em teste e JS | — |

## Auditoria de módulo e correções aplicadas na fase

`saas-audit-br:module contas-pagar-receber-redesign-v2-f05a --audit-only` sobre o diff `2079f94..` de `src/`. O roteador exigiu a auditoria (TIER 0, `audit_required`). Estado e relatório em `.saas-audit/modules/contas-pagar-receber-redesign-v2-f05a/` (fora do Git).

| Agente | Veredito | Resultado |
|---|---|---|
| Mapeador de arquitetura | Sem mudança de fronteira | Mesmas RPCs, tabelas, parâmetros e ordem; nenhum caminho novo de escrita; estado novo só de apresentação |
| Identidade e acesso | PASS | Toda linha de gate removida reaparece idêntica no diff (o agente não executa `git diff`; o grep foi rodado pelo agente principal) |
| Processo de negócio | PASS_WITH_WARNINGS (0 bloqueantes; 3 P2, 9 P3) | Estorno, baixa, aprovação, CMV por linha, aplicar à série e idempotência conferidos sem mudança; achados abaixo |
| Funcional | Sem BLOCKER/HIGH (4 MEDIUM, vários LOW) | Handlers, `stopPropagation`, marcação dupla, hooks e acentos conferidos; achados abaixo |

Introduzidos pela fase e **corrigidos** (com teste quando cabia, e conferidos em navegador com a fixture):

1. "Total filtrado" mostrava R$ 0,00 quando a lista falhava com filtro ativo (Pagar e Receber), contra o próprio invariante da fase → "—" com "Indisponível: a lista não carregou" (`ContasPagarSection.test.tsx`).
2. Alertas: carga vazia seguida de falha mostrava o banner de erro e, abaixo, "Tudo sob controle!" → só o `ErrorState` inteiro; com truncamento o cabeçalho diz "N listados" (`AlertasSection.test.tsx`).
3. Rateio do formulário: a medida era feita no corpo do diálogo (com padding, e border-box na 1ª medida contra content-box no `ResizeObserver`), e o limite de 640 px não cobria a coluna do CMV — a tabela de 736 px rolava em áreas de 658–758 px → ref num contêiner sem padding em volta da tabela/lista, limite de 760 px com o CMV (640 sem) e histerese de 8 px (a área chega a 770 px; com 32 px não voltaria a tabela). `useConteinerEstreito` ganhou o parâmetro opcional; o padrão de 32 px não mudou para Conciliação e listas (`useConteinerEstreito.test.tsx`).
4. `CodigoPagamento`: o nome acessível continuava "Copiar código…" com "Copiado" visível, e a região `aria-live` repetia o toast → o nome acompanha o texto ("Copiado: código de …") e a região saiu (`CodigoPagamento.test.tsx`).
5. `DateRangePresets`: `aria-pressed` no "Limpar", que é ação → removido (o realce visual do período limpo continua).
6. Import `Skeleton` sem uso em `ContasPagarSection.tsx` → removido.

Preexistente, mas só apresentação e dentro das telas da fase, corrigido: selo "Aprovado" de Códigos em `info` (o mapa genérico pintava de verde, igual a "Pago"), alinhado à D51.

Preexistentes **registrados sem corrigir**: PF-093 a PF-104 (lista abaixo). Achados LOW deixados como risco residual, sem PF: linha da tabela focável (`tr tabIndex=0`) sem papel nem dica de ação (Enter/Espaço abrem o detalhe; o nome vem das células); "Editar lançamento" guarda a origem do foco antes de `onEdit` — se a edição falhar, a origem vira reserva da próxima abertura, só quando o foco natural não existir; falha numa atualização do resumo depois de uma carga boa troca os totais pelo `ErrorState` (coerente com D33: o número velho não fica como atual); ids fixos do bloco "Dados para pagamento" no formulário (anteriores; um só formulário montado por vez).

## Pendências e regressões

- Introduzidas e corrigidas na fase: ações da linha quebrando em duas linhas a 1366 px (tabela sem quebra); anel de foco em volta do diálogo de detalhe inteiro ao abrir (removido; o título é anunciado); `<label>` solto no título do rateio (virou texto); e os seis itens da auditoria acima.
- Registradas sem corrigir (preexistentes): PF-093 (guard do formulário), PF-094 (Códigos limpa a lista a cada atualização), PF-095 (selo "Vencido" esconde o status real; detalhe diverge da lista), PF-096 (Recorrências recarrega o mês errado depois de eventos; erro de "Carregar mais" não se limpa), **PF-097 (baixa de Conta a Receber sem conta bancária — espelho some da conciliação; impacto alto)**, PF-098 (estorno sem lock otimista), PF-099 (diálogo de pagamento pode trocar a conta escolhida), PF-100 (pagar/aprovar/receber sem trava síncrona), PF-101 (erros auxiliares viram vazio; `loadPage` sem guarda de versão), PF-102 (CMV: nome por linha ambíguo e "Desmarcar todas" grava "Não"), PF-103 (Pagar/Estornar sem checar `edit` na tela), PF-104 (Alertas não escuta `financeiro:pagar`/`receber`). PF-011, PF-012, PF-013 (corrigida só na apresentação dos Alertas), PF-015, PF-016 e PF-017 continuam.
- Ressalvas: "Aplicar às outras recorrências?" não aberto em navegador; sem permissão, erro/vazio de Códigos, Recorrências e Receber só em teste; leitor de tela e movimento normal não observados; larguras pequenas em iframe.

## Rollback seletivo

Reverter o commit de código da fase (ou descartar a branch `feat/redesign-v2-f05a`). Os arquivos novos só são usados pelas telas desta fase; as props novas dos compartilhados e o parâmetro de histerese do `useConteinerEstreito` são opcionais (nenhum outro consumidor depende deles).

## Decisão de avanço

**Validada com ressalvas.** Gates automáticos verdes (testes, tipos, lint sem erro, build), navegador com dados sintéticos em claro/escuro e seis larguras, valores e códigos idênticos antes e depois, nenhuma escrita, auditoria sem bloqueante e com as regressões da fase corrigidas. As ressalvas acima não bloqueiam. Próxima: **Fase 05B — Fechamento de Caixa, Cadastros Base e Categorização**. Antes de qualquer deploy de Contas a Receber, o proprietário deveria decidir a PF-097 (fora do escopo visual).
