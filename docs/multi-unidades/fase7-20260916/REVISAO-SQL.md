# Revisão de contratos SQL — Fase 7

O [catálogo vivo](catalogo-vivo.json) contém as 356 assinaturas/overloads (297 SECURITY DEFINER), corpos completos, defaults, retorno, owner, search_path e EXECUTE efetivo. A [matriz](matriz.json) localiza callers TS/SQL, writers transitivos, triggers, políticas e relações em ambas as direções. Os 54 retornos `trigger` não são RPCs invocáveis normalmente. As 35 funções de extensão não foram confundidas com APIs de negócio. [Alterações locais](alteracoes-locais.json) registra antes/depois dos 19 objetos de função alterados, incluindo cinco mudanças somente de ACL.

**Inventário completo não significa certificação semântica de todos os ramos.** A autorização real foi exercitada nos caminhos dos testes SQL e regressões; os contratos residuais abaixo impedem assinar o aceite integral de SECURITY DEFINER. Não transformar a presença textual de um guard em aprovação.

## Decisões verificadas e implementadas

| Objeto/caminho | Evidência e decisão |
|---|---|
| 140 tabelas no candidato | authenticated herdava TRUNCATE/TRIGGER/REFERENCES/MAINTAIN diretamente; RLS não contém TRUNCATE. Revogar esses privilégios; manter DML com suas policies. Oito tabelas já estavam contidas pelas fases anteriores; `z_canary_test` não tinha acesso cliente. |
| Cinco materialized views de public | Owner postgres, caches globais sem RLS, SELECT cliente; sem consumer direto local/publicado localizado. Revogar leitura cliente. Não converter a security_invoker nem reconstruir dados. |
| Quatro materialized views de reporting | Owner-only; `refresh_materialized_views()` usa lista fixa de quatro nomes qualificados. Manter scheduler/wrapper protegido da Fase 2. |
| get_or_set_cache / set_cache | Chave arbitrária, sem tenant/ação; acesso permite ler/substituir payload do cache. Sem caller aplicativo publicado/local localizado. Owner-only. |
| refresh_saldo_cache(uuid) | Writer de cache financeiro por UUID; dois callers de trigger definer preservados. Owner-only, corpo/fórmula intactos. |
| rbac_top_legacy_usage / rbac_sql_lint_report_internal | Relatórios internos globais expostos. Wrapper autorizado chama o segundo como owner; nenhuma concessão extra de serviço. Owner-only. |
| create_purchase_order_atomic / edit_purchase_order_atomic | Tenant existente; faltava gate de ação. ALLOW granular de Compras + aliases legados + global, com DENY legado testado. FKs compostas bloqueiam produto/pedido cruzado. |
| ficha_salvar_componente_itens_atomic | Edge fazia gate, SQL público não. Gate edit por tipo do pai, com aliases existentes; mantém lock do pai e transação. FKs compostas pai/filho/produto. |
| batch_reorder_fin_categorias / reorder_fin_categoria | Gate financeiro:cadastros:edit/manage; reorder filtra tenant antes de bloquear categoria. Mantidos retornos e algoritmo. |
| fin_audit_integrity_check | Relatório usa financeiro:auditoria:view/finance:read/global; sem alteração das verificações financeiras. |
| get_stock_dashboard / get_stock_predictive_analysis_v2 / get_stock_losses_report / get_stock_top_consumed / get_inactive_stock_items | Gates das telas dashboard/preditivo/perdas/ranking, mantendo stock:read/global. As duas últimas leituras de saldo passam ao cache produtos.saldo_atual; consumo histórico mantém suas agregações originais. |
| get_all_saldos_contas | Gate financeiro:contas:view/finance:read/global. Fórmula financeira intacta. |
| get_saldo_produto | Leitura passa ao cache de produtos da unidade. UUID estrangeiro retorna zero, contrato preservado. Gate funcional adicional não foi presumido: requisicao-estoque publicada usa esta RPC em diferentes ações. |
| mark_all_notifications_read | Filtrava somente recipient_user_id, atravessando unidades do mesmo usuário. Agora assert_tenant + company_id + destinatário; usuário multi A/B e outro destinatário testados. |
| _guarded_bulk_upsert_orcamento | Delega a _guarded_upsert_orcamento/_guarded_delete_orcamento; ausência de literal de permissão no wrapper não foi classificada como bypass. Array vazio não escreve. |
| list_purchase_orders_cursor | Gate delegado a has_compras_view; não é um leitor sem autorização apenas por ausência de literal has_permission. |
| fn_recompute_product_saldo | Owner-only no vivo; caller fn_update_product_stock definer. Não reabrir nem trocar fórmula; manutenção de cache não é RPC de leitura. |
| recalc_product_costs | Continua exposto no vivo; contenção herdada da Fase 6 preservada e regressão passou. Não restaurar EXECUTE para authenticated/service. |

