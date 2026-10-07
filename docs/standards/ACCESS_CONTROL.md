# Controle de acesso: empresas, filiais, papéis e permissões por módulo

> Padrão SaaS v3.1 — documento normativo. Não edite o corpo por projeto; adaptações vão em "Particularidades deste projeto", no final.
> Leia ao criar módulo, tela, rota, RPC ou policy; ao mexer em convites, papéis, permissões, filiais ou planos.
> Complementa: MULTI_TENANCY.md (isolamento entre empresas), SECURITY.md (autenticação), TENANT_LIFECYCLE.md (planos e status da empresa).
> Níveis: [N1] base · [N2] operação crítica · [N3] escala (ver AGENTS.md §5).

## 1. Modelo [N1]

```text
Plataforma
└── Empresa (tenant, company_id)          ← o cliente que assina o SaaS
    ├── Filial (location_id)              ← opcional; dados operacionais por unidade
    └── Membros (usuário ↔ empresa, N:N)  ← o mesmo usuário pode estar em várias empresas
        ├── Papéis (por empresa, opcionalmente limitados a filiais)
        └── Concessões diretas (por empresa, opcionalmente limitadas a filiais)
```

- O papel e as permissões do usuário valem **por empresa**. Admin na empresa A e operador na B é o caso normal.
- Tabelas canônicas: `companies`, `locations`, `company_members`, `roles`, `role_permissions`, `member_roles`, `member_permissions`, `permissions`, `app_modules`, `company_modules`, `platform_admins`. Nomes reais do projeto ficam em `.claude/tenancy-profile.yml`.
- Dado da **empresa** (cadastros compartilhados, configurações) tem `company_id`. Dado da **filial** (pedidos, caixa, estoque, contas) tem `company_id` **e** `location_id`.
- Projeto sem filiais declara `locations.enabled: false` no profile e ignora as partes de filial deste documento.

## 2. Chaves de permissão [N1]

Formato: `<modulo>.<submodulo>.<acao>` — `financeiro.contas_pagar.baixar`.

- O primeiro segmento é sempre o módulo; o último é sempre a ação. Módulo sem submódulo usa `<modulo>.<acao>`.
- Minúsculas, `snake_case`, sem acento.
- Ações padrão, reutilize antes de inventar:

| Ação | Significado |
|---|---|
| `ver` | listar e abrir |
| `criar` | lançar novo registro |
| `editar` | alterar registro aberto |
| `excluir` | remover (raro; prefira cancelar ou estornar) |
| `aprovar` | aprovar ou rejeitar |
| `baixar` · `estornar` · `cancelar` | transições de estado de negócio |
| `exportar` | gerar arquivo ou relatório com dados em volume |

- **Fonte única: o catálogo no banco**, escrito só por migration (`permissions` e `app_modules`). O tipo TypeScript com a união das chaves é **gerado** a partir dele, e o CI acusa quando está desatualizado. Nunca escreva uma chave à mão no código sem ela existir no catálogo.

## 3. Concessões [N1]

Uma concessão é um **padrão**:

| Padrão | Dá acesso a |
|---|---|
| `*` | tudo dos módulos contratados (só em papel; nunca concessão direta) |
| `financeiro` | todo o módulo, inclusive submódulos criados no futuro |
| `financeiro.contas_pagar` | todas as ações de contas a pagar |
| `financeiro.contas_pagar.ver` | só ver contas a pagar |

Regras:

- **Qualquer ação de um submódulo implica `ver` desse submódulo.** Quem pode editar precisa enxergar o que edita.
- **Concessões só somam.** Não existe negação: ela cria regras de precedência difíceis de auditar. Para restringir, conceda menos.
- **Escopo de filial:** `location_id` nulo = todas as filiais da empresa, inclusive as criadas depois. Preenchido = só aquela filial.
- **Proprietário** (`company_members.is_owner`) equivale a `*` nos módulos contratados.
- **Papéis de sistema** (`roles.company_id` nulo) são mantidos por migration e valem para todas as empresas. A empresa pode criar papéis próprios.
- O banco rejeita concessão que não corresponde a nenhuma chave do catálogo. Concessão com erro de digitação não daria acesso nenhum e passaria despercebida.

