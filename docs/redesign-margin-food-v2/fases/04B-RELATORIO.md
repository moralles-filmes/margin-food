# Relatório — Fase 04B • Conciliação Bancária

## Identificação

- Fase: 04B. Data: 2026-10-04.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f04b`, criada a pedido do proprietário a partir de `feat/redesign-v2-f04a` em `ae30b6f`. `git status` no início: limpo. Commits a pedido do proprietário: `9897f2f` (código), um de documentação e um registrando os SHAs (ver `handoffs/04B-HANDOFF.md`). Sem push, PR, merge ou deploy; `main` intocada em `c6a9774`.
- Ambiente: Windows 11, Bun, Vite do projeto já em execução em `http://127.0.0.1:8080`, Chrome com a extensão, `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: login "Administrador Principal", unidade de teste **Moralles**, com autorização do proprietário para usá-la com **dados simulados**. Nenhuma unidade real foi aberta. A Moralles não tem conta ativa: duas contas sintéticas, extratos OFX sintéticos (principal, simples e de outra conta), saldos do sistema, modos "confere"/"diverge", erros, atrasos e um rascunho de 250 linhas foram injetados **só no cliente**, interceptando o `fetch` da aba.
- Proteção de escrita: toda chamada `reconcile_*`, `unreconcile_*`, `_guarded_*` e INSERT/UPDATE/DELETE recebia resposta simulada na própria aba. POSTs vistos nas duas passagens: leituras (`list_my_companies`, `get_my_company_context`, `count_requisicoes_with_pending_items`, `get_fin_saldo_conta_em`, `list_fin_lancamentos_cursor`, `get_fin_lancamentos_totais`, `get_fin_saldo_atual`) e, ao carregar o OFX sintético, `reconcile_neutralize_contamax` e `reconcile_auto_bind_transfer_counterparts` — **ambas bloqueadas**. Numa primeira versão da lista de liberação, `count_requisicoes_with_pending_items` (leitura do menu) também foi bloqueada; corrigido em seguida. **Nenhuma escrita chegou ao servidor.**
- Desvios do roteiro, registrados para o proprietário: (1) "Confirmar valor" (passo 1 do saldo do extrato) foi acionado como parte do **carregamento** do arquivo sintético, que o prompt autoriza para validar a visão Importar; as escritas que ele dispara são as duas bloqueadas acima. (2) Para abrir os diálogos de linha foram acionados os próprios botões "Baixar", "Boleto", "Ratear", "Transf.", "Criar" e o de sugestões; o prompt lista "Baixar" e "Criar" entre os que não se clicam, mas esses botões só abrem o diálogo (nenhuma chamada sai deles) e a escrita estava interceptada. Nenhum diálogo foi confirmado. (3) "Limpar Extrato" foi usado com o rascunho sintético (só estado local).
- Estado restaurado no fim: unidade Moralles, tema claro, aba do Financeiro em "dashboard", sem largura de sidebar salva, sem chaves `conciliacao_*` nem a fixture no `sessionStorage`, página recarregada (interceptação removida).
- Capturas (antes e depois, claro/escuro, larguras, diálogos) só na pasta temporária `C:\Users\Yuri\AppData\Local\Temp\claude-chrome-screenshots-QXRBrM`, fora do repositório.
- Roteamento (ai-router): **TIER 0 → agente principal**, auditoria exigida. Auditoria de módulo `--audit-only` com quatro agentes; relatório local em `.saas-audit/modules/conciliacao-bancaria-redesign-v2-f04b/REPORT.md`, fora do versionamento.

## Escopo entregue e preservado

Entregue:

