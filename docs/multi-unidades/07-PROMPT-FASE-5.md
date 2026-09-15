# Fase 5: fornecedores e seus consumers

Continue a estabilização multi-tenant do margin.food. Execute somente a Fase 5 (fornecedores e preço por item) do plano em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Ao terminar, entregue resultados e o prompt completo da Fase 6 (produtos e inventário automático de permissões). Não inicie a Fase 6.

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, identidade Auth compartilhada, CompanyScopeProvider/useSupabase, header x-company-id validado, caches e cancelamento de escopo. Não refaça arquitetura, não faça rollback geral e não apague ou una fornecedores/dados reais automaticamente.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (espelhados), docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md, resultados das Fases 2, 3 e 4 em suas pastas faseN-20260915 e docs/ARCHITECTURE.md. Fazer fetch e incorporar alterações posteriores com segurança, preservando trabalho local. Revalidar código, schema vivo, overloads, índices/constraints, ACLs, triggers, callers e deployments; nome de arquivo/versão isolada não prova publicação equivalente.

Projeto Supabase: wuzxpbixprrgssoeeaez. Em 15/09/2026 às 20:28 UTC, Fases 2 (20260915140812), 3 (20260915144030/20260915144031) e 4 (20260915200818) não estavam aplicadas em produção. Vercel estava READY em 80dcf4ec527d1a7e86ed3509496638b71219ab43; scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14. Revalidar publicação posterior. Não aplicar automaticamente fases anteriores nem declarar C01/C02/H01/H02/H03/H04 resolvidos pelo código local.

Alterações de Salmão da outra máquina foram integradas: validade da entrada, FEFO, wizard com Enter e ordem estorno antes de cancelamento. A assinatura atual de create_salmon_entry_atomic inclui p_expiration_date date; o wrapper usa text. Preservar esses corpos e os grants internos preparados pela Fase 4. Não presumir que _salmon_*_atomic exista. A Fase 4 mantém owner postgres nas internas; não conceder EXECUTE genérico nem service_role por suposição para consertar testes.

**Dependência de publicação:** o preflight histórico da Fase 3 espera assinatura/corpos antigos de Salmão e já aborta no banco atual. A Fase 4 não contornou o guard nem editou migrations históricas. Essa reconciliação de release é pendência separada, não autorização para reabrir helpers ou reescrever o histórico. A migration 20260910003448 reapareceu no Git e no histórico remoto; rastreabilidade ampla permanece Fase 9.

## Escopo da Fase 5

1. Revalidar H05: a auditoria encontrou `suppliers` já com UNIQUE(name,company_id), enquanto `upsert_supplier` usa ON CONFLICT(name). Enumerar assinaturas, owner, SECURITY DEFINER, search_path, ACLs efetivos, defaults, triggers e dependências reais. Não recriar uma constraint existente nem assumir que o banco atual ainda é idêntico.
2. Reconstruir consumers de suppliers/supplier_item_prices: useSalmonStore, cadastros de fornecedores, Compras, recebimentos, cotação e qualquer Edge/RPC que crie, atualize, busque ou vincule preço. Encontrar chamadas diretas, lookup por nome, supplier_id textual, supplier_uuid UUID e stock_item_id. Distinguir identidade canônica de texto histórico/snapshot; não trocar todos os campos por UUID indiscriminadamente.
3. Corrigir apenas os caminhos necessários para que o mesmo nome em A e B tenha identidades independentes. Tenant deve vir do contexto validado, ser enviado explicitamente e entrar no alvo real de conflito. Para entradas públicas, exigir permissão funcional existente no registry, membership/empresa ativos e recurso/produto/fornecedor do mesmo tenant. Não confiar em nome global, perfil de origem, company_id arbitrário do cliente ou claim JSON de serviço.
4. Ajustar consumers de preço para usar a identidade retornada pela operação correta e impedir associação de fornecedor A a produto B, fornecedor B a preço A ou atualização por nome fora da empresa. Conferir constraints/FKs/índices e RLS vivos antes de decidir se uma migration é necessária além da RPC. Não ampliar para revisão geral do catálogo ou de todas as policies.
5. Preservar vínculos, histórico de preços, custos, unidades, origem, cancelamento e idempotência/concorrência. O fluxo de entrada de Salmão já faz upsert por (name,company_id) e grava supplier_uuid/stock_item_id/empresa; a Fase 4 verificou esse caminho em banco real e não o redesenhou. Testar regressão ao tocar em seus helpers.
6. Inventariar duplicatas/órfãos/inconsistências por leitura e classificar com evidência. Não deduplicar pessoas jurídicas por semelhança de nome nem normalizar case/acento/whitespace com mudança de identidade sem requisito demonstrado. Se saneamento de dados for necessário, apresentar plano separado e reversível; nenhuma exclusão automática.

