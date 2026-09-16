# Fase 8: Edges, Storage, Realtime, integrações e jobs

Continue a estabilização multi-tenant do margin.food. Execute **somente a Fase 8 (Edges, Storage, Realtime, integrações e jobs)** do plano `docs/multi-unidades/03-AUDITORIA-POS-IMPLANTACAO.md`. Entregue resultados e o prompt completo copiável da Fase 9 (drift de schema/histórico). **Não inicie a Fase 9.**

## Contexto obrigatório

Sistema funcional em produção. Preserve memberships, identidade Auth compartilhada, CompanyScopeProvider/useSupabase, header x-company-id validado, clientes imutáveis, cancelamento/caches de escopo, saldos/custos/históricos e contratos. Não refaça arquitetura, faça rollback geral ou limpe/una/mova dados reais automaticamente.

Antes de editar: git status; ler AGENTS.md/CLAUDE.md (idênticos), docs/ARCHITECTURE.md, docs/multi-unidades/00-AUDITORIA.md, 01-INVENTARIO.md, 02-ARQUITETURA-E-OPERACAO.md, 03-AUDITORIA-POS-IMPLANTACAO.md, resultados das Fases 2–6 em faseN-20260915 e **fase7-20260916/RESULTADOS.md + REVISAO-SQL.md**. Fazer fetch e incorporar alterações posteriores com segurança, preservando trabalho local. Revalidar código, schema vivo, overloads/ACLs/callers e deployments; versão de migration ou fonte local isolada não comprova publicação equivalente.

Projeto Supabase: `wuzxpbixprrgssoeeaez`. Snapshot da Fase 7 em **16/09/2026 13:31 UTC**: Fases 2 (`20260915140812`), 3 (`20260915144030/20260915144031`), 4 (`20260915200818`), 5 (`20260915225538`) e 6 (`20260915232846`) continuavam ausentes do histórico vivo. Vercel READY em `80dcf4ec527d1a7e86ed3509496638b71219ab43`. Edges scheduled-jobs v7, inventario v15, ficha-tecnica v11, requisicao-estoque v14 e purchase-requisitions v10. Revalidar publicação posterior; não aplicar fases anteriores silenciosamente nem declarar C01/C02/H01/H02/H03/H04/H05/M01 resolvidos pelo código local.

**Dependência de release:** preflight histórico da Fase 3 espera corpos/assinaturas antigos de Salmão e aborta no vivo. Fases 4–7 não contornaram esse guard nem alteraram migrations históricas. Preflight vivo da Fase 7 recusou `PHASE7_PREREQUISITES_REQUIRED`. Reconciliação de release permanece separada. `20260910003448` reapareceu no Git/histórico remoto; rastreabilidade ampla é Fase 9.

Fase 7 tem seis migrations **locais, não publicadas**: `20260916133617`, `20260916133618`, `20260916133619`, `20260916134848`, `20260916135928`, `20260916141000`. Contêm privilégios fora de RLS (TRUNCATE/DDL/manutenção), cinco materializadas públicas/cinco helpers internos, alinham categorias/locais/setores/turnos leitores, gates SQL de pedidos/ficha/reordenação/auditoria/leitores, oito FKs compostas, uniques por empresa e notificações da unidade ativa. Trinta e quatro INSERTs/UPSERTs passaram a enviar empresa explícita; custos RH usa conflito company_id,periodo. Não restaurar grants antigos para fazer Edge/job funcionar.

**Aceite integral de SQL permanece pendente**, conforme REVISAO-SQL.md: leitores tenant-only sem gate funcional consolidado, sobrecargas legadas quebradas, FKs simples restantes, gestão de turnos e consumers externos não certificados. Os 17 corpos Edge publicados foram baixados na Fase 7 **somente para callers SQL**, com versões/hashes/localizadores em edge-sql-callers.json; não houve auditoria de autenticação, Storage, Realtime ou jobs. Usar essa evidência como ponto de partida e atualizar os corpos, sem presumir equivalência com fonte local.

Preservar Fases 4–6: Salmão com p_expiration_date date (wrapper text), FEFO/validade/wizard, ordem estorno antes de cancelamento, lock por empresa, índice produtos_one_active_salmon_raw e helpers internos sem EXECUTE público; fornecedores por nome exato+empresa, FKs de preços/cotação e RPC manual atômica; Catálogo inativa por deactivate_produto(uuid), reativa por edit, delete não dá UPDATE genérico/DELETE físico. recalc_product_costs é owner-only local com caller interno preservado, ainda exposto no vivo. Não alterar fórmulas.

## 1. Inventário vivo e mapa de confiança

