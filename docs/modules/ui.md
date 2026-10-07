# Módulo: UI compartilhada (componentes, busca, números e design system)

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Não é módulo do registry: são os componentes e padrões de frontend que todo módulo usa.

- Chave: nenhuma (não há permissão própria)
- Status: ativo
- Código: `src/components/ui/`, `src/components/CompanySelector.tsx`, `src/contexts/`, `src/hooks/`, `src/lib/` (`utils`, `formatters`, `datetime`, `chartTheme`, `padronizarTexto`, `chaveOperacao`, `safeXlsx`), `src/index.css`, `tailwind.config.ts`.

## Responsabilidade

- Faz: componentes padronizados, navegação entre módulos, notificações, contadores de pendência, campos de data, moeda e número, busca de texto sem acento, gráficos, design system (tokens) e exportação PDF/Excel.
- Não faz: regra de negócio de um módulo (fica em `docs/modules/<modulo>.md` e no servidor).

## Componentes padronizados

- **TableActions** (`components/ui/TableActions.tsx`) — botões Editar/Excluir com RBAC e diálogo de confirmação; usar em toda tabela de gerenciamento.
- **FormCloseConfirmDialog** + `useFormDirtyGuard` — previne perda de dados em formulários.
- **useTravaEnvio** (`src/hooks/useTravaEnvio.ts`) — trava síncrona (ref) de todo botão que grava: o estado sozinho só chega ao `disabled` no próximo render e deixa passar duplo clique/Enter + clique. Só protege a tela — envio que mexe em dinheiro, estoque, ponto ou mensagem externa precisa também de chave derivada + índice único no servidor.
- **SearchableSelect** (`components/ui/SearchableSelect.tsx`) — usar em todo select com 10+ opções (produtos, categorias, locais, usuários, fornecedores).
- **NotificationsProvider** (`src/contexts/NotificationsContext.tsx`) — instância única de `useNotifications`, montada em `App.tsx`. Nunca instanciar `useNotifications` de novo dentro do Provider (duplica subscription Realtime).
- **RequisicaoNotificationModal** — `AlertDialog` global bloqueante para requisições encerradas.
- **Notificação nasce só no servidor** — produtores são Edge Functions (service_role) e RPCs `SECURITY DEFINER`; `authenticated` não tem INSERT/DELETE em `notifications` e só atualiza `read_at` (migration `20260929180000`). Produtor novo grava `company_id` explícito e `entity_type`/`entity_id` — é o id que abre o registro, o `link_path` só leva ao módulo. Só notifica quem passa no gate de leitura do registro na unidade dele (membership ativa + a mesma permissão da RPC/RLS de leitura; ex.: `_fin_presentation_can_view`), e revalida o destinatário gravado antes quando o aviso sai depois (ata aprovada/devolvida). INSERT de notificação na mesma transação do registro propaga a falha — nada foi gravado, o reenvio é seguro — e nunca fica em `EXCEPTION WHEN OTHERS THEN NULL`, que esconde defeito para sempre.
- **Navegação entre módulos** (`src/hooks/useNavigationRequest.ts`) — clique que leva a outro módulo (sininho, aviso, atalho) chama `requestNavigation({ tab, subtab, record })`; o módulo consome a sub-aba (`useNavigationSubtab`) e a tela consome o registro (`useNavigationRecord`) ao montar, buscando pelo id quando ele está fora da página carregada. Nunca `window.dispatchEvent` no mesmo tick da troca de aba: as views são lazy e o evento se perde. Telas com estado na URL (Apresentação Sócios) recebem rota, não registro.
- **DateRangePresets** (`components/financeiro/DateRangePresets.tsx`) — atalhos de período em strings `yyyy-MM-dd`, importar de `@/lib/datetime`. Query consumidora deve tratar `from`/`to` vazio condicionalmente (`.gte()` com string vazia quebra no Postgres).
- **MonthNavigator** (`components/financeiro/MonthNavigator.tsx`) — navegação de mês (setas + select), aritmética pura em `yyyy-MM` (sem passar por `new Date`).
- **DateInput** (`components/ui/DateInput.tsx`) — usar em todo campo de data financeira (nunca `Input type="date"` cru) — limita ano a 4 dígitos, backstop de um CHECK constraint no banco.
- **Campos monetários** — estado numérico usa `BRLInput`; estado string usa `CurrencyInput` e salva com `normalizeBRLMoneyToNumber()`; nunca converter moeda formatada com `Number`/`parseFloat` nem atualizar estado numérico a cada tecla.
- **Campos numéricos (padrão de digitação)** — zero é placeholder, nunca texto no campo; apagar tudo deixa o campo vazio; clamp/mínimo/fallback só no `onBlur`/submit, nunca no `onChange` (o clamp a cada tecla fazia a repetição de Contas a Pagar voltar para 2). `Input type="number"` controlado já faz isso e remove zero à esquerda; `step="1"` bloqueia decimal e `min>=0` bloqueia sinal. Nos componentes `BRLInput`/`CurrencyInput`/`DecimalInput`/`PercentInput`/`NumericInput`, use `showZero` só quando 0 for diferente de vazio (ex.: saldo manual × "Automático").
- **SubmoduleSwitcher** (`components/ui/SubmoduleSwitcher.tsx`) — obrigatório para navegação de sub-módulos (substitui fileira horizontal de botões).
- **ModuleBadgesProvider** (`src/contexts/ModuleBadgesContext.tsx`) — fonte única dos contadores de pendência: o `badge` da aba interna e o número do módulo no menu lateral (soma das abas) leem daqui. Contador novo entra no provider como `count` no servidor — nunca calculado na view nem derivado de lista paginada/filtrada, senão o menu diverge da aba.
- **KpiCard** (`components/ui/KpiCard.tsx`) — fonte única de card de indicador (`variant` semântico, `delta` opcional para comparação com período anterior); não criar card de indicador local a uma tela.
- **StatusBadge** (`components/ui/StatusBadge.tsx`) — mapa de status→variante semântica (`success/warning/danger/info/neutral`); preferir a um `Record`/mapa de cor local quando o domínio bate 1:1 nas 5 variantes.
- **DatePicker** / **DateRangePicker** (`components/ui/DatePicker.tsx`) — popover+calendário para campo `Date` único ou intervalo `from`/`to` ISO; não recompor `Popover`+`Calendar` manualmente.
- **ChartCard** / **ChartTooltip** / **ChartLegend** + `src/lib/chartTheme.ts` — camada central de gráficos Recharts (cores de série, grade, eixo, tooltip, formatação BRL/%/qtd). Todo gráfico novo consome daqui, nunca `contentStyle`/cor inline.
- **SegmentedControl** / **ModuleNav** (`components/ui/`) — grupo de opções exclusivas (`Mês|Ano|Total` etc.) e navegação de módulo em 2 níveis; **PageHeader** (`components/ui/PageHeader.tsx`) para cabeçalho de conteúdo de tela (título+ação, distinto do header global do `AppLayout`).
- **CompanySelector** (`components/CompanySelector.tsx`) — único seletor de unidade: `appearance="card"`/`"compact"` na sidebar e `"inline"` no escopo da Apresentação Sócios. Lista só `accessibleCompanies` e troca só por `setActiveCompany` (ou `presentationUnit`); nunca criar seletor paralelo nem consulta própria de unidades.

