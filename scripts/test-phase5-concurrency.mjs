import { spawn } from 'node:child_process';
import fs from 'node:fs';
const database=process.argv[2];
const port=process.argv[3]??'15440';
if(!/^moralles_phase5_test_[a-zA-Z0-9_]+$/.test(database??'')||!/^\d+$/.test(port))throw Error('Local disposable phase5 database required');
const args=['-X','-w','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
function query(sql,onData){return new Promise((resolve,reject)=>{
 const p=spawn('psql',args,{windowsHide:true});let out='',err='';
 p.stdout.on('data',d=>{out+=d;onData?.(String(d));});p.stderr.on('data',d=>err+=d);
 p.on('error',reject);p.on('exit',code=>code===0?resolve(out.replaceAll('\r','')):reject(Error(err)));
 p.stdin.end(sql);
});}
let checks=0;
function ok(value,label){if(!value)throw Error('FAILED: '+label);checks++;console.log('PASS '+label);}
const company='b5100000-0000-4000-8000-000000000001';
const actor='a5100000-0000-4000-8000-000000000001';
const product='c5100000-0000-4000-8000-000000000001';
const order='d5100000-0000-4000-8000-000000000001';
const item='e5100000-0000-4000-8000-000000000001';
const context=`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true); SELECT set_config('request.headers','{"x-company-id":"${company}"}',true);`;
await query(`DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase5_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('${company}','Phase5 concurrency');
INSERT INTO auth.users(id,email) VALUES('${actor}','phase5-concurrency@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('${actor}','Fixture','phase5-concurrency@example.test','${company}');
INSERT INTO company_memberships(user_id,company_id) VALUES('${actor}','${company}');
INSERT INTO permissions(key,description,module,submodule,action) SELECT k,'Fixture',split_part(k,':',1),split_part(k,':',2),split_part(k,':',3) FROM unnest(ARRAY['compras:fornecedores:edit','compras:ranking:view','compras:recebimentos:close'])k ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) SELECT '${actor}','${company}',k,'ALLOW' FROM unnest(ARRAY['compras:fornecedores:edit','compras:ranking:view','compras:recebimentos:close'])k;
BEGIN;${context}RESET ROLE;
INSERT INTO produtos(id,company_id,nome_produto,sku,categoria,unidade_medida) VALUES('${product}','${company}','Produto','P5C','Outros','UN');
INSERT INTO purchase_orders(id,title,supplier_name,created_by,company_id) VALUES('${order}','PO','Concurrent','${actor}','${company}');
INSERT INTO purchase_order_items(id,order_id,stock_item_id,name_snapshot,qty_requested,company_id) VALUES('${item}','${order}','${product}','Produto',2,'${company}'); COMMIT;`);
async function competing(first,second){
 let readyResolve;
 const ready=new Promise(r=>readyResolve=r);
 const worker=query(`BEGIN;${context}${first} SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;`,chunk=>{if(chunk.includes('LOCKED'))readyResolve();});
 await Promise.race([ready,worker.then(()=>{throw Error('Missing synchronization marker');})]);
 const other=query(`BEGIN;${context}${second} COMMIT;`).then(value=>({value}),error=>({error:String(error)}));
 return Promise.all([worker,other]);
}
const supplier=`SELECT upsert_supplier('Concurrent');`;
const suppliers=await competing(supplier,supplier);
ok(!suppliers[1].error,'concurrent same-name suppliers succeed');
ok((await query(`SELECT count(*)=1 FROM suppliers WHERE company_id='${company}' AND name='Concurrent';`)).trim()==='t','one supplier UUID after concurrent upserts');
const price=`SELECT upsert_supplier_price('Concurrent','${product}',25,'CX');`;
const prices=await competing(price,price);
ok(!prices[1].error,'concurrent same-item prices succeed');
ok((await query(`SELECT count(*)=1 AND count(DISTINCT supplier_uuid)=1 FROM supplier_item_prices WHERE company_id='${company}';`)).trim()==='t','one price and canonical UUID after concurrency');
const receive=`SELECT receive_purchase_order_atomic('${order}','[{"order_item_id":"${item}","status":"RECEIVED","qty_received":2,"unit_cost":20}]');`;
const receipts=await competing(receive,receive);
ok(!receipts[1].error,'concurrent receipt retry succeeds');
ok((await query(`SELECT total_confirmed=40 FROM purchase_orders WHERE id='${order}';`)).trim()==='t','concurrent receipt counts total once');
ok((await query(`SELECT saldo_atual=2 FROM produtos WHERE id='${product}';`)).trim()==='t','one receipt mirror in cached stock');
ok((await query(`SELECT count(*)=1 FROM movimentacoes_estoque WHERE reference_id='POI:${item}';`)).trim()==='t','one stock mirror per order item');
// Outra compra do mesmo produto disputa com o cadastro manual de preço.
await query(`BEGIN;${context}RESET ROLE;
INSERT INTO purchase_orders(id,title,supplier_name,created_by,company_id) VALUES('d5100000-0000-4000-8000-000000000002','PO2','Concurrent','${actor}','${company}');
INSERT INTO purchase_order_items(id,order_id,stock_item_id,name_snapshot,qty_requested,company_id) VALUES('e5100000-0000-4000-8000-000000000002','d5100000-0000-4000-8000-000000000002','${product}','Produto',2,'${company}');COMMIT;`);
const receive2=receive.replaceAll(order,'d5100000-0000-4000-8000-000000000002').replaceAll(item,'e5100000-0000-4000-8000-000000000002');
const mixed=await competing(price,receive2);
ok(!mixed[1].error,'manual price and receipt serialize without deadlock');
ok((await query(`SELECT count(*)=1 AND bool_and(source='purchases' AND unit_cost=20) FROM supplier_item_prices WHERE company_id='${company}';`)).trim()==='t','receipt keeps UUID and updates price after manual transaction');
const digest=()=>query(`SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM suppliers t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM supplier_item_prices t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM produtos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimentacoes_estoque t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM purchase_orders t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM purchase_order_items t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_logs t))::text);`);
const before=await digest();
await query(fs.readFileSync('supabase/rollback/phase5_fail_closed.sql','utf8'));
ok(before===await digest(),'containment preserves all suppliers prices costs stock orders and logs');
ok((await query(`SELECT NOT has_function_privilege('authenticated','upsert_supplier(text)','EXECUTE') AND NOT has_function_privilege('authenticated','upsert_supplier_price(text,uuid,numeric,text)','EXECUTE') AND NOT has_function_privilege('authenticated','receive_purchase_order_atomic(uuid,jsonb,jsonb)','EXECUTE') AND NOT has_table_privilege('authenticated','suppliers','INSERT') AND NOT has_function_privilege('anon','upsert_supplier(text)','EXECUTE');`)).trim()==='t','containment closes affected writers without reopening anonymous access');
ok((await query(`SELECT count(*)=2 AND bool_and(convalidated) FROM pg_constraint WHERE conrelid='supplier_item_prices'::regclass AND conname LIKE 'supplier_prices_%_tenant_fk';`)).trim()==='t','containment retains tenant FKs');
console.log(`PASS ${checks} concurrency/containment checks; synthetic rows retained only in local disposable database.`);
