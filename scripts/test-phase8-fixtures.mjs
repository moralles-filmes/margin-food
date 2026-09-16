import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const runtime=JSON.parse(fs.readFileSync('.phase8.local/runtime.json','utf8'));
if(runtime.API_URL!=='http://127.0.0.1:56521')throw Error('LOCAL_ONLY');
const admin=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const existing=await admin.from('companies').select('id',{count:'exact',head:true});
if(existing.error||existing.count!==0)throw Error('EMPTY_DISPOSABLE_REQUIRED');
const users={};
for(const name of ['a','b','adminA','multi','super','none','granular']) {
 const email=`phase8-${name.toLowerCase()}@example.test`,password=crypto.randomUUID()+'aA!';
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw Error('fixture auth '+error.code);
 const client=createClient(runtime.API_URL,runtime.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error('fixture login '+login.error.code);
 users[name]={id:data.user.id,token:login.data.session.access_token};
}
fs.writeFileSync('.phase8.local/users.json',JSON.stringify(users));
const unit=n=>`b8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const col=n=>`c8000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let sql=`BEGIN; INSERT INTO public.companies(id,nome) VALUES('${unit(1)}','Phase8 A'),('${unit(2)}','Phase8 B');\n`;
const perms=['rh:documentos:view','rh:documentos:create','rh:documentos:edit','rh:documentos:delete','rh:documentos:manage','rh:manage','system:global:manage','compras:cotacao:manage','purchases:read','compras:lista:view'];
for(const key of perms)sql+=`INSERT INTO public.permissions(key,description,module,submodule,action) VALUES('${key}','Fixture','fixture','fixture','view') ON CONFLICT DO NOTHING;\n`;
for(const [name,user] of Object.entries(users)) {
 const company=unit(name==='b'?2:1);
 sql+=`INSERT INTO public.profiles(id,nome,email,company_id) VALUES('${user.id}','Fixture','phase8-${name.toLowerCase()}@example.test','${company}');\n`;
 const units=name==='multi'?[unit(1),unit(2)]:[company];
 for(const id of units) {
  sql+=`INSERT INTO public.company_memberships(user_id,company_id) VALUES('${user.id}','${id}');\n`;
  sql+=`INSERT INTO public.user_roles(user_id,company_id,role) VALUES('${user.id}','${id}','${name==='adminA'?'admin':'viewer'}');\n`;
  if(name!=='none') for(const key of perms) {
   const allow=name==='super'?key==='system:global:manage':key!=='system:global:manage'&&key!=='rh:manage'&&key!=='purchases:read';
   sql+=`INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect) VALUES('${user.id}','${id}','${key}','${allow?'ALLOW':'DENY'}');\n`;
  }
 }
}
for(let n=1;n<=2;n++)sql+=`INSERT INTO public.rh_colaboradores(id,nome,company_id) VALUES('${col(n)}','Fixture','${unit(n)}');\n`;
sql+='COMMIT;';
fs.writeFileSync('.phase8.local/fixtures.sql',sql);
const r=spawnSync('psql',['-X','-w','-h','127.0.0.1','-p','56522','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','.phase8.local/fixtures.sql'],{encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'}});
fs.writeFileSync('.phase8.local/fixtures.log',r.stdout+r.stderr);console.log('fixtures SQL',r.status);if(r.status)throw Error('Fixture SQL failed; see ignored local log.');
