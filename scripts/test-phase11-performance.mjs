// EXPLAIN ANALYZE somente SELECT em clones novos de schemas identificados.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const out='docs/multi-unidades/fase11-20260916';
const env={...process.env,PGPASSWORD:process.env.PHASE11_LOCAL_PGPASSWORD??'postgres',PGOPTIONS:'-c timezone=UTC'};
const catalog=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/catalogo-vivo.json','utf8'));
const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
const a='b1100000-0000-4000-8000-000000000001',b='b1100000-0000-4000-8000-000000000002',user='a1100000-0000-4000-8000-000000000001';
function sql(db,input){assert.match(db,/^moralles_phase(?:7|9|11)_test_[a-z0-9_]+$/);return execFileSync('psql',['-X','-w','-qAt','-h','127.0.0.1','-p','15440','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{env,input,encoding:'utf8',maxBuffer:32*1024*1024}).trim();}
const q=s=>'"'+s.replaceAll('"','""')+'"';
function clone(label,template){
 const tables=catalog.relations.filter(r=>r.kind==='r').map(r=>`(select count(*) from ${q(r.schema)}.${q(r.name)})`);
 assert.equal(sql(template,'select '+tables.join('+')+'+(select count(*) from auth.users);'),'0');
 const db=`moralles_phase11_test_perf_${label}_${stamp}`;
 execFileSync('createdb',['-w','-h','127.0.0.1','-p','15440','-U','postgres','-T',template,db],{env,stdio:'pipe'});
 return db;
}
const context=`SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${user}","role":"authenticated"}'; SET LOCAL request.headers='{"x-company-id":"${a}"}';`;
const keys=['estoque:catalogo:view','estoque:dashboard:view','estoque:saldo:view','estoque:movimentacoes:view','financeiro:lancamentos:view','financeiro:contas:view'];
const fixture=`BEGIN;
DO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase11_test_perf_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;
-- Bulk synthetic setup only; no assertion about production write triggers follows from this seed.
SET LOCAL session_replication_role=replica;
INSERT INTO companies(id,nome) VALUES('${a}','F11 performance A'),('${b}','F11 performance B');
INSERT INTO auth.users(id,email) VALUES('${user}','phase11-perf@example.test');
INSERT INTO profiles(id,nome,company_id) VALUES('${user}','Fixture','${a}');
INSERT INTO company_memberships(user_id,company_id) VALUES('${user}','${a}'),('${user}','${b}');
${[...keys,'stock:read','finance:read','finance:manage'].map(k=>`INSERT INTO permissions(key,description,module,submodule,action) VALUES('${k}','Fixture','fixture','fixture','view'); INSERT INTO user_permissions(user_id,company_id,permission_key,effect) VALUES('${user}','${a}','${k}','${keys.includes(k)?'ALLOW':'DENY'}');`).join('\n')}
INSERT INTO produtos(id,company_id,nome_produto,sku,ativo,saldo_atual,default_cost_base_unit,estoque_minimo)
SELECT md5('f11product'||i)::uuid,CASE WHEN i<=3000 THEN '${a}'::uuid ELSE '${b}'::uuid END,'Fixture '||i,'F11-'||i,true,12,7,3 FROM generate_series(1,6000)i;
INSERT INTO fin_lancamentos(id,company_id,descricao,tipo,status,valor,data_competencia,data_pagamento,created_at)
SELECT md5('f11finance'||i)::uuid,CASE WHEN i<=15000 THEN '${a}'::uuid ELSE '${b}'::uuid END,'Fixture '||i,'DESPESA','PREVISTO',10+(i%100),DATE '2026-01-01'+(i%240),NULL,TIMESTAMPTZ '2026-01-01'+i*interval '1 minute' FROM generate_series(1,30000)i;
INSERT INTO movimentacoes_estoque(id,company_id,produto_id,tipo,status,quantidade,custo_unitario,data,created_at)
SELECT md5('f11movement'||i)::uuid,CASE WHEN ((i-1)%6000)+1<=3000 THEN '${a}'::uuid ELSE '${b}'::uuid END,md5('f11product'||(((i-1)%6000)+1))::uuid,'ENTRADA','ATIVO',1,7,DATE '2026-01-01'+(i%240),TIMESTAMPTZ '2026-01-01'+i*interval '1 minute' FROM generate_series(1,18000)i;
COMMIT;
ANALYZE produtos; ANALYZE fin_lancamentos; ANALYZE movimentacoes_estoque; ANALYZE company_memberships; ANALYZE user_permissions;`;
const queries={
 productsRls:`SELECT id,nome_produto,saldo_atual FROM produtos WHERE ativo ORDER BY nome_produto LIMIT 50`,
 productsExplicit:`SELECT id,nome_produto,saldo_atual FROM produtos WHERE company_id='${a}' AND ativo ORDER BY nome_produto LIMIT 50`,
 financePage:`SELECT id,valor,data_competencia FROM fin_lancamentos WHERE company_id='${a}' ORDER BY data_competencia DESC,id DESC LIMIT 50`,
 financeDeepOffset:`SELECT id,valor,data_competencia FROM fin_lancamentos WHERE company_id='${a}' ORDER BY data_competencia DESC,id DESC LIMIT 50 OFFSET 10000`,
 financeKeyset:`SELECT id,valor,data_competencia FROM fin_lancamentos WHERE company_id='${a}' AND (data_competencia,id)<(DATE '2026-03-22','80000000-0000-4000-8000-000000000000'::uuid) ORDER BY data_competencia DESC,id DESC LIMIT 50`,
 movementsPage:`SELECT id,quantidade FROM movimentacoes_estoque WHERE company_id='${a}' AND status='ATIVO' ORDER BY created_at DESC LIMIT 50`,
 stockSummary:`SELECT * FROM get_stock_summary()`,
 movementKpis:`SELECT get_movimentacoes_kpis(NULL,NULL,DATE '2026-01-01',DATE '2026-08-31',false)`,
 permissionPerRow:`SELECT id FROM produtos WHERE company_id='${a}' AND has_any_permission(auth.uid(),ARRAY['estoque:dashboard:view']) LIMIT 1000`,
 permissionInitPlan:`SELECT id FROM produtos WHERE company_id='${a}' AND (SELECT has_any_permission(auth.uid(),ARRAY['estoque:dashboard:view'])) LIMIT 1000`,
};
const result={capturedAt:new Date().toISOString(),productionMutations:false,fixture:{products:6000,finance:30000,movements:18000,companies:2,readRole:'authenticated',grants:'granular ALLOW; legacy DENY',seedTriggers:'disabled ONLY during bulk seed; enabled for all measurements',stock:'cache 12 each, ledger 3 entries each: intentional distinction; no recomputation'},runs:[],limits:['No production p95 or load test','3 independent executions per query, warm caches, single local host','PLpgSQL Function Scan hides nested plans; direct table queries measure RLS/indexes separately','Candidate F7 + hotfix was not built by the blocked release','Deep offset/keyset illustrate access patterns, not a product change']};
for(const [label,template] of [['live','moralles_phase9_test_live'],['candidate','moralles_phase7_test_acceptance']]){
 const db=clone(label,template);
 if(label==='candidate'){const h=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/historico-foco.json')).find(x=>x.version==='20260916153928');sql(db,h.statements.join(';\n')+';');}
 sql(db,fixture);
 const identity=sql(db,"SELECT jsonb_build_object('database',current_database(),'server',version(),'address',inet_server_addr(),'port',inet_server_port(),'replicationRole',current_setting('session_replication_role'));");
 const summary=JSON.parse(sql(db,`BEGIN READ ONLY; ${context} SELECT row_to_json(s) FROM get_stock_summary() s; ROLLBACK;`));
 assert.equal(summary.items_count,3000);assert.equal(summary.total_stock_value,252000);
 assert.equal(sql(db,`BEGIN READ ONLY; ${context} SELECT count(*) FROM produtos WHERE company_id='${b}'; ROLLBACK;`),'0');
 const run={label,template,identity:JSON.parse(identity),summary,queries:{},indexes:JSON.parse(sql(db,"SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('produtos','fin_lancamentos','movimentacoes_estoque','company_memberships');"))};
 for(const [name,query] of Object.entries(queries)){
  assert.match(query,/^SELECT /);
  const plans=[];
  for(let i=0;i<3;i++)plans.push(JSON.parse(sql(db,`BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; ${context} EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}; ROLLBACK;`))[0]);
  run.queries[name]={query,executionMs:plans.map(p=>p['Execution Time']),plans};
  console.log(`${label}/${name}: ${run.queries[name].executionMs.join(', ')} ms`);
 }
 result.runs.push(run);fs.writeFileSync(`${out}/performance.json`,JSON.stringify(result,null,2)+'\n');
}
