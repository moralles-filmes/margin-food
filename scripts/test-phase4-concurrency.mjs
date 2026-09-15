import { spawn } from 'node:child_process';
import fs from 'node:fs';
const database=process.argv[2];
const port=process.argv[3]??'15440';
if(!/^moralles_phase4_test_[a-zA-Z0-9_]+$/.test(database??'')||!/^\d+$/.test(port))throw Error('Local disposable phase4 database required');
const args=['-X','-w','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
function query(sql,onData){return new Promise((resolve,reject)=>{
 const p=spawn('psql',args,{windowsHide:true});let out='',err='';
 p.stdout.on('data',d=>{out+=d;onData?.(String(d));});p.stderr.on('data',d=>err+=d);
 p.on('error',reject);p.on('exit',code=>code===0?resolve(out.replaceAll('\r','')):reject(Error(err)));
 p.stdin.end(sql);
});}
let checks=0;
function ok(value,label){if(!value)throw Error('FAILED: '+label);checks++;console.log('PASS '+label);}
const company='b4100000-0000-4000-8000-000000000001';
const actor='a4100000-0000-4000-8000-000000000001';
const context=`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true); SELECT set_config('request.headers','{"x-company-id":"${company}"}',true);`;
const entry=lot=>`SELECT _salmon_create_entry_guarded('2026-09-15','${lot}','','',1,1,10,100,'','2026-09-20');`;
await query(`DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase4_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('${company}','Phase4 concurrency');
INSERT INTO auth.users(id,email) VALUES('${actor}','phase4-concurrency@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('${actor}','Fixture','phase4-concurrency@example.test','${company}');
INSERT INTO company_memberships(user_id,company_id) VALUES('${actor}','${company}');
INSERT INTO permissions(key,description,module,submodule,action) SELECT k,'Fixture',split_part(k,':',1),split_part(k,':',2),split_part(k,':',3) FROM unnest(ARRAY['salmon:entradas:create','salmon:entradas:delete','salmon:manipulacao:create','salmon:manipulacao:delete'])k ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) SELECT '${actor}','${company}',k,'ALLOW' FROM unnest(ARRAY['salmon:entradas:create','salmon:entradas:delete','salmon:manipulacao:create','salmon:manipulacao:delete'])k;`);
async function competing(first,second){
 let readyResolve;
 const ready=new Promise(r=>readyResolve=r);
 const worker=query(`BEGIN;${context}${first} SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;`,chunk=>{if(chunk.includes('LOCKED'))readyResolve();});
 await Promise.race([ready,worker.then(()=>{throw Error('Missing synchronization marker');})]);
 const other=query(`BEGIN;${context}${second} COMMIT;`).then(value=>({value}),error=>({error:String(error)}));
 return Promise.all([worker,other]);
}
const created=await competing(entry('C1'),entry('C2'));
ok(!created[1].error,'two connections create entries concurrently');
ok((await query(`SELECT count(*)=1 FROM produtos WHERE is_salmon_raw_linked AND ativo AND company_id='${company}';`)).trim()==='t','concurrent first creation yields exactly one raw product');
ok((await query(`SELECT saldo_atual=20 FROM produtos WHERE is_salmon_raw_linked AND company_id='${company}';`)).trim()==='t','concurrent mirrors preserve cached balance 20');
ok((await query(`SELECT count(*)=2 AND count(DISTINCT produto_id)=1 FROM movimentacoes_estoque WHERE source_module='salmon' AND company_id='${company}';`)).trim()==='t','two distinct entries share same tenant product');
const entryId=(await query(`SELECT id FROM salmon_entries WHERE company_id='${company}' AND lot='C1';`)).trim();
const cancel=`SELECT _salmon_cancel_entry_guarded('${entryId}','Concurrent cancellation');`;
const cancelled=await competing(cancel,cancel);
ok(cancelled[1].error?.includes('já cancelada'),'concurrent repeated cancellation waits and returns existing no-op error');
ok((await query(`SELECT count(*)=1 FROM movimentacoes_estoque WHERE estorno_de_id IS NOT NULL AND company_id='${company}';`)).trim()==='t','concurrent cancellation produces one reversal');
const otherEntry=(await query(`SELECT id FROM salmon_entries WHERE company_id='${company}' AND lot='C2';`)).trim();
const manipulation=`SELECT _salmon_create_manipulation_guarded('${otherEntry}','2026-09-15',1,4,3,0,'');`;
const raced=await competing(manipulation,`SELECT _salmon_cancel_entry_guarded('${otherEntry}','Must refuse active child');`);
ok(raced[1].error?.includes('manipulações ativas'),'parent lock serializes manipulation versus entry cancellation');
ok((await query(`SELECT saldo_atual=6 FROM produtos WHERE is_salmon_raw_linked AND company_id='${company}';`)).trim()==='t','failed parent cancellation preserves cached balance');
const manipId=(await query(`SELECT id FROM salmon_manipulations WHERE entry_id='${otherEntry}';`)).trim();
const cancelM=`SELECT _salmon_cancel_manipulation_guarded('${manipId}','Concurrent manipulation cancel');`;
const cancelledM=await competing(cancelM,cancelM);
ok(cancelledM[1].error?.includes('já cancelada'),'concurrent manipulation cancellation also serializes');
await query(`BEGIN;${context}SELECT _salmon_cancel_entry_guarded('${otherEntry}','End cycle'); COMMIT;`);
ok((await query(`SELECT saldo_atual=0 FROM produtos WHERE is_salmon_raw_linked AND company_id='${company}';`)).trim()==='t','concurrent lifecycle ends with cached zero');
// Independent writer cannot create second linked product, even with a different SKU.
const duplicate=await query(`BEGIN;${context}RESET ROLE;INSERT INTO produtos(nome_produto,sku,categoria,unidade_medida,company_id,is_salmon_raw_linked) VALUES('Other raw','OTHER','Pescados','KG','${company}',true); COMMIT;`).then(()=>false,e=>String(e).includes('produtos_one_active_salmon_raw'));
ok(duplicate,'unique index blocks duplicate from another writer');
// An authorized service cancellation outside the module still converges on the same state.
await query(`BEGIN;${context}${entry('Outside')}COMMIT;`);
const outside=(await query(`SELECT id FROM salmon_entries WHERE company_id='${company}' AND lot='Outside';`)).trim();
await query(`BEGIN; SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO movimentacoes_estoque(produto_id,data,tipo,quantidade,custo_unitario,custo_total,origem,created_by,status,estorno_de_id,company_id)
SELECT produto_id,data,'ENTRADA_ESTORNO',quantidade,custo_unitario,custo_total,'ESTORNO','${actor}','ATIVO',id,company_id FROM movimentacoes_estoque WHERE company_id='${company}' AND reference_id='${outside}';
UPDATE movimentacoes_estoque SET status='CANCELADO',cancelado_por='${actor}',cancelado_em=now(),justificativa_cancelamento='Service fixture' WHERE company_id='${company}' AND reference_id='${outside}';
UPDATE salmon_entries SET status='CANCELLED' WHERE company_id='${company}' AND id='${outside}'; COMMIT;`);
const again=await query(`BEGIN;${context}SELECT _salmon_cancel_entry_guarded('${outside}','Repeat after external cancellation');COMMIT;`).then(()=>false,e=>String(e).includes('já cancelada'));
ok(again,'external service cancellation remains an idempotent module no-op');
ok((await query(`SELECT saldo_atual=0 FROM produtos WHERE is_salmon_raw_linked AND company_id='${company}';`)).trim()==='t','external service mirror/cascade preserves zero balance');
const digest=()=>query(`SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM salmon_entries t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM salmon_manipulations t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM produtos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimentacoes_estoque t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_logs t))::text);`);
const before=await digest();
await query(fs.readFileSync('supabase/rollback/phase4_fail_closed.sql','utf8'));
ok(before===await digest(),'containment rollback preserves resources, mirrors, balances and logs byte-for-byte');
ok((await query(`SELECT count(*)=0 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%salmon%' AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('service_role',oid,'EXECUTE'));`)).trim()==='t','rollback does not reopen internal or public RPCs');
console.log(`PASS ${checks} concurrency/containment checks; synthetic data retained in local disposable database.`);
