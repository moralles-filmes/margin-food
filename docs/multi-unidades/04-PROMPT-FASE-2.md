# Prompt — Fase 2: conter acessos globais indevidos

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 2** do plano em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Ao terminar, entregue os resultados e o prompt completo da Fase 3 (logs).

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, Auth, CompanyScopeProvider/useSupabase, x-company-id validado, caches e cancelamento de escopo. Não refaça arquitetura, não faça rollback geral, não apague dados.

Antes de editar: git status; ler AGENTS.md e CLAUDE.md (espelhados), docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md e docs/ARCHITECTURE.md. Confira o código e o banco vivo: documentação e comentários de migrations contêm afirmações desatualizadas.

Base auditada: commit 1fdea27; Supabase wuzxpbixprrgssoeeaez. A fase 1 não aplicou migrations nem deploy. Evidências e consultas de leitura em docs/multi-unidades/auditoria-20260915/. Não trate esse snapshot como estado atual garantido.

## Escopo da fase

### 1. RPCs de manutenção global

Auditar e proteger:

- public.cleanup_old_audit_logs(integer)
- public.refresh_materialized_views()
- chamadas e grants relacionados em supabase/functions/scheduled-jobs/index.ts e agendamentos reais.

A fase 1 encontrou ambas SECURITY DEFINER, owner postgres, EXECUTE efetivo para anon/authenticated, sem autorização no corpo. cleanup apaga logs globalmente e aceita retenção sem limites. O CRON_SECRET na Edge não protege chamada direta via PostgREST.

Mapeie todos os callers antes de revogar. Defina a via legítima de manutenção (scheduler/service_role) e limite a ela; revise PUBLIC além de anon/authenticated. Verifique assinatura, search_path, privilégios efetivos, parâmetros de retenção e execução pelos jobs. Não execute limpeza nem refresh em produção para provar a falha. Não use um papel recebido no body como autorização.

### 2. Administração global de empresas

Auditar e corrigir:

- policy companies_admin e combinação com companies_read;
- public.rpc_create_company(text,text);
- caminhos de leitura/escrita direta de companies;
- compatibilidade com list_my_companies, list_companies, update_company, onboard_new_company, rpc_set_user_company e admin-companies.

A policy atual é ALL e usa somente system:admin; authenticated tem grants CRUD. A sondagem READ ONLY da fase 1 comprovou admin local, sem system:global:manage, lendo empresa sem membership. rpc_create_company também usa somente system:admin.

system:admin é legado de admin de unidade, nunca autorização global. Não restaurar expansão para system:global:manage. Preserve descoberta das empresas autorizadas e administração global legítima. Não amplie escrita direta de company_id/profile ou altere identidades compartilhadas como solução.

## Forma de execução

1. Revalidar schema, definições, ACLs, callers e jobs com consultas somente de leitura.
2. Inventariar efeitos e construir correção mínima, revisável, em migration NOVA. Não alterar migrations históricas.
3. Preflight deve detectar drift de assinatura/policy/ACL e confirmar pré-requisitos. Capturar rollback tecnicamente seguro; não reabrir vulnerabilidade como rollback automático.
4. Ensaiar em banco PostgreSQL/Supabase real isolado, compatível com o schema atual. O runner legado test-multiunit-db.sh requer dump anterior à implantação; não reaplicar as seis migrations em schema já migrado. Sem mock de banco.
5. Testar anon, usuário comum, admin A, usuário multi e super admin. Negar manutenção indevida, leitura/escrita de B por admin A e criação global via legado; permitir descoberta de A/B autorizadas, manutenção pelo serviço e administração global legítima. Testes de escrita somente no ambiente isolado, com fixtures e rollback.
6. Executar testes pertinentes, typecheck, lint, RBAC e build. A baseline tem 713/719 testes passando; seis falhas estáticas de strings multilinha em marcaCategoriaVinculoMigration.test.ts e presentationRevenueByStoreNetMigration.test.ts, possivelmente CRLF. Não editar SQL histórico para fazê-los passar. security:check pode retornar exit 0 pulando SQL por falta de secrets: registre cobertura real.
7. Atualizar o relatório com evidência, status dos achados C01/C02, migrations, testes, riscos e ordem de aplicação. AGENTS/CLAUDE só com regras operacionais necessárias, sempre idênticos.
8. Fazer commits pequenos após a verificação de segredos exigida no projeto. Não publicar em produção sem validar projeto, preflight e testes. Não fazer push em main automaticamente: dispara deploy.
9. Encerrar na Fase 2. Entregar o prompt da Fase 3: modelo de logs tenant/global, writers, readers, backfill seguro, proteção contra forja e testes A/B.

## Limites

Não executar o backfill de logs nesta fase. Não alterar regras financeiras, saldo de estoque, cancelamento do Salmão, unicidade de fornecedores ou telas sem necessidade para C01/C02. Se encontrar outro caminho global que invalide a contenção, inclua a correção justificada e documente.

Se o ambiente de integração estiver indisponível, conclua todo trabalho local seguro e relate exatamente o que falta validar; não declare o problema resolvido sem teste. Nunca pedir segredo no chat.

## Entrega

Resumo curto: problemas corrigidos, arquivos/migrations, testes reais e baseline, pendências, commits e sequência exata de produção. Forneça ao final o prompt copiável da Fase 3.
