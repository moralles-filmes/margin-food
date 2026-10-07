# Módulo: RH — Pessoas

> Regras movidas do `AGENTS.md` em 2026-10-07 (Padrão SaaS, Fase 9), com o texto preservado. Submódulos: `src/permissions/registry.ts`. Tabelas: tipo gerado `src/integrations/supabase/types.ts` (todas com `company_id`).

- Chave do módulo: `rh`
- Status: ativo
- Flag: nenhuma

## Responsabilidade

- Faz: prontuário de colaboradores, escalas e trocas de turno, tarefas, onboarding, treinamento, férias, documentos (Storage), folha de pagamento, benefícios, custos, SST, disciplinar, mural, ponto e banco de horas.
- Não faz: lançamento financeiro da folha → [financeiro.md](financeiro.md).
- Código: `src/components/RhView.tsx`, `src/components/rh/`, `src/domain/rh/`, Edge `rh`.

## Submódulos e permissões

| Submódulo | Ações (`rh:<submodulo>:<acao>`) | Escopo |
|---|---|---|
| `prontuario` | view, create, edit, delete, manage | empresa |
| `escalas` | view, create, edit, delete | empresa |
| `tarefas`, `treinamento`, `beneficios`, `sst`, `disciplinar` | view, create, edit, delete | empresa |
| `onboarding` | view, manage | empresa |
| `ferias` | view, create, approve | empresa |
| `documentos` | view, create, edit, delete, manage | empresa |
| `folha` | view, export, manage | empresa |
| `dashboard` | view | empresa |
| `custos` | view, export | empresa |
| `mural` | view, create | empresa |
| `ponto` | view, create, manage, approve | empresa |
| `banco-horas` | view, manage, reconcile | empresa |

O colaborador vinculado (`rh_colaboradores.user_id`) vê os próprios holerite, férias, documentos e ponto pelas policies `*_select_own`, sem chave de RH.

## Tabelas

| Tabela | Escopo | Observação |
|---|---|---|
| `rh_colaboradores` | empresa | `user_id` é autorização; CPF, contato e remuneração mascarados por `rh_listar_colaboradores` |
| `rh_folha_pagamento` | empresa | transição de status por `trg_rh_folha_transicao` |
| `rh_escalas` / `rh_escala_slots` / `rh_trocas_turno` / `rh_disponibilidade` | empresa | escalas; escrita só pelas RPCs `rh_escala_*`; `rh_escalas` com SELECT por coluna, sem `custo_projetado` |
| `rh_ponto_registros` / `rh_ponto_ajustes` / `rh_banco_horas` | empresa | ponto |
| `rh_documentos` | empresa | metadata do Storage `rh-documentos` (saga) |
| `rh_ferias_afastamentos` / `rh_ferias_saldo` | empresa | férias |
| `rh_audit_log` | empresa | trilha do RH |

## Invariantes

- **Storage RH usa saga explícita** — metadata nasce `PENDING_UPLOAD`, só vira `ACTIVE` após o objeto existir; exclusão passa por `DELETING`, path começa por `company_id`, e falha intermediária deve compensar ou permanecer visível/repetível, nunca ser tratada como sucesso. O id do documento é derivado do envio (`idDocumentoRh`): o reenvio bate na PK e retoma pelo estado (`registerRhDocument`), e a ativação sem resposta é conferida antes de compensar — compensar às cegas apaga o arquivo de um documento já `ACTIVE`.
- **Folha de pagamento APROVADO/PAGO é imutável no banco** — `trg_rh_folha_transicao` barra recálculo e volta de status em qualquer caminho (RASCUNHO ⇄ CALCULADO → APROVADO → PAGO) e carimba `aprovado_em/por` no servidor; a tela grava só por `rh_folha_salvar_calculo` (upsert atômico por colaborador+período que pula folha fechada) e `rh_folha_mudar_status`.
- **`rh_colaboradores.user_id` é autorização, não cadastro** — o vínculo abre ao usuário as telas "minhas" do RH (holerite, férias, documentos, ponto: policies `*_select_own` e `rh_registrar_ponto`). A edição do Prontuário grava por `rh_atualizar_colaborador` (`:edit` + `:view`, lock otimista pelo `updated_at` lido da tabela ao abrir o formulário); pela tabela, `authenticated` só atualiza `status`. Vínculo, salário e valor-hora exigem `:manage` também na criação (policy `rh_colaboradores_insert_hr`); o vinculado precisa ser membro da unidade, não estar ligado a outro colaborador e nunca ser quem está gravando (`VINCULO_PROPRIO`: um gestor se ligaria à ficha de outra pessoa e veria holerite e ponto dela — outro gestor faz) (migrations `20261007200000` e `20261007220000`).
- **Escalas (RH): escrita só pelas RPCs `rh_escala_*`** — criar a semana é `rh:escalas:create`; turnos, publicação e decisão de troca são `rh:escalas:edit`, sempre com `:view` (nunca `rh:escalas:manage`, que não está no registry), conferindo o rascunho sob lock da escala. Publicar não tem volta e recebe os turnos que a tela mostrava (`ESCALA_ALTERADA` se mudaram). Valor-hora do RH é `valor_hora` ou, zerado, `salario/220` — Folha, Custos e o custo da escala (tela e servidor) usam a mesma regra. `authenticated` não tem INSERT/UPDATE/DELETE nas três tabelas, e `rh_escalas` tem SELECT por coluna sem `custo_projetado` (com um colaborador só, o custo revela o valor-hora): `select('*')` nela dá erro de permissão, e um `GRANT SELECT ... ON ALL TABLES` em migration futura reabre a coluna (migration `20261007220000`).
- **Batida de ponto é `rh_registrar_ponto`** — hora e dia do servidor, só o colaborador do próprio usuário, chave derivada que inclui o dia; a semente troca quando muda o tipo da batida (`sementeDaBatida`), senão ENTRADA → SAÍDA → ENTRADA com respostas perdidas devolveria a 1ª ENTRADA como se fosse a nova.
- Lookup de colaboradores por outras telas é RPC com colunas mascaradas por chave (`rh_listar_colaboradores`): ACCESS_CONTROL, "Particularidades".

## Commands, queries e eventos

- Commands: `rh_atualizar_colaborador`, `rh_escala_criar`, `rh_escala_adicionar_turno`, `rh_escala_remover_turno`, `rh_escala_publicar`, `rh_escala_decidir_troca`, `rh_folha_salvar_calculo`, `rh_folha_mudar_status`, `rh_registrar_ponto`; saga do Storage no cliente em `src/lib/rhDocumentStorageSaga.ts` (`registerRhDocument`), id derivado por `idDocumentoRh` (`src/domain/rh/idempotencia.ts`).
- Queries: `rh_listar_colaboradores`.

## Dependências

- Membership da unidade (o vinculado precisa ser membro). Storage: bucket `rh-documentos` com path iniciado por `company_id` (SECURITY, "Particularidades").
