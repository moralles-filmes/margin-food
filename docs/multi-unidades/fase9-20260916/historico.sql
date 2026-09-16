-- READ ONLY. Nunca retorna statements, nomes de atores, segredos ou payloads históricos.
BEGIN READ ONLY;
SELECT now() captured_at, version, name, cardinality(statements) statement_count,
 md5(array_to_string(statements,E'\n')) statements_md5,
 md5(replace(array_to_string(statements,E'\n'),E'\r\n',E'\n')) statements_lf_md5,
 (SELECT jsonb_agg(md5(s) ORDER BY ord) FROM unnest(statements) WITH ORDINALITY a(s,ord)) statement_hashes,
 (SELECT jsonb_agg(md5(btrim(regexp_replace(replace(s,E'\r\n',E'\n'),';[[:space:]]*$',''),E' \n\r\t')) ORDER BY ord) FROM unnest(statements) WITH ORDINALITY a(s,ord)) statement_normalized_md5,
 created_by IS NOT NULL has_created_by, idempotency_key IS NOT NULL has_idempotency_key,
 cardinality(rollback) rollback_count
FROM supabase_migrations.schema_migrations ORDER BY version;
ROLLBACK;
