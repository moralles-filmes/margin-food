import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const dir='.phase10.local', out='docs/multi-unidades/fase10-20260916';
const runtime=JSON.parse(fs.readFileSync(`${dir}/runtime.json`,'utf8'));assert.equal(runtime.API_URL,'http://127.0.0.1:56621');
const users=JSON.parse(fs.readFileSync(`${dir}/users.json`,'utf8')), units=JSON.parse(fs.readFileSync(`${dir}/units.json`,'utf8'));
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,options), tokens={};
for(const [name,u] of Object.entries(users)){const c=createClient(runtime.API_URL,runtime.ANON_KEY,options);const r=await c.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(r.error,null,r.error?.code);tokens[name]=r.data.session.access_token;}
const scoped=(name,company)=>createClient(runtime.API_URL,runtime.ANON_KEY,{...options,global:{headers:{Authorization:`Bearer ${tokens[name]}`,...(company===null?{}:{'x-company-id':company})}}});
const checks=[];const pass=label=>{checks.push({label,status:'PASS'});console.log('PASS '+label);};
for(const [name,count] of [['one',1],['multi',2],['none',0]]){const r=await scoped(name,null).rpc('list_my_companies');assert.equal(r.error,null);assert.equal(r.data.length,count);pass(`descoberta ${name}: ${count} unidades`);}
for(const [name,company,allowed] of [['one',units.a,true],['one',units.b,false],['multi',units.b,true],['multi',units.c,false],['multi','forged',false],['multi','00000000-0000-0000-0000-000000000001',false],['multi',null,true]]){
 const r=await scoped(name,company).rpc('get_my_company_context');assert.equal(!r.error,allowed,r.error?.message);if(allowed)assert.equal(r.data.company_id,company??units.a);pass(`contexto ${name}/${company===null?'origem':company===units.a?'A':company===units.b?'B':'forjado'} ${allowed?'permitido':'recusado'}`);
}
for(const company of [units.a,units.b,units.a]){const r=await scoped('multi',company).from('fin_contas').select('company_id,nome');assert.equal(r.error,null);assert.ok(r.data.length);assert.ok(r.data.every(row=>row.company_id===company));}pass('A→B→A: leituras HTTP isoladas com JWT real');
const context=await scoped('multi',units.a).rpc('get_my_company_context');assert.ok(context.data.permissions.includes('financeiro:contas:view'));assert.ok(!context.data.permissions.includes('finance:read'));pass('ALLOW granular e DENY legado preservados');
for(const status of ['inactive','revoked']){assert.equal((await service.from('company_memberships').update({status}).eq('user_id',users.multi.id).eq('company_id',units.b)).error,null);assert.ok((await scoped('multi',units.b).rpc('assert_tenant')).error);assert.equal((await service.from('company_memberships').update({status:'active'}).eq('user_id',users.multi.id).eq('company_id',units.b)).error,null);pass(`membership ${status}: mesmo JWT recusado`);}
assert.equal((await service.from('companies').update({ativo:false}).eq('id',units.b)).error,null);assert.ok((await scoped('multi',units.b).rpc('assert_tenant')).error);assert.equal((await service.from('companies').update({ativo:true}).eq('id',units.b)).error,null);pass('empresa inativa recusada com mesmo JWT');
assert.ok((await scoped('admin',units.a).rpc('onboard_new_company',{p_company_name:'F10 deve negar'})).error);pass('admin local não cria empresa');
const company=await scoped('super',units.a).rpc('onboard_new_company',{p_company_name:'F10 Jornada '+Date.now()});assert.equal(company.error,null,company.error?.message);const newUnit=company.data.company_id;pass('super explícito cria empresa por RPC real');
const newIdentity={email:`f10-admin-${crypto.randomUUID()}@example.test`,password:crypto.randomUUID()+'aA!',nome:'F10 Nova Admin'};
async function handler(slug,work){
 assert.ok(process.env.PHASE10_DENO,'PHASE10_DENO obrigatório');
 const child=spawn(process.env.PHASE10_DENO,['run','--no-lock','--allow-env','--allow-net',`supabase/functions/${slug}/index.ts`],{env:{...process.env,SUPABASE_URL:runtime.API_URL,SUPABASE_ANON_KEY:runtime.ANON_KEY,SB_SECRET_KEY:runtime.SERVICE_ROLE_KEY,ALLOWED_ORIGINS:'http://127.0.0.1:8085'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let ready=false;const log=fs.createWriteStream(`${dir}/handler-${slug}.log`);const capture=b=>{log.write(b);if(String(b).includes('Listening'))ready=true;};child.stdout.on('data',capture);child.stderr.on('data',capture);
 try{for(let i=0;i<200&&!ready;i++){assert.equal(child.exitCode,null,'handler encerrou');await new Promise(r=>setTimeout(r,100));}assert.ok(ready);await work(async(name,unit,body)=>{const r=await fetch('http://127.0.0.1:8000',{method:'POST',headers:{Authorization:`Bearer ${tokens[name]}`,'x-company-id':unit,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,`${slug}: ${r.status} ${data.error??''}`);return data;});}
 finally{child.kill();await new Promise(r=>child.once('close',r));log.end();}
}
let adminId;
await handler('admin-companies',async call=>{const r=await call('super',units.a,{action:'create-first-user',company_id:newUnit,...newIdentity});adminId=r.user_id;assert.ok(adminId);});
let login=await createClient(runtime.API_URL,runtime.ANON_KEY,options).auth.signInWithPassword({email:newIdentity.email,password:newIdentity.password});assert.equal(login.error,null);tokens.newAdmin=login.data.session.access_token;pass('reserva pré-Auth → primeiro admin → login real');
const original=await service.from('profiles').select('id,nome,email,company_id').eq('id',adminId).single();assert.equal(original.data.company_id,newUnit);
await handler('admin-users',async call=>{
 const employee={email:`f10-user-${crypto.randomUUID()}@example.test`,password:crypto.randomUUID()+'aA!',nome:'F10 Pessoa',role:'viewer',permissions:['financeiro:contas:view']};
 const r=await call('super',units.a,{action:'create',...employee});assert.ok(r.user.id);const person=r.user.id;
 const before=await service.from('profiles').select('id,nome,email,company_id').eq('id',person).single();
 const linked=await call('newAdmin',newUnit,{action:'create',...employee,password:'',nome:'Nome não substitui identidade'});assert.equal(linked.user.id,person);assert.equal(linked.linked,true);
 assert.deepEqual((await service.from('profiles').select('id,nome,email,company_id').eq('id',person).single()).data,before.data);
 const personLogin=await createClient(runtime.API_URL,runtime.ANON_KEY,options).auth.signInWithPassword({email:employee.email,password:employee.password});assert.equal(personLogin.error,null);tokens.person=personLogin.data.session.access_token;pass('admin cria usuário; outro admin vincula email existente sem mudar ID/nome/email/senha/origem');
 await call('newAdmin',newUnit,{action:'delete',userId:person,motivo:'Ensaio sintético F10'});
 assert.ok((await scoped('person',newUnit).rpc('assert_tenant')).error);assert.equal((await scoped('person',units.a).rpc('assert_tenant')).error,null);pass('revogar só membership mantém login e acesso original');
 await call('newAdmin',newUnit,{action:'create',email:employee.email,password:'',nome:employee.nome,role:'viewer',permissions:['estoque:dashboard:view']});
 const permissions=await scoped('person',newUnit).rpc('get_my_company_context');assert.equal(permissions.error,null);assert.ok(permissions.data.permissions.includes('estoque:dashboard:view'));assert.ok(!permissions.data.permissions.includes('financeiro:contas:view'));pass('reintrodução usa grants novos sem restaurar antigos');
});
fs.writeFileSync(`${out}/http.json`,JSON.stringify({capturedAt:new Date().toISOString(),baseline:'Supabase real local: candidato F7 + hotfix; Auth trigger vivo. Não release integrado.',checks,productionMutations:false,limits:['handlers Deno diretos; não gateway cloud','sem convites/email/IA/WhatsApp']},null,2)+'\n');