## Contratos residuais e aceite bloqueado

| Grupo | Constatação / dependência exata |
|---|---|
| get_catalog_counts, get_saldo_produtos, get_saldo_produto | Escopo por empresa conferido, mas autorização funcional compartilhada entre Catálogo, Inventário e requisição requer matriz completa por ação, inclusive callers Edge. Estes endpoints não receberam certificação de menor privilégio. Nenhum gate arbitrário foi imposto para quebrar consumers. |
| get_saldo_conta; get_stock_consumption_history; get_stock_predictive_analysis v1 | Definers tenant-scoped sem gate funcional; nenhum caller aplicativo atual localizado além de tipos. V1 ainda usa ledger para saldo e colunas legadas. Resolver contrato de compatibilidade/consumers externos antes de substituir ou fechar API; ausência em fonte não prova ausência de cliente externo. Não invocar como saldo certificado. |
| compute_requisicao_status_agregado; count_requisicoes_with_pending_items | Pai validado por empresa, joins de itens por UUID sem filtro adicional de company_id. Sem gate funcional específico. FKs simples destes itens permanecem; falta ensaio dedicado de criação/atendimento e contagens com vínculos cruzados. |
| fin_get_limite_aprovacao_atual | Wrapper usa empresa contextual e helper interno; falta decidir se configuração é informação de toda a unidade ou exige ações de CP. Não confundir self-context com gate funcional. |
| Overloads text/text de relatórios | Wrappers legados referenciam implementações `_get_relatorios_*_impl` ausentes no catálogo. Não excluídos nem substituídos: validar resolução PostgREST e compatibilidade antes de remover. |
| turnos INSERT/UPDATE/DELETE | Sem writer UI atual localizado; policies ainda admitem settings:manage/global e candidatos configuracoes:turnos:* fora do registry. SELECT do inventário foi corrigido; gestão de turnos não recebeu módulo fictício nem concessão em massa. |
| Demais FKs simples | As 120 relações tenant↔tenant foram verificadas por agregados. Zero cruzados operacionais no snapshot não impede inserções futuras. Oito caminhos receberam constraints e testes nesta fase; os demais, incluindo vínculos de RH, exigem validação semântica/ensaio por writer antes de declarar impossibilidade de referências cruzadas. |
| salmon_purchase_targets | Tabela legada ainda tem unique global de período/categoria, sem caller atual localizado. Não foi alterada junto aos três conflitos de consumers ativos. |
| debug_tenant / helpers de identidade | debug_tenant devolve dados do próprio auth.uid e empresa de origem; não vira preferência de navegação. Está sem search_path fixo, como fn_recompute_product_saldo e trg_force_company_alertas_falta. Reavaliar hardening e privilégios CREATE/schema em release integrado; não foi aberta permissão. |
| z_canary_test | Única tabela sem RLS; classificada indeterminada, cliente sem privilégio. Confirmar finalidade/owner antes de remover ou tenantizar. |
| FORCE RLS | 47 tabelas sem FORCE no snapshot, incluindo globais/históricas e operacionais. Não convertido em massa; owners com BYPASSRLS continuariam passando. Revisão dos caminhos owner/definer continua necessária. |

O único comando dinâmico `EXECUTE` localizado nos definers de negócio é o refresh de materialized views com lista fixa; não foi encontrado nome SQL fornecido pelo usuário nesse caminho. Isso não certifica SQL construído por integrações externas. Os corpos de 17 Edges foram lidos apenas para localizar callers SQL, com hash/versão em [edge-sql-callers.json](edge-sql-callers.json); JWT, Storage, Realtime e jobs continuam na Fase 8.

Aliases e regex são localizadores. A matriz AST resolve variáveis pelo escopo lexical e desembrulha casts em `.rpc`; não resolve execução dinâmica em runtime nem todos os indiretos JavaScript. Toda linha não coberta pelo ensaio permanece explicitamente sem certificado de ponta a ponta.
