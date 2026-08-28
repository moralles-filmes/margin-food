# Progresso do redesign

Uma entrada por fase concluída. O agente de cada fase acrescenta a sua ao terminar.

---

## Fase 1 — Auditoria + fundação de tokens ✅ (2026-08-27)

### Arquivos alterados
- `src/index.css` — reescrito (317 → ~430 linhas)
- `tailwind.config.ts` — reescrito (114 → ~190 linhas)
- `src/components/CmvView.tsx`, `src/components/RhView.tsx`, `src/components/cmv/CmvTabs.tsx`,
  `src/components/cmv/CmvMetasDialog.tsx`, `src/components/rh/DashboardRhSection.tsx` — paleta de séries corrigida

### Arquivos criados
- `docs/redesign/README.md`, `00-AUDITORIA.md`, `01-DESIGN-SYSTEM.md`, `PLANO-DE-FASES.md`, `PROGRESSO.md`
- `docs/redesign/referencias/README.md`, `referencias/MOCKUPS.md`
- `docs/redesign/prompts/FASE-02.md`

### Decisões que valem para as fases seguintes
1. **`--primary` varia por tema e é AA como texto nos dois** (light `#2563EB` 5,2:1 · dark `#3B82F6` 5,2:1).
   Isso mantém corretos os 333 `text-primary`, 121 `border-primary` e 117 `bg-primary/N` já existentes, sem migração.
2. **`--primary-strong` é idêntico nos dois temas** (`#2563EB`) e existe para **superfície com label pequeno**
   (botão preenchido, chip com texto) — garante branco 5,2:1 em claro e escuro.
   Os 48 `bg-primary` sólidos remanescentes migram para ele conforme as fases tocarem nos arquivos.
3. **`--primary-ink`** é o azul para **texto pequeno** sobre o fundo do tema (light 6,7:1 · dark 7,6:1).
4. **`--info` virou ciano-azulado** (`#0369A1`/`#38BDF8`) para não colidir visualmente com a cor de marca.
5. **Aliases legados preservados** (`--gold*`, `.gradient-salmon`, `.glow-salmon`, `.text-gradient-salmon`)
   com valores azuis — 35 arquivos continuam funcionando. Migração é oportunista; remoção fica na Fase 11.
6. **`--radius` 1rem → 0,75rem** e escala tipográfica reduzida (`h1` 30px→26px) — densidade operacional.
7. `prefers-reduced-motion` passou a valer para o app inteiro (antes, só o Modo Apresentação).
8. `:focus-visible` global com `outline` de 2px na cor do `ring`.

### Bug corrigido
`--chart-2` … `--chart-5` eram consumidos por 5 arquivos mas **nunca haviam sido definidos** —
`hsl(var(--chart-2))` resolvia para cor inválida. Os tokens agora existem (`--chart-1..8`, matizes distintos)
e as listas de cores desses arquivos passaram a usar `--chart-1..6` (a última entrada era `--accent`,
um tint quase invisível).

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 678 warnings (idêntico ao baseline)
bun run test      → 61 arquivos, 518 testes, todos passando
bun run build     → OK
```
Sonda de classes: as 16 classes novas mais críticas (`bg-primary-soft`, `text-primary-ink`,
`border-border-strong`, `stroke-chart-grid`, `fill-chart-label`, `bg-sidebar-active`, `shadow-focus`,
`duration-fast`…) foram confirmadas no CSS compilado e a sonda foi removida.

### Pendências deixadas para as próximas fases
- 48 `bg-primary` sólidos com label pequeno → `bg-primary-strong` (fases 4–10)
- 35 arquivos com aliases `gold`/`salmon` → tokens semânticos (fases 2–10)
- 54 `<Tooltip>` de Recharts sem estilo e ~37 eixos sem `fill` → fases 6–8
- 26 arquivos com `<Input type="date">` cru → Fase 5
- `ui/sonner.tsx` usando `next-themes` sem provider → Fase 2

---

## Fase 2 — Layout global: Sidebar, Header e PageHeader ✅ (2026-08-27)

### Arquivos alterados
- `src/components/AppLayout.tsx` — sidebar, header e menu de usuário reconstruídos
- `src/components/ui/sonner.tsx` — troca de `next-themes` por `@/hooks/useTheme`

### Arquivos criados
- `src/components/ui/PageHeader.tsx` — título, subtítulo, ações e favorito opcionais

### Decisões
1. **Sidebar** — fundo/borda por token (`bg-sidebar`/`border-sidebar-border`, já não-transparente desde a Fase 1),
   bloco de marca com `bg-primary-strong` (superfície com label pequeno, não `bg-primary`), rótulos de grupo em
   `text-sidebar-section`, item ativo em `bg-sidebar-active` + marcador `bg-sidebar-active-marker`, hover em
   `bg-sidebar-hover` cor cheia (sem `/[0.08]`). Ícone sem cor própria — herda `currentColor` do texto do botão,
   garantindo "ícone na mesma cor do texto ativo" sem CSS extra.
2. **Collapse sem `fixed`** — o toggle do modo recolhido virou parte do fluxo normal (linha própria, centralizada)
   em vez do `fixed left-12 z-[60]` anterior. Dois controles fazem a mesma ação (toggle no topo quando expandido +
   rodapé "Recolher menu", como no mockup) — ambos dentro do fluxo, sem popup de layout.
3. **Tooltip Radix no modo recolhido** — cada item de nav e o link Admin viram `<Tooltip>` (`ui/tooltip.tsx`,
   já com `TooltipProvider` global em `App.tsx`) só quando `sidebarCollapsed`; `delayDuration` padrão do Radix.
4. **Menu de usuário → `DropdownMenu`** — substituiu a `div` absoluta + `useState(showUserMenu)`. Fecha ao
   clicar fora e por `Escape`, navegável por `Tab`/setas (comportamento nativo do Radix).
5. **Badges do header nos tokens `-soft`/`-border`** — `offline` e `budgetStatus` (estourado/perto) usam
   `bg-{warning,destructive}-soft border-{warning,destructive}-border text-{warning,destructive}` em vez de
   opacidade ad hoc (`/10`, `/20`). `ui/badge.tsx` continua com a variante antiga (`/25`, `/15`) — migração é
   escopo da Fase 4, não desta fase.
6. **Header sem blur** — trocado `bg-background/60 backdrop-blur-md` (sem borda) por `bg-background border-b
   border-border` sólido, alinhado ao mockup e à regra "sombra/borda para separação, não opacidade".
7. **Container de conteúdo** — `max-w-7xl` (1280px fixo) → `max-w-[1920px]`; padding ganhou `xl:p-8`. Densidade
   operacional em telas largas sem alterar o comportamento em 1280–1440px.
8. **`PageHeader` criado, não forçado no `AppLayout`** — o cabeçalho do `AppLayout` é chrome global (tab ativa +
   ações do sistema); o `PageHeader` do mockup é o cabeçalho de **conteúdo** de cada tela (título+estrela,
   subtítulo, ação primária), que só existe a partir da Fase 9/10. Encaixar o componente no header do
   `AppLayout` teria misturado as duas responsabilidades sem ganho real — decisão registrada aqui para não
   ser reaberta nas próximas fases.
9. **`favorite` do `PageHeader` sem handler não vira botão falso** — se `onFavoriteClick` não for passado, a
   estrela renderiza como ícone estático (sem `<button>`), evitando o anti-padrão de "botão fantasma".

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 678 warnings (idêntico ao baseline)
bun run test      → 61 arquivos, 518 testes, todos passando
bun run build     → OK
```
Verificação visual com Playwright headless (login real, usuário de teste fornecido pelo usuário) — light/dark,
sidebar expandida/recolhida, tooltip do modo recolhido, dropdown de usuário, drawer mobile + overlay: todos
renderizando conforme o mockup, sem erros de console atribuíveis ao layout (os únicos erros de console são
`401`/`permission denied` de RLS do tenant de teste, pré-existentes e fora do escopo desta fase).

### Pendências deixadas para as próximas fases
- Adoção do `PageHeader` tela a tela → Fases 9 e 10
- `ui/badge.tsx` ainda com variantes `success/warning/info` em opacidade (`/25`, `/15`) em vez de `-soft`/`-border` → Fase 4
- Aliases `gold`/`gradient-salmon` fora de `AppLayout.tsx` (35 arquivos) seguem pendentes → fases 3–10

---

## Fase 3 — Navegação de módulos e submódulos ✅ (2026-08-27)

### Arquivos alterados
- `src/components/ui/SubmoduleSwitcher.tsx` — redesenho visual, mesma API pública
- `src/components/FinanceiroView.tsx` — adota `ModuleNav` no lugar da composição manual (botão "Dashboard" + `SubmoduleSwitcher` por grupo)

### Arquivos criados
- `src/components/ui/ModuleNav.tsx`
- `src/components/ui/SegmentedControl.tsx`
- `docs/redesign/prompts/FASE-04.md`

