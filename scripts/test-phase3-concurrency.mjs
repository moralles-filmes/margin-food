import { spawn } from 'node:child_process';
import fs from 'node:fs';
const database=process.argv[2];
const port=process.argv[3]??'15440';
if(!/^moralles_phase3_test_[a-zA-Z0-9_]+$/.test(database??'')||!/^\d+$/.test(port))throw Error('Requires a local disposable phase3 database');
const args=['-X','-w','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
function query(sql,onData){
 return new Promise((resolve,reject)=>{
  const p=spawn('psql',args,{windowsHide:true});let out='',err='';
  p.stdout.on('data',d=>{out+=d;onData?.(String(d));});p.stderr.on('data',d=>err+=d);
  p.on('error',reject);p.on('exit',code=>code===0?resolve(out.replaceAll('\r','')):reject(Error(err)));
  p.stdin.end(sql);
 });
}
function ok(value,label){if(!value)throw Error('FAILED: '+label);console.log('PASS '+label);}
await query(`DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase3_test_%' OR inet_server_addr()<>'127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('b3000000-0000-4000-8000-000000000001','Concurrency fixture');
INSERT INTO auth.users(id,email) VALUES('a3000000-0000-4000-8000-000000000001','phase3-concurrency@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('a3000000-0000-4000-8000-000000000001','Fixture','phase3-concurrency@example.test','b3000000-0000-4000-8000-000000000001');
INSERT INTO company_memberships(user_id,company_id) VALUES('a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001');
INSERT INTO permissions(key,description,module,submodule,action) VALUES('configuracoes:auditoria-sistema:view','Fixture','configuracoes','auditoria-sistema','view');
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('a3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','configuracoes:auditoria-sistema:view','ALLOW');
INSERT INTO stock_categories(id,name,company_id) VALUES('c3000000-0000-4000-8000-000000000001','Concurrent resource','b3000000-0000-4000-8000-000000000001');
ALTER TABLE audit_logs DISABLE TRIGGER stamp_log;
INSERT INTO audit_logs(entity,entity_id,module,action) SELECT 'stock_categories','c3000000-0000-4000-8000-000000000001','estoque','CONCURRENT_LEGACY' FROM generate_series(1,2);
ALTER TABLE audit_logs ENABLE TRIGGER stamp_log;`);
let releaseReady;
const ready=new Promise(r=>releaseReady=r);
const workerA=query(`BEGIN; SET LOCAL ROLE service_role; SELECT backfill_log_scope('audit_logs',1,false); SELECT 'WORKER_A_LOCKED'; SELECT pg_sleep(2); COMMIT;`,chunk=>{if(chunk.includes('WORKER_A_LOCKED'))releaseReady();});
await Promise.race([ready,workerA.then(()=>{throw Error('Missing synchronization marker');})]);
const [workerB,writer,locked]=await Promise.all([
 query(`BEGIN; SET LOCAL ROLE service_role; SELECT backfill_log_scope('audit_logs',500,false); COMMIT;`),
 query(`INSERT INTO stock_categories(name,company_id) VALUES('New concurrent write','b3000000-0000-4000-8000-000000000001');`),
 query(`SET lock_timeout='200ms'; UPDATE stock_categories SET name='Should wait' WHERE id='c3000000-0000-4000-8000-000000000001';`).then(()=>false,e=>String(e).includes('lock timeout')),
]);
const workerAResult=await workerA;
ok(workerAResult.includes('"scanned": 1')&&workerB.includes('"scanned": 1'),'two real connections classify distinct rows with SKIP LOCKED');
ok(writer.includes('INSERT 0 1'),'new writer operates while historical batch is open');
ok(locked,'resource FOR SHARE prevents concurrent reassignment/deletion during classification');
ok((await query(`SELECT count(*)=2 FROM audit_logs WHERE action='CONCURRENT_LEGACY' AND log_scope='TENANT';`)).trim()==='t','both historical rows assigned once');
ok((await query(`SET ROLE service_role; SELECT (backfill_log_scope('audit_logs',500,false)->>'scanned')::integer=0;`)).trim().endsWith('t'),'reexecution consumes no classified rows');

// Carga sintética para plano de acesso; não usa payload ou identidade de produção.
await query(`SET ROLE service_role;
INSERT INTO audit_logs(company_id,source,module,entity,entity_id,action,scope_reason)
SELECT 'b3000000-0000-4000-8000-000000000001','db','estoque','stock_categories','c3000000-0000-4000-8000-000000000001','PERF_FIXTURE','db_trigger' FROM generate_series(1,10000);
RESET ROLE; ANALYZE audit_logs;`);
const planOutput=await query(`BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-company-id":"b3000000-0000-4000-8000-000000000001"}',true);
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM audit_logs WHERE log_scope='TENANT' AND company_id='b3000000-0000-4000-8000-000000000001' ORDER BY created_at DESC,id DESC LIMIT 50;
ROLLBACK;`);
const plan=JSON.parse(planOutput.slice(planOutput.indexOf('[\n'),planOutput.lastIndexOf(']')+1));
ok(JSON.stringify(plan).includes('audit_logs_tenant_page'),'tenant pagination uses partial index with 10000 fixture events');
console.log(JSON.stringify({executionMs:plan[0]['Execution Time'],planningMs:plan[0]['Planning Time'],returnedRows:plan[0].Plan['Actual Rows']}));

const digests=()=>query(`SELECT jsonb_build_object('audit_log',(SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id)) FROM audit_log l),'audit_logs',(SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id)) FROM audit_logs l),'integration_logs',(SELECT md5(string_agg(to_jsonb(l)::text,'' ORDER BY id)) FROM integration_logs l));`);
const before=await digests();
await query(fs.readFileSync('supabase/rollback/phase3_fail_closed.sql','utf8'));
ok(before===await digests(),'containment rollback preserves all rows and classifications byte-for-byte');
ok((await query(`SELECT NOT has_table_privilege('authenticated','audit_logs','SELECT') AND NOT has_function_privilege('authenticated','public.list_restricted_logs(text,text,integer,timestamptz,uuid,text,text,text)','EXECUTE') AND NOT has_function_privilege('service_role','public.backfill_log_scope(text,integer,boolean)','EXECUTE') AND has_function_privilege('service_role','public.cleanup_old_audit_logs(integer)','EXECUTE');`)).trim()==='t','rollback closes readers/backfill and preserves Phase2 service maintenance');
await query(`SET ROLE service_role; INSERT INTO audit_logs(module,entity,action) VALUES('system','scheduled-jobs','JOB_RUN');`);
console.log('PASS rollback preserves legitimate service writers; fixtures remain only in disposable '+database);
