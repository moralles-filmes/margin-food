# Fase 6: produtos e inventário automático de permissões

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 6 (produtos e inventário automático de permissões)** do plano em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Ao terminar, entregue resultados e o prompt completo da Fase 7 (tabelas, INSERTs, RLS, views e SECURITY DEFINER). Não inicie a Fase 7.

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, identidade Auth compartilhada, CompanyScopeProvider/useSupabase, header x-company-id validado, caches e cancelamento de escopo. Não refaça arquitetura, não faça rollback geral, não limpe nem una dados reais automaticamente.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (espelhados), docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md, resultados das Fases 2/3/4/5 nas pastas faseN-20260915 e docs/ARCHITECTURE.md. Fazer fetch e incorporar alterações posteriores com segurança, preservando trabalho local. Revalidar código, schema vivo, overloads, índices/constraints, ACLs, triggers, callers e deployments; nome/versão de migration isolada não comprova publicação equivalente.

Projeto Supabase: `wuzxpbixprrgssoeeaez`. Em **15/09/2026 às 23:16 UTC**, Fases 2 (`20260915140812`), 3 (`20260915144030/20260915144031`), 4 (`20260915200818`) e 5 (`20260915225538`) não estavam aplicadas em produção. Vercel estava READY em `80dcf4ec527d1a7e86ed3509496638b71219ab43`; scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14, purchase-requisitions v10. Revalidar publicação posterior. Não aplicar fases anteriores silenciosamente nem declarar C01/C02/H01/H02/H03/H04/H05 resolvidos pelo código local.

**Dependência de release:** o preflight histórico da Fase 3 espera assinatura/corpos antigos de Salmão e aborta no banco vivo atual. Fases 4/5 não contornaram o guard nem editaram migrations históricas. Reconciliação de release é pendência separada. `20260910003448` reapareceu no Git e no histórico remoto; rastreabilidade ampla continua na Fase 9.

Salmão já tem validade, FEFO, wizard com Enter e ordem estorno antes de cancelamento. A assinatura de create_salmon_entry_atomic inclui `p_expiration_date date`; wrapper usa text. Preserve corpos, índice `produtos_one_active_salmon_raw`, lock por empresa e grants internos da Fase 4. Não presumir `_salmon_*_atomic`, não conceder EXECUTE genérico ou serviço para fazer testes passarem.

Fase 5: mesma identidade de fornecedor por nome exato+empresa, UUIDs independentes entre empresas, RPC manual de fornecedor+preço atômica, FKs compostas de preço/cotação, escrita direta de preço fechada para authenticated, cadastro com empresa explícita, recebimento corrigido para colunas/conflito/tenant reais. Não trocar supplier_id textual/snapshots por UUID indiscriminadamente; supplier_uuid identifica fornecedor canônico no preço. Identidade de preço existente não pode ser retargetada. Não deduplicar nomes/case/acento/whitespace automaticamente. Detalhes em `fase5-20260915/RESULTADOS.md`.

## Escopo da Fase 6

### 1. Revalidar M01 — produtos: Catálogo × Cadastros

- Enumerar **todas** as policies permissivas e restritivas, grants efetivos, triggers, defaults, constraints, índices e RPCs que leem/criam/editam/desativam/excluem produtos. Conferir schema vivo e caminhos reais, inclusive SKU e operações internas que criam produtos.
- Auditoria anterior: produtos_insert/update/delete usam `estoque:cadastros:*` e legadas, mas o Catálogo é gateado por `estoque:catalogo:*`; policies paralelas `tenant_insert/update/delete` com has_permission_quick podem combinar por OR. Não concluir pela inspeção de só três policies.
- O botão **Excluir** do Catálogo faz `UPDATE ativo=false`. Permitir UPDATE amplo para quem tem somente `estoque:catalogo:delete` abriria edição de nome, preço, custo, SKU, tenant ou outros campos. Separar autorização da ação e payload permitido; distinguir soft-delete de DELETE real e testar ambas as vias.
- Mapear clientes de produtos: Catálogo, Cadastros, useEstoqueGeralStore, Compras/recebimento, Salmão, ficha técnica, inventário e Edges/RPCs internas. Confirmar consumidores de leitura e gravação antes de restringir grants. Produto deve pertencer à unidade validada; nunca confiar em profiles.company_id como preferência, empresa arbitrária ou claim JSON de serviço.
- Corrigir apenas a divergência necessária ao Catálogo e os caminhos que comprovadamente bloqueiem seu isolamento/contrato. Não ampliar para revisão/correção geral das tabelas, Edges ou fórmulas.
- `produtos.saldo_atual` continua fonte única de saldo; triggers de cache e RPCs de leitura existentes devem ser preservados. Conferir com pg_get_functiondef antes de assumir equivalência. Não recalcular ledger nem ajustar saldo/custo para satisfazer testes.
- Preservar FKs compostas da Fase 5, IDs, histórico, SKUs por empresa, unidades, fatores de conversão, custo, produto bruto de Salmão e operações internas legítimas.

### 2. Inventário automático de permissões