## 4. Avaliação [N1]

Um usuário tem a permissão `P` na empresa `E` (e filial `F`) quando **todas** as condições valem, nesta ordem:

1. membership ativa em `E`;
2. `E` com status `active` — em `read_only`, só ações `ver` e `exportar`; em `suspended` ou `canceled`, nada;
3. o módulo de `P` contratado por `E` (`company_modules`);
4. a filial `F`, quando houver, ativa;
5. alguma concessão (de papel, direta ou de proprietário) casa com `P` no escopo de `F`.

A mesma semântica existe em dois lugares, e os dois precisam concordar:

- **No banco:** `private.grants_for`, `private.allowed_company_ids` e `private.allowed_location_ids`.
- **No servidor:** o `TenantContext` carrega as permissões efetivas (`public.my_permissions(company_id)`) uma vez por requisição, e `can(ctx, P, locationId?)` é uma função pura sobre essa lista. Não reimplemente a regra de casamento em outro lugar.

## 5. Onde a permissão é verificada [N1]

| Camada | Como |
|---|---|
| Banco — tabela da empresa | `using (company_id in (select private.allowed_company_ids('<modulo>.<sub>.ver')))` |
| Banco — tabela da filial | `using (location_id in (select private.allowed_location_ids('<modulo>.<sub>.ver')))`; a FK composta `(company_id, location_id)` amarra a empresa |
| Banco — cadastro compartilhado | alteração exige concessão para a empresa inteira: `allowed_company_ids('…editar', true)` |
| Banco — transição crítica | coluna de estado sem grant de update; a mudança passa por RPC ou caso de uso que confere a ação (`…baixar`) |
| Servidor | o caso de uso chama `can()` antes de abrir a transação (ARCHITECTURE §5) |
| Interface | menu, rotas e botões a partir de `my_permissions` — **só UX** |
| Jobs e webhooks | revalidam, na execução, a permissão de quem originou a ação |

- Chame os helpers sempre dentro de `(select …)` na policy: assim o Postgres avalia uma vez por consulta, não por linha.
- Toda policy de leitura de módulo usa a permissão `ver` do submódulo dono da tabela. Uma tabela pertence a um submódulo; tabela compartilhada entre submódulos é sinal de que ela pertence a um cadastro da empresa.

## 6. Administração de acessos — anti-escalada [N1]

As tabelas de acesso não aceitam escrita direta do cliente (o banco bloqueia). Toda mudança passa por um caso de uso no servidor que garante:

- quem altera tem `configuracoes.usuarios.editar` na empresa;
- só se concede o que **quem concede possui**, no mesmo escopo de filial ou menor. O proprietário concede qualquer permissão dos módulos contratados;
- ninguém altera os **próprios** acessos;
- só proprietário promove ou remove proprietário, e a empresa **nunca fica sem proprietário ativo**;
- papel da empresa usa apenas chaves do catálogo; papel de sistema só muda por migration;
- convite cria membership `invited`, que só vira `active` quando o convidado aceita com a conta autenticada;
- toda mudança grava o audit log com quem, o quê, escopo e antes/depois;
- remover acesso vale na **próxima requisição**. Os helpers leem o banco a cada consulta; nenhum cache de permissão sobrevive além da requisição sem invalidação explícita.

## 7. Empresa ativa e filial ativa [N1]