### Decisões
1. **`SubmoduleSwitcher`**: trigger ativo trocou `.gradient-salmon` por `bg-primary-soft text-primary-soft-foreground border border-primary-border`; trigger "grupo sem match" (`groupLabel` presente, tab ativa fora do grupo) ganhou `border border-transparent` para não pular de tamanho em relação ao ativo (que tem borda). Item selecionado no dropdown/drawer usa os mesmos tokens `-soft`/`-soft-foreground` (antes: `bg-primary/10 text-primary` no desktop, `.gradient-salmon` no drawer mobile — os dois caminhos agora são visualmente idênticos). Badge numérico virou sólido (`bg-destructive`, sem `/80`).
2. **`ModuleNav` é novo e só foi adotado em `FinanceiroView`** — é a única das 8 views com uma navegação de módulo equivalente ao mockup (item simples "Dashboard" + itens de grupo com dropdown "Operações/Configurações/Relatórios"). Auditoria confirmou que as outras 7 views usam `SubmoduleSwitcher` como lista plana única (sem essa composição de 2 níveis) — não se inventou uma estrutura de grupos para elas.
3. **`ModuleNav` reaproveita `SubmoduleSwitcher` para os itens de grupo** (em vez de reimplementar um segundo `DropdownMenu`) — evita duplicar a lógica de dropdown desktop / drawer mobile já testada, e mantém o comportamento mobile que `FinanceiroView` já tinha antes desta fase. Itens sem `children` renderizam como botão simples (`bg-primary-soft text-primary-ink border-primary-border` ativo, `text-muted-foreground` sem fundo inativo — conforme o prompt da fase, ligeiramente diferente do texto do trigger do `SubmoduleSwitcher`, que usa `-soft-foreground`).
4. **`ModuleNav` substitui o wrapper em card** (`rounded-2xl bg-card border ... justify-center`) por uma fileira simples com `border-b border-border` — fiel ao mockup 01 ("Navegação do módulo"), que não desenha um card ao redor da fileira, só uma linha divisória abaixo.
5. **`SegmentedControl` criado mas não adotado nesta fase** — auditoria dos 8 arquivos consumidores de `SubmoduleSwitcher` não encontrou nenhum padrão `Mês|Meses|Ano|Total`/`Realizado|Orçado|Projeção`/`Valor|Volume` nas áreas de navegação desses arquivos (esses controles existem em telas de dashboard fora do escopo desta fase — Apresentação Sócios, Planejamento). Componente genérico, `role="radiogroup"`/`role="radio"`, navegação por `ArrowLeft`/`ArrowRight`/`Home`/`End` com roving `tabIndex`, ativo em `bg-primary-strong text-primary-strong-foreground` sólido. Adoção real fica para quem tocar essas telas (Fases 7–9).
6. **`gradient-salmon` removido apenas onde fazia parte da navegação de módulo** — `SubmoduleSwitcher.tsx` (2 ocorrências) e o botão "Dashboard" manual em `FinanceiroView.tsx` (que replicava a mesma classe). Ocorrências de `gradient-salmon` em botões de ação não relacionados à navegação nos mesmos arquivos consumidores (`EstoqueGeralView`, `ConfiguracoesView`, `PedidosComprasMercadoView`) foram deixadas intactas — fora do escopo de "ajuste de integração, não redesenho de tela inteira".

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 678 warnings (idêntico ao baseline)
bun run test      → 61 arquivos, 518 testes, todos passando
bun run build     → OK
```
Verificação visual com Playwright headless (login real, usuário de teste): Financeiro (light/dark, trigger "Dashboard" ativo, dropdown "Operações" aberto), Compras (`SubmoduleSwitcher` standalone com badge), Dashboard Salmão (dropdown com os 6 itens do mockup 03, incluindo o item ativo com tint + check) — todos consistentes com os mockups, sem erros de console atribuíveis a esta fase (os únicos erros são `401`/RLS do tenant de teste, pré-existentes desde a Fase 2).

### Pendências deixadas para as próximas fases
- Adoção do `SegmentedControl` nas telas de dashboard que já têm os 3 padrões do mockup (Apresentação Sócios, Planejamento) → Fases 7–9
- `ModuleNav` não avaliado para as outras 7 views — nenhuma tinha estrutura equivalente hoje; reavaliar caso alguma ganhe navegação em 2 níveis numa fase futura
- Aliases `gold`/`gradient-salmon` fora da navegação de módulo (ainda ~32 arquivos, incluindo os 3 botões de ação identificados em `EstoqueGeralView`, `ConfiguracoesView`, `PedidosComprasMercadoView`) seguem pendentes → fases 4–10

---

## Fase 4 — Componentes base (primitivos) ✅ (2026-08-27)

### Arquivos alterados
`src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `dropdown-menu.tsx`,
`dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `badge.tsx`, `alert.tsx`, `table.tsx`, `EmptyState.tsx`, `KpiCard.tsx`,
`StatusBadge.tsx`, `checkbox.tsx`, `switch.tsx`.

Sem alteração (auditados e já compliant — sem opacidade/hex, tokens corretos): `tabs.tsx`, `skeleton.tsx`,
`tooltip.tsx`, `popover.tsx`, `command.tsx`, `radio-group.tsx`.

### Decisões
1. **`Button` `default`** → `bg-primary-strong text-primary-strong-foreground hover:bg-primary-hover` (era
   `bg-primary`/`hover:bg-primary/90`). `outline`/`ghost`/`secondary`/`destructive`/`link` mantidos — já usavam
   tokens (`border-input`, `bg-secondary`, `hover:bg-accent`), sem opacidade-como-hierarquia a corrigir. Chaves
   de `variant` intocadas.
2. **`Card`** — `CardHeader`/`CardContent`/`CardFooter`: `p-6` → `p-4` (`space-y-1.5` → `space-y-1` no header).
   `CardTitle`: `text-2xl` → `text-base font-semibold` (mesma escala do `h3` global, evita introduzir um tamanho
   arbitrário novo). `Card` raiz (`rounded-lg border bg-card shadow-sm`) já estava correto, não mexido.
3. **Inputs (`input.tsx`/`textarea.tsx`/`select.tsx` trigger)** — adicionado `hover:border-border-strong`
   (`disabled:hover:border-input` para não acender hover em campo desabilitado) e `aria-[invalid=true]:` para o
   estado de erro (`border-destructive` + `ring` vermelho no foco) — hook por atributo HTML padrão, não por prop
   nova, então não altera a assinatura pública nem a lógica de `NUMERIC_INTERMEDIATE_RE`. **Não existe
   `form.tsx`/wiring de RHF que sete `aria-invalid` automaticamente hoje** — o estado fica pronto para quem
   passar o atributo manualmente; nenhum consumidor faz isso ainda, então não muda nada visualmente até alguém
   adotar. **Estado `filled` avaliado e descartado**: o projeto não usa label flutuante em nenhum formulário
   (`grep` não achou o padrão), então não há o que estilizar diferente para "campo preenchido" — decisão, não
   omissão. **Estado `success`** também não tem sinal de nenhum consumidor hoje (nenhum `aria-invalid={false}`
   explícito nem prop equivalente) — mesmo raciocínio de "não validar cenário que não existe" do `CLAUDE.md`.
   `SelectTrigger` ganhou `data-[state=open]:border-ring` (feedback de aberto, Radix já expõe o atributo).
4. **`SelectItem` / `DropdownMenuCheckboxItem` / `DropdownMenuRadioItem`** ganharam
   `data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary-soft-foreground` — estado
   **persistente** de selecionado (tint azul, igual ao item ativo do `SubmoduleSwitcher`/`ModuleNav`), separado
   do highlight **transitório** de hover/teclado que já usava `focus:bg-accent` (mantido). Antes, o único sinal
   de "selecionado" era o ícone de check: o fundo não mudava.
5. **`DropdownMenuSubContent`**: `shadow-lg` → `shadow-md` — era inconsistente com `DropdownMenuContent`
   (mesma elevação, é um dropdown, não um modal; `01-DESIGN-SYSTEM.md` § Elevação reserva `shadow-lg` para
   modal/drawer).
6. **`Dialog`/`Sheet`/`Drawer` — superfície `bg-background` → `bg-card`**: os três usavam o token de *fundo da
   página* para o painel modal, o que no dark quebra a "hierarquia por luminosidade crescente" documentada em
   `01-DESIGN-SYSTEM.md` § Superfícies (`background` #0A0D14 ≈ mesmo tom do scrim atrás, o modal não parecia
   elevado). `Drawer` também não tinha `shadow-lg` (só `border`) — adicionado, e a alça de arrastar trocou
   `bg-muted` por `bg-border-strong` (mais visível como afordance de "puxar", `bg-muted` é um token de
   hierarquia de texto/superfície, não de affordance de UI).
7. **`Table`** — `bg-muted/30`(thead)/`bg-muted/50`(tfoot) → `bg-muted` sólido nos dois (a própria Fase 3
   já cita `bg-muted` como candidato). `TableRow`: `hover:bg-muted/40` → `hover:bg-surface-hover` (token
   dedicado a "hover de linha/item de lista", já usado pelo CSS global `tr:hover td` desde a Fase 1 — agora o
   componente e o CSS global usam o mesmo token, sem redundância de cor divergente); `data-[state=selected]:bg-muted`
   → `bg-primary-soft` (selecionado passa a ser um estado azul, distinto de hover neutro). **Zebra/empty/loading
   não viraram API nova** — `grep` não achou nenhum padrão informal de zebra nos consumidores (`nth-child`/`even:`),
   e empty state já é resolvido por `EmptyState` dentro de um `TableCell colSpan` (17 arquivos fazem isso) — a
   decisão de não inventar ficou documentada como comentário no próprio `table.tsx`, com a classe de zebra
   opcional (`[&_tr:nth-child(even)]:bg-background-subtle`) sugerida para quem precisar.
8. **`Badge`**: `default` migrou para `bg-primary-strong`/`hover:bg-primary-hover` (mesma regra do `Button`).
   `success`/`warning`/`info` trocaram `/25`+`/15` por `-border`+`-soft`. Adicionadas as variantes que faltavam
   — `danger` (reaproveita `destructive-soft`/`destructive-border`, já que `--danger` é numericamente idêntico a
   `--destructive`; evita criar tokens CSS duplicados só para ter o nome "danger") e `neutral`
   (`neutral-soft`/`neutral-border`). `destructive` (sólido) e `outline` mantidos intocados — compatibilidade
   com quem já usa `destructive`. `StatusBadge` (`VARIANT_STYLES`) migrado do mesmo jeito; o dot sólido de
   `neutral` trocou `bg-muted-foreground` por `bg-neutral` (mesmo valor de cor, nome semântico correto).
9. **`Alert`** ganhou acento lateral (`border-l-4` na cor semântica cheia, borda fina nas outras 3 bordas na
   `-border`, fundo `-soft`) em vez do bloco `text-destructive` sem preenchimento que existia antes. Adicionadas
   as variantes `success`/`warning`/`info` (só existiam `default`/`destructive`) — aditivo, não quebra os 20
   usos existentes de `variant="destructive"`. Ícone (`[&>svg]`) ganhou cor semântica própria por variante em
   vez de herdar `text-foreground` genérico.
10. **`EmptyState`**: ícone `text-muted-foreground/50` → `text-muted-foreground` (opacidade-como-hierarquia).
11. **`KpiCard`**: todas as variantes (`primary/success/warning/danger/gold`) migraram `border-X/25`+`bg-X/15`
    para `border-X-border`+`bg-X-soft`; `primary` passou a usar `text-primary-ink` no ícone em vez de
    `text-primary` (ícone pequeno sobre tint = mesma regra de "texto pequeno" do design system). Hover do card
    clicável: `hover:bg-accent/50` → `hover:bg-card-hover` (token dedicado a "card clicável em hover", em vez de
    reaproveitar o tint de menu com opacidade). Reconstrução completa de layout (delta, seta de tendência,
    barra fina) **não** entrou aqui — fica para a Fase 9, que já vai redesenhar as telas que o consomem; nesta
    fase o objetivo era só o primitivo não carregar mais dívida de token.
12. **`Checkbox`/`Switch`** — preenchimento sólido (`data-[state=checked]:bg-primary`) migrou para
    `bg-primary-strong`/`text-primary-strong-foreground` (regra de "superfície com label pequeno" aplicada a
    qualquer preenchimento sólido, não só botões — os dois arquivos estavam no escopo desta fase). `border-primary`
    (contorno do quadrado desmarcado) e `text-primary`/`border-primary` do `RadioGroupItem` **não** mudaram — são
    usos de `text-primary`/`border-primary`, já cobertos pela decisão da Fase 1 de que esses dois não precisam
    migração.
13. **`Tabs`/`Skeleton`/`Tooltip`/`Popover`/`Command`/`RadioGroup` sem alteração** — auditados item por item,
    já usavam tokens sólidos (`bg-muted`, `bg-popover`+`shadow-md`, `text-primary`/`border-primary`) sem
    opacidade-como-hierarquia nem hex. `Tabs` mantém o estilo "pill branco sobre trilho cinza + shadow-sm" —
    deliberadamente diferente do `SegmentedControl` (Fase 3, ativo azul sólido): são padrões distintos por design
    (troca de conteúdo vs. filtro), não uma inconsistência a unificar.

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 678 warnings (idêntico ao baseline)
bun run test      → 61 arquivos, 518 testes, todos passando
bun run build     → OK
```
**Sem verificação visual em navegador nesta fase** — esta sessão não teve acesso a uma ferramenta de automação
de navegador (Playwright ou equivalente) nem a credenciais de teste; ao contrário das Fases 2 e 3, a validação
ficou restrita a tipos/lint/testes/build e à leitura cuidadosa de cada classe Tailwind contra os tokens de
`01-DESIGN-SYSTEM.md`. Recomenda-se conferência visual manual (light/dark) na primeira tela que consumir cada
primitivo antes da Fase 9 fechar os dashboards.