## Implementação e testes

- Criar migrations novas, pequenas, com preflight de drift. Não editar migrations históricas. Capturar definições/ACLs anteriores e preparar contenção que preserve dados sem reabrir acesso indevido. Ao mudar assinatura SECURITY DEFINER, conferir overloads e o caller antes de remover assinatura antiga.
- Usar PostgreSQL/Supabase real e isolado, schema atual e fixtures próprias, sem mock de banco nem dados reais como fixtures. Não reaplicar as seis migrations multiunidade num schema já migrado. Pré-requisitos das Fases 2/3/4 somente em banco descartável e explicitamente documentados; isso não autoriza produção.
- Testar anon, A, B, admin A, multi A/B, super, sem permissão e serviço nos caminhos pertinentes. Cobrir granular ALLOW/legado DENY, membership revogado/inativo, empresa inativa, header inválido/forjado/placeholder, fornecedor/produto de B no contexto A e tentativa de escolher ator/empresa/origem de log.
- Demonstrar duas unidades criando mesmo nome sem conflito e com UUIDs distintos; repetição e concorrência na mesma unidade sem duplicação indevida; consumer usa o UUID correto; preço e lookup não vazam/alteram outra unidade. Testar mudança de seleção A→B com resposta atrasada se alterar estado/cache. Conferir recursos, vínculos, preços e logs antes/depois de sucesso, falha e recuo.
- Exercitar fluxo legítimo de cadastro/seleção de fornecedor → preço por item → operação consumidora afetada (compra/recebimento/entrada de Salmão). Testar falha intermediária e rollback atômico quando o contrato for transacional. Não mudar fórmulas de estoque/financeiro para satisfazer testes; produtos.saldo_atual continua a fonte de saldo.
- Preservar logs internos da Fase 3: log_audit uuid/text, audit_log_write e log_integration_error não são APIs genéricas públicas; service_write_audit é exclusivo de serviço real. Históricos correlacionados não certificam autoria; ambiguidades ficam restritas.
- Reexecutar regressões afetadas: Fase 4 teve 146 assertions SQL, oito recusas de drift e 15 checks de concorrência/recuo; Fase 3 teve 175 assertions SQL. Isso não é cobertura completa de fornecedores. Os runners exigem banco local descartável, não produção.
- Rodar TypeScript app/node, lint, RBAC, build, unitários e Deno nas Edges alteradas. Baseline após integrar main: 773/773 unitários; lint 0 erros/1.355 warnings. security:check pode retornar 0 pulando SQL por ausência de secrets; registrar cobertura real. Não pedir segredos no chat.
- Registrar limites preexistentes sem consertar fora do escopo: planejamento com ON CONFLICT/coluna inválidos, inventário rápido com tipo incompatível, categorias fora do registry, edição de Salmão em duas chamadas e cancelamento externo por múltiplas requisições. Exceção somente se demonstrar bloqueio do isolamento/fluxo autorizado desta fase, com alteração mínima justificada.

## Entrega e limites

Atualizar relatório com status H05, matriz de consumers/identidades/ACLs antes/depois, evidências, migrations, testes, riscos, pendências e ordem exata de publicação/rollback. Manter AGENTS/CLAUDE idênticos; adicionar apenas regras operacionais que evitem erro caro. Fazer commits pequenos com verificação de segredos antes de git add/commit/push.

Produção exige projeto confirmado, backup restaurável, preflight atualizado e ensaio aprovado. Não fazer push automático em main nem publicar fases anteriores silenciosamente. Se integração/publicação/evidência estiver faltando, concluir trabalho local seguro e documentar dependência exata; não declarar H05 resolvido no banco vivo.

Entregar resumo curto das correções, evidências, arquivos/migrations, testes reais e limitações, pendências, commits e sequência exata de produção/recuo. Encerrar na Fase 5 e fornecer o prompt completo copiável da Fase 6, sem iniciá-la.