## Busca de texto (OBRIGATÓRIO)

> Bloqueado por ESLint (`no-restricted-syntax`). Toda nova busca de texto na UI **DEVE** seguir este padrão.

- **Cliente:** `includesNormalized(haystack, needle)` ou `normalizeSearchText(text)` de `@/lib/utils`. Nunca `.toLowerCase().includes()`.
- **Servidor (`.ilike()` / RPC):** buscar em coluna `*_unaccent` e normalizar o termo cliente-side com `normalizeSearchText()` antes de enviar — `ILIKE` não remove acentos.
- **Combobox / cmdk:** `filter={(val, search) => normalizeSearchText(val).includes(normalizeSearchText(search)) ? 1 : 0}` — o default do cmdk não normaliza acentos.
- **Edge Function (Deno):** mesma regra, normalizar termo inline (sem import de `@/lib/utils`).
- **Casos legítimos não-busca** (path de arquivo, uuid::text): justificar com `// eslint-disable-next-line no-restricted-syntax -- <motivo>`.

## Números, datas e texto

- **Texto formatado em pt-BR nunca volta para um campo numérico editável** — `formatarQuantidade` agrupa milhar (`1001` → `"1.001"`) e `parseQuantidade` relê o ponto como decimal (`1,001`): o stepper escrevia o texto agrupado de volta no input e gravava ~1000x menos do que o operador enxergava, sem erro nenhum na tela. Campo editável usa `quantidadeParaCampo` (`useGrouping: false`); o invariante `parseQuantidade(quantidadeParaCampo(x)) === x` é coberto por teste. Mesma classe do `normalizeBRLMoneyToNumber` dos campos monetários.
- **Maiúsculas/minúsculas de nome e descrição digitados: `padronizarTexto` (`src/lib/padronizarTexto.ts`) no valor enviado ao banco, nunca trigger** — RPCs idempotentes comparam o texto exato no reenvio (`_guarded_create_conta_pagar`, `estoque_criar_produto`, `onboard_new_company`…) e recusariam o reenvio legítimo com `REQUEST_ID_REUTILIZADO`; a chave continua derivada do texto digitado. Fora de propósito: texto do extrato bancário, transferências e nome de cadastro copiado como texto em outras tabelas (categoria/setor/local de estoque, fornecedor), que exige cascata. O espelho SQL do backfill (`docs/padronizacao-texto/`) divide os casos de teste com a função — regra nova muda os dois lados.
- **`formatDateBR` existe em 2 módulos com semânticas diferentes** — `@/lib/datetime` retorna ISO (`yyyy-MM-dd`, para `<Input type="date">`); `@/lib/formatters` retorna `dd/MM/yyyy` (exibição). Importar do módulo errado quebra `<Input type="date">` (`RangeError: Invalid time value`).
- **Rótulo de mês a partir de `"yyyy-MM"` deve parsear como data local** — `new Date("yyyy-MM-01")` é UTC e recua um mês no BR. Usar `new Date(y, m - 1, 1)` (construtor de componentes) ou anexar horário (`+'T12:00:00'`).

