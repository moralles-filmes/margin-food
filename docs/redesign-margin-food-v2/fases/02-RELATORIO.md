# Relatório — Fase 02 • Sidebar, cabeçalho, seletor de loja e navegação

## Identificação

- Fase: 02. Data: 2026-10-03.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `feat/redesign-v2-f02`, criada a pedido do proprietário a partir de `feat/redesign-v2-f01` em `7bf08a740a411ad6a53e90bba1a6891082e7101b`. `git status` no início: limpo. Sem push, merge ou deploy; `main` intocada. Commits a pedido do proprietário: `11ae4d6` (código) e `1b381c6` (documentação), mais um registrando estes SHAs.
- Ambiente: Windows 11, Bun, Vite já em execução em `http://127.0.0.1:8080` (o servidor que eu tinha subido na 8081 foi parado). Chrome com a extensão, janela de 1278 × 888 px úteis, `prefers-reduced-motion: reduce` ativo.
- Sessão do navegador: já logada pelo proprietário numa conta com quatro unidades reais. O proprietário autorizou o uso **só de leitura**: nada foi salvo, exportado ou enviado; a única gravação foi a preferência local de unidade/tema/largura, restaurada ao fim (tema claro, sem largura salva, unidade Moralles).
- Roteamento (ai-router): TIER 0, agente principal. Auditoria de módulo em modo `--audit-only` (relatório local em `.saas-audit/modules/layout-sidebar-seletor-loja-redesign-v2-f02/REPORT.md`, fora do versionamento).

## Decisões do proprietário no início

- Branch nova `feat/redesign-v2-f02`.
- D07: conta no rodapé da sidebar; seletor só na sidebar.
- `SegmentedControl`: pílula clara com texto azul (como a prancha 07).

## Escopo entregue e preservado

Entregue:

1. Sidebar clara (D22): fundo `#FAFCFF`, marca, cartão da loja, seções com espaçamento, item ativo com o gradiente do destaque e chevron, conta no rodapé.
2. `CompanySelector` com `appearance` `inline | card | compact` (D23): cartão com nome real (até duas linhas), "Unidade ativa" (D25), chevron, menu com marca de selecionada, nomes completos, rolagem, teclado e toque; busca local a partir de 8 unidades (D24); trava contra clique repetido.
3. Recolhida (D27) e gaveta do celular (D28) com foco, Escape, `inert` e `role=dialog`.
4. Largura padrão 256 px para quem não salvou largura; abaixo de 208 px o cartão perde o ícone e a marca fica só no "M" (D26).
5. Cabeçalho branco sem a conta; sininho com nome acessível; grupo inativo do `ModuleNav` sem preenchimento (D30).
6. `SegmentedControl` em pílula clara com peso 600 e largura reservada (D29).

Preservado: ordem, rótulos, `TabId` e destinos dos 15 itens, as duas entradas de Salmão, `isItemVisible`, skeleton de permissões, badges, dicas, item Admin, recolhimento (estado local, como antes), chave e faixa de largura, tema, Offline, aviso de meta, notificações, menu da conta (nome, e-mail, papéis, setor, Sair), `setActiveCompany`, `AuthContext`, `CompanyScopeProvider` e o modo `inline` do seletor usado pela Apresentação Sócios.

Fora do escopo e não tocado: Dashboard Financeiro e cards/gráficos (Fase 03), RPC, migration, RLS, permissão, dependência, `presentation*Export.ts`, busca global, breadcrumb e subtítulo da marca.

## Arquivos reais

Alterados (7): `src/components/AppLayout.tsx`, `src/components/CompanySelector.tsx`, `src/components/NotificationBell.tsx`, `src/components/ui/SegmentedControl.tsx`, `src/components/ui/SubmoduleSwitcher.tsx`, `src/index.css`, `tailwind.config.ts`.

Novos (testes): `src/components/AppLayout.test.tsx` (9), `src/components/CompanySelector.test.tsx` (10), `src/components/ui/SegmentedControl.test.tsx` (3).

Tokens: `--sidebar-background` alterado; `--sidebar-active` e `--sidebar-active-foreground` passam a apontar para o destaque; `--sidebar-active-marker` removido (só o `AppLayout` usava); novos `--sidebar-card`, `--sidebar-card-hover`, `--sidebar-card-border`, `--segmented-active` — todos nos dois temas.

