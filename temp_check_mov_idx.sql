-- Check indexes for movimentacoes_estoque
SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'movimentacoes_estoque';

-- Check row count for movimentacoes_estoque
SELECT count(*) FROM movimentacoes_estoque;
