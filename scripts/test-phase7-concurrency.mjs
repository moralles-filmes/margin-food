import { spawn } from 'node:child_process';
import fs from 'node:fs';
const database=process.argv[2],port=process.argv[3]??'15440';
if(!/^moralles_phase7_test_[a-zA-Z0-9_]+$/.test(database??'')||!/^\d+$/.test(port))throw Error('Local disposable phase7 database required');
const args=['-X','-w','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
function query(sql,onData){return new Promise((resolve,reject)=>{
 const p=spawn('psql',args,{windowsHide:true});let out='',err='';
 p.stdout.on('data',d=>{out+=d;onData?.(String(d));});p.stderr.on('data',d=>err+=d);
 p.on('error',reject);p.on('exit',code=>code===0?resolve(out.replaceAll('\r','')):reject(Error(err)));p.stdin.end(sql);
});}
let checks=0;function ok(value,label){if(!value)throw Error('FAILED: '+label);checks++;console.log('PASS '+label);}
const A='b7100000-0000-4000-8000-000000000001',B='b7100000-0000-4000-8000-000000000002',actor='a7100000-0000-4000-8000-000000000001';
const context=(company=A)=>`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true); SELECT set_config('request.headers','{"x-company-id":"${company}"}',true);`;
await query(`DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase7_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('${A}','Phase7 concurrency A'),('${B}','Phase7 concurrency B');
INSERT INTO auth.users(id,email) VALUES('${actor}','phase7-concurrency@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('${actor}','Fixture','phase7-concurrency@example.test','${A}');
INSERT INTO company_memberships(user_id,company_id) VALUES('${actor}','${A}'),('${actor}','${B}');
INSERT INTO permissions(key,description,module,submodule,action) VALUES('system:global:manage','Fixture','system','global','manage') ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('${actor}','${A}','system:global:manage','ALLOW'),('${actor}','${B}','system:global:manage','ALLOW');`);
async function competing(first,second,secondCompany=A){
 let signal;const ready=new Promise(r=>signal=r);
 const worker=query(`BEGIN;${context()}${first} SELECT 'LOCKED'; SELECT pg_sleep(0.6); COMMIT;`,s=>{if(s.includes('LOCKED'))signal();});
 await Promise.race([ready,worker.then(()=>{throw Error('Missing synchronization marker');})]);
 return Promise.all([worker,query(`BEGIN;${context(secondCompany)}${second} COMMIT;`).then(value=>({value}),error=>({error:String(error)}))]);
}
const cost=(company,value)=>`INSERT INTO rh_custos_mensais(company_id,periodo,total_geral) VALUES('${company}','2026-09',${value}) ON CONFLICT(company_id,periodo) DO UPDATE SET total_geral=EXCLUDED.total_geral;`;
ok(!(await competing(cost(A,10),cost(A,20)))[1].error,'same-tenant upsert serializes');
ok((await query(`SELECT count(*)=1 AND min(total_geral)=20 FROM rh_custos_mensais WHERE company_id='${A}';`)).trim()==='t','same key one row final value');
ok(!(await competing(cost(A,30),cost(B,40),B))[1].error,'A/B same month coexist concurrently');
ok((await query(`SELECT count(*)=2 AND sum(total_geral)=70 FROM rh_custos_mensais;`)).trim()==='t','A/B independent values');
const order=`SELECT create_purchase_order_atomic('{"title":"Race","type":"MERCADO","items":[]}', 'd7100000-0000-4000-8000-000000000001');`;
const race=await competing(order,order);
ok(/duplicate key/.test(race[1].error??''),'legacy simultaneous first request rejects unique conflict safely');
ok((await query(`SELECT count(*)=1 FROM purchase_orders WHERE idempotency_key='d7100000-0000-4000-8000-000000000001';`)).trim()==='t','one order after race');
ok((await query(`BEGIN;${context()}${order} ROLLBACK;`)).includes('idempotent'),'retry after committed race returns same order');
const tables=['rh_custos_mensais','rh_escalas','planning_metas_compra','purchase_orders','purchase_order_items','produtos','ficha_componentes','ficha_componente_itens','inventarios','inventario_itens','movimentacoes_estoque','audit_logs','fin_audit_logs'];
const digest=()=>query(`SELECT md5(jsonb_build_array(${tables.map(t=>`(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ${t} t)`).join(',')})::text);`);
const before=await digest();
await query(fs.readFileSync('supabase/rollback/phase7_fail_closed.sql','utf8'));
ok(before===await digest(),'containment preserves all fixture resources links stock costs logs');
ok((await query(`SELECT NOT has_function_privilege('authenticated','create_purchase_order_atomic(jsonb,uuid)','EXECUTE') AND NOT has_table_privilege('authenticated','stock_categories','INSERT');`)).trim()==='t','containment closes changed entry points');
ok((await query(`SELECT NOT has_table_privilege('authenticated','mv_giro_estoque','SELECT') AND NOT has_function_privilege('anon','set_cache(text,jsonb,integer)','EXECUTE') AND NOT has_table_privilege('authenticated','produtos','TRUNCATE');`)).trim()==='t','containment never reopens vulnerable grants');
ok((await query(`SELECT count(*)=8 AND bool_and(convalidated) FROM pg_constraint WHERE conname LIKE 'phase7_%_tenant_fk';`)).trim()==='t','containment preserves eight tenant FKs');
ok((await query(`SELECT has_table_privilege('authenticated','stock_categories','SELECT') AND has_table_privilege('service_role','rh_custos_mensais','UPDATE');`)).trim()==='t','reading and service table access retained');
console.log(`PASS ${checks} concurrency/containment checks; synthetic rows remain only in local disposable database.`);
