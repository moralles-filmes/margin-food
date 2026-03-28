-- Check row count for produtos
SELECT count(*) FROM produtos;

-- Check indexes for produtos
SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'produtos';

-- Check for slow queries or current settings
SHOW statement_timeout;
