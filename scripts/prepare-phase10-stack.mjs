// Stack nova real, template candidato separado do release integrado bloqueado.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const browser=process.env.PHASE10_SCENARIO==='browser';
const dir=browser?'.phase10-browser.local':'.phase10.local';
const targetPort=browser?56632:56622;
const runtime=JSON.parse(fs.readFileSync(`${dir}/runtime.json`,'utf8').replace(/^\uFEFF/,''));
assert.equal(runtime.API_URL,`http://127.0.0.1:${targetPort-1}`);
const env={...process.env,PGPASSWORD:'postgres',PGOPTIONS:'-c timezone=UTC'};
const args=port=>['-X','-w','-qAt','-h','127.0.0.1','-p',String(port),'-U','postgres','-v','ON_ERROR_STOP=1','-d',port===15440?'moralles_phase7_test_acceptance':'postgres'];
const sql=(port,input)=>execFileSync('psql',args(port===56622?targetPort:port),{env,input,encoding:'utf8',maxBuffer:64*1024*1024});
const catalog=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/catalogo-vivo.json','utf8'));
const empty=catalog.relations.filter(r=>r.kind==='r').map(r=>`(select count(*) from "${r.schema}"."${r.name}")`);
assert.equal(sql(15440,'select '+empty.join('+')+'+(select count(*) from auth.users);').trim(),'0');
assert.equal(sql(56622,"select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r';").trim(),'0');
const dump=execFileSync('pg_dump',['-w','-h','127.0.0.1','-p','15440','-U','postgres','-d','moralles_phase7_test_acceptance','--schema-only','--schema=public','--schema=reporting','--schema=log_private','--schema=multiunit_private'],{env,encoding:'utf8',maxBuffer:64*1024*1024});
const schema='CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;\n'+dump.replace('CREATE SCHEMA public;','');
fs.writeFileSync(`${dir}/schema.sql`,schema);sql(56622,schema);
sql(56622,sql(15440,fs.readFileSync('docs/multi-unidades/fase8-20260916/exportar-acls-fixture.sql','utf8')));
const hotfix=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/historico-foco.json','utf8')).find(x=>x.version==='20260916153928');
sql(56622,hotfix.statements.join(';\n')+';');
// O template público F7 não inclui a tabela privada usada pelo trigger Auth vivo.
// Restaurar somente esse DDL, não reaplicar a migration multiunidade.
const reservation=fs.readFileSync('supabase/migrations/20260909193257_company_membership_administration.sql','utf8');
sql(56622,'CREATE SCHEMA IF NOT EXISTS multiunit_private;\n'+reservation.slice(reservation.indexOf('CREATE TABLE'),reservation.indexOf('CREATE FUNCTION')));
sql(56622,'NOTIFY pgrst, \'reload schema\';');
console.log('PASS: nova stack F10; schema candidato F7 + hotfix, sem dados privados, sem reaplicar multiunidade.');
