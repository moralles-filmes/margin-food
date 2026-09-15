# Inventário automático de permissões

Gerar: `bun scripts/audit-permission-inventory.ts [catalogo.json] [saida.json]`. Sem conexão de rede. Snapshot vivo: 2026-09-15T23:27:40.069027+00:00.

## Critérios e precedência

1. DIVERGENTE: evidência semântica revisada de operação incompatível (M01 vivo; helper de custo em objects).
2. NÃO ENCONTRADA: expressão dinâmica não resolvida; callers não são gates. registryWithoutLiteralOccurrence significa ausência de literal apenas nas fontes cobertas, não ausência de autorização. Snapshot ausente é indisponibilidade, nunca aprovação.
3. GLOBAL: chave explícita system:global:manage; não classifica automaticamente o recurso como global.
4. VÁLIDA: chave exata no registry, ação permitida.
5. LEGADA: chave exata no LEGACY_PERMISSION_MAP. system:admin permanece local, não implica global.
6. FANTASMA: candidato textual fora das duas fontes. Não equivale a vulnerabilidade comprovada.

## Cobertura

515 arquivos TS/TSX; 861 migrations; 321 funções SQL/PLpgSQL vivas e 595 policies. JSON preserva caminho, linha, objeto/assinatura, operação, trecho e callers. Linhas vivas são relativas à definição/expressão no snapshot, não ao JSON. Imports dinâmicos, overload por tipo e SQL construído exigem revisão.

| Classe | Ocorrências |
|---|---:|
| VÁLIDA | 3214 |
| LEGADA | 1602 |
| FANTASMA | 688 |
| NÃO ENCONTRADA | 1022 |
| DIVERGENTE | 9 |
| GLOBAL | 1657 |

## Candidatos fantasmas vivos

- `cmv:precos:view`
- `cmv:simulador:view`
- `configuracoes:turnos:create`
- `configuracoes:turnos:delete`
- `configuracoes:turnos:edit`
- `configuracoes:turnos:view`
- `estoque:categorias:create`
- `estoque:categorias:delete`
- `estoque:categorias:edit`
- `estoque:categorias:view`
- `estoque:consumo:view`
- `estoque:geral:view`
- `estoque:locais:create`
- `estoque:locais:delete`
- `estoque:locais:edit`
- `estoque:locais:view`
- `estoque:movimentacoes:delete`
- `estoque:movimentacoes:manage`
- `estoque:setores:create`
- `estoque:setores:delete`
- `estoque:setores:edit`
- `estoque:setores:view`
- `estoque:sku:manage`
- `rh:beneficios:manage`
- `rh:comunicacao:manage`
- `rh:custos:manage`
- `rh:escalas:manage`
- `rh:ferias:manage`
- `rh:onboarding:create`
- `rh:onboarding:edit`
- `rh:sst:manage`
- `rh:treinamento:manage`
- `salmon:dashboard:edit`
- `salmon:edit`
- `salmon:manipulacao:edit`
- `salmon:metas:create`
- `salmon:metas:delete`
- `system:read`
- `usuarios:cargos:create`
- `usuarios:cargos:delete`
- `usuarios:cargos:edit`
- `usuarios:cargos:view`

## Revisão obrigatória

- Literais em eventos, exemplos, tipos e testes não são autorização; lifecycle e evidence os distinguem. Regex SQL não é parser PostgreSQL; texto dentro de corpo dinâmico também aparece.
- Arrays de OR e policies permissivas somam caminhos; restritivas exigem interseção. Consultar policies completas e ACLs efetivas de objects. A presença de uma chave válida não prova que o caminho a exige.
- DENY prevalece por chave nas permissões efetivas; outra chave no OR ainda pode conceder. O banco não expande aliases do frontend.
- Gate dinâmico como can(module, action) precisa de resolução dos argumentos/callers. Helpers internos podem delegar autorização; ausência de literal no corpo não prova ausência de guard.
- Grants de tabelas fora de produtos permanecem no catálogo da Fase 1; não foram revalidados integralmente aqui. Revisão semântica global é Fase 7.
- Migration é histórico, inclusive esta candidata não publicada. Fonte Edge local não comprova corpo publicado. Não houve sync, concessão em massa ou exclusão de chaves.