1. **Cabeçalho e navegação (D50):** `FinScreenHeader`; "Conta bancária" com rótulo; alternador "Importar Extrato / Lançamentos" em `SegmentedControl` com ativação manual; skeleton, erro com nova tentativa e vazio para as contas (antes a tela abria com o seletor vazio).
2. **Visão Importar:** seção "Arquivo do extrato" com o campo de arquivo alcançável pelo teclado; banner de conferência em painel (D46) com a mesma regra e os mesmos textos; avisos de extrato anterior ausente e ContaMax por token; linhas do extrato com chips acessíveis, legenda do recorte, selos com a mesma precedência (D47) e tabela ⇄ lista por largura medida do contêiner (D45).
3. **Visão Lançamentos (D48):** "Situação da conta" com os dois KPIs da conta inteira; filtros rotulados; "Conciliar Todos (N)"; tabela ⇄ lista; estados de carregamento anunciado, erro com nova tentativa e vazio.
4. **Diálogos FIN-A-023 a 034:** tokens no lugar de cores com opacidade, `ExtratoLinhaResumo` compartilhado, grades responsivas, ícones no lugar de emojis, rótulos associados, rolagem própria; textos de decisão, botões e ordem de confirmação iguais.
5. **Foco (D49):** `useRetornoFoco` devolve o foco ao elemento de origem em todos os diálogos da Conciliação, com o campo de arquivo como reserva.
6. **Peças novas:** `ConciliacaoParts.tsx` (só JSX com props), `conciliacaoView.ts` (funções puras de rótulo e cor), `useConteinerEstreito.ts`, `useRetornoFoco.ts`.

Preservado (conferido no diff pelo mapeador e por grep, e em navegador): RPCs, parâmetros e ordem das chamadas (`importarEConciliar`, `processarLinhas`, `processarBaixas`, `conciliar`, `conciliarTodos`, exclusões, `CriarLancamentoExtratoDialog.handleSave`, `ConfirmarSaldoExtratoDialog.handleConfirmarValor`); parser, matching, dedup, FITID, `p_occurrence_index`, transferência, ContaMax; chaves de `sessionStorage` (`bankDraftScope`); gates `useCan`; condição de cada botão de ação; regra do banner. As linhas antigas 544–2170 (todos os handlers) não têm hunk. Estado novo só de apresentação: `contasStatus`, `contasTentativa`, `conferenciaAtualizando`, `conferenciaErro`, `conferenciaTentativa`, `conferenciaBase`, `contagemStatus`, `lancamentosErro`.

Fora do escopo e não tocado: `src/lib/*` da conciliação, RPC, migration, RLS, permissão, `ContaFormDialog` (edição, Fase 05), `CategoryCombobox`, `DateRangePresets`, `finV2Layout`, telas da 04A, `presentation*Export.ts`.

## Arquivos reais

Alterados (3): `src/components/financeiro/ConciliacaoBancariaSection.tsx`, `CriarLancamentoExtratoDialog.tsx`, `ConfirmarSaldoExtratoDialog.tsx`.

Novos (9): `ConciliacaoParts.tsx`, `conciliacaoView.ts`, `useConteinerEstreito.ts`, `useRetornoFoco.ts` e os testes `ConciliacaoBancariaSection.test.tsx` (11), `ConciliacaoParts.test.tsx` (7), `conciliacaoView.test.ts` (7), `useConteinerEstreito.test.tsx` (3), `useRetornoFoco.test.tsx` (3).

Total do código: 12 arquivos, +2.322 / −1.013 linhas (`9897f2f`).

