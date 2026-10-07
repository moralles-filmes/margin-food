# ADR-0001: Unidade é a empresa; não há filial abaixo dela

- Data: 2026-10-07
- Status: aceita (registra o modelo em produção)

## Contexto

O Padrão SaaS v3.1 tem como modelo de referência o arquétipo E: empresa → filial (`location_id`) → dados, com permissões por filial e a empresa ativa na URL. Este projeto nasceu antes do padrão e funciona de outro jeito:

- O tenant é `company_id` (`companies`). Na interface, "Unidade" é a empresa: o `CompanySelector` lista as empresas do usuário e a troca de unidade troca a empresa ativa.
- A empresa ativa vem do estado do cliente, enviada no header `x-company-id`, e é confirmada no banco por `get_current_company_id()` (membership ativa + empresa ativa).
- Um usuário pode estar em várias unidades: uma membership por empresa, com papéis e ALLOW/DENY próprios em cada uma. Em 2026-10-07 havia 5 empresas ativas, 27 memberships e 3 usuários em mais de uma empresa.
- `stock_locations` é local físico de estoque dentro da empresa, não filial.
- Cadastros são por unidade: código de barras é único por `(company_id, codigo)`, para a 2ª unidade poder cadastrar o mesmo EAN.

Um agente que leia os exemplos do padrão pode tentar "corrigir" o projeto para o arquétipo E como efeito colateral de outra tarefa. Esta ADR existe para impedir isso.

## Decisão

- Unidade = empresa. Toda tabela operacional é da empresa (`company_id`), sem coluna de filial. `.claude/tenancy-profile.yml` declara o arquétipo híbrido A/C com `locations.enabled: false`.
- Usuário em várias unidades tem várias memberships. Não existe permissão "para todas as unidades".
- A empresa ativa continua vindo do header `x-company-id`, não da URL.
- Visão que cruza unidades usa escopo explícito por unidade e exige acesso em cada uma (ex.: `presentationUnit` na Apresentação Sócios); nunca uma policy que devolva várias empresas na mesma consulta.
- Exemplos do padrão com filial, `location_id`, empresa na URL ou `company_modules` não se aplicam até nova ADR (AGENTS.md §4, "Precedência").

## Alternativas consideradas

- Adotar o arquétipo E (empresa → filial) — exigiria coluna nova e backfill em mais de 150 tabelas, policies por filial e mudança de navegação, sem necessidade de negócio registrada hoje.
- Empresa-grupo com unidades como filiais (cadastros compartilhados no grupo) — resolveria cadastro duplicado entre unidades do mesmo dono, mas muda isolamento, RBAC e relatórios de uma vez; fica para quando houver demanda concreta.

## Consequências

- Mais fácil: isolamento com uma coluna e uma empresa ativa; cada unidade tem cadastros, permissões e financeiro próprios.
- Mais difícil: cadastro comum a várias unidades (fornecedor, produto, categoria) é duplicado por unidade; visão consolidada precisa de escopo explícito e permissão em cada unidade.
- Monitorar: pedidos de consolidação ou de cadastro compartilhado entre unidades. Qualquer mudança passa por nova ADR com expand → backfill → contract (Fase 10 do plano do padrão).
