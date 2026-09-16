import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const browser=process.env.PHASE10_SCENARIO==='browser';
const dir=browser?'.phase10-browser.local':'.phase10.local';
const port=browser?'56632':'56622';
const runtime=JSON.parse(fs.readFileSync(`${dir}/runtime.json`,'utf8').replace(/^\uFEFF/,''));
assert.equal(runtime.API_URL,`http://127.0.0.1:${Number(port)-1}`);
const env={...process.env,PGPASSWORD:'postgres'};
const sql=input=>execFileSync('psql',['-X','-w','-qAt','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env,input,encoding:'utf8'}).trim();
assert.equal(sql('select (select count(*) from auth.users)+(select count(*) from public.companies);'),'0');
const service=createClient(runtime.API_URL,runtime.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const unit=n=>`b1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const permissions=['system:global:manage','system:admin','configuracoes:usuarios:view','configuracoes:usuarios:manage','users:manage','estoque:dashboard:view','estoque:catalogo:view','estoque:catalogo:create','estoque:cadastros:view','estoque:movimentacoes:view','financeiro:dashboard:view','financeiro:contas:view','financeiro:conciliacao:view','financeiro:relatorio-socios:view','financeiro:relatorio-socios:export','stock:read','finance:read','finance:manage'];
sql(`insert into companies(id,nome) values('${unit(1)}','F10 Centro'),('${unit(2)}','F10 Shopping'),('${unit(3)}','F10 Sem acesso');\n`+permissions.map(k=>`insert into permissions(key,description,module,submodule,action) values('${k}','Fixture','fixture','fixture','view');`).join('\n'));
const users={};
// Template sintético mínimo: não copia permissões de usuários produtivos.
sql("insert into role_permissions(role,permission_key) values ('admin','system:admin'),('admin','configuracoes:usuarios:view'),('admin','configuracoes:usuarios:manage');");
for(const name of ['super','multi','one','none','admin']){
 const email=`phase10-${name}@example.test`,password=crypto.randomUUID()+'aA!';
 const r=await service.auth.admin.createUser({email,password,email_confirm:true});assert.equal(r.error,null,r.error?.code);
 const id=r.data.user.id; users[name]={id,email,password};
 sql(`insert into profiles(id,nome,email,company_id) values('${id}','F10 ${name}','${email}','${unit(1)}');`);
 if(name==='none')continue;
 for(const company of name==='multi'?[unit(1),unit(2)]:[unit(1)]){
  const role=name==='admin'||company===unit(1)&&name==='multi'?'admin':'viewer';
  sql(`insert into company_memberships(user_id,company_id) values('${id}','${company}'); insert into user_roles(user_id,company_id,role) values('${id}','${company}','${role}');`);
  const allow=name==='super'?['system:global:manage']:name==='admin'?['system:admin','configuracoes:usuarios:view','configuracoes:usuarios:manage']:permissions.filter(k=>k.startsWith('estoque:')||k.startsWith('financeiro:'));
  sql(permissions.map(k=>`insert into user_permissions(user_id,company_id,permission_key,effect) values('${id}','${company}','${k}','${allow.includes(k)?'ALLOW':'DENY'}');`).join('\n'));
 }
}
fs.writeFileSync(`${dir}/users.json`,JSON.stringify(users));
fs.writeFileSync(`${dir}/units.json`,JSON.stringify({a:unit(1),b:unit(2),c:unit(3)}));
// Trigger real do catálogo vivo; GoTrue inicializou o schema Auth nativo.
const platform=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/catalogo-plataforma.json','utf8'));
sql(platform.triggers.find(t=>t.name==='on_auth_user_created').definition+';');
// Dados apenas sintéticos. Seeds com INSERT explícito, nenhuma baixa/pagamento real.
for(let n=1;n<=2;n++){
 sql(`insert into fin_contas(company_id,nome,tipo,saldo_inicial) values('${unit(n)}','Conta F10 ${n}','CAIXA',${n*100}); insert into stock_categories(company_id,name) values('${unit(n)}','Categoria F10 ${n}');`);
 if(browser)sql(`insert into financeiro_fechamento_caixa(company_id,data,faturamento_bruto) values('${unit(n)}',CURRENT_DATE,${n*111});`);
}
fs.writeFileSync(`${dir}/users.json`,JSON.stringify(users));
fs.writeFileSync(`${dir}/units.json`,JSON.stringify({a:unit(1),b:unit(2),c:unit(3)}));
console.log('PASS: 5 identidades sintéticas, três unidades, trigger Auth real instalado; credenciais privadas.');