Documentação: `PROGRESSO.md`, `DECISOES.md` (D45–D50), `MATRIZ-DE-COBERTURA.md` (FIN-A-016 a 035), `PENDENCIAS-FUNCIONAIS.md` (PF-086 a PF-092), este relatório, `handoffs/04B-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md`/`AGENTS.md` sem alteração.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 192 arquivos, 1.852 testes, todos passando | Base 187 / 1.821 + 5 arquivos e 31 testes | — |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual à base; os avisos dos arquivos tocados são anteriores (ex.: diretiva `no-await-in-loop` sem uso, que estava na linha 204 e foi para a 227) | — |
| Build | `bun run build` | ok; `vendor-charts` 555,44 kB (=), `index` 204,80 kB (=), `FinanceiroView` 245,69 kB (−1,56), `Index` 41,20 kB (+0,15), CSS 122,54 kB (+0,88), chunk `ConciliacaoBancariaSection` 117,35 → 137,05 kB (gzip 30,26 → 35,35) | Base reconstruída numa worktree isolada de `ae30b6f` no mesmo dia | O chunk da Conciliação só baixa ao abrir a sub-aba. `finV2Layout` virou chunk compartilhado (4,75 kB, sai do `FinanceiroView`); o chunk compartilhado antes chamado `conciliacaoSaldoExtrato` (27,64 kB) agora se chama `livroRazaoView` (29,48 kB) por causa do `ledgerTipoBadge`. `Index` da base nesta máquina: 41,05 kB (a 04A registrou 41,12 noutra instalação) |
| Hex, `dark:`, opacidade de cor, valores das referências | grep no diff | 0 ocorrências (o único acerto é a asserção de um teste que proíbe esses padrões) | — | — |
| Segredos | `git diff --cached` com `eyJ`, `sb_secret_`, `password`, `api_key`; arquivos proibidos | 0 | Antes do commit de código | — |
| Antes | Conciliação com a mesma conta e o mesmo OFX sintético; claro, escuro; desktop e iframe | Capturado antes de editar | Pasta temporária | — |
| Valores antes/depois | Chips, linhas, banner verde e vermelho, visão Lançamentos | **Idênticos** | Texto lido por JS + capturas | Dados sintéticos |
| Escrita | Interceptação do `fetch` | Só `reconcile_neutralize_contamax` e `reconcile_auto_bind_transfer_counterparts` no carregamento, ambas bloqueadas; nenhuma escrita no servidor | Log da fixture | — |
| Diálogos | Sugestões, revisão de baixa, boleto, rateio, transferência, criar registro, conta diverge, substituir, saldo (passo 1 e 2), editar | Abertos e fechados com Esc/Cancelar; foco volta ao elemento de origem (ou ao campo de arquivo) | Capturas + `document.activeElement` | "Já no Livro Razão" e duplicata só em teste (exigem Processar). Editar: foco não volta (`ContaFormDialog`, Fase 05). Passo 2: foco no contêiner do diálogo |
| Banner | Fixture "confere" e "diverge"; projeção no título (2ª passagem) | Verde e vermelho com os textos de antes; dia da divergência; "(projetado com as linhas ainda pendentes)" no título | Capturas + JS | Erro de leitura e troca de conta só em teste |
| Estados | Atraso e erros simulados no cliente | Skeleton com anúncio "Carregando lançamentos…"; vazios; erros com nova tentativa | JS + capturas | Erro da lista e contagem: teste |
| Larguras | Iframes de 320 (contêiner 312) e 390; 768, 1024, 1366, 1920 | Sem rolagem horizontal da página nem interna; extrato em lista até 1366 px com sidebar e em tabela a 1920; Lançamentos em lista a 1024 e em tabela a 1366 | Capturas + `scrollWidth` | Iframe, não aparelho |
| Sidebar | Recolhida; alargada a 437 px | Recolhida: tabela; 437 px: sem rolagem | Medição | Largura restaurada |
| Teclado | Alternador, chips, campo de arquivo, diálogos | Setas só movem o foco no alternador; Enter ativa chip; Tab chega ao campo de arquivo com anel; Esc fecha diálogos | Capturas | — |
| Contraste, claro | 68 pares sobre o fundo real + 2ª passagem | Mínimo 4,80 (selo do banner, chip "p/ conciliar", selos de sucesso); título do banner 16,68; complemento 5,29; rótulos 5,67; chips 4,80–5,71; avisos 5,36 e 5,20; descrição resolvida 5,04; "Criar novo" neutro 5,04 | JS | Sobre tokens, não por pixel |
| Contraste, escuro | Idem | Mínimo 5,11 (selo Despesa); título 13,67; complemento 6,13; rótulos 7,69; chips 6,90–7,42; avisos 6,34 e 6,51; descrição resolvida 6,92; selos "Criar novo" 6,92 (neutro) e 6,90 (azul) | JS | Idem |
| Desempenho | Rascunho de 250 linhas sintéticas, clique numa linha | ≈135 ms antes, ≈137 ms depois (amostras 140/151/127/131); nós 11.793 → 12.344 | Medição no navegador | Uma regressão intermediária (≈277 ms) foi achada e corrigida na fase |
| Auditoria de módulo | Mapeador, processo de negócio, identidade/acesso, funcional | Sem mudança de fronteira; PASS com avisos / PASS com avisos / PRODUCTION_READY; nenhum bloqueante | Relatório local | — |
| Leitor de tela / movimento normal | — | **Não executados** | Só atributos e nomes acessíveis em teste | — |

