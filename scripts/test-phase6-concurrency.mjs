import { spawn } from 'node:child_process';
import fs from 'node:fs';
const database=process.argv[2];
const port=process.argv[3]??'15440';
if(!/^moralles_phase6_test_[a-zA-Z0-9_]+$/.test(database??'')||!/^\d+$/.test(port))throw Error('Local disposable phase6 database required');
const args=['-X','-w','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
function query(sql,onData){return new Promise((resolve,reject)=>{
 const p=spawn('psql',args,{windowsHide:true});let out='',err='';
 p.stdout.on('data',d=>{out+=d;onData?.(String(d));});p.stderr.on('data',d=>err+=d);
 p.on('error',reject);p.on('exit',code=>code===0?resolve(out.replaceAll('\r','')):reject(Error(err)));
 p.stdin.end(sql);
});}
let checks=0;
function ok(value,label){if(!value)throw Error('FAILED: '+label);checks++;console.log('PASS '+label);}
const company='b6100000-0000-4000-8000-000000000001';
const actor='a6100000-0000-4000-8000-000000000001';
const product='c6100000-0000-4000-8000-000000000001';
const context=`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true); SELECT set_config('request.headers','{"x-company-id":"${company}"}',true);`;
await query(`DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase6_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_ONLY'; END IF; END $$;
INSERT INTO companies(id,nome) VALUES('${company}','Phase6 concurrency');
INSERT INTO auth.users(id,email) VALUES('${actor}','phase6-concurrency@example.test');
INSERT INTO profiles(id,nome,email,company_id) VALUES('${actor}','Fixture','phase6-concurrency@example.test','${company}');
INSERT INTO company_memberships(user_id,company_id) VALUES('${actor}','${company}');
INSERT INTO permissions(key,description,module,submodule,action) SELECT k,'Fixture',split_part(k,':',1),split_part(k,':',2),split_part(k,':',3) FROM unnest(ARRAY['estoque:catalogo:create','estoque:catalogo:edit','estoque:catalogo:delete','compras:fornecedores:edit'])k ON CONFLICT DO NOTHING;
INSERT INTO user_permissions(user_id,company_id,permission_key,effect) SELECT '${actor}','${company}',k,'ALLOW' FROM unnest(ARRAY['estoque:catalogo:create','estoque:catalogo:edit','estoque:catalogo:delete','compras:fornecedores:edit'])k;
BEGIN;${context}
INSERT INTO produtos(id,company_id,nome_produto,sku,categoria,unidade_medida,custo_padrao) VALUES('${product}','${company}','Produto','P6C','Outros','UN',17);
SELECT upsert_supplier_price('Fixture','${product}',17,'UN'); COMMIT;`);
async function competing(first,second){
 let signal;
 const ready=new Promise(r=>signal=r);
 const worker=query(`BEGIN;${context}${first} SELECT 'LOCKED'; SELECT pg_sleep(1); COMMIT;`,s=>{if(s.includes('LOCKED'))signal();});
 await Promise.race([ready,worker.then(()=>{throw Error('Missing synchronization marker');})]);
 return Promise.all([worker,query(`BEGIN;${context}${second} COMMIT;`).then(value=>({value}),error=>({error:String(error)}))]);
}
const rowBefore=(await query(`SELECT (to_jsonb(p)-'ativo')::text FROM produtos p WHERE id='${product}';`)).trim();
const deactivation=`SELECT deactivate_produto('${product}');`;
const results=await competing(deactivation,deactivation);
ok(!results[1].error,'concurrent deactivation and retry succeed');
ok((await query(`SELECT NOT ativo FROM produtos WHERE id='${product}';`)).trim()==='t','concurrent product inactive');
ok((await query(`SELECT count(*)=1 FROM audit_logs WHERE entity='produtos' AND entity_id='${product}' AND action='UPDATE';`)).trim()==='t','one product audit UPDATE for concurrent retry');
ok((await query(`SELECT (to_jsonb(p)-'ativo')::text FROM produtos p WHERE id='${product}';`)).trim()===rowBefore,'soft delete preserves every other field including cost and balance');
ok((await query(`SELECT count(*)=1 FROM supplier_item_prices WHERE stock_item_id='${product}';`)).trim()==='t','referenced supplier price retained');
const skus=await competing(`SELECT generate_next_sku('RACE');`,`SELECT generate_next_sku('RACE');`);
ok(!skus[1].error,'concurrent SKU allocation succeeds');
ok((await query(`SELECT next_value=2 FROM stock_sku_counter WHERE company_id='${company}' AND prefix='RACE';`)).trim()==='t','counter serializes unique SKU reservations');
const insert=`INSERT INTO produtos(company_id,nome_produto,sku) VALUES('${company}','Collision','COLLISION');`;
const collision=await competing(insert,insert);
ok(/duplicate key/.test(collision[1].error??''),'same-tenant concurrent SKU collision rejected');
ok((await query(`SELECT count(*)=1 FROM produtos WHERE company_id='${company}' AND sku='COLLISION';`)).trim()==='t','one product after competing inserts');
const digest=()=>query(`SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM produtos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM supplier_item_prices t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM suppliers t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM movimentacoes_estoque t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_logs t))::text);`);
const before=await digest();
await query(fs.readFileSync('supabase/rollback/phase6_fail_closed.sql','utf8'));
ok(before===await digest(),'containment preserves products prices links stock costs and logs');
ok((await query(`SELECT NOT has_function_privilege('authenticated','deactivate_produto(uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','generate_next_sku(text)','EXECUTE') AND NOT has_function_privilege('anon','recalc_product_costs(uuid)','EXECUTE') AND NOT has_table_privilege('authenticated','produtos','UPDATE');`)).trim()==='t','containment closes writers without reopening helpers');
ok((await query(`SELECT has_table_privilege('authenticated','produtos','SELECT') AND has_table_privilege('service_role','produtos','UPDATE') AND EXISTS(SELECT 1 FROM pg_constraint WHERE conname='supplier_prices_product_tenant_fk' AND convalidated);`)).trim()==='t','containment retains reading service and tenant FK');
console.log(`PASS ${checks} concurrency/containment checks; synthetic rows remain only in local disposable database.`);