- Produzir gerador reproduzível e artefato revisável cruzando **registry/actions/LEGACY_PERMISSION_MAP**, chamadas e gates do frontend, Edge Functions, migrations e funções/policies vivas. Manter fonte, objeto/assinatura, caminho/linha, ação/operação e evidência de caller.
- Fontes de verdade: `src/permissions/registry.ts` e `src/permissions/actions.ts`; ações permitidas: view/create/edit/delete/export/manage/approve/close/reconcile/cancel/simulate. Não inventar ações/submódulos para acomodar uma string legada.
- Classificar ocorrências como **VÁLIDA, LEGADA, FANTASMA, NÃO ENCONTRADA, DIVERGENTE ou GLOBAL**, com definição dos critérios e precedência. Diferenciar ausência comprovada de informação indisponível e ocorrência apenas em histórico/teste/tipo/comentário.
- Extrair chaves literais e expressões dinâmicas separadamente. AST/regex são localizadores, não prova de autorização: verificar delegação, helpers internos, arrays de OR, DENY, policies restritivas/permissivas e grants herdados. Documentar falsos positivos e casos de revisão manual.
- Distinguir recurso global real de tenant e admin local de administração global. `system:admin` não implica `system:global:manage`. O banco não expande LEGACY_PERMISSION_MAP; frontend liberado por alias não prova acesso na RLS.
- Não conceder permissões em massa, não converter todas as policies, não apagar chaves/grants históricos e não rodar sync destrutivo. Esta fase corrige M01 e inventaria/classifica o restante para próximas fases. Achado crítico novo pode antecipar contenção mínima, com evidência e justificativa explícitas.
- Não ler/imprimir secrets, payloads privados ou dados pessoais para gerar o relatório. Configuração ausente é limitação de cobertura, não aprovação.

## Implementação e testes

- Migrations novas e pequenas com preflight de drift; não editar históricas. Capturar definições/ACLs anteriores e preparar contenção que preserve dados sem reabrir acesso. Mudança de assinatura SECURITY DEFINER exige revisão de overloads/callers antes de remover a antiga.
- Policies novas usam `(select ...)` para resolvers/permissões; chaves funcionais têm que existir no registry e corresponder à operação. Validar identidade, membership e empresa ativos no servidor. Não adicionar coluna/NOT NULL/FORCE indiscriminadamente a objetos globais ou logs mistos.
- PostgreSQL/Supabase real e isolado, schema atual e fixtures próprias; sem mock de banco/dados reais como fixtures. Não reaplicar seis migrations multiunidade em schema já migrado. Pré-requisitos das Fases 2/3/4/5 só em descartável e documentados; não autoriza produção.
- Matriz: anon, A, B, admin A, multi A/B, super, sem permissão e serviço nos caminhos pertinentes. Granular ALLOW/legado DENY; catalogo-only, cadastros-only, create-only, edit-only, delete-only, view-only; sem herança acidental de grants adicionais.
- Demonstrar leitura/criação/edição/desativação autorizadas em A sem efeitos em B; recursos/SKU de B em A recusados; header inválido/forjado/placeholder, membership revogado/inativo e empresa inativa recusados.
- **Delete-only:** pode executar exatamente a desativação permitida, sem editar outros campos, reativar arbitrariamente, mover tenant, trocar SKU/custo/unidades nem apagar fisicamente por outra API. Exercitar payload misto, valores NULL, updates vazios e tentativas por SQL/PostgREST/RPC pertinentes.
- Testar concorrência/idempotência, recurso já desativado e referências existentes; falha intermediária deve reverter tudo quando o contrato for transacional. Comparar recursos/vínculos/saldos/custos/logs antes/depois de sucesso, falha e recuo.
- Exercitar fluxo real de Catálogo→consumer afetado; regressão de criação automática de Salmão e recebimento/preços de fornecedores. Não reabrir log_audit uuid/text, audit_log_write ou log_integration_error; service_write_audit é exclusivo de serviço real. Histórico correlacionado não certifica autoria.
- Testar A→B com resposta atrasada se alterar estado/cache, mantendo CompanyScopeProvider e clientes imutáveis. Distinguir teste de transporte/UI de autorização PostgreSQL e de gateway/JWT real.
- Reexecutar regressões afetadas. Fase 5: 67 assertions SQL, dez recusas de drift, 13 checks de concorrência/recuo. Fase 4: 146 assertions SQL, oito recusas, 15 checks concorrência/recuo. Fase 3: 175 assertions. Runners exigem banco local descartável, nunca produção.
- TypeScript app/node, lint, RBAC, build, unitários e Deno nas Edges alteradas. Baseline Fase 5: **773/773 unitários; lint 0 erros/1.355 warnings**. security:check pode retornar 0 pulando SQL sem configuração de serviço: registrar cobertura real. Não pedir segredos no chat.
- Registrar limites preexistentes sem ampliar escopo: planejamento com conflito/coluna inválidos, inventário rápido com tipo incompatível, categorias fora do registry, edição de Salmão em duas chamadas e cancelamento externo em múltiplas requisições; recebimento após aprovação exige compras:lista:approve para mudar total confirmado; itens livres sem produto em pedido parcial não têm idempotência geral certificada. Exceção só se demonstrar bloqueio do fluxo/isolamento autorizado desta fase, com mudança mínima justificada.

## Entrega e publicação

Atualizar relatório com status M01, matriz de permissões/ações/consumers/ACLs antes/depois, inventário automático e suas limitações, evidências, migrations, testes, riscos e dependências. Manter AGENTS/CLAUDE idênticos, acrescentando só regra operacional necessária para evitar erro caro. Commits pequenos, verificação de segredos antes de git add/commit/push.

Produção exige projeto confirmado, backup restaurável, preflight atualizado e ensaio aprovado. Não fazer push automático em main nem publicar fases anteriores silenciosamente. Se faltar integração/publicação/evidência, concluir trabalho local seguro e registrar dependência exata; não declarar M01 ou demais achados resolvidos no banco vivo.

Entregar resumo curto, arquivos/migrations, testes reais e limites, pendências, commits e sequência exata de publicação/recuo. Encerrar na Fase 6 e fornecer o prompt completo copiável da Fase 7, **sem iniciá-la**.
