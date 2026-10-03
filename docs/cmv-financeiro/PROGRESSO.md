# Progresso — CMV Financeiro

Checkpoint por fase. Diagnóstico e decisões: [`PLANO.md`](./PLANO.md). Branch: `feat/cmv-financeiro`, com PR aberto para `main` (sem merge).

---

## Estado atual (2026-10-03)

Fases 0 a 6 concluídas no código e auditadas. **A migration NÃO foi aplicada em produção**: a aplicação foi recusada na confirmação e o banco ficou intacto (só houve leituras). Ela existe como arquivo e rodou apenas em PostgreSQL local descartável. Ordem segura: aplicar a migration antes ou depois do merge — o frontend novo detecta a ausência das RPCs e esconde o CMV (roteiro em "Ativação").

Conferido em produção (somente leitura, 2026-10-03): última migration `20261003120000`; as assinaturas atuais de `_guarded_create/update_conta_pagar` são as que a migration substitui (`20261001160354`); nenhuma coluna/trigger de CMV existe; PG 17.6; `fin_config` tem PK `(company_id, key)`, `fin_audit_logs` não tem CHECK de entidade/ação; `fin_categorias.tipo` usa `despesa`/`receita`.

## Fase 0 — Diagnóstico ✅

- Schema vivo lido por MCP (somente leitura): tabelas, triggers, policies e corpo das RPCs de Contas a Pagar.
- Baseline antes de qualquer mudança: `vitest` 162 arquivos / 1502 testes ✅ · `tsc -p tsconfig.app.json` ✅.
- Decisões registradas no `PLANO.md` §3.

## Fases 1–2 — Persistência e Contas a Pagar ✅

### Arquivos criados
- `supabase/migrations/20261003140000_cmv_financeiro.sql` — colunas `cmv_incluir` (rateio e título) e `cmv_sugerir` (categoria), chaves RBAC, helpers internos `_fin_cmv_*`, RPCs `get_fin_cmv_financeiro`, `list_fin_cmv_linhas`, `get_fin_cmv_config`, `fin_cmv_set_ativo`, `fin_cmv_set_categoria_padrao`, `fin_cmv_classificar`; `_guarded_create/update_conta_pagar` ganham `p_cmv` (opcional).
- `supabase/tests/database/cmv_financeiro_ephemeral.sql` — integração em banco real descartável.
- `src/components/financeiro/cmv/CmvDecisaoToggle.tsx`, `src/components/financeiro/ContaFormCmv.test.tsx`.

### Arquivos alterados
- `src/components/financeiro/ContaFormDialog.tsx` — pergunta Sim/Não (título e por linha), "Marcar/Desmarcar todas", resumo Total/Incluído/Fora/Pendente, competência usada, sugestão pelo padrão da categoria com aviso quando a categoria é trocada.
- `src/components/financeiro/ContasPagarSection.tsx` — carrega a configuração, envia `p_cmv`, `id` e `cmv_incluir` das linhas **só** quando o recurso existe no banco.
- `src/components/financeiro/ContaDetailDialog.tsx` — coluna "CMV financeiro" no detalhe.
- `src/permissions/registry.ts` — subtab `financeiro:cmv` (view, export, manage).

## Fase 3 — Motor analítico ✅

- `src/domain/financeiro/cmv/` — `period.ts` (modos, anterior, corte, faixas), `report.ts` (contrato do payload, fórmulas, lados, árvore, série, insights, avisos), `rateio.ts`, `cores.ts`.
- `src/hooks/useCmvFinanceiro.ts` — consultas (React Query, chave por unidade + filtro, cancelamento) e escritas.

## Fase 4 — Telas ✅

- `src/components/financeiro/cmv/` — `CmvFinanceiroSection` (cabeçalho, filtros, avisos, abas), `CmvCards`, `CmvVisaoGeral`, `CmvAnaliseCategoria` (+ demonstrativo), `CmvComparativo`, `CmvRegrasVinculo`, `CmvBoletosDialog` (origem dos valores e revisão em lote), `cmvCharts`.
- `src/components/FinanceiroView.tsx` — item "CMV" em Financeiro → Relatórios & Análise.

## Fase 5 — PDF ✅

- `src/lib/cmvFinanceiroPdfExport.ts` (A4 paisagem, vetorial, snapshot único) e `CmvExportSheet.tsx` (Exportar tudo / Personalizar, atalhos, prévia com as páginas reais do documento que será baixado).
- A prévia é o mapa de páginas do próprio documento gerado, não um PDF embutido: a CSP de produção (`object-src 'none'`, `frame-src` → `'self'`) impede `blob:` em iframe e não foi afrouxada.

