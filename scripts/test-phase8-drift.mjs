// Alterações sintéticas em transações revertidas, apenas na stack de ensaio.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
const storage=fs.readFileSync('docs/multi-unidades/fase8-20260916/preflight.sql','utf8').replace('BEGIN TRANSACTION READ ONLY;','').replace('ROLLBACK;','');
const realtime=fs.readFileSync('docs/multi-unidades/fase8-20260916/preflight-realtime.sql','utf8').replace('BEGIN TRANSACTION READ ONLY;','').replace('ROLLBACK;','');
const old=fs.readFileSync('docs/multi-unidades/fase8-20260916/definicao-anterior.sql','utf8');
const cases=[
 ['function',"ALTER FUNCTION public.can_access_company_document(text,text) SET search_path=public;",storage],
 ['resolver',"ALTER FUNCTION public.get_current_company_id() SET search_path=public;",storage],
 ['acl','GRANT EXECUTE ON FUNCTION public.can_access_company_document(text,text) TO anon;',storage],
 ['overload',"CREATE FUNCTION public.can_access_company_document(text) RETURNS boolean LANGUAGE sql AS 'SELECT true';",storage],
 ['parallel policy','CREATE POLICY phase8_open ON storage.objects FOR SELECT TO authenticated USING(true);',storage],
 ['changed policy','ALTER POLICY company_documents_read ON storage.objects USING(true);',storage],
 ['public bucket',"UPDATE storage.buckets SET public=true WHERE id='rh-documentos';",storage],
 ['path',"UPDATE storage.objects SET name='../synthetic' WHERE name LIKE '%phase8.txt' AND name LIKE 'c8000000%000001/%';",storage],
 ['publication options',"ALTER PUBLICATION supabase_realtime SET (publish='insert');",realtime],
 ['publication tables','ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;',realtime],
];
for(const [label,change,guard] of cases){
 const sql='BEGIN;\n'+old+';\nALTER PUBLICATION supabase_realtime SET (publish=\'insert,update,delete,truncate\');\n'+change+'\n'+guard+'\nROLLBACK;';
 const r=spawnSync('psql',['-X','-w','-h','127.0.0.1','-p','56522','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}});
 if(!r.status||!r.stderr.includes('PHASE8_'))throw Error('drift not refused '+label+' '+r.stderr.slice(-300));
 console.log('PASS drift',label);
}
console.log('PASS 10 drift refusals');
