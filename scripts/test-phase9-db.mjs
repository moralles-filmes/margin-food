// PostgreSQL real local; somente clones novos, nunca remove banco/guarda/histórico.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
const dir='docs/multi-unidades/fase9-20260916',scratch='.phase9.local';
const read=f=>JSON.parse(fs.readFileSync(`${dir}/${f}`,'utf8'));
const hotfixSql=read('historico-foco.json').find(h=>h.version==='20260916153928').statements.join(';\n')+';';
const env={...process.env,PGPASSWORD:process.env.PHASE9_LOCAL_PGPASSWORD??'postgres',PGOPTIONS:'-c timezone=UTC'};
const port='15440',host='127.0.0.1';
const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
const databases={},checks=[];
const safe=db=>{assert.match(db,/^moralles_phase9_test_[a-z0-9_]+$/);};
function sql(db,text,expected=null){safe(db);const r=spawnSync('psql',['-X','-w','-qAt','-h',host,'-p',port,'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env,maxBuffer:32*1024*1024});if(r.error)throw r.error;if(expected){assert.notEqual(r.status,0);assert.match(r.stderr,expected);return r.stderr.match(/ERROR:[^\n]+/)?.[0];}assert.equal(r.status,0,r.stderr.slice(-1500));return r.stdout.trim();}
function file(db,p,expected=null){return sql(db,fs.readFileSync(p,'utf8'),expected);}
function clone(label,template){assert.match(template,/^moralles_phase[79]_test_[a-z0-9_]+$/);const db=`moralles_phase9_test_${label}_${stamp}`;safe(db);
 const tables=read('catalogo-vivo.json').relations.filter(r=>r.kind==='r').map(r=>`(SELECT count(*) FROM "${r.schema}"."${r.name}")`);
 const empty=execFileSync('psql',['-X','-w','-qAt','-h',host,'-p',port,'-U','postgres','-d',template,'-v','ON_ERROR_STOP=1','-c','SELECT '+tables.join('+')+'+(SELECT count(*) FROM auth.users);'],{env,encoding:'utf8'}).trim();assert.equal(empty,'0','Template deve estar vazio em todas as tabelas public/reporting + Auth');
 execFileSync('createdb',['-w','-h',host,'-p',port,'-U','postgres','-T',template,db],{env,stdio:'pipe'});databases[label]=db;return db;}
const ok=(label,detail)=>{checks.push({label,status:'PASS',detail});console.log('PASS '+label);};
const digest=db=>sql(db,`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.proacl::text,p.proowner::regrole::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','reporting','log_private') AND p.prokind='f'),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname IN ('public','reporting')),'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE connamespace='public'::regnamespace),'relations',(SELECT jsonb_agg(jsonb_build_array(relname,relacl::text,relowner::regrole::text,relrowsecurity,relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v','m')),'canary',(SELECT jsonb_agg(to_jsonb(t)) FROM z_canary_test t));`);
const live=clone('live','moralles_phase9_test_live');
const catalogQuery=fs.readFileSync(`${dir}/inventario.sql`,'utf8').replace('from supabase_migrations.schema_migrations','from (select null::text version where false) fixture');
const local=JSON.parse(sql(live,catalogQuery)),current=read('catalogo-vivo.json');
const acl=s=>s===null?null:s.slice(1,-1).split(',').sort().join(',');
const mismatches=[];
for(const f of current.functions){const g=local.functions.find(g=>g.signature===f.signature);if(!g||f.md5!==g.md5||f.owner!==g.owner||acl(f.acl)!==acl(g.acl))mismatches.push(f.signature);}
assert.deepEqual(mismatches,[]);ok('restore: 356 definicoes/owner/ACL identicos ao vivo');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
for(const group of ['relations','columns','constraints','indexes','triggers']){assert.deepEqual(sorted(local[group]),sorted(current[group]));ok('restore: '+group+' identicos');}
assert.deepEqual(local.policies,current.policies.filter(p=>p.schemaname!=='storage'));ok('restore: policies public/reporting identicas; Storage fora deste clone');
sql(live,'INSERT INTO public.z_canary_test DEFAULT VALUES;');
let before=digest(live);
file(live,'docs/multi-unidades/fase3-20260915/preflight.sql',/PHASE3_FUNCTION_DRIFT: create_salmon_entry_atomic/);assert.equal(digest(live),before);ok('F3 recusa assinatura anterior no vivo equivalente sem mutacao');
file(live,'supabase/migrations/20260915140812_contain_global_maintenance_and_companies.sql');ok('cadeia: F2 aplica no vivo equivalente');
before=digest(live);
file(live,'supabase/migrations/20260915140812_contain_global_maintenance_and_companies.sql',/PHASE2_.*DRIFT/);assert.equal(digest(live),before);ok('F2 repetida recusa estado ja aplicado; nao mascara aplicacao parcial');
for(let i=0;i<2;i++){file(live,'supabase/migrations/20260915144030_trusted_log_writers_and_readers.sql',/PHASE3_FUNCTION_DRIFT: create_salmon_entry_atomic/);assert.equal(digest(live),before);}ok('cadeia: F3 e retry recusados atomicamente apos F2');
const liveRefs=clone('refs','moralles_phase9_test_live');
const candidate=clone('candidate','moralles_phase7_test_acceptance');
const base=clone('hotfix','moralles_phase7_test_base');
sql(base,hotfixSql);
before=digest(base);
file(base,'docs/multi-unidades/fase7-20260916/preflight.sql',/PHASE7_.*DRIFT/);assert.equal(digest(base),before);ok('F7 preflight recusa hotfix com F2-F6 presentes');
file(base,'supabase/migrations/20260916133617_phase7_contain_non_rls_privileges.sql',/PHASE7_.*DRIFT/);assert.equal(digest(base),before);ok('cadeia: primeira migration F7 tambem recusa hotfix atomicamente');
// Regressão das policies publicadas: mesmo corpo de testes; apenas nome do descartável adaptado.
let lookup=fs.readFileSync(`${dir}/fixtures/stock_reference_access.sql`,'utf8').replace("LIKE 'moralles_lookup_test_%'","LIKE 'moralles_phase9_test_%'");
sql(liveRefs,lookup);ok('526 assertions hotfix no vivo equivalente');
sql(candidate,hotfixSql);
before=digest(candidate);file(candidate,'supabase/migrations/20260916133618_phase7_align_reference_catalogs.sql',/PHASE7_REFERENCE_POLICY_DRIFT/);assert.equal(digest(candidate),before);ok('F7 referencias recusa hotfix em clone candidato ja contido');
sql(candidate,lookup);ok('526 assertions hotfix sobre candidato F7');
for(const phase of [3,4,5,6,7]){const names={3:'logs',4:'salmon',5:'suppliers',6:'products',7:'security'};let t=fs.readFileSync(`supabase/tests/database/phase${phase}_${names[phase]}.sql`,'utf8').replaceAll(`LIKE 'moralles_phase${phase}_test_%'`,"LIKE 'moralles_phase9_test_%'");sql(candidate,t);ok('regressao SQL F'+phase);}
// Histórico é compilado apenas em clone separado. Nunca executa statements históricos no vivo.
const historyDb=clone('history','moralles_phase9_test_live'),focus=read('historico-foco.json');
const identity='admin_upsert_company_membership(uuid,uuid,uuid,app_role,text[],text,uuid,text,boolean)';
const compiled=[];
for(const version of ['20260910003448','20260912164600','20260915120000']){
 const remote=focus.find(h=>h.version===version);
 const source=fs.readdirSync('supabase/migrations').find(f=>f.startsWith(version+'_'));
 const definition=s=>s.slice(s.search(/CREATE OR REPLACE FUNCTION/i));
 // Foco contém um CREATE por arquivo; extrai usando splitter para excluir demais statements.
 const {splitSql}=await import('./phase9-sql.mjs');
 const extract=s=>splitSql(s).filter(s=>/CREATE OR REPLACE FUNCTION/i.test(s)).map(definition).join(';\n')+';';
 const sources=[extract(remote.statements.join(';\n')+';'),extract(fs.readFileSync(`supabase/migrations/${source}`,'utf8'))];
 const rows=sources.map(s=>JSON.parse(sql(historyDb,`BEGIN; ${s}\nSELECT jsonb_build_object('md5',md5(pg_get_functiondef('${identity}'::regprocedure)),'acl',(SELECT proacl::text FROM pg_proc WHERE oid='${identity}'::regprocedure)); ROLLBACK;`)));
 assert.deepEqual(rows[0],rows[1]);compiled.push({version,...rows[0],sameAsLive:rows[0].md5===current.functions.find(f=>f.signature===identity).md5});
}
assert.equal(compiled.at(-1).sameAsLive,true);ok('3 definicoes admin historicas compiladas: Git=history; ultima=vivo',compiled);
// Dados, hashes e falhas ficam em evidência sem identificadores pessoais reais.
const result={capturedAt:new Date().toISOString(),databases,checks,compiled,integratedRelease:'BLOCKED: F3 antes de F4-F8; F7 referencia conflita com hotfix. Regressao de candidato nao prova construcao a partir do vivo.',productionMutations:false,limits:['SQL PostgreSQL real; Auth fixture, sem gateway/browser','Clone candidato herdado F7, nao obtido pelo release bloqueado','Nenhuma migration historica alterada ou history repair executado']};
fs.writeFileSync(`${dir}/ensaios.json`,JSON.stringify(result,null,2)+'\n');
