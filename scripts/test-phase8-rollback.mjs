// Contenção final: execute somente depois dos demais ensaios no descartável.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
const users=JSON.parse(fs.readFileSync('.phase8.local/users.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
function sql(input) {
 const r=spawnSync('psql',['-X','-q','-w','-h','127.0.0.1','-p','56522','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}});
 if(r.status)throw Error('rollback SQL failed');return r.stdout.trim();
}
const snapshotSql=`CREATE TEMP TABLE fingerprint(name text, hash text);
 DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='r' AND (n.nspname IN ('public','reporting','log_private','multiunit_private')
 OR (n.nspname='storage' AND c.relname IN ('objects','buckets')) OR (n.nspname='auth' AND c.relname='users')) LOOP
 EXECUTE format('INSERT INTO fingerprint SELECT %L,md5(coalesce(string_agg(to_jsonb(t)::text,%L ORDER BY to_jsonb(t)::text),%L)) FROM %I.%I t',r.nspname||'.'||r.relname,'','',r.nspname,r.relname);
 END LOOP; END $$;
 SELECT jsonb_object_agg(name,hash) FROM fingerprint;`;
const before=JSON.parse(sql(snapshotSql));let checks=0;
function ok(value,label){if(!value)throw Error(label);checks++;console.log('PASS',label);}
ok(Object.keys(before).length>100,'snapshot abrangente de dados sintéticos');
sql(fs.readFileSync('docs/multi-unidades/fase8-20260916/pos-validacao.sql','utf8'));
ok(true,'pós-validação do candidato antes do recuo');
sql(fs.readFileSync('supabase/rollback/phase8_fail_closed.sql','utf8'));
const after=JSON.parse(sql(snapshotSql));
ok(JSON.stringify(before)===JSON.stringify(after),'dados, identidades, memberships, saldos, custos, históricos e objetos preservados');
ok(sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime'")==='0','consumers Realtime contidos');
ok(sql("SELECT NOT has_function_privilege('authenticated','public.can_access_company_document(text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.can_access_company_document(text,text)','EXECUTE') AND NOT has_function_privilege('service_role','public.can_access_company_document(text,text)','EXECUTE')")==='t','Storage fechado sem reabrir serviço/anon');
const client=createClient(runtime.API_URL,runtime.ANON_KEY,{accessToken:async()=>users.a.token,global:{headers:{'x-company-id':'b8000000-0000-4000-8000-000000000001'}}});
ok(!!(await client.storage.from('rh-documentos').download('c8000000-0000-4000-8000-000000000001/phase8.txt')).error,'download HTTP negado após contenção');
fs.writeFileSync('.phase8.local/rollback-result.json',JSON.stringify({checks,unchangedTables:Object.keys(before).length,realStorage:true},null,2));