### Pendências deixadas para as próximas fases
- Confirmação visual em navegador (light/dark) dos 22 primitivos tocados — não verificada nesta sessão
- `KpiCard`: layout completo (delta, tendência, barra fina de cor) → Fase 9
- Zebra de tabela: classe sugerida (`[&_tr:nth-child(even)]:bg-background-subtle`) documentada mas não adotada
  em nenhum consumidor — fica a critério de quem precisar
- `aria-invalid`/estado de erro de `Input`/`Textarea`/`Select` está pronto no CSS mas nenhum formulário seta o
  atributo ainda — conectar quando a Fase 5+ (ou um formulário específico) precisar de validação visual
- Aliases `gold`/`gradient-salmon` fora de `src/components/ui/*` seguem pendentes → fases 5–10

---

## Fase 5 — Datas e filtros ✅ (2026-08-27)

### Arquivos alterados
- `src/components/ui/calendar.tsx` — estados sem opacidade
- `src/components/ui/DateInput.tsx` — **não alterado** (lógica intocada, conforme obrigatório)
- `src/components/PeriodFilter.tsx`, `src/components/financeiro/DateRangePresets.tsx`,
  `src/components/financeiro/MonthNavigator.tsx` — `gradient-salmon`/opacidade-como-hierarquia removidos
- 24 arquivos com `<Input type="date">` cru migrados para `DateInput` (ver lista abaixo)
- 4 arquivos com composição manual Popover+Calendar (Date-based) migrados para `DatePicker`:
  `src/components/RhView.tsx`, `src/components/financeiro/DashboardFinanceiroSection.tsx`,
  `src/components/rh/FeriasAfastamentosSection.tsx`, `src/components/rh/DocumentosComplianceSection.tsx`

### Arquivos criados
- `src/components/ui/DatePicker.tsx` — exporta `DatePicker` (single, `Date`-based) e `DateRangePicker`
  (intervalo, contrato `from`/`to` ISO `yyyy-MM-dd`)
- `src/components/ui/FilterBar.tsx` — exporta `FilterBar` (container) e `FilterField` (gatilho ícone+label+valor+chevron)
- `src/components/ui/PeriodSelector.tsx` — composição `FilterField` + `Popover` + `Calendar mode="range"`
- `docs/redesign/prompts/FASE-06.md`

### Decisões
1. **`Calendar` sem `opacity` em nenhum estado.** `nav_button` deixou de usar `opacity-50 hover:opacity-100`
   (fake-disabled permanente) — agora usa tokens reais (`bg-background`/`hover:bg-surface-hover`) e o
   `disabled:opacity-50` que resta vem do `buttonVariants` base (Fase 4, já aprovado, ligado ao `:disabled`
   real do react-day-picker no limite do range navegável — não é hierarquia via opacidade, é o mesmo
   comportamento de disabled de qualquer outro botão do app). `day_selected` migrou de `bg-primary` sólido
   para `bg-primary-strong` (mesma regra de "superfície com label pequeno" da Fase 4). `day_today` mantido em
   `bg-accent` (já era tint correto, prompt pediu para não mexer).
2. **"Dia fora do mês dentro do range selecionado" resolvido com tokens existentes, sem token novo.** O
   problema (`bg-accent/50`+`opacity-30` no código antigo) virou `bg-background-subtle` (tint sólido e mais
   discreto que `bg-primary-soft`, usado no range dentro do mês corrente) — comunica "faz parte do range mas é
   de outro mês" só por contraste de superfície, sem opacidade. Não foi necessário nenhum token novo em
   `index.css`.
3. **`ui/DatePicker.tsx`: um arquivo, dois componentes.** `DatePicker` (Date-based, para telas que já guardam
   `Date` — ponto, agenda, vencimento) e `DateRangePicker` (contrato `from`/`to` ISO, para filtros). O plano
   da fase listava só `ui/DatePicker.tsx` como arquivo novo — em vez de criar um `RangePicker.tsx` separado
   (duplicando ~80% do popover/trigger), o range picker foi colocado no mesmo arquivo como um segundo export,
   já que a anatomia (Popover + Button-trigger + Calendar) é idêntica. `DatePicker` ganhou `formatValue?` para
   o único consumidor que precisava de um formato de exibição diferente do padrão `dd/MM/yyyy`
   (`DashboardFinanceiroSection`, que mostra "15 de agosto, 2026").
4. **Locale `pt-BR` centralizado no `DatePicker`/`DateRangePicker`/`PeriodSelector`**, não mais responsabilidade
   de cada call site. Achado ao migrar: `DashboardFinanceiroSection.tsx` já tinha um `<Calendar mode="single">`
   **sem** `locale={ptBR}` (bug latente — mês em inglês), enquanto os outros 3 consumidores manuais passavam
   `locale={ptBR}` individualmente. Corrigido de graça ao centralizar — não é mais possível esquecer o locale
   num novo consumidor.
