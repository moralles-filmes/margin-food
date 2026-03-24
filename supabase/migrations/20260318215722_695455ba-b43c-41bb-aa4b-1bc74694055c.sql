UPDATE movimentacoes_estoque
SET quantidade = 0.5,
    custo_total = ROUND(0.5 * custo_unitario, 2)
WHERE id = 'a5adb157-0e05-4375-bd23-b07180416ac9'
  AND quantidade = 1.000
  AND origem = 'REQUISICAO_ESTOQUE'