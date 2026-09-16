// Casos adicionais independentes; executa exclusivamente em clones do ensaio F9.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const dir='docs/multi-unidades/fase9-20260916';
const result=JSON.parse(fs.readFileSync(`${dir}/ensaios.json`,'utf8'));
const catalog=JSON.parse(fs.readFileSync(`${dir}/catalogo-vivo.json`,'utf8'));
const env={...process.env,PGPASSWORD:process.env.PHASE9_LOCAL_PGPASSWORD??'postgres',PGOPTIONS:'-c timezone=UTC'};
function sql(db,text,expected){assert.match(db,/^moralles_phase9_test_[a-z0-9_]+$/);const r=spawnSync('psql',['-X','-w','-qAt','-h','127.0.0.1','-p','15440','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env,maxBuffer:16*1024*1024});if(r.error)throw r.error;if(expected){assert.notEqual(r.status,0);assert.match(r.stderr,expected);}else assert.equal(r.status,0,r.stderr.slice(-1000));return r.stdout.trim();}
const q=s=>'"'+s.replaceAll('"','""')+'"';
const digests=db=>sql(db,'SELECT jsonb_object_agg(name,digest) FROM ('+catalog.relations.filter(r=>r.kind==='r').map(r=>`SELECT '${r.schema}.${r.name}' name,md5(coalesce((SELECT string_agg(j::text,E'\\n' ORDER BY j::text) FROM (SELECT to_jsonb(t) j FROM ${q(r.schema)}.${q(r.name)} t) a),'')) digest`).join(' UNION ALL ')+') x;');
const metadata=db=>sql(db,`SELECT md5((SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text) ORDER BY p.oid::regprocedure::text)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f')||(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text FROM pg_policies p WHERE schemaname='public'));`);
const checks=[];
const ok=(label,detail)=>{checks.push({label,status:'PASS',detail});console.log('PASS '+label);};
const db=result.databases.refs;
const preflight=fs.readFileSync('docs/multi-unidades/fase2-20260915/preflight.sql','utf8').replace(/BEGIN TRANSACTION READ ONLY;/,'');
for(const [name,mutation] of Object.entries({body:"ALTER FUNCTION public.cleanup_old_audit_logs(integer) SET search_path='pg_temp';",acl:'GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) TO supabase_admin;',overload:"CREATE FUNCTION public.cleanup_old_audit_logs(text) RETURNS void LANGUAGE sql AS 'SELECT';",policy:'CREATE POLICY phase9_extra ON public.companies FOR SELECT TO authenticated USING(true);'})){
 const before=metadata(db),data=digests(db);sql(db,'BEGIN;\n'+mutation+'\n'+preflight,/PHASE2_.*DRIFT/);assert.equal(metadata(db),before);assert.equal(digests(db),data);ok('guard F2 recusa '+name+' e reverte integralmente');
}
// Registros próprios; réplica somente na preparação de fixture, nunca em código produtivo.
const seed=`BEGIN; SET LOCAL session_replication_role=replica;
INSERT INTO companies(id,nome) VALUES('b9900000-0000-4000-8000-000000000001','Phase9 synthetic A'),('b9900000-0000-4000-8000-000000000002','Phase9 synthetic B');
INSERT INTO auth.users(id,email) VALUES('a9900000-0000-4000-8000-000000000001','phase9@example.test');
INSERT INTO profiles(id,company_id) VALUES('a9900000-0000-4000-8000-000000000001','b9900000-0000-4000-8000-000000000001');
INSERT INTO company_memberships(user_id,company_id) VALUES('a9900000-0000-4000-8000-000000000001','b9900000-0000-4000-8000-000000000001'),('a9900000-0000-4000-8000-000000000001','b9900000-0000-4000-8000-000000000002');
INSERT INTO produtos(company_id,nome_produto,saldo_atual,custo_padrao) VALUES('b9900000-0000-4000-8000-000000000001','Phase9 synthetic stock',12,7);
COMMIT;`;
for(const [label,target,rollback] of [['F2',result.databases.live,'phase2_fail_closed.sql'],['F7',result.databases.candidate,'phase7_fail_closed.sql']]){
 sql(target,seed);const before=digests(target),authBefore=sql(target,'SELECT md5(jsonb_agg(to_jsonb(u) ORDER BY id)::text) FROM auth.users u');
 sql(target,fs.readFileSync(`supabase/rollback/${rollback}`,'utf8'));assert.equal(digests(target),before);assert.equal(sql(target,'SELECT md5(jsonb_agg(to_jsonb(u) ORDER BY id)::text) FROM auth.users u'),authBefore);
 ok('recuo '+label+': 149 tabelas + Auth preservados; fixtures unidade/membership/estoque/custo',JSON.parse(before));
 const closed=sql(target,label==='F2'?"SELECT NOT has_function_privilege('authenticated','cleanup_old_audit_logs(integer)','execute') AND NOT has_function_privilege('anon','refresh_materialized_views()','execute');":"SELECT NOT has_function_privilege('authenticated','set_cache(text,jsonb,integer)','execute') AND NOT has_function_privilege('authenticated','recalc_product_costs(uuid)','execute');");
 assert.equal(closed,'t');ok('recuo '+label+': nao reabre helpers clientes');
}
fs.writeFileSync(`${dir}/ensaios-guards-recuo.json`,JSON.stringify({capturedAt:new Date().toISOString(),checks,limits:'Dados sintéticos; maior parte das tabelas vazia. Não é prova de restauração de backup produtivo nem de efeitos externos.'},null,2)+'\n');
