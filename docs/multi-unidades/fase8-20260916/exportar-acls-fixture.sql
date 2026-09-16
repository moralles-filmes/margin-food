-- READ ONLY no template vazio local. A saída é SQL para o descartável, nunca para produção.
SELECT format('REVOKE ALL ON %s %I.%I FROM PUBLIC,anon,authenticated,service_role;',
 CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','reporting','log_private','multiunit_private') AND c.relkind IN ('r','p','v','m','S')
ORDER BY n.nspname,c.relname;
SELECT format('GRANT %s ON %s %I.%I TO %s%s;',a.privilege_type,
 CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,n.nspname,c.relname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(a.grantee::regrole::text) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
WHERE n.nspname IN ('public','reporting','log_private','multiunit_private') AND c.relkind IN ('r','p','v','m','S')
ORDER BY n.nspname,c.relname,a.grantee,a.privilege_type;
