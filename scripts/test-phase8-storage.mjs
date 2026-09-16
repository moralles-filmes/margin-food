// Real Storage/Auth/PostgREST. Exige a stack descartável e fixtures próprias.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
const users=JSON.parse(fs.readFileSync('.phase8.local/users.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
const unit=n=>`b8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const path=n=>`c8000000-0000-4000-8000-${String(n).padStart(12,'0')}/phase8.txt`;
const client=(name,company)=>createClient(runtime.API_URL,runtime.ANON_KEY,{accessToken:async()=>users[name]?.token??null,global:{headers:company===undefined?{}:{'x-company-id':company}}});
const service=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let checks=0;function ok(value,label){if(!value)throw Error(label);checks++;console.log('PASS',label);}
async function main() {
const a=client('a',unit(1)),b=client('b',unit(2)),multiA=client('multi',unit(1)),multiB=client('multi',unit(2));
if(process.argv.includes('--before')) {
 for(let n=1;n<=2;n++){const r=await service.storage.from('rh-documentos').upload(path(n),'synthetic phase8',{upsert:true,contentType:'text/plain'});ok(!r.error,'service synthetic upload '+n);}
 const r=await client('multi').storage.from('rh-documentos').download(path(2));
 ok(!r.error,'reproduzido: sem header acessa arquivo de B apesar de origem A');
 return;
}
for(const [name,company,object,allowed] of [
 ['a',unit(1),1,true],['a',unit(1),2,false],['a',unit(2),2,false],['b',unit(2),2,true],
 ['adminA',unit(1),2,false],['multi',unit(1),1,true],['multi',unit(1),2,false],['multi',unit(2),2,true],
 ['multi',undefined,1,true],['multi',undefined,2,false],['none',unit(1),1,false],['granular',unit(1),1,true],
 ['super',unit(1),1,true],['super',unit(2),2,false],['a','invalid',1,false],['a','00000000-0000-0000-0000-000000000001',1,false],['anon',unit(1),1,false],
]) {const r=await client(name,company).storage.from('rh-documentos').download(path(object));ok(!r.error===allowed,`download ${name} ${company===unit(2)?'B':company===undefined?'sem-header':'A/invalid'} objeto ${object}`);}
for(const bad of ['../phase8.txt','%2e%2e/phase8.txt',path(1).replace('/','/../'),path(1).replace('/','\\'),null]){
 const r=await a.rpc('can_access_company_document',{p_path:bad,p_action:'view'});ok(!r.error&&r.data===false,'path recusado '+String(bad?.slice(0,5)));
}
const nullAction=await a.rpc('can_access_company_document',{p_path:path(1),p_action:null});ok(!nullAction.error&&nullAction.data===false,'NULL action recusada');
const deniedUpload=await a.storage.from('rh-documentos').upload(path(2).replace('phase8','forged'),'fixture');ok(!!deniedUpload.error,'upload A->B recusado');
const copy=await a.storage.from('rh-documentos').copy(path(1),path(2).replace('phase8','copy'));ok(!!copy.error,'copy A->B recusada');
const move=await a.storage.from('rh-documentos').move(path(1),path(2).replace('phase8','move'));ok(!!move.error,'move A->B recusado');
const listing=await a.storage.from('rh-documentos').list(path(2).split('/')[0]);ok(!listing.error&&listing.data.length===0,'list B invisível em A');
const replace=await a.storage.from('rh-documentos').upload(path(1),'synthetic replacement',{upsert:true});ok(!replace.error,'upsert autorizado');
const sign=await a.storage.from('rh-documentos').createSignedUrl(path(1),3);ok(!sign.error,'URL assinada curta criada');
const revoked=await service.from('company_memberships').update({status:'revoked'}).eq('user_id',users.a.id).eq('company_id',unit(1));ok(!revoked.error,'fixture membership revogada');
ok(!!(await a.storage.from('rh-documentos').download(path(1))).error,'download novo recusado após revogação');
const signed=await fetch(sign.data.signedUrl);await signed.arrayBuffer();ok(signed.ok,'URL já assinada permanece válida após revogação');
await new Promise(r=>setTimeout(r,4500));
const expired=await fetch(sign.data.signedUrl);await expired.arrayBuffer();ok(!expired.ok,'URL recusada após TTL');
await service.from('company_memberships').update({status:'active'}).eq('user_id',users.a.id).eq('company_id',unit(1));
await service.from('company_memberships').update({status:'inactive'}).eq('user_id',users.multi.id).eq('company_id',unit(2));
ok(!!(await multiB.storage.from('rh-documentos').download(path(2))).error,'membership inativo recusado');
await service.from('company_memberships').update({status:'active'}).eq('user_id',users.multi.id).eq('company_id',unit(2));
await service.from('companies').update({ativo:false}).eq('id',unit(2));
ok(!!(await b.storage.from('rh-documentos').download(path(2))).error,'empresa inativa recusada');
await service.from('companies').update({ativo:true}).eq('id',unit(2));
const remove=await a.storage.from('rh-documentos').remove([path(2)]);ok(!!remove.error||remove.data.length===0,'remove cruzado não remove arquivo');
ok(!(await b.storage.from('rh-documentos').download(path(2))).error,'arquivo B preservado');
console.log('PASS total Storage',checks);
fs.writeFileSync('.phase8.local/storage-result.json',JSON.stringify({checks,realAuth:true,realStorage:true}));
}
await main();
