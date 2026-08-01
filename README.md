# Margin Food (MarginPro)

Sistema inteligente de gestão para restaurantes focado em controle de CMV, estoque, compras, ficha técnica, financeiro e aumento de margem operacional. Multi-tenant (multi-empresa) com isolamento por `company_id` em todas as tabelas e RLS global no PostgreSQL.

## Stack

- **Frontend:** Vite 8 + React 18 + TypeScript 5
- **UI:** shadcn/ui + Radix UI + Tailwind CSS 3
- **Estado:** TanStack React Query 5
- **Forms:** React Hook Form 7 + Zod 3
- **Backend:** Supabase (PostgreSQL 15+, Auth, Edge Functions Deno, Realtime, Storage)
- **Testes:** Vitest 4 + Testing Library + jsdom
- **PWA:** vite-plugin-pwa (auto-update)
- **Runtime/Build:** Bun

## Como rodar localmente

Pré-requisito: [Bun](https://bun.sh) instalado.

```sh
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

Depois:

```sh
git clone https://github.com/moralles-filmes/margin-food.git
cd margin-food
bun install
```

Crie o `.env.local` (ver [Variáveis de ambiente](#variáveis-de-ambiente)) — **o app não sobe sem ele**.

```sh
bun run dev          # dev server em http://localhost:8080
bun run build        # build de produção
bun run preview      # serve o build local
bun run test         # testes (Vitest)
bun run test:watch   # testes em watch mode
bun run lint         # ESLint
bun run rbac:lint    # lint do registry de permissões
bun run security:check  # auditoria de segurança (requer service_role, ver abaixo)
```

## Variáveis de ambiente

Crie um `.env.local` na raiz:

```
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

URL e chave publishable estão no dashboard do Supabase (Settings → API).

> ⚠️ Tudo com prefixo `VITE_` é embutido no bundle e fica **público no browser**. Nunca coloque `service_role` ou qualquer segredo numa variável `VITE_*`.

Opcionais:

| Variável | Escopo | Descrição |
|---|---|---|
| `VITE_ENABLE_LEGACY_PERMISSIONS` | frontend | `false` desativa o fallback de permissões legadas (modo estrito). Padrão: habilitado. |
| `SUPABASE_URL` + `SB_SECRET_KEY` | scripts locais | Necessárias apenas para `bun run security:check`. Sem prefixo `VITE_` → não entram no bundle. |
| `RBAC_SQL_LINT_ACTOR_USER_ID` | scripts locais | Ator usado pelo lint SQL de RBAC. |

### Edge Functions

As functions em `supabase/functions/` **não** leem o `.env.local` — os segredos vivem no ambiente do Supabase:

```sh
supabase secrets set SB_SECRET_KEY=... GEMINI_API_KEY=... CRON_SECRET=...
```

| Segredo | Usado por |
|---|---|
| `SB_SECRET_KEY` | todas as functions com privilégio administrativo |
| `GEMINI_API_KEY` | `ai-chat`, `cotacao-ia` |
| `CRON_SECRET` | `scheduled-jobs` |
| `ALLOWED_ORIGINS`, `PUBLIC_SITE_URL` | CORS (`_shared/cors.ts`) |

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já são injetadas pela plataforma.

## Deploy

- **Frontend:** auto-deploy via Vercel ao push em `main`.
- **Edge Functions:** `supabase functions deploy <nome>`.
- **Migrations:** `supabase db push` (após validação local).

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — contexto completo do projeto, stack e últimas atualizações
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — guia completo de arquitetura
- [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) — regras de negócio
- [`docs/ENTERPRISE_SAFE_STANDARDS.md`](docs/ENTERPRISE_SAFE_STANDARDS.md) — padrões de segurança
- [`TAREFAS.md`](TAREFAS.md) — tarefas em andamento