- A empresa ativa vai na **URL**: `/app/[empresa]/…` (Next) ou `/:empresa/…` (React Router). Trocar de empresa é navegar; duas abas em empresas diferentes funcionam.
- A filial vai na URL quando a tela opera numa filial específica (PDV, caixa). Telas consolidadas listam as filiais permitidas e filtram por elas.
- O servidor resolve o slug para `company_id` e confere a membership a cada requisição. O slug só **indica**; quem concede é a membership.
- **A RLS é a cerca; o filtro é o foco.** A RLS libera tudo o que o usuário pode ver em **todas** as empresas dele. Toda query de tela filtra pela empresa ativa (e pela filial, quando aplicável). Esquecer o filtro mistura dados de duas empresas do mesmo usuário: não é vazamento para estranho, mas é dado errado na tela e no relatório.
- Chaves de cache (TanStack Query, cache de servidor) começam por `company_id`. Trocar de empresa ou fazer logout descarta o cache privado.

## 8. Módulos contratados [N1]

- `company_modules` diz o que a empresa contratou. Sem o módulo, ninguém da empresa acessa, nem o proprietário. A interface mostra o módulo como "não contratado", não como erro.
- O provisionamento habilita os módulos base (ex.: `configuracoes`). A cobrança liga e desliga os demais (TENANT_LIFECYCLE §3).
- Limites quantitativos do plano (filiais, usuários, mensagens) são verificados no caso de uso que cria o recurso, dentro da transação. Esconder o botão não é limite.

## 9. Implementação de referência

A skill `padrao-saas:aplicar` traz em `templates/sql/`:

- `01_modelo_de_acesso.sql` — tabelas, validações, helpers, RLS, grants e seed de exemplo;
- `02_exemplo_modulo_financeiro.sql` — tabela da empresa, tabela da filial e transição crítica por RPC;
- `03_modelo_de_acesso.test.sql` — 29 cenários em pgTAP.

Adapte nomes ao projeto; não aplique em massa num projeto existente (DATABASE §1).

## 10. Testes obrigatórios [N1]

Além da matriz de MULTI_TENANCY §7:

| Cenário | Esperado |
|---|---|
| Usuário com acesso só a um submódulo lê outro submódulo do mesmo módulo | Negado |
| Usuário com acesso só à filial F1 lê ou grava na F2 | Negado |
| Usuário com acesso à filial F1 altera cadastro compartilhado da empresa | Negado |
| Concessão só de `editar` permite ver | Permitido |
| Empresa sem o módulo contratado, inclusive para o proprietário | Negado |
| Empresa em `read_only`: ler / gravar | Permitido / Negado |
| Membership desativada | Acesso perdido na próxima requisição |
| Filial desativada | Concessões dela deixam de valer |
| Usuário altera as próprias permissões, direto no banco ou pelo caso de uso | Negado |
| Usuário concede permissão que não tem | Negado |
| Remover o último proprietário | Negado |
| Concessão com chave inexistente | Rejeitada pelo banco |
| Transição crítica por update direto | Negado; só pelo RPC/caso de uso com a ação |

## Particularidades deste projeto

Levantado em 2026-10-07. Desvios do modelo padrão, aceitos até ADR:

- Chaves `<modulo>:<submodulo>:<acao>` (separador `:`), ações em inglês: `view, create, edit, delete, export, manage, approve, close, reconcile, cancel, simulate` (`src/permissions/actions.ts`). Sem concessão por prefixo.
- Concessão direta com **DENY** (`user_permissions.effect`): DENY vence papel e ALLOW. Admin → Permissões grava DENY para toda chave padrão do papel que não estiver marcada.
- Árvore de módulos e submódulos: `src/permissions/registry.ts` → `sync_permissions_from_registry` → tabela `permissions`. O padrão pede o catálogo no banco como fonte única, com tipo gerado; aqui o sentido é o inverso.
- Papéis de sistema: enum `app_role` (admin, diretor, gerente_geral, gerente, financeiro, compras, compras_assistente, chefe_setor, estoquista, operador, colaborador, viewer), em `role_permissions` global. admin, diretor e gerente_geral recebem o catálogo inteiro, exceto `configuracoes:empresas:*`. A empresa não cria papéis próprios (`job_roles` é cargo).
- Sem filial, sem proprietário (`is_owner`), sem módulos contratados (`company_modules`), sem `read_only`/`suspended` (só `companies.ativo`).
- Verificação no banco: `has_permission`, `has_any_permission`, `get_effective_permissions`, `get_company_permissions`. O banco não expande `LEGACY_PERMISSION_MAP`; só o `useCan` do frontend expande.
- Concessão só por `admin_upsert_company_membership` (service role, via Edge `admin-users`). Escrita do cliente nas tabelas de acesso é negada. Guards atuais: `PRIVILEGE_ESCALATION_DENIED` (apenas para `system:global:manage` e `system:admin`), `SELF_PROVISIONING_DENIED`, `PROTECTED_MEMBERSHIP`, `COMPANY_HAS_USER_MANAGER`.
- Super admin: ALLOW direto de `system:global:manage` na empresa da plataforma (`platform_company_id()`), sem acesso implícito a dados de outras unidades.

