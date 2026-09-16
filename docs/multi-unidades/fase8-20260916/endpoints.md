# Localizadores de contratos Edge

Corpos/versões/imports/hash e ações completas em [edges.json](edges.json). Identidade e efeitos exigem a revisão de RESULTADOS.md. `CRLF only` significa conteúdo igual após normalizar apenas finais de linha.

| Edge | Versão | JWT gateway | Auth manual | Ações localizadas | Secrets referenciados (nomes) |
|---|---:|---|---|---:|---|
| admin-users | 32 | false | Auth getUser | 10 | SUPABASE_URL, SUPABASE_ANON_KEY, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| ai-chat | 9 | false | Auth getUser | 1 | SUPABASE_URL, SUPABASE_ANON_KEY, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| inventario | 15 | false | Auth getUser | 17 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| check-password | 8 | true | Auth getUser | 0 | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| purchase-requisitions | 10 | false | Auth getUser | 7 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| requisicao-estoque | 14 | false | Auth getUser | 12 | SUPABASE_URL, SUPABASE_ANON_KEY, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| cmv | 10 | false | Auth getUser | 9 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| rh | 10 | false | Auth getUser | 1 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| ficha-tecnica | 11 | false | Auth getUser | 18 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| admin-companies | 11 | true | Auth getClaims | 1 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| scheduled-jobs | 7 | false | CRON_SECRET (scheduler) | 2 | CRON_SECRET, SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| admin-create-user | 6 | false | Auth getClaims | 0 | SUPABASE_URL, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| rbac-lint | 6 | false | Auth getUser | 0 | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| rbac-lint-quick | 6 | true | Auth getUser | 0 | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| rbac-lint-full | 6 | true | Auth getUser | 0 | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| send-whatsapp-zapi | 5 | false | Auth getUser | 0 | SUPABASE_URL, SUPABASE_ANON_KEY, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
| cotacao-ia | 4 | false | Auth getUser | 3 | SUPABASE_URL, SUPABASE_ANON_KEY, SB_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, PUBLIC_SITE_URL |