Documentação: `PROGRESSO.md`, `DECISOES.md` (D07 resolvida; D22–D30), `MATRIZ-DE-COBERTURA.md` (GLB-005, GLB-009 a GLB-021), `PENDENCIAS-FUNCIONAIS.md` (PF-019 reproduzida; PF-072 e PF-073), este relatório, `handoffs/02-HANDOFF.md`, `PROXIMO-CHAT.md`. `CLAUDE.md` e `AGENTS.md`: uma linha em "Componentes Padronizados" sobre o `CompanySelector` como seletor único (arquivos idênticos, conferido com `cmp`).

Consultados sem alteração: `AuthContext.tsx`, `CompanyScopeProvider.tsx`, `companySelection.ts`, `companyClient.ts`, `useTheme.ts`, `ModuleNav.tsx`, `pages/Index.tsx`, `App.tsx`, `dirtyStateRegistry.ts`, `useFormDirtyGuard.ts`, `PresentationCompanyScope.tsx`, `CompanyScope.test.tsx`, `command.tsx`, `popover.tsx`, `FechamentoMarcasTab.tsx`, `CmvExportSheet.tsx`.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` | 177 arquivos, 1.741 testes, todos passando | Baseline 174 / 1.719 + 3 arquivos e 22 testes novos | Aviso de source map preexistente |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | exit 0 | — |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Igual ao baseline | — |
| Build | `bun run build` | ok; `vendor-charts` 555,44 kB (=), `FinanceiroView` 221,84 kB (−0,07), `index` 204,80 kB (+0,05), `Index` 41,09 kB, CSS 117,72 kB | Saída do build | `Index` e CSS sem número de baseline |
| Catálogo fora da produção | grep em `dist/` | 0 ocorrências | — | — |
| Antes | Expandida, menu do seletor, recolhida, escuro, celular, Financeiro | Capturado antes de editar | Capturas na pasta temporária da extensão | — |
| Comparação com o recorte | `00-sidebar-aprovada.png` sobreposta à direita da sidebar real | Mesma estrutura; diferenças restantes: marca sem subtítulo (fora do escopo), itens com texto um pouco mais escuro (contraste) | Captura lado a lado | Recorte em escala menor |
| Contraste, claro | Cálculo WCAG sobre os tokens computados | Ativo 6,14 (ponto mais claro) / 8,12; cartão nome 16,05, apoio 5,09; itens 9,92; seção 4,57; e-mail 5,51; menu atual 7,29 (6,71 sob destaque); segmentado ativo 7,29, inativo 5,04 | JS no navegador | Calculado sobre tokens, não por pixel |
| Contraste, escuro | Idem | Ativo 6,66 / 8,83; cartão 17,28 / 7,75; itens 13,41; seção 6,60; segmentado 5,28 / 6,92 | JS no navegador | Idem |
| Troca A → B → A | Moralles → Ren Sushi pelo teclado, depois volta | Gravador de DOM: nenhum quadro com cabeçalho de B e dados de A; a árvore some em 45 ms e B só mostra valores aos 1.074 ms | `MutationObserver` | — |
| Cliques rápidos | Duplo clique numa unidade | Uma troca; 2 chamadas de `get_my_company_context`, igual ao clique simples | `read_network_requests` | — |
| Falha na troca | `fetch` interceptado só na aba (500 para outra unidade) | Carregando → tela de erro existente; a revalidação existente voltou para a unidade anterior | Gravador + captura | Simulação no cliente |
| Rede ao abrir o menu | Abrir/fechar o seletor | Nenhuma requisição à API | `read_network_requests` | — |
| Formulário sujo | Contas a Pagar → Nova Conta, digitar, clicar no cartão da loja | Abre "Alterações não salvas", não o seletor; descartado sem salvar | Captura | — |
| Badges | Estoque e Compras | Visíveis expandida e recolhida | Captura | Contagens HEAD com 503 (PF-072, preexistente) |
| Largura | Arrastar a 160 e além de 480; recarga | 160 e 480 respeitados; largura salva sobrevive; estado restaurado | Medição | Arraste com mouse apenas |
| Teclado e foco | Tab, Enter, setas, Escape | Foco visível (2 px) no cartão e itens; Escape devolve o foco ao gatilho; Escape em camadas na gaveta | JS + captura | — |
| Celular | Janela de 604 px; iframes de 320 e 390 px | Gaveta 256 px; foco em "Fechar menu"; 0 botões no Tab fechada; rolagem interna; fecha ao virar desktop | Medição + capturas | Iframe, não aparelho real |
| Larguras | Iframes de 320, 390, 768, 1024, 1366, 1920 | Sem rolagem horizontal na página e no cabeçalho em todas | `scrollWidth` | 1920 visto reduzido |
| Segmentado — 4 consumidores | Dashboard Financeiro, Borderô, cadastro de marca, folha do CMV | Pílula clara; largura estável na troca | Capturas | Folha do CMV já estourava 12,5 px (+1,5 agora) |
| Console | Coletor de `console.error` instalado na aba | Vazio após HMR, trocas de tema, menus e redimensionamentos | `window.__errs` | As únicas mensagens de erro anteriores vêm da falha simulada |
| Auditoria de módulo | `identity-access-auditor` (estático) | Aprovado com ressalvas; dois P3 corrigidos com teste | Relatório local | Gate de `/admin` no servidor não auditado |
| Uma loja | — | **Só em teste automatizado** | `CompanySelector.test.tsx`, `AppLayout.test.tsx` | Sem login de uma loja |
| Perfil com menos permissões | — | **Só em teste automatizado** (as quatro unidades dão o mesmo perfil de super admin) | `AppLayout.test.tsx` | — |
| Busca sem resultado | — | **Só em teste automatizado** (4 unidades < limiar 8) | `CompanySelector.test.tsx` | — |
| Leitor de tela | — | **Não executado** | Só atributos | — |
| Movimento normal | — | **Não observado** (navegador com movimento reduzido) | — | — |

As capturas ficaram na pasta temporária da extensão e mostram dados de unidades reais; não foram copiadas para o repositório.

## Pendências e regressões

- Introduzida e corrigida na fase: sidebar do desktop ficava sem cliques depois de a janela passar pelo modo celular (`inert` grudado no `<aside>` reaproveitado). Achado no navegador; corrigido com `key` distinta e limpeza do efeito; teste e nova conferência em navegador.
- Corrigidos na fase (preexistentes no escopo): Escape não fechava a gaveta, foco ficava atrás do overlay, 18 botões escondidos no Tab, ícone da unidade esmagado na recolhida, drawer mostrando menu recolhido, sininho sem nome acessível.
- Auditoria: P3 da trava do seletor e P3 da gaveta que reabria sozinha — corrigidos com teste.
- Registradas sem corrigir: PF-072 (HEAD 503 nos badges), PF-073 (calculadora sobre a gaveta).
- Observações para outras fases: a folha de exportação do CMV Financeiro estoura o controle segmentado (Fase 07); a tela CMV Financeiro tem seletor de período próprio em azul cheio, diferente do `SegmentedControl` (Fase 07); a 768 px a sidebar ocupa um terço da largura (preexistente, recolhível); o Dashboard Financeiro faz duas chamadas de `get_fin_dashboard_charts` (já anotado em FIN-B-007).

## Rollback seletivo

Reverter os commits da Fase 02 (ou descartar a branch `feat/redesign-v2-f02`). Partes independentes: `SegmentedControl.tsx` + `--segmented-active` (só o controle); `NotificationBell.tsx` (só rótulo e tamanho); `SubmoduleSwitcher.tsx` (uma classe). `AppLayout.tsx` e `CompanySelector.tsx` andam juntos (o layout usa `appearance`).

## Decisão de avanço

Fase 02 **validada com ressalvas**: gates de linha de comando ok, sidebar/seletor/cabeçalho conferidos em navegador nos dois temas e nas seis larguras, troca de loja sem flash, falha e formulário sujo conferidos. Ressalvas: uma loja, perfil reduzido e busca só em teste; leitor de tela e movimento normal não observados; larguras pequenas em iframe. Próxima: Fase 03.