- Inventariar todas as Edges, versões, entrypoints, imports compartilhados, verify_jwt, CORS, secrets **somente nomes/metadados**, callers frontend/SQL/serviço, webhooks, integrações e scheduler. Baixar corpos publicados necessários, comparar semanticamente com fonte local; separar CRLF de mudanças reais.
- Mapear por endpoint/ação: identidade real, papéis, tenant contextual, origem e validação dos recursos, permissão granular/legada, cliente usuário/serviço, RPCs/tabelas/Storage/channels acionados, efeitos externos, idempotência, logs e falhas intermediárias.
- Não expor tokens, chaves, dados bancários ou payloads pessoais em ferramentas, logs, commits ou relatório. Não pedir segredos no chat. Snapshot/corpo/configuração indisponível é limitação, não ausência comprovada.
- Diferenciar endpoints de usuário, operações por unidade, administração global e serviço real. Papel service_role é contexto autenticado real, nunca string role no JSON/body/metadata nem apenas decode de JWT.

## 2. Edges e integrações

- Validar Bearer/JWT no servidor conforme contrato; verify_jwt=false no config não dispensa validação manual. Header x-company-id deve ser autorizado por membership ativo + empresa ativa. Profiles.company_id é origem, nunca seleção de navegação.
- Autorização funcional vem de registry.ts/actions.ts; banco não expande LEGACY_PERMISSION_MAP. Gate no frontend não protege URL da Edge; gate na Edge não substitui proteção de RPC pública. Testar granular ALLOW com legado DENY, policies paralelas e self-service legítimo.
- Cliente service_role não deve transformar parâmetros de usuário em poder global. Toda leitura/escrita tenant-scoped por serviço exige empresa explícita e recursos validados; testar UUIDs/arrays/lotes mistos, owner/actor spoof, nulos, placeholder, headers inválidos/ausentes e membership revogado/inativo.
- Preservar CORS compartilhado e ALLOWED_ORIGINS; não reintroduzir wildcard. Verificar preflight OPTIONS, resposta de erro sem vazamento, métodos/ações e limites/rate limits dos endpoints pertinentes.
- Integrações de Cotação/WhatsApp/IA usam configuração por empresa: impedir uso da configuração/chave de outra unidade e logs cruzados. Webhooks precisam autenticação/assinatura adequada, deduplicação e associação de tenant a partir de vínculo confiável, não dado arbitrário do remetente.
- Não enviar mensagens, WhatsApp ou emails reais, não executar pagamentos/cancelamentos externos nem disparar IA cobrada para testar sem autorização específica. Usar ambiente isolado e fixtures próprias; parar antes de efeito externo não autorizado, registrar dependência exata.
- Escrita de auditoria segue Fase 3: log_audit uuid/text, audit_log_write e log_integration_error internos não recebem EXECUTE genérico; serviço usa service_write_audit com ator/empresa/recurso validados. Correlação histórica não prova autoria.

## 3. Storage

- Inventariar buckets, públicos/privados, policies, grants, paths, uploads/downloads/removes/moves/copies/listagens e geração/uso de URLs assinadas. Metadados de storage não substituem política de acesso ao objeto.
- Verificar prefixos de empresa, normalização/decodificação de caminho, autorização de recurso vinculado e identidade compartilhada. Testar A→B, multi no escopo escolhido, usuário sem permissão, revogação e empresa inativa; não confiar em prefixo enviado pelo cliente sozinho.
- URL pública/assinada pode permanecer utilizável após troca de unidade ou revogação até expiração; documentar contrato real e TTL. Não alegar revogação instantânea sem prova. Não tornar bucket público ou emitir URL longa para contornar RLS.
- Testar somente arquivos sintéticos em projeto/ambiente isolado autorizado. Não listar conteúdo privado sem necessidade nem apagar/mover objetos reais.

## 4. Realtime

- Inventariar publications, replicação/tabelas, postgres_changes/broadcast/presence, filtros, políticas de autorização, nomes de canais e consumidores. Canal com company_id no nome não é prova de autorização.
- Verificar assinatura com sessão correta, renovação de token, filtros/server-side RLS, payload de UPDATE/DELETE, reconexão e cleanup ao trocar empresa/deslogar/revogar acesso. Não inferir comportamento de DELETE a partir de SELECT.
- Ensaiar A/B simultâneos, multi A→B com evento atrasado, membership revogado/inativo e empresa inativa. Eventos de A não podem contaminar cache/estado visível de B. Preservar clientes imutáveis, provider e cancelamento existentes; se alterar estado/cache, adicionar teste relevante de resposta/evento atrasado.

## 5. Jobs e serviço

