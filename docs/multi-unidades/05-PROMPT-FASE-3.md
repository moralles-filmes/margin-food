# Prompt — Fase 3: logs com escopo confiável

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 3 (logs)** do plano em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Ao terminar, entregue os resultados e o prompt completo da Fase 4 (Salmão, funções internas e grants).

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, Auth, CompanyScopeProvider/useSupabase, x-company-id validado, caches e cancelamento de escopo. Não refaça arquitetura, não faça rollback geral, não apague dados.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (espelhados), docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md, fase2-20260915/RESULTADOS.md e docs/ARCHITECTURE.md. Revalidar código, schema vivo, ACLs, triggers ativos e deployments. Documentação, snapshots e comentários históricos não garantem o estado atual.

Projeto: Supabase `wuzxpbixprrgssoeeaez`. A Fase 2 preparou a migration `20260915140812_contain_global_maintenance_and_companies.sql`, com 82 testes SQL reais, cinco testes de drift, rollback de contenção, oito checks HTTP da Edge e 719 testes unitários passando. **Ela não foi aplicada em produção nessa execução**, nem houve deploy/push. Verificar se foi publicada depois; não declarar C01/C02 resolvidos pelo arquivo local. Manter eventual pendência de publicação separada do escopo desta fase, sem aplicar automaticamente fases anteriores ou reabrir acesso de manutenção.

## Escopo

Tratar conjuntamente `audit_log`, `audit_logs` e `integration_logs`: modelo tenant/global, writers, readers, histórico e proteção contra forja. Achados H01/H02/H03 do relatório são a hipótese inicial, não substituem auditoria atual.

1. Inventariar schema, grants efetivos (PUBLIC/anon/authenticated/service_role), policies permissivas/restritivas, defaults, triggers realmente ativos, SECURITY DEFINER/search_path, chamadas diretas/RPC/Edges, contagens, nulos, órfãos e pistas contraditórias. Não imprimir payloads sensíveis, identidades ou segredos nos artefatos.
2. Distinguir eventos TENANT, GLOBAL legítimo e histórico AMBÍGUO. NULL não significa automaticamente global confiável. auth.users é identidade compartilhada: separar evento da identidade de alteração de membership. Definir a via autorizada de escrita/leitura global e as permissões existentes no registry; `system:admin` nunca é gate global.
3. Corrigir writers antes de impor obrigatoriedade ou executar backfill. Revisar StockCadastrosSection, usePurchaseOrdersStore, Edge inventario, audit_trigger_fn, handle_first_admin (confirmar ativação), sobrecargas log_audit, log_integration_error, integração salmon_to_stock e RPCs/Edges que escrevem nessas tabelas. Eventos de recurso derivam empresa e ator de evidência/autorização do servidor; o cliente não pode escolher ator, origem confiável ou escopo global.
4. Preservar os eventos globais de scheduled-jobs, cleanup e refresh sob a via de serviço definida na Fase 2. Alterar writers/constraints de forma coordenada para não quebrar manutenção, criação de empresa, triggers financeiros, inventário ou operações de estoque. Não executar manutenção destrutiva em produção para demonstrar acesso.
5. Corrigir readers, incluindo SecurityAuditView, GlobalAuditView, PerformanceMonitorView e `_guarded_list_fin_audit_logs`: tenant + permissão funcional, sem uma policy permissiva paralela desfazer a restrição. Não abrir todos os nulos ao admin local para recuperar visibilidade. Garantir acesso global legítimo por caminho explícito.
6. Desenhar backfill seguro e revisável: atribuir apenas com recurso existente/vínculo inequívoco ou histórico corroborado. Nunca usar profiles.company_id atual, seleção do navegador ou membership único hoje como prova de empresa passada. before/after/metadata isolados podem ter sido fornecidos pelo cliente e exigem corroboração. UUID inválido, recurso removido ou pistas conflitantes ficam preservados em escopo restrito identificável, sem inventar empresa ou apagar eventos.

## Execução e testes

- Criar migrations novas, pequenas e protegidas por preflight de drift. Não editar SQL histórico. Capturar definições/ACLs e rollback que preserve dados e não reabra vazamentos. Considerar concorrência com writers, idempotência, batches, contagens e performance do backfill; não adicionar NOT NULL antes de tornar todos os writers compatíveis e classificar exceções.
- Ensaiar no PostgreSQL/Supabase real isolado com schema atual, sem mocks de banco. O runner legado de multiunidade requer schema anterior à implantação; não reaplicar as seis migrations no schema já migrado. Não reutilizar fixtures da Fase 2 como prova de cobertura completa de logs.
- Testar anon, usuário A, usuário B, admin A, multi A/B e super admin; ALLOW/DENY, memberships revogados/inativos, headers inválidos/forjados, leitura A/A permitida com permissão, A/B negada, escrita operacional/trigger/RPC correta e proibição de forjar ator/empresa/recurso/origem/global. Testar grants efetivos, não somente texto das policies.
- Testar eventos globais de serviço e sua leitura autorizada; preservação dos eventos ambíguos; histórico com UUID inválido, ausência de entidade e pistas contraditórias; reexecução do backfill, concorrência, rollback e ausência de regressão nas operações que geram auditoria. Escritas de teste apenas no ambiente isolado, fixtures e rollback.
- Executar testes pertinentes, typecheck, lint, RBAC, build e checagem Deno das Edges alteradas. Baseline após Fase 2: 719/719 testes; 0 erros/1.349 warnings de lint. Dois harnesses normalizam CRLF; não alterar SQL histórico para satisfazer testes. security:check pode retornar 0 pulando SQL por falta de secrets: registrar cobertura efetiva.
- Atualizar o relatório com status de H01/H02/H03, classificação/contagens antes e depois, ambiguidades preservadas, migrations, testes, riscos e ordem exata de publicação. AGENTS/CLAUDE somente regras operacionais necessárias, sempre idênticos. Fazer commits pequenos com a verificação de segredos do projeto. Nunca pedir segredos no chat.
- Produção exige projeto confirmado, backup restaurável, preflight e ensaio aprovado. Não fazer push automático em main. Se integração ou evidência de atribuição faltar, concluir o trabalho local seguro, registrar exatamente o limite e não declarar o histórico resolvido.

## Limites e entrega

Não alterar regras financeiras, saldo de estoque, cancelamento do Salmão, unicidade de fornecedores ou telas fora do necessário aos logs. Não corrigir outras fases sem evidência de que um caminho invalida o isolamento desta etapa; justificar qualquer exceção. Não apagar logs ambíguos e não mudar identidades compartilhadas como solução de tenant.

Entregar resumo curto das correções, evidências e contagens, arquivos/migrations, testes reais e limitações, pendências, commits e sequência exata de produção/rollback. Encerrar na Fase 3 e fornecer o prompt copiável da Fase 4.
