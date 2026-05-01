# Margin Food (MarginPro)

Sistema inteligente de gestão para restaurantes focado em controle de CMV, estoque, compras, ficha técnica, financeiro e aumento de margem operacional. Multi-tenant (multi-empresa) com isolamento por `company_id` em todas as tabelas e RLS global no PostgreSQL.

## Stack

- **Frontend:** Vite 5 + React 18 + TypeScript 5
- **UI:** shadcn/ui + Radix UI + Tailwind CSS 3
- **Estado:** TanStack React Query 5
- **Forms:** React Hook Form 7 + Zod 3
- **Backend:** Supabase (PostgreSQL 15+, Auth, Edge Functions Deno, Realtime, Storage)
- **PWA:** vite-plugin-pwa (auto-update)
- **Build:** Bun

## Como rodar localmente

Pré-requisitos: [Bun](https://bun.sh) instalado.

```sh
bun install         # instala dependências
bun run dev         # dev server em http://localhost:8080
bun run build       # build de produção
bun run test        # testes (Vitest)
bun run lint        # ESLint
```

## Variáveis de ambiente

Crie um `.env.local` na raiz com:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

URL e chave anon do projeto Supabase estão no dashboard do projeto (Settings → API). Nunca commitar `service_role` no frontend.

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