### Regras de RBAC (movidas do AGENTS.md em 2026-10-07)

- Formato: `<módulo>:<submódulo>:<ação>`.
- **Fonte de verdade das ações é `src/permissions/actions.ts`** (`ALLOWED_ACTIONS`, 11 ações): `view, create, edit, delete, export, manage, approve, close, reconcile, cancel, simulate`. `validatePermissionKey()` rejeita qualquer outra — não existem ações como `send_whatsapp`/`use_ai`/`convert`/`audit`/`configure`/`execute`/`admin` (mapear para uma das 11: WhatsApp/IA → `manage`, converter → `close`).
- Registry em `src/permissions/registry.ts` (fonte única de módulos/subtabs) → sync via `sync_permissions_from_registry(_entries jsonb)` (**não** existe `rpc_sync_permissions_from_registry` no banco).
- **Permissões novas**: adicionar em `src/permissions/registry.ts` + rodar `sync_permissions_from_registry(_entries jsonb)`. `admin`/`diretor`/`gerente_geral` recebem o catálogo inteiro via `role_permissions` (exceto `configuracoes:empresas:*`, ver RBAC) — a chave nova precisa ser inserida lá na mesma migration, senão nem o Admin a enxerga.
- `has_permission(user_id, key)` / `has_any_permission(user_id, keys[])` / `get_effective_permissions(user_id)` são as RPCs de checagem.
- **Chave de permissão na policy tem que existir em `src/permissions/registry.ts` — nunca inventar submódulo novo direto na RLS.** `fin_categorias`/`fin_centros_custo` checavam `financeiro:categorias:*`/`financeiro:centros-custo:*`, que nunca foram registradas (o submódulo real é `financeiro:cadastros:*`, único gate usado pelo frontend em `CadastroBaseTree.tsx`) — não aparecem em Admin → Permissões, ninguém consegue conceder, então a RLS só era satisfeita por `finance:read`/`finance:manage`/`system:global:manage`. Usuário com ALLOW explícito na chave granular certa (`financeiro:cadastros:view/create`) mas DENY nas chaves legadas ficava com a tela liberada pelo frontend e a RLS bloqueando tudo (lista vazia no SELECT, violação de RLS no INSERT) — caso real, Royal Parma Bauru, migration `20260912131731`.
- **RLS/RPC nunca pode depender só de chave legada (`finance:manage`, `stock:read`…) ou fora do registry** — o banco não expande `LEGACY_PERMISSION_MAP` (só o `useCan` do frontend expande), e Admin → Permissões grava DENY para toda chave default do perfil que não está marcada na matriz, inclusive as legadas e as que a matriz nem mostra. Todo gate do banco usa `has_any_permission([<chave granular que a tela usa>, <legado>, 'system:global:manage'])`. Financeiro alinhado em `20260912164500` (policies) e `20260914120000` (RPCs).
- **Cadastro lido por outra tela como lista de escolha precisa aceitar a chave `:view` dessa tela na RLS de SELECT** — senão a lista vem vazia sem erro (Contas a Pagar sem `financeiro:contas:view`/`cadastros:view` gravou boletos sem categoria e não conseguia baixar). Padrão `operational_active_lookup`: só ativos, empresa atual, só chaves `:view` das telas consumidoras, nunca escrita — `fin_contas`/`fin_categorias`/`fin_centros_custo` (`20261007120000`) e `stock_*`/`turnos` (`20260916153928`). Filho de título segue o pai: `titulo_rateio_read` libera o rateio de CP/CR a quem lê o título — rateio lido vazio na edição faz `_guarded_update_conta_pagar` apagar as linhas ao salvar. Tela nova que lê cadastro de outro submódulo entra na policy na mesma migration; a policy expõe a linha inteira pelo PostgREST, então cadastro com coluna sensível só ganha lookup por policy se a tela consumidora puder ver tudo (`produtos` para Compras/Ficha/Inventário Rápido, custo incluso — decisão do usuário, `20261007150000`); senão, RPC com colunas mascaradas por chave (`rh_listar_colaboradores`: CPF/contato só Prontuário, remuneração só Prontuário/Folha/Custos/Dashboard; o custo projetado da Escala é calculado pelo servidor na publicação e fica fora do SELECT do cliente).
- **`system:admin` (legado, todo Admin de unidade tem) nunca expande para `system:global:manage`** — a expansão liberava o AdminPanel global na UI. Super-admin é só ALLOW direto de `system:global:manage`; o guard `PRIVILEGE_ESCALATION_DENIED` de `admin_upsert_company_membership` bloqueia conceder essa chave a quem não a possui **e** bloqueia delegar `system:admin` a quem não é Admin na unidade nem super-admin — sem o segundo guard, qualquer ator com `users:manage`/`configuracoes:usuarios:manage` poderia criar Admins livremente (migrations `20260912164600` + `20260915120000`, reconciliando com o guard equivalente que já chegou antes em `20260910003448`).
- **Super admin não tem acesso implícito a nenhuma unidade** — `system:global:manage` administra a plataforma (cadastro de empresas), não dados: entrar numa unidade exige membership concedido pela própria unidade. Provisionar a partir de outra unidade (`admin_upsert_company_membership`/`reserve_company_invitation`, com a chave na unidade original do ator) só dá o 1º gestor a unidade sem nenhum (`COMPANY_HAS_USER_MANAGER`) e nunca ao próprio ator (`SELF_PROVISIONING_DENIED`); `onboard_new_company` não vincula quem cria. Membership de quem detém a chave **naquela** unidade só é alterado por quem também a detém (`PROTECTED_MEMBERSHIP`; `admin-users` barra também senha/e-mail) — nas demais o super admin é membro comum, removível por qualquer admin (migration `20261006200000`).
- **Configurações → Empresas é da plataforma (Moralles, `platform_company_id()`)** — `configuracoes:empresas:*` só existe como ALLOW na Moralles e nunca em `role_permissions` (triggers `trg_user_permissions_empresas_plataforma`/`trg_role_permissions_sem_empresas` barram); só quem tem `system:global:manage` lá concede ou remove (para os demais gestores `admin_upsert_company_membership` mantém o estado atual) e a matriz só mostra a sub-aba nesse caso. As RPCs de empresas checam `can_manage_companies(<ação>)`, que só vale com a Moralles ativa; o delegado com `create` provisiona só o 1º Admin de unidade sem gestor, sem lista de chaves, e ninguém desativa a Moralles (migration `20261006210000`).
- `admin-users` desativa/revoga somente o membership da unidade; nunca exclui a identidade compartilhada. Cadastrar e-mail existente adiciona acesso sem alterar senha/nome/e-mail; alterações de identidade compartilhada exigem administração global.
- Regras de acesso de um módulo: `operacional` é módulo próprio e nunca entra nas policies de `produtos`/`movimentacoes_estoque` (`docs/modules/operacional.md`); `financeiro:cmv:*` fica fora do `LEGACY_PERMISSION_MAP` (`docs/modules/financeiro.md`); `suppliers` é lido pelas telas consumidoras (`docs/modules/compras.md`); listas fixas de requisição decididas pela RLS (`docs/modules/estoque.md`).