## Auditoria de módulo e correções aplicadas na fase

- Mapeador: nenhuma chamada, parâmetro, ordem, chave de `sessionStorage`, gate ou condição de botão mudou; greps do diff sem gate removido nem consulta nova.
- Corrigidos (introduzidos ou realçados pela fase): foco do diálogo de saldo (o `autoFocus` impedia capturar a origem); aviso de projeção devolvido ao título do banner; "Criar novo" desmarcado neutro; veredito de outro saldo de extrato não aparece mais ao lado do banco novo, "Atualizando…" sem esperar o debounce, erro da conta anterior zerado na troca de conta e indicador que podia ficar preso; skeletons anunciados; vazio quando o filtro esvazia a lista; nome acessível do "Remover vínculo" com reserva; testes de tabela larga, lista estreita, troca de conta e foco com `autoFocus`; cliente falso dos testes registra também escrita direta em tabela.
- Registrados sem corrigir (preexistentes): PF-086 a PF-092; PF-014 continua.

## Pendências e regressões

- Introduzidas e corrigidas na fase: botão de origem desmontado ao abrir diálogo perto do limite (histerese); foco ao `body` ao cancelar "substituir" (reserva); ações empilhadas a 1366 px e valor do rateio cortado; regressão de desempenho de ≈277 ms (marcar "atualizando" no efeito); e os itens da auditoria acima.
- Ressalvas: "Já no Livro Razão" e duplicata validados só em teste; foco vai ao `body` depois de "Criar e Conciliar" (a linha some) e depois de confirmar o saldo (campo de arquivo desabilitado durante o processamento); no passo 2 do saldo o foco fica no contêiner; `CategoryCombobox`/`SupplierCombobox` não aceitam `id`/`aria-label`, então o rótulo visual não nomeia o combobox (FIN-A-067, Fase 05); trocar tabela ⇄ lista redimensionando a janela fecha um combobox aberto; `loading` é compartilhado entre as duas visões (preexistente).
- Observações para outras fases: `ContaFormDialog` sem retorno de foco e com textos sem acento ("Editar Lancamento"); PF-072 (503 nas contagens HEAD) segue.

## Rollback seletivo

Reverter `9897f2f` (ou descartar a branch `feat/redesign-v2-f04b`). Os arquivos novos são usados só pela Conciliação; `finV2Layout`, `kpiGrid`, `SegmentedControl` e `livroRazaoView` (da 04A) só são importados, sem alteração.

## Decisão de avanço

Fase 04B **validada com ressalvas**: gates de linha de comando ok; chips, linhas, banner e visão Lançamentos idênticos antes/depois com dados sintéticos; nenhuma escrita no servidor; diálogos, estados, temas, seis larguras, sidebar, teclado, foco e contraste conferidos em navegador; desempenho mantido; auditoria de módulo sem bloqueante. Ressalvas: dois diálogos só em teste; leitor de tela e movimento normal não observados; larguras pequenas em iframe; foco ao `body` em dois fluxos de gravação não executados e no `ContaFormDialog`. Próxima: Fase 05A.
