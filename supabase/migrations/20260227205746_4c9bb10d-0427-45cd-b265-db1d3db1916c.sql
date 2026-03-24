ALTER TABLE movimentacoes_estoque DROP CONSTRAINT movimentacoes_estoque_tipo_check;

ALTER TABLE movimentacoes_estoque ADD CONSTRAINT movimentacoes_estoque_tipo_check CHECK (tipo = ANY (ARRAY[
  'ENTRADA'::text, 'SAIDA'::text, 'AJUSTE'::text, 'BAIXA_PERDA'::text,
  'ENTRADA_ESTORNO'::text, 'SAIDA_ESTORNO'::text,
  'ENTRADA_COMPRA'::text, 'ENTRADA_INICIAL'::text,
  'SAIDA_CONSUMO'::text, 'SAIDA_REQUISICAO'::text, 'SAIDA_PERDA'::text,
  'SAIDA_AJUSTE_NEGATIVO'::text, 'SAIDA_VENCIMENTO'::text, 'SAIDA_TRANSFERENCIA'::text
]));