## Fase 6 — Revisão ✅

### Validação
```
vitest run                       169 arquivos / 1608 testes  ✅  (baseline 162 / 1502)
tsc --noEmit -p tsconfig.app.json                            ✅
eslint (arquivos novos)                                      ✅  0 erros, 0 avisos
vite build                                                   ✅
bun run rbac:lint                                            ✅  PASS (2 avisos preexistentes em admin-users)
psql cmv_financeiro_ephemeral.sql (PostgreSQL 16 local)      ✅  cmv_financeiro_ephemeral: OK
```
- Banco real (descartável): a migration aplica do zero e passam os cenários de rateio (R$ 2.150 → R$ 1.800), competência × vencimento × pagamento, pagamento parcial, estorno, cancelamento, parcelas, boleto sem competência, cliente antigo, idempotência, edição preservando o id do rateio, lock otimista, lote tudo-ou-nada, auditoria, permissões e isolamento entre unidades.
- Visual: telas reais renderizadas com dados fictícios (harness local fora do build) em 1440, 1354, 768 e 390 px; PDFs das quatro combinações renderizados página a página. Capturas e PDFs em [`evidencias/`](./evidencias).

### Auditoria independente (2 revisores, análise estática) — 0 bloqueantes, 7 correções

Corrigido e coberto por teste (banco local e/ou vitest):
1. **Escrita direta fora das RPCs** — as policies já existentes aceitavam `UPDATE` de `cmv_incluir` e `upsert` de `fin_config.cmv_financeiro_ativo` pelo PostgREST, sem `financeiro:cmv:manage`, lock nem auditoria. Triggers `trg_fin_cmv_guard_decisao` (título e rateio) e `trg_fin_cmv_guard_config` recusam a escrita do papel `authenticated`; nenhuma policy foi alterada.
2. **Edição apagava decisão já tomada** — com a classificação ativa, `_guarded_update_conta_pagar` recusa (`CMV_DECISAO_OBRIGATORIA`) devolver para pendente a mesma linha de rateio ou o título; o formulário bloqueia o salvar no mesmo caso. Pendência herdada do histórico continua aceita.
3. **Lote com versão antiga** — a seleção da revisão em lote é reconciliada a cada recarga, perde as linhas do boleto alterado individualmente e é limpa quando o lote falha.
4. **Desfazer rateio com respostas diferentes** — não aplica mais a resposta da 1ª linha ao valor cheio; a decisão fica em branco com aviso.
5. **Detalhe de "(lançado direto)"** — `list_fin_cmv_linhas` ganhou `p_so_direto`; o detalhe lista só o valor da linha clicada.
6. **PDF "Boletos de origem"** — se a soma das linhas lidas não fecha com o CMV do snapshot, o PDF não é gerado; o aviso "dados mudaram" compara conteúdo, não a referência do objeto.
7. **Edição aberta antes de a configuração do CMV carregar** — salva como cliente antigo (o servidor preserva as decisões) em vez de enviar decisões em branco.

Aceito / em aberto (P3):
- `_fin_cmv_payload` e `_fin_cmv_lista` leem todos os boletos da unidade a cada chamada (necessário para "pendentes" e "sem competência" gerais). Medir com `EXPLAIN` numa unidade grande depois de aplicar; se pesar, filtrar o período antes.
- Reenvio de criação (`p_idempotency_key`) depois que a unidade ativa a classificação, ou depois que o boleto foi reclassificado, devolve erro em vez de "já registrado".
- `fin_cmv_classificar` em boleto legado cuja soma do rateio já excede o valor falha pelo trigger de soma, sem dizer qual boleto.
- Parcela gerada depois por `gerar_parcela_recorrente` nasce pendente (não herda a decisão).
- `financeiro:cmv:view` mostra descrição/fornecedor/vencimento dos boletos sem exigir `financeiro:pagar:view` (hoje só admin/diretor/gerente_geral têm a chave).
- Período encerrado é comparado com o anterior mesmo com durações diferentes (28 × 31 dias); a tela avisa, mas a variação em R$ não é normalizada.
- Aba aberta depois da meia-noite: o atalho "período atual" usa o dia em que a tela foi aberta (os números usam o dia do servidor).

