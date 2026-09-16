// Handlers Deno reais contra Auth/PostgREST descartáveis. Sem IA/WhatsApp externos.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
const users=JSON.parse(fs.readFileSync('.phase8.local/users.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
const deno=process.env.PHASE8_DENO;if(!deno)throw Error('Defina PHASE8_DENO para o executável local.');
const service=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const unit=n=>`b8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
for(let i=0;i<3;i++) {const r=await service.from('cotacoes').insert({id:ids[i],company_id:unit(i===2?2:1),codigo:'PH8-'+ids[i].slice(0,8),titulo:'Fixture',created_by:users.a.id});if(r.error)throw Error('cotacao fixture '+r.error.code);}
const suppliers=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
for(let i=0;i<3;i++){const r=await service.from('cotacao_fornecedores').insert({id:suppliers[i],company_id:unit(i===2?2:1),cotacao_id:ids[i],supplier_nome_snapshot:'Fixture'});if(r.error)throw Error('supplier fixture '+r.error.code);}
let checks=0;const summary=[];
function sql(text) {
 const r=spawnSync('psql',['-X','-w','-h','127.0.0.1','-p','56522','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}});
 if(r.status)throw Error('fixture SQL failed');
}
async function run(slug,cases){
 const cronSecret=crypto.randomUUID();
 const child=spawn(deno,['run','--no-lock','--allow-env','--allow-net',`supabase/functions/${slug}/index.ts`],{env:{...process.env,SUPABASE_URL:runtime.API_URL,SUPABASE_ANON_KEY:runtime.ANON_KEY,SB_SECRET_KEY:runtime.SERVICE_ROLE_KEY,CRON_SECRET:cronSecret,ALLOWED_ORIGINS:'https://a.example.test,https://b.example.test'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let ready=false;const listening=b=>{if(b.toString().includes('Listening'))ready=true;};child.stdout.on('data',listening);child.stderr.on('data',listening);
 try{
  for(let i=0;i<100&&!ready;i++){if(child.exitCode!==null)throw Error('Deno exited '+slug);await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Deno not ready');
 for(const c of cases){
   if(c.before) await c.before();
   const token=c.service?cronSecret:c.user?users[c.user].token:c.invalid?'invalid-test-token':null;
   const headers={'Content-Type':'application/json',Origin:c.origin??'https://a.example.test',...(token?{Authorization:`Bearer ${token}`} : {}),...(c.company===null?{}:{'x-company-id':c.company??unit(1)})};
   const invoke=()=>fetch('http://127.0.0.1:8000',{method:c.method??'POST',headers,...(['GET','OPTIONS'].includes(c.method)?{}:{body:JSON.stringify(c.body??{})})});
   const responses=await Promise.all(Array.from({length:c.parallel??1},invoke));
   for(const response of responses) {
   const text=await response.text();let body;try{body=JSON.parse(text)}catch{body={}}
   if(response.status!==c.status||response.headers.get('Access-Control-Allow-Origin')!==headers.Origin||(c.test&&!c.test(body)))throw Error(`${slug} ${c.label}: status ${response.status}; response code ${body.error?.code??body.error??'none'}`);
   checks++;summary.push({edge:slug,case:c.label,status:response.status});console.log('PASS',slug,c.label);
   }
   if(c.after)await c.after();
  }
 }finally{child.kill();await new Promise(r=>child.once('close',r));}
}
const body={cotacao_id:ids[0],cotacao_fornecedor_id:suppliers[0],tipo:'SOLICITACAO_COTACAO',phone:'5511000000000',message:'Synthetic - never sent'};
const negative=[{label:'OPTIONS',method:'OPTIONS',status:200},{label:'anon',status:401},{label:'JWT inválido',invalid:true,status:401}];
await run('send-whatsapp-zapi',[...negative,{label:'método',method:'GET',status:405},
 ...['none'].map(user=>({label:'sem permissão',user,body,status:403})),
 {label:'granular ALLOW legado DENY',user:'granular',body,status:200,test:b=>b.error==='ZAPI_NOT_CONFIGURED'},
 {label:'super permitido',user:'super',body,status:200,test:b=>b.error==='ZAPI_NOT_CONFIGURED'},
 {label:'A header B',user:'a',company:unit(2),body,status:403},
 {label:'header inválido',user:'a',company:'invalid',body,status:403},
 {label:'placeholder',user:'a',company:'00000000-0000-0000-0000-000000000001',body,status:403},
 {label:'header ausente usa origem',user:'a',company:null,body,status:200,test:b=>b.error==='ZAPI_NOT_CONFIGURED'},
 {label:'fornecedor B',user:'a',body:{...body,cotacao_fornecedor_id:suppliers[2]},status:404},
 {label:'fornecedor outra cotação A',user:'a',body:{...body,cotacao_fornecedor_id:suppliers[1]},status:404},
 {label:'cotação B',user:'adminA',body:{...body,cotacao_id:ids[2]},status:404},
 {label:'body role não concede',user:'none',body:{...body,role:'service_role',company_id:unit(2),created_by:users.super.id},status:403},
 {label:'multi B autorizado',user:'multi',company:unit(2),body:{...body,cotacao_id:ids[2],cotacao_fornecedor_id:suppliers[2]},status:200,test:b=>b.error==='ZAPI_NOT_CONFIGURED'},
 ...['revoked','inactive'].map(status=>({label:'membership '+status,user:'multi',company:unit(2),body,status:403,
 before:()=>sql(`UPDATE public.company_memberships SET status='${status}' WHERE user_id='${users.multi.id}' AND company_id='${unit(2)}'`),
 after:()=>sql(`UPDATE public.company_memberships SET status='active' WHERE user_id='${users.multi.id}' AND company_id='${unit(2)}'`)})),
 {label:'empresa inativa',user:'multi',company:unit(2),body,status:403,
 before:()=>sql(`UPDATE public.companies SET ativo=false WHERE id='${unit(2)}'`),
 after:()=>sql(`UPDATE public.companies SET ativo=true WHERE id='${unit(2)}'`)},
]);
await run('cotacao-ia',[...negative,{label:'método',method:'GET',status:405},{label:'sem permissão',user:'none',body:{cotacao_id:ids[0],task:'analise_precos'},status:403},{label:'granular permitido sem disparo externo',user:'granular',body:{cotacao_id:ids[0],task:'analise_precos'},status:200,test:b=>b.error==='IA_NOT_CONFIGURED'}]);
await run('admin-users',[...negative,{label:'admin local sem gate de usuários',user:'adminA',body:{action:'list'},status:403},{label:'global lista unidade',user:'super',body:{action:'list'},status:200}]);
const requisition=crypto.randomUUID();
const requisitionInsert=await service.from('requisicoes_estoque').insert({id:requisition,company_id:unit(1),setor:'Fixture',solicitante_user_id:users.a.id});
if(requisitionInsert.error)throw Error('fixture requisicao '+requisitionInsert.error.code);
await run('requisicao-estoque',[
 {label:'recurso cruzado não confirma ciência',user:'b',company:unit(2),body:{action:'marcar_requisicao_visto',requisicao_id:requisition},status:404},
 {label:'owner forjado não confirma',user:'none',body:{action:'marcar_requisicao_visto',requisicao_id:requisition,solicitante_user_id:users.none.id},status:403},
 {label:'self-service do solicitante',user:'a',body:{action:'marcar_requisicao_visto',requisicao_id:requisition},status:200},
 {label:'negação grava notificação tenant',user:'super',body:{action:'negar',requisicao_id:requisition},status:200},
 {label:'retry de notificação',user:'super',body:{action:'negar',requisicao_id:requisition},status:200},
]);
const notification=await service.from('notifications').select('company_id,recipient_user_id').eq('entity_id',requisition).eq('type','REQUISICAO_ENCERRADA');
if(notification.error||notification.data.length!==1||notification.data[0].company_id!==unit(1)||notification.data[0].recipient_user_id!==users.a.id)throw Error('notification tenant/idempotence failed');
checks++;console.log('PASS notification unique and tenant');
for(const slug of ['ai-chat','check-password','cmv','ficha-tecnica','inventario','requisicao-estoque','rh','rbac-lint','rbac-lint-full','rbac-lint-quick','admin-companies','admin-create-user']) {
 await run(slug,negative);
}
const denied=await service.from('user_permissions').upsert(['compras:lista:view','purchases:read'].map(permission_key=>({user_id:users.adminA.id,company_id:unit(1),permission_key,effect:'DENY'})),{onConflict:'user_id,company_id,permission_key'});
if(denied.error)throw Error('fixture DENY');
await run('purchase-requisitions',[...negative,
 {label:'admin com DENY não contorna RBAC',user:'adminA',body:{action:'listar'},status:403},
 {label:'granular-only autorizado',user:'granular',body:{action:'listar'},status:200},
 {label:'global autorizado',user:'super',body:{action:'listar'},status:200},
]);
await run('scheduled-jobs',[
 {label:'método',method:'GET',status:405},{label:'anon',body:{action:'refresh_all'},status:401},
 {label:'JWT usuário não é scheduler',user:'super',body:{action:'cleanup',role:'service_role'},status:401},
 {label:'serviço action inválida',service:true,body:{action:'invalid'},status:400},
 {label:'refresh real + log',service:true,body:{action:'refresh_mvs'},status:200,test:b=>b.ok===true},
 {label:'cleanup real sintético',service:true,body:{action:'cleanup'},status:200,test:b=>b.ok===true},
 {label:'retry cleanup sem apagar mais',service:true,body:{action:'cleanup'},status:200,test:b=>b.ok===true&&b.results.cleanup.deleted===0},
 {label:'refresh concorrente',parallel:2,service:true,body:{action:'refresh_mvs'},status:200,test:b=>b.ok===true},
 {label:'falha intermediária auditoria não retorna sucesso',service:true,body:{action:'refresh_mvs'},status:500,test:b=>b.ok===false&&!!b.results.audit.error,
  before:()=>sql("CREATE FUNCTION public.phase8_fail_job_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='JOB_RUN' THEN RAISE EXCEPTION 'PHASE8_SYNTHETIC_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER phase8_fail_job_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.phase8_fail_job_audit();"),
  after:()=>sql('DROP TRIGGER phase8_fail_job_audit ON public.audit_logs; DROP FUNCTION public.phase8_fail_job_audit();')},
]);
fs.writeFileSync('.phase8.local/edge-result.json',JSON.stringify({checks,cases:summary},null,2));console.log('PASS total Edge HTTP',checks);
