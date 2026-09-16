// WebSocket real; nenhum transporte/banco substituído por mock.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
const users=JSON.parse(fs.readFileSync('.phase8.local/users.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
const unit=n=>`b8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const service=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const active=[];const events={};let checks=0;
function ok(value,label){if(!value)throw Error(label);checks++;console.log('PASS',label);}
const pause=()=>new Promise(r=>setTimeout(r,2000));
async function delivered(predicate) {for(let i=0;i<20&&!predicate();i++)await new Promise(r=>setTimeout(r,500));}
async function listen(label,name,company,filter=true) {
 const client=createClient(runtime.API_URL,runtime.ANON_KEY,{accessToken:async()=>users[name].token,global:{headers:{'x-company-id':company}}});
 await client.realtime.setAuth(users[name].token);active.push(client);events[label]=[];
 const channel=client.channel('phase8-'+label+'-'+crypto.randomUUID()).on('postgres_changes',
 {event:'*',schema:'public',table:'notifications',...(filter?{filter:`company_id=eq.${company}`}:{})},p=>events[label].push({id:p.new.id??p.old.id,event:p.eventType,company:p.new.company_id}));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('subscribe timeout '+label)),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('subscribe failed '+label));}});});
 return {client,channel};
}
async function insert(name,company) {const id=crypto.randomUUID();const {error}=await service.from('notifications').insert({id,company_id:company,recipient_user_id:users[name].id,title:'Fixture',message:'Synthetic',type:'PHASE8'});if(error)throw Error('fixture insert '+error.code);return id;}
async function status(name,company,status){const r=await service.from('company_memberships').update({status}).eq('user_id',users[name].id).eq('company_id',company);if(r.error)throw Error('fixture status');}
try {
 await listen('a','a',unit(1)); await listen('b','b',unit(2));
 const ma=await listen('multiA','multi',unit(1)); await listen('multiB','multi',unit(2));
 await listen('forgedB','a',unit(2)); await listen('unfilteredA','a',unit(1),false);
 await pause();
 const a=await insert('a',unit(1)),b=await insert('b',unit(2)),mA=await insert('multi',unit(1)),mB=await insert('multi',unit(2));
 await delivered(()=>events.a.some(e=>e.id===a)&&events.b.some(e=>e.id===b)&&events.multiA.some(e=>e.id===mA)&&events.multiB.some(e=>e.id===mB));
 console.log('initial event counts',Object.fromEntries(Object.entries(events).map(([k,v])=>[k,v.length])));
 ok(events.a.some(e=>e.id===a)&&events.b.some(e=>e.id===b),'A/B simultâneos recebem seus próprios eventos');
 ok(!events.a.some(e=>e.id===b)&&!events.b.some(e=>e.id===a),'A/B sem mistura');
 ok(events.multiA.some(e=>e.id===mA)&&!events.multiA.some(e=>e.id===mB),'multi A filtrado');
 ok(events.multiB.some(e=>e.id===mB)&&!events.multiB.some(e=>e.id===mA),'multi B filtrado apesar da origem A');
 ok(events.forgedB.length===0,'header/canal B não autoriza A');
 ok(!events.unfilteredA.some(e=>e.id===mA||e.id===b),'RLS protege unidade e destinatário sem filtro');
 await ma.client.removeAllChannels();const count=events.multiA.length;await insert('multi',unit(1));await pause();ok(events.multiA.length===count,'cleanup A para eventos novos');
 await status('multi',unit(2),'revoked');const revoked=await insert('multi',unit(2));await pause();ok(!events.multiB.some(e=>e.id===revoked),'membership revogado não recebe INSERT');
 await service.from('notifications').update({message:'Synthetic updated'}).eq('id',mB);await pause();ok(!events.multiB.some(e=>e.id===mB&&e.event==='UPDATE'),'membership revogado não recebe UPDATE');
 await status('multi',unit(2),'inactive');const inactive=await insert('multi',unit(2));await pause();ok(!events.multiB.some(e=>e.id===inactive),'membership inativo não recebe INSERT');
 await status('multi',unit(2),'active');await service.from('companies').update({ativo:false}).eq('id',unit(2));const off=await insert('multi',unit(2));await pause();ok(!events.multiB.some(e=>e.id===off),'empresa inativa não recebe INSERT');
 await service.from('companies').update({ativo:true}).eq('id',unit(2));
 const password=crypto.randomUUID()+'aA!';
 const reset=await service.auth.admin.updateUserById(users.multi.id,{password});if(reset.error)throw Error('fixture credential rotation');
 const auth=createClient(runtime.API_URL,runtime.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await auth.auth.signInWithPassword({email:'phase8-multi@example.test',password});if(login.error)throw Error('fixture login');
 const renewed=await auth.auth.refreshSession();ok(!renewed.error&&!!renewed.data.session,'renovação real de sessão Auth');
 users.multi.token=renewed.data.session.access_token;
 const reconnected=await listen('reconnected','multi',unit(2));
 await reconnected.client.realtime.setAuth(users.multi.token);
 await pause();
 const afterReconnect=await insert('multi',unit(2));await delivered(()=>events.reconnected.some(e=>e.id===afterReconnect));
 ok(events.reconnected.some(e=>e.id===afterReconnect),'reconexão com JWT renovado recebe INSERT autorizado');
 await service.from('notifications').update({message:'Synthetic reconnect update'}).eq('id',afterReconnect);await delivered(()=>events.reconnected.some(e=>e.id===afterReconnect&&e.event==='UPDATE'));
 ok(events.reconnected.some(e=>e.id===afterReconnect&&e.event==='UPDATE'),'UPDATE autorizado após renovação');
 await reconnected.client.removeAllChannels();await auth.auth.signOut();
 const afterLogout=await insert('multi',unit(2));await pause();
 ok(!events.reconnected.some(e=>e.id===afterLogout),'logout com cleanup interrompe canal');
 // Deixa uma sessão sintética válida para os demais runners, sem imprimi-la.
 const nextSession=await auth.auth.signInWithPassword({email:'phase8-multi@example.test',password});
 if(nextSession.error)throw Error('fixture session renewal');
 users.multi.token=nextSession.data.session.access_token;
 fs.writeFileSync('.phase8.local/users.json',JSON.stringify(users));
 await service.from('notifications').delete().eq('id',b);await pause();
 const deleteObservation={a:events.a.some(e=>e.id===b&&e.event==='DELETE'),unfilteredA:events.unfilteredA.some(e=>e.id===b&&e.event==='DELETE'),b:events.b.some(e=>e.id===b&&e.event==='DELETE')};
 console.log('DELETE observation (only PK, no private payload)',JSON.stringify(deleteObservation));
 if(!process.argv.includes('--before')) ok(!deleteObservation.a&&!deleteObservation.unfilteredA&&!deleteObservation.b,'DELETE não transmite identificadores após contenção');
 fs.writeFileSync('.phase8.local/realtime-result.json',JSON.stringify({checks,deleteObservation,realWebSocket:true},null,2));
 console.log('PASS total Realtime',checks);
} finally {
 await status('multi',unit(2),'active');await service.from('companies').update({ativo:true}).eq('id',unit(2));
 await Promise.all(active.map(c=>c.removeAllChannels()));
}
