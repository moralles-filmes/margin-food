@AGENTS.md

## Específico do Claude Code

- As regras em `.claude/rules/` são carregadas automaticamente quando você lê ou edita arquivos dos caminhos indicados nelas. Elas resumem os pontos críticos e apontam para `docs/standards/` e para as seções do AGENTS.md, sem substituí-los.
- `.claude/settings.json` bloqueia ou pede confirmação para ações irreversíveis e de produção (inclui escrita pelos MCPs Supabase e Vercel). Não tente obter o mesmo efeito por outro comando ou ferramenta: se uma ação foi bloqueada, explique o que precisa e peça autorização.
- `.claude/tenancy-profile.yml` declara o modelo de tenant e de acesso. Os plugins saas-shield-br, saas-builder-br e saas-audit-br leem o mesmo arquivo.
- Use plan mode antes de alterar `supabase/migrations/`, `release/`, `supabase/functions/`, `src/permissions/`, Financeiro/Conciliação (`src/components/financeiro/`, `src/lib/conciliacao*`, `src/lib/extratoParser.ts`) e Estoque/Movimentação.
- Se o `/doctor` sugerir enxugar este arquivo ou o AGENTS.md, não aceite cortes nas seções de segurança, modelo de acesso e invariantes.
