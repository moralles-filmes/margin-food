
-- Add estoque:requisicoes:view and estoque:requisicoes:create to produtos_select RLS
-- so operators with only Requisição access can read products
DROP POLICY IF EXISTS produtos_select ON public.produtos;
CREATE POLICY produtos_select ON public.produtos
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'stock:read',
      'estoque:geral:view',
      'estoque:cadastros:view',
      'estoque:catalogo:view',
      'estoque:saldo:view',
      'estoque:requisicoes:view',
      'estoque:requisicoes:create',
      'estoque:dashboard:view',
      'estoque:movimentacoes:view',
      'estoque:consumo:view',
      'estoque:ranking:view',
      'estoque:perdas:view',
      'estoque:transferencias:view',
      'estoque:preditivo:view',
      'estoque:simulador:view',
      'cmv:categoria:view',
      'cmv:top-itens:view',
      'cmv:setor:view',
      'cmv:semanal:view',
      'cmv:precos:view',
      'cmv:simulador:view',
      'system:global:manage'
    ])
  );