5. **Antes de criar `DatePicker`, auditados os 4 arquivos que já importavam `ui/calendar`+`ui/popover`**
   (`RhView.tsx`, `DashboardFinanceiroSection.tsx`, `FeriasAfastamentosSection.tsx`,
   `DocumentosComplianceSection.tsx` — 6 ocorrências no total) — todas eram exatamente a mesma composição
   manual (Popover+Button-trigger+Calendar mode="single"). Extraídas para `DatePicker` em vez de deixar
   duplicado, conforme pedido no prompt da fase ("confirme que nenhum arquivo já tem uma composição
   equivalente que baste extrair").
6. **`FilterField` é genérico — não existe `UnitSelector` dedicado.** O padrão do mockup ("ícone em container +
   label pequeno acima + valor bold abaixo + chevron") é o mesmo para o campo "Período" e o campo "Unidade";
   criar um componente por ícone seria duplicação. `FilterField` (`ui/FilterBar.tsx`) cobre os dois — quem
   precisar de "Unidade" usa `<FilterField icon={Building2} label="Unidade" value="..." />` diretamente ou
   dentro de um `DropdownMenuTrigger asChild`. `PeriodSelector` é a única composição especializada, porque
   "Período" carrega lógica própria (popover com `Calendar mode="range"`).
7. **`FilterBar`/`FilterField`/`PeriodSelector` criados mas não forçados em nenhuma tela nesta fase** — mesma
   lógica da Fase 3 com o `SegmentedControl` (criado, adoção real quando a tela for redesenhada). O prompt da
   Fase 5 pede os componentes prontos; adotá-los tela a tela é explicitamente escopo das Fases 7–9
   ("Filtros no padrão da Fase 5", `PLANO-DE-FASES.md`).
8. **`MonthNavigator`: `bg-muted/40` → `bg-background-subtle`** (well sólido, mesmo papel documentado em
   `01-DESIGN-SYSTEM.md`: "faixa/well dentro de card"). **Foco do `SelectTrigger` interno restaurado**: o
   componente zerava `focus:ring-2` (herdado do `Select` padrão) com `focus:ring-0` mas não colocava nada no
   lugar — como o próprio `SelectTrigger` já tem `focus:outline-none` na base, o resultado era foco de teclado
   completamente invisível ali (o `:focus-visible` global da Fase 1 não vence porque o utilitário Tailwind
   está numa camada CSS posterior). Adicionado `focus-visible:ring-2 focus-visible:ring-ring
   focus-visible:ring-inset` — mantém o visual "quieto" no clique do mouse e devolve foco visível real no
   teclado, sem reabrir a decisão de estilo da Fase 4 sobre o `Select` padrão (a mudança é só neste consumidor).
   Aritmética de mês (`shiftMonth`/`monthBounds`) **intocada**.
9. **24 arquivos com `<Input type="date">` cru → `DateInput`** (mesma API, sem tocar a lógica de guarda de ano):
   `EntriesView`, `GlobalAuditView`, `InventarioView`, `ManipulationView`, `MovimentacoesSection` (3 ocorrências,
   2 escopos), `PedidosComprasMercadoView`, `SimuladorCompra`, `cmv/CmvFiltersBar`, `compras/cotacao/CotacaoFormDialog`,
   `estoque/StockLossesSection`, `estoque/StockTopConsumedSection`, `financeiro/ConciliacaoBancariaSection`
   (preserva `min`/`max` cruzados entre os 2 campos), `financeiro/ContasPagarSection`/`ContasReceberSection`
   (preserva `max={todayBR()}`), `financeiro/CriarLancamentoExtratoDialog`, `financeiro/FechamentoCaixaSection`
   (2 escopos distintos), `financeiro/LivroRazaoSection`, `financeiro/PresentationPeriodFilters` (preserva `id`
   para os `<Field>`), `rh/BeneficiosSection`, `rh/ComunicacaoInternaSection`, `rh/GestaoDisciplinarSection`,
   `rh/SSTSection` (5 ocorrências em 3 formulários independentes — `EpisTab`/`ExamesTab`/`IncidentesTab`), mais
   `RhView` (o campo "Data Admissão", que não fazia parte da composição Popover+Calendar do mesmo arquivo) e
   `PeriodFilter.tsx`. Import de `Input` removido só onde não sobrava nenhum outro uso no arquivo.
10. **Nenhum dos 24 exigiu "justificar em vez de migrar"** — todos eram campo de data avulso em formulário/filtro,
    sem popover+calendário próprio, todos com contrato `value`/`onChange(e.target.value)` compatível 1:1 com
    `DateInput`.

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 677 warnings (baseline 678 — sem regressão)
bun run build     → OK
```
`bun run test` rodou em paralelo a uma sessão concorrente não relacionada (refatoração de capítulos da
Apresentação Sócios — `presentationSlides.ts`, `PresentationMode.tsx`, `presentationDetailNavigation.ts`,
nenhum desses tocado por esta fase); 522/525 testes passaram, as 3 falhas são exclusivamente em
`presentationExports.test.ts` (contagem de slides do PPTX), num arquivo e numa área que esta fase não tocou —
confirmado via `git diff --stat` que `src/lib/presentationExports.ts` está intocado e que os arquivos que
alimentam aquele teste (`presentationSlides.ts`, `PresentationMode.tsx`) só aparecem modificados pela sessão
concorrente. Nenhum teste de `DateInput`/`PeriodFilter`/`MonthNavigator`/`DateRangePresets`/Calendar falhou.

### Pendências deixadas para as próximas fases
- Adoção de `FilterBar`/`FilterField`/`PeriodSelector` tela a tela → Fases 7–9 ("Filtros no padrão da Fase 5")
- `PeriodSelector` foi desenhado só para intervalo (`from`/`to`); se alguma tela precisar de granularidade
  "Mês único" no mesmo campo, combinar com `SegmentedControl` (Fase 3) na tela consumidora, não no componente
- Verificação visual em navegador (light/dark) dos novos `DatePicker`/`FilterField`/`PeriodSelector` e do
  `Calendar` redesenhado — não executada nesta sessão (sem acesso a navegador/credenciais neste ambiente)
- Aliases `gold`/`gradient-salmon` fora do escopo desta fase seguem pendentes → fases 6–10

---

## Fase 6 — Camada central de gráficos ✅ (2026-08-28)

### Arquivos alterados
- `tailwind.config.ts` — namespace `chart` completo (`cursor`, `tooltip`, `tooltip-foreground`, `tooltip-border`)
- `src/components/ui/chart.tsx` — `ChartTooltipContent` migrado para os tokens de tooltip; seletores globais de
  eixo/grade/cursor do `ChartContainer` migrados de `border`/`muted-foreground` para `chart-label`/`chart-grid`/
  `chart-cursor`; formatação padrão do valor (`item.value.toLocaleString()`, sem locale = separador `en-US`)
  trocada por `formatDecimalBR` (`@/lib/formatters`); `item.value &&` → `item.value != null` no mesmo local (o
  `&&` escondia valores exatamente `0`, comuns em gráfico financeiro — corrigido de graça por estar na mesma
  linha já em edição, não é um escopo novo)

### Arquivos criados
- `src/lib/chartTheme.ts` — `SERIES_COLORS` (8 matizes), `getSeriesColor()`, `SEMANTIC_CHART_COLORS`
  (`positive/negative/neutral/projected`), `PROJECTED_DASH_ARRAY` (`'6 4'`), `axisProps`, `gridProps`,
  `cursorProps`, `makeActiveDot()`, `tooltipProps`, `legendProps`, `chartValueFormatters`
  (`money`/`moneyCompact`/`percent`/`quantity`)
- `src/components/ui/ChartTooltip.tsx` — tooltip para consumidores de Recharts cru (título/período/série/
  valor/unidade, amostra sólida vs tracejada via `dashedKeys`)
- `src/components/ui/ChartLegend.tsx` — legenda companheira do `ChartTooltip`, mesma lógica de `dashedKeys`
- `src/components/ui/ChartCard.tsx` — card com título/subtítulo/ações/legenda/corpo responsivo/empty/loading

### Decisões
1. **`ChartTooltip`/`ChartLegend` (novos) NÃO substituem `ChartTooltipContent`/`ChartLegendContent` de
   `ui/chart.tsx`, que continuam existindo intocados na API pública.** São dois pares para dois públicos
   diferentes: `ui/chart.tsx` é para quem já usa `ChartContainer`/`ChartConfig` (resolve cor/rótulo por
   `dataKey` via contexto React — hoje só os 4 arquivos de Estoque: `StockDashboardSection`,
   `StockLossesSection`, `StockTopConsumedSection`, `StockPredictiveSection`, todos escopo da Fase 8); os novos
   `ui/ChartTooltip.tsx`/`ui/ChartLegend.tsx` são para os demais ~18 arquivos que importam Recharts cru e não
   têm `ChartConfig` nenhum — recebem tudo por prop, sem depender de contexto. Só ajustei o que já existe
   (tokens de superfície, formatação, seletores globais); não deletei nem reescrevi a API do wrapper shadcn.
2. **Distinção sólida vs tracejada via `dashedKeys` explícito, não via `legendType`/`strokeDasharray` do
   Recharts.** O Recharts não expõe um `legendType` nativo de "linha tracejada" (só `line/square/circle/
   diamond/cross/…`), e o payload do `Tooltip`/`Legend` não carrega o `strokeDasharray` da série de volta —
   depender disso seria inventar um comportamento não documentado. Em vez disso, `ChartTooltip`/`ChartLegend`
   recebem `dashedKeys?: Array<string|number>` (as `dataKey`s que são "ideal/orçado/projetado") e decidem a
   amostra (`border-solid`/`border-dashed` em CSS, não SVG `stroke-dasharray`) a partir disso — explícito,
   sem mágica. `PROJECTED_DASH_ARRAY = '6 4'` em `chartTheme.ts` só centraliza o valor já usado em
   `PresentationPlanComparison`/`PresentationScenarioSection` (não é um padrão novo).
3. **`gridProps` é `vertical: false` por padrão** (mockup 04: "grade horizontal sutil e visível, sem grade
   vertical") — decisão tomada como *padrão recomendado* para gráfico de linha/área nas Fases 7/8, não uma
   regra rígida; um gráfico de barras que precise de grade nas duas direções sobrescreve com
   `{...gridProps, vertical: true}`. `strokeDasharray: '3 3'` foi mantido (não é valor novo, é a convenção já
   usada em ~20 dos 22 consumidores existentes — trocar teria sido uma mudança visual não pedida).
4. **Migração dos seletores globais do `ChartContainer`** (`fill-muted-foreground`→`fill-chart-label`,
   `stroke-border`→`stroke-chart-grid`/`stroke-chart-cursor`, removida a opacidade `stroke-border/50`) feita
   com base no contraste **já documentado** em `01-DESIGN-SYSTEM.md`/`index.css` (`--chart-label` comentado
   como "AA nos dois temas", "6.9:1 sobre o card" no dark; `--chart-grid` desenhado como "sutil porém
   visível") — **sem verificação em navegador real** (mesma limitação da Fase 4: sem Playwright/credenciais
   neste ambiente). Recomenda-se conferência visual quando a Fase 8 tocar os 4 arquivos que usam
   `ChartContainer` (única superfície que consome esses seletores hoje).
5. **Formato BR do tooltip usa `fmtBRL`/`formatMoneyBR` sem espaço após `R$`** (`R$537.565,72`), não
   `R$ 537.565,72` como no exemplo solto do prompt da fase — é o comportamento real de
   `formatNumberToBRLWithSymbol`/`fmtBRL` em `@/lib/money.ts`, usado em todo o resto do sistema; inventar um
   espaço só no gráfico quebraria a consistência com KPI cards, tabelas etc.
6. **`ChartCard`: altura padrão `aspect-video`, override por `height?: string` (classe Tailwind).** Mesmo
   contrato de altura que `ChartContainer` (`ui/chart.tsx`) já usa — reaproveita o padrão em vez de inventar
   uma API de altura numérica (`height={320}`) diferente da que os 22 consumidores já conhecem via
   `ResponsiveContainer height={...}`.
7. **Nenhum dos 22 consumidores de Recharts foi migrado nesta fase** (proibido pelo prompt). Mapeamento
   Fase 7 vs Fase 8 já registrado em `PLANO-DE-FASES.md` foi conferido por `grep` contra os arquivos reais —
   os 10 arquivos listados na Fase 7 e os 11 da Fase 8 batem exatamente com os 21 arquivos que hoje importam
   `from 'recharts'` (+ o próprio `ui/chart.tsx`, que importa `from "recharts"` = os "22 arquivos" da
   auditoria da Fase 1); nada a corrigir no mapeamento.
8. **Auditoria rápida feita ao ler os 10 arquivos da Fase 7** (para escrever o prompt seguinte com precisão,
   não migração): `FechamentoCaixaSection.tsx` importa `Tooltip as RTooltip` (por isso não aparecia em
   buscas por `<Tooltip`); `ProjecaoFluxoSection.tsx` tem `<Tooltip>` sem nenhum estilo (caixa branca padrão
   do Recharts); `relatorios/GastosPorSetorChart.tsx` tem `SECTOR_COLORS` com 3 dos 8 valores em HSL literal
   (`hsl(210, 70%, 55%)` etc.) em vez de token; `PresentationAnalytics.tsx` já estiliza o tooltip via
   `contentStyle` com tokens de `--popover` (não `--chart-tooltip`, que é a superfície dedicada). Registrado
   com precisão no prompt da Fase 7 em vez de generalizar.

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (baseline 677 — sem regressão)
bun run test      → 74 arquivos, 576 testes, todos passando (nenhuma falha da sessão concorrente
                    de Apresentação Sócios desta vez — aparentemente resolvida por ela)
bun run build     → OK
```
**Sem verificação visual em navegador** — os componentes novos (`ChartCard`/`ChartTooltip`/`ChartLegend`)
ainda não têm nenhum consumidor real (a adoção é escopo das Fases 7/8), então não há tela para abrir; a
migração dos seletores do `ChartContainer` existente também não foi verificada visualmente (ver decisão 4).
Sem acesso a Playwright/credenciais neste ambiente, mesma limitação já registrada na Fase 4.

### Pendências deixadas para as próximas fases
- Migrar os ~18 arquivos de Recharts cru (Fases 7/8) para `chartTheme.ts` + `ChartTooltip`/`ChartLegend`/
  `ChartCard`
- Migrar os 4 arquivos de Estoque que usam `ChartContainer`/`ChartConfig` (Fase 8) — conferir visualmente a
  migração de seletores do item 4 acima na primeira tela real
- `relatorios/GastosPorSetorChart.tsx`: `SECTOR_COLORS` com HSL literal → `SERIES_COLORS`/`chartTheme.ts`
  (Fase 8)
- Verificação visual em navegador (light/dark, 1024–1920px) de qualquer gráfico migrado — não executada
  nesta fase por falta de acesso a navegador
- Aliases `gold`/`gradient-salmon` fora do escopo desta fase seguem pendentes → fases 7–10

---

## Fase 7 — Gráficos do Financeiro ✅ (2026-08-28)

### Arquivos alterados
`src/components/financeiro/DashboardCharts.tsx`, `KPIsSection.tsx`, `ComparativoSection.tsx`,
`ProjecaoFluxoSection.tsx`, `FechamentoCaixaSection.tsx`, `PresentationAnalytics.tsx`,
`PresentationPlanComparison.tsx`, `PresentationDetailPage.tsx`, `PresentationScenarioSection.tsx`,
`src/components/relatorios/GastosPorSetorChart.tsx` — os 10 arquivos do escopo, todos migrados para
`chartTheme.ts` + `ChartTooltip`/`ChartLegend`.

### Decisões
1. **`PresentationPlanComparison.tsx` (Real vs Orçado) manteve o par de cor por natureza (receita=
   `SEMANTIC_CHART_COLORS.positive`, despesa=`SEMANTIC_CHART_COLORS.negative`) para **as duas variantes**
   (realizada e orçada da mesma natureza), em vez de jogar toda série orçada em
   `SEMANTIC_CHART_COLORS.projected`.** O gráfico tem 2 pares simultâneos (receita real/orçada, despesa
   real/orçada) — usar o token `projected` (uma cor neutra única) nas duas orçadas as tornaria
   indistinguíveis entre si, quebrando a leitura "mesma cor = mesma métrica, tracejado = orçado" que o
   mockup 04 pede (linha "Ideal" tracejada na **mesma família de cor** da linha "Real", não uma cor genérica
   à parte). A distinção sólido/tracejado ficou só por `PROJECTED_DASH_ARRAY` + `dashedKeys` no
   `ChartTooltip`/`ChartLegend` (`['receitaOrcada', 'despesaOrcada']`). `SEMANTIC_CHART_COLORS.projected`
   continua reservado para o caso de um único par real/ideal (ex.: Planejamento, fora do escopo desta fase).
2. **Tooltip com título dinâmico formatado (`label` do eixo X) exigiu um pequeno wrapper local em vez de só
   passar `title` estático ao `ChartTooltip`.** `ChartTooltip.title` sobrepõe `label`, mas é uma prop
   estática — não recebe uma função formatadora. Onde o cabeçalho do tooltip precisava de formatação (BRL,
   percentual, data) sobre o valor bruto do eixo X injetado pelo Recharts em runtime, duas soluções foram
   usadas conforme o caso: **(a)** pré-computar um campo de exibição já formatado no array de dados e usá-lo
   como `dataKey` do eixo X (`KPIsSection.tsx`: `mesLabel`; `ProjecaoFluxoSection.tsx`: `dataLabel`) — o
   Recharts injeta esse valor formatado como `label` de graça, sem lógica extra no tooltip; **(b)** quando o
   eixo precisa continuar numérico bruto para o `tickFormatter` compacto do eixo funcionar (ex.: eixo de
   "valor da alavanca" em R$ ou % na sensibilidade de `PresentationScenarioSection.tsx`, onde o tick do eixo
   usa `moneyCompact`/`%` mas o header do tooltip precisa do valor **não-compacto**, com mais casas), foi
   criado um componente local `SensitivityChartTooltip` que recebe `active`/`label`/`payload` do Recharts,
   formata `label` e repassa para `<ChartTooltip title={...} valueFormatter={...} />` — não reimplementa o
   render do `ChartTooltip`, só formata o header antes de delegar. Não é um componente genérico novo do
   design system, é local a `PresentationScenarioSection.tsx`.
3. **`GastosPorSetorChart.tsx`: legenda lateral manual mantida, não virou `<ChartLegend>`.** A lista ao lado
   do donut tem 3 colunas por linha (nome truncado + valor R$ + percentual, cada uma com alinhamento
   próprio) — `ChartLegend` só tem swatch + um `value` (`ReactNode` único). Encaixar as 3 colunas dentro de
   um único `value` perderia o alinhamento em coluna (`truncate flex-1` / `whitespace-nowrap` / `whitespace-
   nowrap` lado a lado). Decisão: manter a legenda manual (só migrando `SECTOR_COLORS` para `SERIES_COLORS`),
   documentado aqui em vez de forçar a adoção — mesmo critério que a Fase 6 já havia previsto no prompt desta
   fase ("continue manual se o layout não couber na anatomia do `ChartLegend`").
4. **Dead code removido ao tocar no arquivo:** `CHART_COLORS` em `DashboardCharts.tsx` (definido, nunca
   usado — só `PIE_COLORS` era consumido) foi apagado em vez de migrado, já que migrar uma constante morta
   teria sido trabalho supérfluo; `fmtShort`/`fmtBRLCompact` locais que só encapsulavam `fmtBRLCompact` para
   um `tickFormatter` (em `KPIsSection.tsx`, `ProjecaoFluxoSection.tsx`, `FechamentoCaixaSection.tsx`,
   `PresentationPlanComparison.tsx`, `PresentationDetailPage.tsx`, `PresentationScenarioSection.tsx`) foram
   substituídos por `chartValueFormatters.moneyCompact` (mesmo valor, fonte única) e o import/variável local
   removido quando ficou sem outro uso no arquivo.
5. **`ComparativoSection.tsx`: as duas barras de período (A/B) trocaram `hsl(var(--primary))` sólido +
   `hsl(var(--primary) / 0.4)` translúcido (opacidade-como-hierarquia) por `SERIES_COLORS[0]`/`SERIES_COLORS
   [1]`** — são dois períodos do **mesmo** indicador (categórico, não semântico positivo/negativo), então a
   Fase 7 tratou como duas séries categóricas distintas em vez de "a mesma cor mais clara" — remove o
   anti-padrão de opacidade sem perder a leitura de comparação.
6. **`Resultado`/`Valor` em séries que não têm polaridade fixa (não são claramente receita/despesa) mantidas
   em `hsl(var(--primary))` literal**, não migradas para `SEMANTIC_CHART_COLORS` (que só cobre
   `positive/negative/neutral/projected`) — é o caso de "Resultado Mensal" em `DashboardCharts.tsx`, a linha
   `Resultado` em `PresentationAnalytics.tsx`/`PresentationScenarioSection.tsx`/`PresentationDetailPage.tsx`.
   `hsl(var(--primary))` já é um token válido (não é hex), consistente com o uso preexistente em todo o
   sistema para "métrica de destaque neutra".
7. **`PresentationScenarioSection.tsx`: grade do gráfico de sensibilidade manteve `vertical: true`**
   (`{...gridProps} vertical`) em vez do `vertical: false` padrão de `gridProps` — é uma curva contínua sobre
   um eixo X numérico (valor da alavanca), não uma série temporal categórica; o original já desenhava grade
   nos dois eixos e overridar preserva esse comportamento (o próprio `chartTheme.ts` documenta esse override
   como esperado para casos assim).

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (idêntico ao baseline da Fase 6)
bun run test      → 74 arquivos, 576 testes, todos passando
bun run build     → OK
```
**Sem verificação visual em navegador** — mesma limitação registrada desde a Fase 4 (sem acesso a
Playwright/credenciais neste ambiente). Validação de estilo feita por auditoria de código: nenhum hex/rgb
literal restante nos 10 arquivos (`grep` confirmado), nenhum `<Tooltip>`/`<CartesianGrid>`/eixo sem os
tokens centralizados, nenhum `opacity` de hierarquia restante (as duas exceções documentadas — área sob
linha em `ProjecaoFluxoSection.tsx`/`FechamentoCaixaSection.tsx` — já existiam como padrão aprovado desde a
Fase 6/mockup 04).

### Pendências deixadas para as próximas fases
- Migrar os 11 arquivos de Estoque/CMV/RH/Relatórios/Planejamento (Fase 8) — 4 deles usam `ChartContainer`/
  `ChartConfig` e **não** devem virar `ChartTooltip`/`ChartLegend` (ver decisão 1 da Fase 6)
- Verificação visual em navegador (light/dark, 1024–1920px) dos 10 gráficos migrados nesta fase — não
  executada por falta de acesso a navegador neste ambiente
- Aliases `gold`/`gradient-salmon` fora do escopo desta fase seguem pendentes → fases 8–10

---

## Fase 8 — Gráficos de Estoque, CMV, RH, Relatórios e Planejamento ✅ (2026-08-28)

### Arquivos alterados
- `src/components/RelatoriosView.tsx` — removida `chartTooltipStyle` local; 3 gráficos (`LineChart` Tendência
  CMV, `BarChart` Custo por Semana, `LineChart` CMV por Semana) migrados para `gridProps`/`axisProps`/
  `tooltipProps`/`ChartTooltip`/`makeActiveDot`
- `src/components/DashboardView.tsx` — `BarChart` "Perda em R$ por semana" migrado; cor trocada para
  `SEMANTIC_CHART_COLORS.negative` (mesmo valor de `--destructive`, agora via token de gráfico)
- `src/components/AnaliseItemView.tsx` — removida a segunda cópia de `chartTooltipStyle` (duplicada de
  `RelatoriosView.tsx`); 2 gráficos compactos (`LineChart` Histórico de Preço, `BarChart` Consumo Semanal)
  migrados, tamanho de fonte compacto preservado via override de `tick` sobre `axisProps`
- `src/components/PurchaseRadar.tsx` — grade adicionada (`gridProps`), eixo/tooltip migrados; bug de
  `contentStyle` sem `background` corrigido de graça pela troca para `ChartTooltip`; barra "ideal"
  translúcida migrada de `hsl(var(--success) / 0.3)` para `SEMANTIC_CHART_COLORS.projected` +
  `fillOpacity={0.3}` (ver decisão 1)
- `src/components/WeeklyBreakdown.tsx` — mesma migração e mesma cor/opacidade da barra "ideal" que
  `PurchaseRadar.tsx` (decisão 1); swatch manual da legenda embutida trocado de `bg-success/35` para
  `bg-chart-projected/30` para continuar refletindo a cor real da barra
- `src/components/cmv/CmvTabs.tsx` — `COLORS` local → `SERIES_COLORS`; `RPieChart`/`BarChart` "Custo por
  Setor" (`layout="vertical"`, grade invertida para `vertical horizontal={false}`)/`BarChart` "Custo Semanal"
  migrados; bug de tabela pré-existente (linha 113, célula "Custo (R$)" faltando no Ranking por Setor) **não
  tocado**, fora de escopo
- `src/components/rh/DashboardRhSection.tsx` — `COLORS` local → `SERIES_COLORS`; 2 `PieChart` (Headcount por
  Setor, Tipo de Contrato — antes com `<Tooltip />` sem nenhum estilo) e 2 `BarChart` (Custo por Setor; Top
  10 Horas Extras com `layout="vertical"`, grade invertida) migrados
- `src/components/estoque/StockDashboardSection.tsx` — `STATUS_COLORS` (fallback `hsl(var(--x, y))`) →
  `SEMANTIC_CHART_COLORS.positive/negative/neutral` + `hsl(var(--warning))` para `atencao` (ver decisão 2);
  `PIE_COLORS` (8 HSL literais) → `SERIES_COLORS`; `chartConfigCat`/`chartConfigStatus` atualizados para os
  novos valores — estrutura do `ChartConfig`/`ChartContainer` intocada
- `src/components/estoque/StockLossesSection.tsx` — `CHART_COLORS` → `SERIES_COLORS`; `chartConfigTimeline`/
  `chartConfigTop`/`stroke` da linha de timeline migrados de `hsl(350, 80%, 55%)` literal para
  `SEMANTIC_CHART_COLORS.negative` (perda é semanticamente negativa, não uma série categórica); legendas
  manuais de "Tipo de Perda"/"Perdas por Categoria" mantidas manuais (ver decisão 3)
- `src/components/estoque/StockPredictiveSection.tsx` — **sem alteração de cor** (já usava `hsl(var(--primary))`/
  `hsl(var(--destructive))` sem literal); conferido conforme o prompt pedia, nada a migrar
- `src/components/estoque/StockTopConsumedSection.tsx` — `CHART_COLORS` (10 HSL literais) removido em favor
  de `getSeriesColor(i)` (wrap-around módulo 8, cobre os 10 itens do ranking); `STATUS_CONFIG.ok`/`.atencao`
  migrados de HSL literal para `hsl(var(--success))`/`hsl(var(--warning))` (tokens de app, mesmo raciocínio
  do `STATUS_COLORS` de `StockDashboardSection.tsx` — ver decisão 2); `chartConfig` do `BarChart` principal
  (dentro de `ChartContainer`) só teve a cor trocada; os 2 `PieChart` fora do `ChartContainer` (Top
  Quantidade, Distribuição por Categoria) migrados para `ChartTooltip`/`ChartLegend`/`tooltipProps`/
  `legendProps` de `chartTheme.ts` (importados com alias `RawChartTooltip`/`RawChartLegend` para não colidir
  com `ChartTooltip`/`ChartTooltipContent` de `ui/chart.tsx`, já importados para o `BarChart`)

### Decisões
1. **Barra "ideal" translúcida de `PurchaseRadar.tsx`/`WeeklyBreakdown.tsx`: `SEMANTIC_CHART_COLORS.projected`
   + `fillOpacity={0.3}`**, não a `fill` com alpha embutido (`hsl(var(--x) / 0.3)`) que os dois arquivos
   usavam antes. `fillOpacity` é a prop nativa do Recharts para isso e evita reimplementar opacidade dentro
   da string de cor; unifiquei os dois arquivos na mesma opacidade (0,3, valor que `PurchaseRadar.tsx` já
   usava — `WeeklyBreakdown.tsx` usava 0,35) porque o prompt da fase pede que os dois fiquem consistentes
   entre si por serem a mesma visualização em dois lugares da tela.
2. **`atencao` (4º status de saúde de estoque) usa o token de app `hsl(var(--warning))`, não um token de
   gráfico novo.** Aplicado em `StockDashboardSection.tsx` (`STATUS_COLORS`) e `StockTopConsumedSection.tsx`
   (`STATUS_CONFIG`). `01-DESIGN-SYSTEM.md` só define `--chart-positive/negative/neutral` (3 semânticas), sem
   um `--chart-warning` — inventar um token novo só para esse caso divergiria dos outros 3 valores do mesmo
   objeto em ambos os arquivos (`--destructive`/`--muted-foreground`/`--success`), que já são tokens de *app*,
   não de gráfico. Manter os 4 status na mesma família de token que `KpiCard`/`Badge` já usam para os mesmos
   4 estados é mais consistente do que uma migração parcial para `--chart-*`.
3. **Legendas manuais de "Tipo de Perda"/"Perdas por Categoria" em `StockLossesSection.tsx` continuam
   manuais, não viraram `<ChartLegend>`.** Cada linha tem dot colorido + label + contagem de registros (badge
   "N reg.") + valor em R$ alinhado à direita — mais colunas do que a anatomia de `ChartLegend` (swatch +
   texto) suporta. Diferente do caso já resolvido na Fase 7 (`GastosPorSetorChart`, que tinha só mais uma
   coluna de percentual e foi para dentro do padrão), aqui o "componente" já é funcionalmente uma mini-tabela,
   não uma legenda — forçá-lo em `ChartLegend` perderia a coluna de registros ou exigiria estender a API do
   componentente centralizado para um caso só.
4. **`StockPredictiveSection.tsx` não teve nenhuma linha alterada.** O prompt já apontava que o arquivo estava
   limpo (`chartConfig` só com `hsl(var(--primary))`/`hsl(var(--destructive))`); conferido de novo nesta
   sessão — nenhum HSL/hex literal, nenhum `contentStyle` manual. `ReferenceLine y={0}` (marca de ruptura) e
   os dois `any` pré-existentes (`get_stock_predictive_analysis_v2 as any`, `data as any`) mantidos, fora de
   escopo de gráfico.
5. **Os 4 arquivos com `ChartContainer` (itens 8–11) não importaram `axisProps`/`gridProps`/`tooltipProps`/
   `legendProps`/`ChartTooltip`/`ChartLegend` de `chartTheme.ts`/`ui/ChartTooltip.tsx`/`ui/ChartLegend.tsx`**
   — decisão já tomada na Fase 6 (grade/eixo/cursor do `ChartContainer` vêm de CSS global, não de props Recharts) e reafirmada no prompt desta fase. Única exceção: os 2 `PieChart` crus de
   `StockTopConsumedSection.tsx`, que **não** estão dentro de `ChartContainer` e por isso seguem o padrão
   Recharts-cru dos itens 1–7 (com alias de import para não colidir com os nomes já usados pelo `ChartContainer`
   no mesmo arquivo).

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (idêntico ao baseline da Fase 7)
bun run test      → 74 arquivos, 576 testes, todos passando
bun run build     → OK
```
**Sem verificação visual em navegador** — mesma limitação registrada desde a Fase 4 (sem acesso a
Playwright/credenciais neste ambiente). Validação de estilo feita por auditoria de código: nenhum HSL/hex
literal restante nos 5 arrays de cor listados no prompt (`STATUS_COLORS`, `PIE_COLORS`, `CHART_COLORS` ×2,
`STATUS_CONFIG`/`chartConfig*`), nenhum `<Tooltip>`/`contentStyle` inline restante nos 7 arquivos Recharts
cru, grade das 3 barras horizontais (`CmvTabs` Custo por Setor, `DashboardRhSection` Top 10 Horas Extras,
`StockTopConsumedSection`/`StockLossesSection`/`StockPredictiveSection`/`StockDashboardSection` dentro de
`ChartContainer`, já corretas antes) conferida na direção certa (`vertical horizontal={false}`).

### Pendências deixadas para as próximas fases
- Verificação visual em navegador (light/dark, 1024–1920px) dos 11 arquivos migrados nesta fase — não
  executada por falta de acesso a navegador neste ambiente; recomenda-se conferência especial na barra
  "ideal" translúcida (opacidade sobre a grade) e nos 2 `PieChart` recém-migrados de `StockTopConsumedSection`
- Aliases `gold`/`gradient-salmon` fora do escopo desta fase seguem pendentes → fases 9–10
- Bug de tabela pré-existente em `cmv/CmvTabs.tsx` (Ranking por Setor sem célula de "Custo (R$)") — não é
  gráfico, registrado aqui só para não se perder; correção é de outra fase/sessão

---

## Fase 9 — Dashboards executivos ✅ (2026-08-28)

### Arquivos alterados
- `src/components/ui/KpiCard.tsx` — novo prop opcional `delta?: KpiCardDelta` (linha de comparação "label →
  valor colorido com seta") e `ariaLabel?: string`; acessibilidade de teclado adicionada ao `onClick` (`role`,
  `tabIndex`, `onKeyDown` — faltava desde a Fase 4)
- `src/components/financeiro/DashboardFinanceiroSection.tsx` — grid de 8 cards migrado para `KpiCard` (com
  `delta` nos 3 que comparam com período anterior); segmented Dia/Mês/Período trocado pelo `SegmentedControl`
  da Fase 3; `DeltaBadge`/`Card` manual removidos
- `src/components/financeiro/PresentationAnalytics.tsx` — `ExecutiveMetricCard`/`CmvMetricCard` (Resumo
  executivo) migrados para `KpiCard` com `delta`; `OpenItemsPanel` (Contas a pagar/receber) com opacidade
  (`bg-warning/[0.04]` etc.) trocada por tokens `-soft`/`-border`; `DeltaLine`/`deltaTone` (lógica antiga de
  comparação) substituídos por `buildExecutiveDelta()`, que devolve um `KpiCardDelta` pronto
- `src/components/DashboardView.tsx` (Dashboard Salmão) — opacidade (`border-x/20`, `bg-x/10`, `bg-x/15`) de
  todos os blocos manuais trocada por tokens `-soft`/`-border`/`-ink`; alertas de estoque baixo/previsão de
  compra ganharam ícone (antes só emoji no texto)
- `src/components/PlanningView.tsx` — filtro de mês/ano (2 `<Select>` manuais) trocado por
  `financeiro/MonthNavigator` (import cross-módulo, ver decisão 2); estado `selectedMonth`/`selectedYear`
  colapsado em `targetMonth: 'yyyy-MM'`, derivando os inteiros só onde a RPC exige
- `src/components/MetaCompraCard.tsx` — redesenhado nas 4 colunas do mockup (Período · Meta R$ · Progresso +
  barra · Status); card deixou de pintar o fundo inteiro pela cor do status, status virou badge pequeno
- `src/components/PlanningProjecaoCard.tsx` — `text-success/80` (opacidade) → `text-success`
- `src/components/PurchaseRadar.tsx` / `src/components/BudgetPressure.tsx` — blocos "Estabilidade de Compra",
  "Concentração Semanal", "Padrão de Comportamento", "Risco de Estouro" deixaram de pintar o card inteiro
  (`bg-x/5`/`bg-x/10` + `border-x/30`) e passaram a usar `bg-card border-border` + acento lateral
  `border-l-4 border-l-{cor}`, conforme o mockup pede explicitamente para "Concentração Semanal"
- `src/components/RelatoriosView.tsx` — `KPICard` local (variantes `default/salmon/gold/success/destructive`)
  eliminado; ~19 usos migrados para `ui/KpiCard` (mapeamento na decisão 4)
- `src/components/AnaliseItemView.tsx` — bloco "Summary Cards" (Maior Impacto CMV, Maior Aumento Preço, Menor
  Giro, Maior Desperdício) migrado de `<div>` manual para `KpiCard`; `chartTooltipStyle` morto removido
- `src/components/CmvView.tsx` — `COLORS`/`fmt()` (2 declarações) removidos por dead code; `bg-muted/50` da
  "Simulação Rápida" → `bg-background-subtle`

### Decisões
1. **Achado transversal — Opção A: `KpiCard` ganhou um slot de `delta`.** `DashboardFinanceiroSection` e
   `PresentationAnalytics` resolviam "indicador + comparação com período anterior" com dois componentes
   bespoke (`DeltaBadge`, `ExecutiveMetricCard`). Em vez de manter os dois formatos, `KpiCard` (fonte única de
   "card de indicador" desde a Fase 4) ganhou `delta?: { label, formatted, direction?, tone? }` — o *consumidor*
   calcula o valor/direção/tom (a lógica de negócio de cada tela, incluindo `invert` para métricas onde "menor
   é melhor", como despesa, e os estados "Base zero"/"Fora do histórico" da Apresentação Sócios, ficou nas
   duas telas, sem entrar no componente de UI). `KpiCard` só sabe desenhar a linha "label cinza → valor
   colorido com seta", igual ao mockup. As duas telas foram migradas para esse mesmo prop; nenhuma outra tela
   desta fase precisou de `delta`.
2. **`MonthNavigator` (mora em `components/financeiro/`) importado por `PlanningView.tsx`** — cross-módulo,
   deliberado. Já é exatamente o padrão "setas + select de mês" que Planejamento reimplementava com 2
   `<Select>`; mover o arquivo para um lugar "mais neutro" só para evitar o import cross-módulo teria tocado
   todos os consumidores existentes em Financeiro sem ganho real. Precedente: `PeriodFilter.tsx` (raiz de
   `components/`) já é consumido por telas de módulos diferentes.
3. **`CmvFiltersBar.tsx`: `DateInput`×2 mantido, não migrado para `DateRangePicker`.** `DateRangePicker`
   (`ui/DatePicker.tsx`, Fase 5) não tem nenhum consumidor real no projeto hoje; adotá-lo pela primeira vez
   nesta fatia introduziria um segundo padrão de filtro de data (calendário em popover) divergente do padrão
   já canônico para range manual (`DateRangePresets.tsx`, 2× `DateInput` lado a lado) sem ganho de UX real —
   os dois campos aqui não têm lógica de min/max cruzado que justifique o contrato `from`/`to` de um único
   componente.
4. **Mapeamento de variantes locais → `KpiVariant` (`RelatoriosView`/`AnaliseItemView`)**: `destructive`→`danger`
   (mesmo semântico, nome diferente); `salmon`→`primary` (métricas de marca/destaque do módulo Salmão, sem
   conotação de risco); `gold`→`primary` (valores informativos sempre exibidos, sem lógica condicional de
   "atenção" — `01-DESIGN-SYSTEM.md` permite `gold`→`warning` **ou** `primary`, e nenhum desses casos
   representava "pendente/atenção"). Nenhum uso de `gold` real virou `warning` nesta fase porque nenhum se
   qualificava semanticamente.
5. **Card "CMV Explicado"/"Simulação Rápida" em `CmvView.tsx` não viraram `KpiCard`** — são conteúdo
   (lista de insights, resultado de simulação), não indicadores do sistema; só a opacidade (`bg-muted/50`) foi
   corrigida.
6. **`PurchaseRadar.tsx`/`WeeklyBreakdown.tsx`: apenas o conteúdo fora da área do gráfico foi tocado** — os
   dois já tinham o `recharts` migrado desde a Fase 8 (grade/eixo/tooltip/cor da barra "ideal"); confirmado por
   diff que nenhuma linha de `recharts`/`ChartContainer`/cor de série mudou nesta fase, só os blocos
   "Estabilidade"/"Concentração" (decisão acima) e o acento visual ao redor.
7. **Nenhuma tela desta fase precisou de um segundo componente de card de indicador.** Onde a métrica era uma
   agregação semântica de 2–4 números relacionados (Dashboard Salmão: "Estoque Limpo", "Meta g/Cliente",
   "Custo & CMV"; Planejamento: `MetaCompraCard`, `PlanningProjecaoCard`), manteve-se um card único com grid
   interno em vez de forçar vários `KpiCard`s — critério já usado nas Fases 4-8 para não fragmentar
   informação relacionada.

### Validação
```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (idêntico ao baseline da Fase 8)
bun run test      → 74 arquivos, 576 testes, todos passando
bun run build     → OK
```
**Sem verificação visual em navegador** — mesma limitação registrada desde a Fase 4 (sem acesso a
Playwright/credenciais neste ambiente). Um teste (`ApresentacaoSociosSection.test.tsx`) quebrou durante a
migração porque `ExecutiveMetricCard`/`CmvMetricCard` tinham `aria-label="Ver detalhes de X"` explícito no
`<button>` antigo — `KpiCard` não tinha esse conceito; corrigido adicionando o prop `ariaLabel` (item novo do
componente, ver acima) e passando o mesmo texto nos dois call sites. Sem esse prop, o nome acessível do card
clicável cairia para o texto concatenado do card (label+valor+delta) em vez do rótulo curto esperado pelo
teste e por leitores de tela que já dependiam desse texto.

### Pendências deixadas para as próximas fases
- Verificação visual em navegador (light/dark) das 6 telas desta fase — não executada por falta de acesso a
  navegador neste ambiente
- Aliases `gold`/`gradient-salmon` fora do escopo desta fase seguem pendentes → Fase 10
- `KpiCard.ariaLabel`/`delta` são novos — nenhum outro consumidor além dos citados usa ainda; oportunidade
  para quem tocar outro dashboard com comparação de período (ex. RH, Estoque) na Fase 10/11

---

## Fase 10 — Demais módulos e Modo Apresentação ✅ (2026-08-28)

Maior fase do plano em número de arquivos (~40 com achado real, 9 áreas). Executada em **7 agentes
paralelos** (um por área independente, sem sobreposição de arquivo — `AdminUsersView.tsx`, reusado pela aba
"Usuários" de Configurações, ficou sob responsabilidade única do agente de Admin), seguida de validação
centralizada.

### Arquivos alterados por área

- **Estoque**: `EstoqueGeralView.tsx` + 13 arquivos de `estoque/` (exceto `StockDashboardSection.tsx`,
  referência intocada) — `StockLossesSection.tsx`/`StockTopConsumedSection.tsx`/`StockPredictiveSection.tsx`
  KPIs manuais → `KpiCard`; 2 `Select` de Categoria → `SearchableSelect`; opacidade tokenizada em todo o
  módulo.
- **Compras + Cotação**: `ComprasView.tsx`, `PedidosComprasMercadoView.tsx`, `SimuladorCompra.tsx`, 6
  arquivos de `compras/cotacao/` — `STATUS_CONFIG`→`StatusBadge`, `SummaryCard`/`STATUS_META` de
  `CotacaoView.tsx`→`KpiCard`/`StatusBadge`, `<select>` nativo→`Select`, os 2 `confirm()` nativos de
  `CotacaoDetailDrawer.tsx` (exclusão e conversão em pedido)→`useConfirmDialog`.
- **Inventário**: `InventarioView.tsx`, `inventario/InventarioDashboardView.tsx`,
  `inventario/InventarioAuditView.tsx`, `QuickInventorySection.tsx` — `KPICard` duplicado (2 cópias, 9+ usos)
  eliminado em favor de `ui/KpiCard.tsx`; tabela de contagem física (`ItemRow`, edição inline) migrada para
  `Table`/`TableRow`/`TableCell` preservando o estado de edição.
- **RH**: `RhView.tsx` + 12 de 13 arquivos de `rh/` (exceto `DashboardRhSection.tsx`, referência intocada) —
  7 mini-KPI locais (incluindo um terceiro padrão, `StatCard`, em `GestaoDisciplinarSection.tsx`) → `KpiCard`;
  `TableActions` propagado onde a ação era editar/excluir simples.
- **Admin**: `AdminPanel.tsx`, `AdminUsersView.tsx`, 4 arquivos de `admin/` — 3 dos 5 formulários em
  `AlertDialog` (Criar/Editar Usuário, Criar Cargo, Resetar Senha) migrados para `Dialog`; lista de usuários
  migrada para `Table`+`TableActions`; opacidade tokenizada.
- **Configurações**: `ConfiguracoesView.tsx`, `IntegracoesView.tsx`, `AuditView.tsx`, `SecurityAuditView.tsx`,
  `GlobalAuditView.tsx`, `PerformanceMonitorView.tsx` — os 3 `gradient-salmon` de botões "Salvar" removidos
  (não renomeados); 5 `<div>` card → `Card`; mini-KPI → `KpiCard`.
- **Ficha Técnica + Central de IA + Login + Apresentação**: `FichaTecnicaView.tsx` (5 pontos de
  `<Input inputMode="decimal">` → `DecimalInput`; novo `MiniStat` local para os blocos de mini-stat de
  diálogo), `CentralIAView.tsx` (8 `agentes[].color` + estados de UI tokenizados), `Login.tsx` (cosmético,
  `Card`/`Button variant="link"`), QA de `PresentationSlideCanvas.tsx`/`PresentationMode.tsx` (sem alteração
  de cor — ver decisão 5).

### Decisões — os 5 achados transversais do prompt

1. **`KpiCard` duplicado (achado 1)** — consolidado em todos os pontos citados (Inventário ×2, RH ×7,
   Configurações, Cotação). Era pura consolidação, sem achado de API faltante: `KpiCard` já suportava tudo
   que os locais precisavam.
2. **Mapas de badge manuais (achado 2)** — avaliados um a um, não migrados em bloco. Migraram para
   `StatusBadge` os domínios que batem 1:1 nas 5 variantes semânticas (`PedidosComprasMercadoView.
   STATUS_CONFIG`, `CotacaoView.STATUS_META`, badge de status/risco/classificação do Inventário, `Status` da
   lista de usuários do Admin). Ficaram como `Record` local só com tokens `-soft`/`-border` trocados onde o
   domínio tem mais estados do que as variantes cobrem: `PRIORITY_COLORS` (4 níveis de prioridade),
   `ROLE_LABELS` (papel de usuário, inclui a cor de marca `primary-soft`/`primary-ink` para `operador`,
   deliberadamente distinta de `info`), `BugTrackerView.SEVERITY_COLORS`/`STATUS_COLORS` (chaves em inglês
   sem correspondência 1:1 com `STATUS_MAP`).
3. **Bugs de padrão de interação (achado 3)** — `SimuladorCompra.tsx:176` (`<select>`→`Select`) e
   `CotacaoDetailDrawer.tsx:66` (`confirm()`→`useConfirmDialog`, e um segundo `confirm()` de conversão em
   pedido no mesmo arquivo, migrado por consistência) resolvidos sem tocar RPC/payload.
4. **`AdminUsersView.tsx` — `AlertDialog` para formulário (achado 4)** — Criar Usuário, Editar Usuário e
   Criar Cargo migraram para `Dialog`. Resetar Senha também migrou (tinha validação de força de senha +
   checagem no servidor, não era "campo simples"). Excluir Usuário ficou como `AlertDialog` — confirmação
   binária destrutiva pura, mesmo espírito do `useConfirmDialog` já usado no resto do arquivo.
5. **Modo Apresentação — correção da estimativa "80 cores fixas" (achado 5)** — confirmado por leitura
   completa dos dois arquivos: **zero hex, zero opacidade-como-hierarquia** em `PresentationSlideCanvas.tsx`/
   `PresentationMode.tsx` (construídos em 2026-08-26, já depois da fundação de tokens da Fase 1). A estimativa
   do `PLANO-DE-FASES.md` original estava desatualizada — as ~80 cores fixas reais estão nos 4 arquivos de
   export (`presentationPdfExport.ts`, `presentationPptxExport.ts`, `presentationMinutesPdfExport.ts`,
   `presentationMinutesPptxExport.ts`), que representam uma paleta impressa intencionalmente diferente do
   tema da aplicação (jsPDF/pptxgenjs exigem string de cor literal) e **não têm nenhum acoplamento de import**
   com o Canvas/Mode — confirmado por grep cruzado nos dois sentidos. Nenhum dos 4 foi tocado. O trabalho
   desta área foi só QA visual/contraste, sem migração — badges `-soft`/`-border` sempre emparelhados
   corretamente, contraste sobre `bg-background-subtle` sem problema aparente, barra proporcional
   (`PresentationSlideCanvas.tsx:279`) com cálculo correto (68% de altura máxima, piso de 4% para estado
   vazio/indisponível).

### Outras decisões notáveis

- **Exceções de opacidade documentadas e mantidas** (não migradas) por serem convenções já estabelecidas em
  módulos anteriores, não o anti-padrão "opacidade para hierarquia semântica": opacidade em item
  desabilitado/inativo (Estoque, Admin — confirmado em `01-DESIGN-SYSTEM.md` que não existe token dedicado
  para esse estado); `hover:bg-x/90` de botão sólido (Estoque, Inventário — convenção de hover-darken já
  usada em `ContaDetailDialog.tsx`); ícones fantasma grandes em empty/error state e skeleton `animate-pulse`
  (RH, Configurações, Estoque — confirmado por grep como padrão repetido em vários módulos já migrados).
- **`CotacaoComparativoTable.tsx`/`CotacaoRespostasMatrix.tsx`**: `<table>` HTML crua com coluna sticky
  mantida, não migrada para os primitivos `Table`/`TableRow`/`TableCell` — o `TableHead` do DS impõe
  `h-10`/`uppercase`/`tracking-wider` fixos, incompatíveis com uma matriz densa item×fornecedor de colunas
  estreitas sem anular o ganho da adoção.
- **`MovimentacoesSection.tsx`**: os 3 KPI cards de Entradas/Saídas/Perdas não migraram para `KpiCard` — o
  componente não suporta cor customizada e dinâmica no valor (`text-success`/`text-destructive` conforme
  sinal), sinal semântico essencial ali.
- **`InventarioView.tsx` `<Input type="time">`**: mantido, não virou `TimeInput` — o padrão se repete em RH
  (`RhView.tsx`, `EscalasSection.tsx` ×2), mas criar o componente exigiria tocar arquivos fora do escopo desta
  fatia; deferido para uma fase cross-cutting futura.
- **`FichaTecnicaView.tsx`**: mini-stat de custo/rendimento/economia em `DetalheDialog`/`SimuladorDialog`
  virou um `MiniStat` local ao arquivo (não um componente global do design system — a Fase 10 já tinha
  proibido criar um segundo "card de indicador"; `MiniStat` é deliberadamente menor e mora dentro do próprio
  diálogo, não em `ui/`).

### Validação

```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (idêntico ao baseline da Fase 9)
bun run test      → 74 arquivos, 576 testes, todos passando
bun run build     → OK
```

Cada um dos 7 agentes rodou `npx tsc --noEmit` local ao terminar sua fatia; a bateria completa (acima) foi
rodada uma única vez, de forma centralizada, depois que todos os 7 completaram — nenhuma regressão em
relação ao baseline da Fase 9. **Sem verificação visual em navegador** — mesma limitação registrada desde a
Fase 4 (sem acesso a Playwright/credenciais neste ambiente); o QA do Modo Apresentação (achado 5) foi feito
por leitura de código (tokens usados, cálculo de altura/largura inline), não por captura de tela real.

### Pendências deixadas para a Fase 11

- Verificação visual em navegador (light/dark) de todas as telas tocadas nesta fase — acumulada desde a Fase
  4, nenhuma fase teve acesso a navegador/credenciais neste ambiente.
- `TimeInput` — avaliar se o padrão `<Input type="time">` repetido (Inventário, RH ×3) justifica um
  componente dedicado, agora que está confirmado em mais de um módulo.
- `CotacaoComparativoTable.tsx`/`CotacaoRespostasMatrix.tsx` seguem com `<table>` HTML crua — decisão
  documentada, não é um "esquecimento" a corrigir de graça na Fase 11 sem repensar a API do `TableHead`.
- `DecimalInput` cru (`<Input inputMode="decimal">`) só foi auditado no escopo desta fase (Ficha Técnica);
  não houve varredura do projeto inteiro por esse padrão.

---

## Fase 11 — QA visual, acessibilidade, regressão e limpeza ✅ (2026-08-28)

### Sem acesso a navegador real (mesma limitação desde a Fase 4)

Esta sessão não teve acesso a Playwright/automação de navegador nem a credenciais de teste — a mesma
limitação registrada em todas as fases desde a Fase 4. A varredura de light/dark, interação, contraste e
responsividade (escopos 1–4 do prompt da fase) foi feita por **leitura de código e grep de padrões
conhecidos** (hex literal, `dark:` avulso, opacidade-como-hierarquia, classes fora do sistema de tokens),
não por captura de tela real. Ficha aberta como pendência não-bloqueante (ver final).

### Achados de contraste/anti-padrão (corrigidos)

1. **`text-gold-dark dark:text-primary` — `dark:` avulso sobre alias legado, 10 ocorrências em 7 arquivos
   nunca tocados por nenhuma fase anterior** (`ApresentacaoSociosSection.tsx`, `PresentationAnalytics.tsx`,
   `PresentationDecisionGovernance.tsx`, `PresentationDetailPage.tsx` ×2, `PresentationMeetingGovernance.tsx`,
   `PresentationPlanComparison.tsx`, `PresentationScenarioSection.tsx`). Violava diretamente o anti-padrão
   "classe `dark:` avulsa" de `01-DESIGN-SYSTEM.md`. Corrigido para `text-primary-ink` — o token correto para
   "azul como texto pequeno" (ícone de cabeçalho de card, rank numerado), já documentado desde a Fase 1.
2. **`bg-amber-50/50 dark:bg-amber-950/10` em `financeiro/DemonstrativoTree.tsx:265`** — hex/paleta Tailwind
   literal (não-token) para destacar linha `isInformational` (categoria fora do resultado) na árvore do
   DRE/DFC, arquivo nunca tocado por nenhuma fase anterior. Corrigido para `bg-warning-soft` (token existente,
   AA nos dois temas, mesma semântica de "atenção/informativo" já usada em badges).
3. **`PresentationMeetingGovernance.tsx:608` — card de detalhe de pauta com `bg-black text-white` +
   `text-[#d6b85f]` (hex literal) + `text-slate-400` (paleta Tailwind fora do sistema), fixo independente do
   tema.** Não corrigido: é um card "spotlight" de citação/ata cujo efeito visual pretendido (sempre escuro,
   independente do tema) não tem um token equivalente no design system atual sem inventar um token novo — fora
   do escopo desta fase (auditoria, não construção). Registrado como dívida.
4. **Achados menores registrados, não corrigidos** — meia dúzia de textos secundários com opacidade adicional
   sobre `text-muted-foreground` (`/60`–`/70`, ex.: `RelatoriosView.tsx:30,31,40`, `NotificationBell.tsx:133`,
   `financeiro/CategorizacaoSection.tsx:460`) para uma 3ª camada de hierarquia (texto terciário) sem token
   dedicado. A grande maioria dos ~50 achados de `text-*/opacity` encontrados na varredura **são o padrão já
   documentado e aceito na Fase 10** (ícone fantasma grande em empty/error state, hover-darken, "previsto" vs.
   "realizado" no Financeiro) — não é achado novo, confirmado item a item antes de descartar.

### Aliases legados — inventário final (escopo 5)

- **`gold` (Tailwind namespace: `DEFAULT`/`light`/`dark`/`foreground`) e `--gradient-gold`/`.gradient-gold`/
  `.text-gradient-salmon`/`.text-gradient-brand` — REMOVIDOS.** Depois de corrigir o achado 1 acima (única
  fonte de uso restante de `gold-dark`), nenhuma classe da família ficou com consumidor real — confirmado por
  grep no `src/` inteiro antes de remover, nos dois lados (classe → CSS e CSS → classe). `KpiVariant: 'gold'`
  (`ui/KpiCard.tsx`, consumido por `DashboardView.tsx`) **não** foi tocado — é um valor de tipo TypeScript, sem
  relação com os tokens `--gold*` removidos (o variant já resolvia via `border-warning-border`/`bg-warning-soft`
  desde a Fase 4).
- **`gradient-salmon`/`.gradient-brand` (`--gradient-brand`) — MANTIDO, 47 usos reais em 28 arquivos**, quase
  todos o mesmo padrão (`<Button className="gradient-salmon text-primary-foreground border-0">` — CTA
  primário de formulário) nunca migrado para `bg-primary-strong` por nenhuma fase (a Fase 3 só migrou os 2 usos
  de navegação de módulo). É a maior dívida de alias remanescente do redesign — migrar os 28 arquivos é fora do
  escopo desta fase (seria redesenho de tela, não QA/fechamento); registrado como pendência não-bloqueante.
- **`glow-salmon` — MANTIDO, 2 usos reais** (`ManipulationView.tsx:300`, `StockView.tsx:106`, alerta de
  card com borda de risco).

### `TimeInput` — avaliado e descartado (não criado)

Os 4 pontos de `<Input type="time">` cru (`RhView.tsx`, `InventarioView.tsx`, `rh/EscalasSection.tsx` ×2) são
todos `value`/`onChange={e => setX(e.target.value)}` puro — sem guarda de formato, sem `min`/`max` cruzado,
sem nenhuma lógica compartilhada equivalente ao bug de ano de `DateInput` (que justificou aquele componente na
Fase 5). Um `TimeInput` aqui seria um wrapper sem nenhuma diferença de comportamento em relação a `Input`
direto — exatamente a "abstração prematura" que a regra de engenharia do `CLAUDE.md` pede para evitar. Decisão:
**não criar**, mantido `<Input type="time">` direto nos 4 pontos (já herda o estilo correto de `ui/input.tsx`
desde a Fase 4). Isso fecha a pendência deixada em aberto pela Fase 10 — não é mais dívida, é decisão tomada.

### Limpeza de documentação

- `docs/redesign/referencias/` (4 PNGs de mockup + `MOCKUPS.md` + `README.md`) — **apagada**.
- `docs/redesign/prompts/` (`FASE-02.md` … `FASE-11.md`) — **apagada**.
- `00-AUDITORIA.md`, `01-DESIGN-SYSTEM.md`, `PLANO-DE-FASES.md`, `PROGRESSO.md` — mantidos como documentação
  permanente do design system.
- `CLAUDE.md`/`AGENTS.md` (raiz, mantidos idênticos) — acrescentado um parágrafo curto de Design System com
  paleta, localização dos tokens, componentes padronizados novos e as duas regras de maior risco de regressão
  (nunca hex em componente, os 4 arquivos de export do Modo Apresentação têm paleta impressa intencionalmente
  fora do tema).

### Validação

```
npx tsc --noEmit  → 0 erros
bun run lint      → 0 errors / 676 warnings (idêntico ao baseline da Fase 10)
bun run test      → 74 arquivos, 576 testes, todos passando
bun run build     → OK
```

Rodada uma única vez, depois de todas as correções desta fase (achados 1–2 + remoção de aliases mortos) —
nenhuma regressão em relação ao baseline da Fase 10. **Sem verificação visual em navegador** — ver nota no
início desta entrada.

### Pendências não-bloqueantes que sobrevivem ao redesign

- Verificação visual em navegador real (light/dark, todos os breakpoints) — nunca executada em nenhuma das 11
  fases neste ambiente; recomenda-se antes do deploy (ver relatório final ao usuário).
- Meia dúzia de opacidades de texto terciário sem token dedicado (achado 4 acima).
- `CotacaoComparativoTable.tsx`/`CotacaoRespostasMatrix.tsx` — `<table>` HTML crua, decisão da Fase 10 mantida.

## Follow-up informal pós-Fase 11 (2026-08-28)

Pedido avulso do usuário para fechar as duas dívidas concretas deixadas pela Fase 11 — não é uma fase do
`PLANO-DE-FASES.md`, só limpeza pontual:

1. **`gradient-salmon` migrado para `bg-primary-strong`** — os 47 usos em 28 arquivos (quase todos
   `<Button className="gradient-salmon text-primary-foreground border-0">`, CTA primário sem `variant`
   explícito) viraram `bg-primary-strong` via substituição literal. Com 0 consumidores restantes,
   `.gradient-salmon`/`.gradient-brand` (regras CSS) e `--gradient-brand`/`--gradient-salmon` (tokens) foram
   removidos de `src/index.css` (light + dark). `.glow-salmon` (2 usos: `ManipulationView.tsx`,
   `StockView.tsx`) e `--shadow-glow` continuam intactos — consumidor real, fora do escopo.
2. **`PresentationMeetingGovernance.tsx:608` corrigido** — o card "spotlight" do Modo Reunião (detalhe de um
   item de pauta em tela cheia durante a reunião) usava `bg-black text-white text-[#d6b85f] text-slate-400`,
   hex literal fora do sistema de tokens. Trocado por `className="dark bg-card text-card-foreground"` no
   `<article>` — o `dark` forçado no nó reaproveita os tokens do tema escuro (`--card`/`--card-foreground`/
   `--muted-foreground`/`--primary`, já AA testados) independente do tema ativo no resto da tela, preservando
   a intenção original de "spotlight sempre escuro" sem inventar token novo. `text-[#d6b85f]` → `text-primary`
   (o `01-DESIGN-SYSTEM.md` já garante `text-primary` AA como texto nos dois temas); `text-slate-400` (×3) →
   `text-muted-foreground`.

Validação após as duas mudanças: `tsc` 0, `lint` 0 erros/676 avisos, `test` 74 arquivos/576 testes, `build` OK
— idêntico ao baseline da Fase 11, sem regressão. `CLAUDE.md`/`AGENTS.md` atualizados (removida a menção a
`gradient-salmon` no bullet de Design System e o item de pendência correspondente).