## Design system

- **Design System (azul/branco/preto)** — tokens HSL em `src/index.css` (valores) + `tailwind.config.ts` (mapeamento de classe), consumidos via `hsl(var(--token))`; **nunca hex em componente** e nunca `dark:` avulso (falta de token, não é caso de usar `dark:`). `--primary` varia por tema e é **AA como texto nos dois** (light `#2563EB`, dark `#3B82F6`) — por isso `text-primary`/`border-primary` estão corretos em qualquer tela. Superfície com **label pequeno** (botão preenchido, chip com texto) usa `--primary-strong` (mesmo valor nos 2 temas, branco 5,2:1), nunca `bg-primary`; azul como **texto pequeno** usa `--primary-ink`. `--info` é ciano-azulado, desacoplado do `--primary`. Nunca `--border` branco puro no dark. Nunca usar opacidade (`text-x/40`, `bg-x/10`) para hierarquia semântica — usar o token `-soft`/`-border`/`muted` correto (exceções já aceitas: ícone grande de empty/error state, hover-darken de botão sólido, skeleton `animate-pulse`). Não renomear a classe legada `.glow-salmon` (2 usos reais, alerta de estoque crítico) — o nome é legado, o valor já é azul; os tokens `--gold*`/`--gradient-gold`/`.text-gradient-salmon`/`.gradient-salmon`/`.gradient-brand`/`--gradient-brand` **foram removidos** (Fase 11 e follow-up) por ficarem sem nenhum consumidor real — CTA primário usa `bg-primary-strong` diretamente. Os 4 arquivos de export do Modo Apresentação (`src/lib/presentationPdfExport.ts`, `presentationPptxExport.ts`, `presentationMinutesPdfExport.ts`, `presentationMinutesPptxExport.ts`) têm paleta de cor **impressa e literal, intencionalmente fora do sistema de tokens** (jsPDF/pptxgenjs exigem string de cor, não CSS var) — nunca migrar para `hsl(var(--token))`. Referência completa: `docs/redesign/01-DESIGN-SYSTEM.md`.
- **Redesign V2 — card de destaque** — gradiente só existe em duas exceções nomeadas: card de destaque (`KpiCard appearance="highlight"`, tokens `--highlight*`/`bg-gradient-highlight`) e item ativo da sidebar; `appearance` é aparência e `variant` é significado — `variant="primary"` nunca vira card azul, e sem `appearance` o `KpiCard` não muda. Sobre o azul só entram `text-highlight-foreground`/`text-highlight-muted` (verde/vermelho não têm contraste), e a família V2 (`summary`/`highlight`) fica em uma coluna abaixo de 480px. Decisões: `docs/redesign-margin-food-v2/DECISOES.md`.

## Exportação

- **jspdf-autotable v5**: importar como `import autoTable from 'jspdf-autotable'` e chamar `autoTable(doc, {...})` — o padrão `(doc as any).autoTable({...})` não funciona na v5 em Vite/ESM.
- Bundle: `exceljs` em chunk separado e exports por `src/lib/safeXlsx.ts` (PERFORMANCE, "Particularidades").

## Dependências

- Backend de notificações (`notifications`, Realtime) e o contexto de empresa (`CompanyScopeProvider`, `useSupabase()`).

## Decisões

- Design system: `docs/redesign/01-DESIGN-SYSTEM.md` e `docs/redesign/PROGRESSO.md`; Redesign V2: `docs/redesign-margin-food-v2/DECISOES.md`.