### Diferenças assumidas em relação aos mockups
1. **Shell global** (sidebar, cabeçalho, seletor de empresa) é o do sistema; só o conteúdo interno segue o design.
2. **Coluna "Status" (Atenção/Crítico)** não existe: não há meta de CMV financeiro por categoria.
3. **"Comparar com"** é texto com as datas do período anterior (a única comparação definida), não um seletor.
4. **Card 4** chama-se "Variação do CMV em R$" e mostra só custo (o mockup misturava variação de faturamento).
5. **Série "Total Mercadorias"** não existe: é o próprio CMV.
6. **Toggle Sim/Não** em vez de switch: sem resposta, nenhuma opção fica marcada.
7. **Faixa de avisos** e bloco "Qualidade da apuração" acrescentados (incompletude precisa ser visível).
8. **Card de indicador próprio** (`CmvIndicadorCard`) em vez do `KpiCard`, cujo layout não comporta as três linhas do design aprovado.
9. **Cores de categoria** calculadas pelo índice estável do cadastro, não pela paleta fixa.

### Não verificado
- Aplicação da migration no banco de produção (não autorizada) — inclusive os triggers que só existem lá (`audit_trigger_fn`, `fin_set_entity_report_exclusion`, `fin_rateio_valida_empresa`); o teste local usa o gatilho real de soma do rateio e simula tenant/permissão.
- As travas de escrita direta dependem de o PostgREST rodar como papel `authenticated` e de as RPCs pertencerem a outro papel (owner) — é o padrão do Supabase, exercitado só no banco local. Conferir em produção logo após aplicar: um `UPDATE ... SET cmv_incluir` pelo cliente deve falhar e a edição normal de um boleto deve continuar passando.
- As correções da auditoria na tela (lote, PDF de boletos, detalhe "lançado direto", corrida na edição) têm typecheck e a suíte passando, mas só o item do formulário ganhou teste próprio; não foram reexercitadas no navegador.
- Fluxo ponta a ponta com login real no navegador (sem credenciais neste ambiente); a tela foi exercitada com cliente Supabase simulado.
- Dark mode e larguras 1280/1024 só por inspeção de código/1 captura.
- `supabase/tests/database/*` antigos não foram reexecutados.

## Ativação (requer autorização)

1. **Migration primeiro.** MCP `apply_migration` com o conteúdo de `20261003140000_cmv_financeiro.sql`; renomear o arquivo local para a versão que o MCP gravar (regra do repo; nunca `supabase db push`). É aditiva e compatível com o frontend atual: quem não envia `p_cmv` continua funcionando.
2. **Frontend.** PR `feat/cmv-financeiro` → `main` (deploy Vercel). Antes da migration o formulário de Contas a Pagar fica como hoje e a tela do CMV mostra "ainda não ativado neste ambiente".
3. **Permissões.** As chaves `financeiro:cmv:*` (11 ações) **já existiam** em produção, geradas pela carga do catálogo, e já estavam em `role_permissions` de admin/diretor/gerente_geral; a migration só ajusta a descrição de view/export/manage. Há também concessões individuais em `user_permissions` — 5 ALLOW e 1 DENY, todas de admins ativos da própria unidade, em 2 unidades —, então a exposição não muda; o admin com DENY não verá o relatório até alguém liberar. Demais usuários: Admin → Permissões. Rodar `sync_permissions_from_registry` se a tela não listar a subtab.
4. **Por unidade.** CMV → Regras de vínculo: definir os padrões por categoria, ligar "Pedir a resposta nos novos boletos" e revisar as pendências do histórico (nada é classificado automaticamente).

## Reversão

- **Desligar sem deploy:** desativar "Pedir a resposta nos novos boletos" (o formulário volta ao comportamento anterior) e/ou retirar `financeiro:cmv:view`.
- **Reverter o frontend:** revert do PR. As RPCs novas aceitam o cliente antigo; nada precisa ser desfeito no banco.
- **Banco:** não remover as colunas — as classificações já feitas ficam preservadas e são ignoradas pelo sistema antigo. Se for indispensável voltar as duas RPCs de Contas a Pagar, recriar a assinatura anterior a partir de `20261001160354_financeiro_codigos_pagamento.sql`.

## Pendências

- Aplicar/publicar (acima) e, depois, classificar o histórico por unidade.
- Regenerar `src/integrations/supabase/types.ts` após a migration (as chamadas novas usam `rpc` sem tipo gerado).
- Avaliar meta de CMV financeiro por categoria se o negócio quiser a coluna "Status".