- Inventariar pg_cron/pg_net/schedules externos, autenticação do scheduler, payloads, timezone, retries, locks, timeout, logs e versões efetivamente chamadas. READ ONLY primeiro; não executar job global em produção para “ver se funciona”.
- Distinguir manutenção global autorizada de trabalho operacional por tenant. Enumerar empresas elegíveis de modo confiável, incluir company_id em cada passo e não reutilizar contexto/caches entre iterações. Uma falha por empresa não pode atribuir dados à seguinte.
- Testar concorrência/retry/idempotência e falha intermediária em ambiente isolado; demonstrar preservação de dados/logs/custos/saldos e ausência de efeitos parciais indevidos. Não conceder EXECUTE público/serviço em helpers internos nem restaurar TRUNCATE/leitura de caches globais para adaptar job legado.
- Refresh reporting usa wrapper/allowlist autorizados; materializadas públicas foram contidas localmente na Fase 7. Confirmar se há consumidor externo não inventariado antes de liberar publicação.

## Implementação e testes

- Corrigir somente problemas comprovados desta fase, com mudanças pequenas. SQL novo apenas quando ligado diretamente ao contrato Edge/Storage/Realtime/job em revisão; classificar dependência residual da Fase 7 em vez de certificar todo SQL por tabela/lista.
- Migrations novas via CLI, guards de drift, captura de corpos/ACLs e recuo que preserve dados sem reabrir exposição. Não editar migrations históricas. Nova policy usa resolvers/permissões em `(select ...)`. Não adicionar tenant/NOT NULL/FORCE indiscriminadamente a globais/logs.
- Banco/Supabase real isolado, schema atual e fixtures próprias; sem mock de banco. Não reaplicar as seis migrations multiunidade sobre schema já migrado. Fases 2–7 só como dependências documentadas no descartável; isso não autoriza produção.
- Matriz anon/A/B/admin A/multi/super/sem permissão/granular-only/serviço real; auth e autorização HTTP reais nos endpoints pertinentes, não somente SET ROLE SQL. Recursos cruzados, arrays mistos, NULL, headers forjados/placeholder, role falsificada, membership/empresa inativos, falhas intermediárias, concorrência e retry.
- Baseline Fase 7: **248 assertions SQL, 14 recusas de drift, 12 concorrência/recuo; regressões Fases 3/4/5/6 = 175/146/67/80**. Runners em scripts/test-phase7-db.ps1 e test-phase7-concurrency.mjs exigem descartável local; o runner de recuo fecha APIs ao final. Reexecutar regressões afetadas.
- **779/779 unitários, 99 arquivos; lint 0 erros/1.355 warnings; TypeScript app/node, RBAC e build PASS.** Rodar Deno check/test nas Edges alteradas. security:check retornava 0 pulando SQL lint sem configuração de serviço; registrar cobertura real.
- Não certificado na Fase 7: gateway/JWT/PostgREST/browser integrado. Testes existentes de CompanyScope/transporte passaram, mas não equivalem a integração real de Storage/Realtime/Edges.
- Limites anteriores: delete de planejamento com deleted_at inexistente (upsert foi corrigido), inventário rápido com tipo incompatível, edição de Salmão em duas chamadas, cancelamento externo distribuído, ordem do estorno de Compras, recebimento exige compras:lista:approve, itens livres parciais sem idempotência geral. Duas primeiras criações simultâneas de pedido geram um pedido + uma recusa 23505; retry posterior retorna idempotent. Não declarar esses fluxos aprovados por ensaios de outra rotina.

## Entrega e publicação

Atualizar relatório com mapa revisável de endpoints/buckets/channels/jobs, corpos/versões/callers, grants/gates/tenant antes/depois, casos reais testados, diferenças entre local e vivo, riscos e evidências faltantes. Manter AGENTS/CLAUDE idênticos/enxutos. Commits pequenos; verificar segredos antes de git add/commit/push, nunca incluir .env/settings.local/supabase/.temp.

Produção exige projeto confirmado, backup restaurável, preflight atualizado, dependências realmente publicadas e ensaio aprovado. **Não fazer push automático em main, não publicar fases anteriores silenciosamente, não disparar efeitos externos reais para validar.** Se faltar integração/publicação/evidência, concluir o trabalho local seguro e registrar a dependência exata; não declarar achados resolvidos no banco/Edge vivo.

Entregar resumo curto, arquivos/migrations/Edges, testes e limites, pendências, commits, sequência exata de publicação por versão e recuo sem reabrir exposição. Encerrar na Fase 8 e fornecer o prompt completo copiável da Fase 9, **sem iniciá-la**.
