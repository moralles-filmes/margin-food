# Prompt — Fase 4: Salmão, funções internas e grants

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 4 (Salmão, funções internas e grants)** do plano em `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Ao terminar, entregue os resultados e o prompt completo da Fase 5 (fornecedores e seus consumers).

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, identidade Auth compartilhada, CompanyScopeProvider/useSupabase, x-company-id validado, caches e cancelamento de escopo. Não refaça arquitetura, não faça rollback geral e não apague dados.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (espelhados), docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md, fase2-20260915/RESULTADOS.md, fase3-20260915/RESULTADOS.md e docs/ARCHITECTURE.md. Revalidar código, schema vivo, ACLs, triggers ativos, callers e deployments. Arquivo local, snapshot ou nome de função não comprova o estado publicado.

Projeto Supabase: `wuzxpbixprrgssoeeaez`. Em 15/09/2026 às 15:21 UTC, a Fase 2 (`20260915140812`) e as migrations da Fase 3 (`20260915144030`, `20260915144031`) **não estavam aplicadas em produção**. Produção Vercel permanecia no commit `1fdea27e69e3d687b49fdd04e91069b25cc70850`; scheduled-jobs v7, inventario v15, ficha-tecnica v10 e requisicao-estoque v14. Verificar se houve publicação posterior. Não aplicar automaticamente fases anteriores nem declarar C01/C02/H01/H02/H03 resolvidos pelo código local. Manter a pendência de publicação separada desta fase.

A Fase 3 preparou logs TENANT/GLOBAL/AMBIGUOUS, writers confiáveis, readers restritivos e backfill explícito de serviço. Preservar esse contrato: log_audit (uuid/text), audit_log_write e log_integration_error são internos; APIs genéricas não voltam a ser públicas para fazer testes passar. service_write_audit é exclusivo de serviço real. O histórico correlacionado não certifica autoria; ambiguidades não podem ser abertas ao admin local. A prévia de produção não foi aplicada: audit_log 34 correlacionáveis/79 ambíguos; audit_logs 32.414/2.937; integration_logs vazio.

## Escopo

1. Revalidar H04. Os nomes anteriormente encontrados são `create_salmon_entry_atomic`, `cancel_salmon_entry_atomic`, `create_salmon_manipulation_atomic`, `cancel_salmon_manipulation_atomic` e `ensure_salmon_raw_product`. Não presumir que `_salmon_*_atomic` exista. Enumerar assinaturas/overloads, owner, SECURITY DEFINER, search_path, ACLs efetivos para PUBLIC/anon/authenticated/service_role e dependências reais.
2. Reconstruir o caminho completo: useSalmonStore e outros consumers → wrappers `_salmon_*_guarded` → funções atômicas/helpers → triggers, movimentos/espelhos, produtos e auditoria. Procurar chamadas diretas no frontend, RPCs, Edges e funções SQL, inclusive integração salmon_to_stock. O helper log_integration_error não tinha caller ativo na Fase 3; isso não certifica os fluxos de Salmão.
3. Identificar quais entradas são públicas e quais são estritamente internas. Impedir que membro autenticado sem permissão funcional contorne o wrapper chamando a função atômica ou helper de criação de produto. Anon tinha EXECUTE nas atômicas, mas assert_tenant já barrava sua operação: distinguir exposição de ACL de exploração comprovada.
4. Para entradas públicas legítimas, exigir tenant validado, recurso no mesmo tenant e a chave funcional **existente no registry** para a ação. Para internas, revogar PUBLIC/anon/authenticated e outros papéis sem caller legítimo, preservando chamadas autorizadas pelo owner/serviço conforme evidência. Não conceder service_role automaticamente nem confiar em claim JSON para comprovar serviço.
5. Preservar entrada, manipulação, espelhamento, cancelamento/estorno, idempotência, concorrência e logs confiáveis. Conferir vínculos e saldos antes/depois. `produtos.saldo_atual` continua fonte única de leitura de saldo, mantida pelos triggers: conferir corpos vivos com pg_get_functiondef e não reintroduzir soma cumulativa do ledger ou alterar fórmulas para satisfazer o teste.
6. Revisar ensure_salmon_raw_product e helpers alcançáveis que criem/alterem catálogo, especialmente empresa explícita, produto de outra unidade, placeholder reservado, criação concorrente e duplicação. Não ampliar esta fase para uma revisão geral de todo o catálogo ou de todas as funções do sistema.

## Execução e testes

- Criar migrations novas, pequenas e com preflight de drift. Não editar migrations históricas. Capturar definições/ACLs anteriores e preparar rollback de contenção que preserve dados e não reabra o bypass. Conferir overloads ao mudar assinaturas SECURITY DEFINER.
- Ensaiar em PostgreSQL/Supabase **real e isolado**, com schema atual e fixtures próprias, sem mock de banco. O runner legado exige schema anterior à implantação: não reaplicar as seis migrations multiunidade num schema já migrado. Quando necessário, aplicar os pré-requisitos das Fases 2/3 somente no banco descartável, sem tratar isso como autorização de produção.
- Testar anon, A, B, admin A, multi A/B, super e serviço nos caminhos pertinentes. Cobrir granular ALLOW com legado DENY, usuário sem permissão, membership revogado/inativo, empresa inativa, header inválido/forjado, recurso/produto de B no contexto A e tentativa de escolher empresa/ator/origem do log.
- Demonstrar que chamada direta não autorizada é recusada **sem efeitos**, inclusive pelos helpers alcançáveis; conferir privilégios efetivos, não somente texto de GRANT ou guard. Operação legítima por wrapper deve continuar funcionando.
- Executar entrada → manipulação → espelhos → cancelamento, repetição idempotente e concorrência em conexões reais. Comparar recursos, vínculos, movimentos, saldo cacheado e auditoria antes/depois. Testar falha intermediária e rollback atômico. Não usar manutenção destrutiva nem dados reais de produção como fixtures.
- Reexecutar testes pertinentes das Fases 2/3 se os contratos forem afetados, além dos novos testes desta fase. A Fase 3 teve 175 assertions SQL, nove casos de drift, concorrência/recuo e 719/719 unitários; isso **não é cobertura completa dos fluxos de Salmão**.
- Rodar typecheck, lint, RBAC, build e Deno nas Edges alteradas. Baseline: 0 erros/1.349 warnings de lint. security:check pode retornar 0 pulando SQL por ausência de secrets; registrar cobertura real. Não pedir segredos no chat.
- Registrar limites preexistentes sem consertá-los fora do escopo: planejamento com ON CONFLICT/coluna inválidos, inventário rápido com tipo incompatível e gates de categorias fora do registry estão descritos na Fase 3. Só fazer exceção se demonstrar que bloqueia o isolamento ou fluxo autorizado desta fase; justificar a alteração mínima.
- Atualizar o relatório com status de H04, matriz de chamadas/ACLs antes/depois, evidências, migrations, testes, riscos e ordem exata de publicação/rollback. AGENTS/CLAUDE somente regras operacionais necessárias, sempre idênticos. Fazer commits pequenos com a verificação de segredos antes de git add/commit/push.

## Limites e entrega

Não alterar regras financeiras, unicidade de fornecedores, identidades compartilhadas, relatórios, RLS de módulos não envolvidos ou histórico ambíguo de logs. Preserve cancelamento de Salmão e regras de negócio; o objetivo é impedir acesso indevido às mesmas operações legítimas.

Produção exige projeto confirmado, backup restaurável, preflight atualizado e ensaio aprovado. Não fazer push automático em main. Se publicação anterior, integração ou evidência estiver faltando, concluir o trabalho local seguro, documentar exatamente a dependência e não declarar H04 resolvido no banco vivo.

Entregar resumo curto das correções, evidências, arquivos/migrations, testes reais e limitações, pendências, commits e sequência exata de produção/rollback. Encerrar na Fase 4 e fornecer o **prompt completo copiável da Fase 5**, sem iniciá-la.
