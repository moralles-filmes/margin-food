-- ── Cadastros usados como lista de escolha por outras telas ──
-- Várias telas leem um cadastro de outro submódulo direto pelo PostgREST para
-- montar a lista de escolha (conta bancária, categoria, centro de custo,
-- fornecedor), mas a RLS de SELECT só aceitava a chave do submódulo dono do
-- cadastro. Quem tem só a chave da tela consumidora via a lista vazia, sem erro
-- nenhum. Caso real: Contas a Pagar com financeiro:pagar:* e sem
-- financeiro:contas:view/financeiro:cadastros:view — conta bancária e categoria
-- vazias, boletos lançados sem classificação e baixa impossível.
--
-- Regra: cadastro consumido por outra tela recebe uma policy de leitura só das
-- linhas ATIVAS da empresa atual, para as chaves :view das telas consumidoras
-- (mesmo desenho de operational_active_lookup em stock_categories/locations/
-- sectors, migration 20260916153928). Isto não autoriza escrita.
-- Só chaves :view: as telas exigem :view antes de carregar dados, então ação
-- sem view (reconcile, create) não abriria tela nenhuma — só leitura avulsa.
-- RLS é por linha: quem usa a tela consumidora também lê banco/agência/conta e
-- saldo inicial das contas ativas da própria unidade. Aceito: é o perfil que
-- paga e recebe por essas contas.
-- Todas as chaves já existem em src/permissions/registry.ts. A policy
-- RESTRICTIVE multiunit_scope_boundary continua valendo por cima.

-- Contas bancárias: Contas a Pagar/Receber, Livro Razão e Conciliação.
CREATE POLICY operational_active_lookup ON public.fin_contas
FOR SELECT TO authenticated USING (
  ativo AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:pagar:view',
      'financeiro:receber:view',
      'financeiro:lancamentos:view',
      'financeiro:conciliacao:view'
    ]::text[]))
);

-- Categorias: as mesmas telas, mais Categorização (regras) e Fechamento de
-- Caixa → Marcas (vínculo marca→categoria).
CREATE POLICY operational_active_lookup ON public.fin_categorias
FOR SELECT TO authenticated USING (
  ativo AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:pagar:view',
      'financeiro:receber:view',
      'financeiro:lancamentos:view',
      'financeiro:conciliacao:view',
      'financeiro:categorizacao:view',
      'financeiro:fechamento:view'
    ]::text[]))
);

CREATE POLICY operational_active_lookup ON public.fin_centros_custo
FOR SELECT TO authenticated USING (
  ativo AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:pagar:view',
      'financeiro:receber:view',
      'financeiro:lancamentos:view',
      'financeiro:conciliacao:view',
      'financeiro:categorizacao:view'
    ]::text[]))
);

-- Rateio de título é parte do título. A leitura só aceitava
-- financeiro:lancamentos:view: quem tem só Contas a Pagar abria a edição do
-- boleto sem o rateio e, ao salvar, _guarded_update_conta_pagar recebia o
-- rateio vazio e apagava as linhas (com a decisão do CMV de cada uma).
-- Libera só o rateio cujo pai é um título que a pessoa já enxerga.
CREATE POLICY titulo_rateio_read ON public.fin_lancamento_rateios
FOR SELECT TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (
    (
      (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view']::text[]))
      AND EXISTS (
        SELECT 1 FROM public.fin_contas_pagar cp
        WHERE cp.id = fin_lancamento_rateios.lancamento_id
          AND cp.company_id = fin_lancamento_rateios.company_id
      )
    )
    OR (
      (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:view']::text[]))
      AND EXISTS (
        SELECT 1 FROM public.fin_contas_receber cr
        WHERE cr.id = fin_lancamento_rateios.lancamento_id
          AND cr.company_id = fin_lancamento_rateios.company_id
      )
    )
  )
);

-- Fornecedores: acrescenta Cotação e Calendário de Compras, Salmão (entradas,
-- manipulação, planejamento) e o Simulador do Planejamento. Fornecedor não é
-- dado sensível e o histórico (entrada de salmão com fornecedor hoje inativo)
-- precisa do nome, por isso todas as linhas e não só as ativas.
-- ALTER POLICY preserva o nome (referenciado pelo pacote do release F12).
ALTER POLICY "compras:fornecedores:view suppliers" ON public.suppliers
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:view', 'compras:lista:view', 'compras:pedidos:view',
      'compras:cotacao:view', 'compras:cotacao:create', 'compras:calendario:view',
      'financeiro:cadastros:view', 'financeiro:pagar:view', 'financeiro:conciliacao:view', 'finance:read',
      'salmon:entradas:view', 'salmon:manipulacao:view', 'salmon:planejamento:view',
      'planning:simulador:view',
      'system:global:manage'
    ]))
  );

-- Parâmetros do Salmão: Salmão → Estoque e Configurações → Salmão mostravam os
-- padrões (50/30/7) em vez dos limites salvos, e os alertas saíam errados.
ALTER POLICY salmon_config_select ON public.salmon_config
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'salmon:dashboard:view', 'salmon:manipulacao:view', 'salmon:entradas:view',
      'salmon:estoque:view', 'configuracoes:salmon:view',
      'system:global:manage'
    ]))
  );
