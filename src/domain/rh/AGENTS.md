<!-- GERADO por scripts/check-padrao.mjs --write-nested a partir de .claude/rules/. Não edite aqui: edite as rules e regenere. -->
# Regras para agentes ao trabalhar em src/domain/rh/

O Codex lê este arquivo. O Claude Code recebe as mesmas regras por `.claude/rules/`. As regras gerais estão no `AGENTS.md` da raiz.

## RH — ao tocar prontuário, escalas, folha, ponto ou documentos

Antes de alterar, leia `docs/modules/rh.md`. Dados pessoais e Storage: também `docs/standards/SECURITY.md` ("Particularidades").

Pontos críticos:

- `rh_colaboradores.user_id` é autorização: abre ao vinculado as telas "minhas" (holerite, férias, documentos, ponto).
- CPF, contato e remuneração só por `rh_listar_colaboradores`, com colunas mascaradas por chave; nunca por policy de lookup na tabela.
- Escalas gravam só pelas RPCs `rh_escala_*` (`rh:escalas:create`/`edit` com `:view`); publicar não tem volta. `rh_escalas` tem SELECT por coluna sem `custo_projetado`: `select('*')` nela dá erro de permissão.
- Folha APROVADO/PAGO não volta: grave só por `rh_folha_salvar_calculo` e `rh_folha_mudar_status`.
- Batida de ponto é `rh_registrar_ponto` (hora do servidor, chave derivada que inclui o dia e o tipo).
- Documento segue a saga `PENDING_UPLOAD` → `ACTIVE` → `DELETING`; compensar às cegas apaga arquivo de documento já ativo.
- UPDATE pelo PostgREST que a RLS descarta volta 0 linhas sem erro: confira `data.length` antes do toast.
