// Reconstrói SOMENTE schema público/reporting vazio do catálogo, nunca dados reais.
import fs from 'node:fs';
const dir='docs/multi-unidades/fase9-20260916', scratch='.phase9.local';
fs.mkdirSync(scratch,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(`${dir}/${f}`,'utf8'));
const c=read('catalogo-vivo.json'),x=read('catalogo-complementar.json'),en=read('enums-privados.json');
const q=s=>'"'+s.replaceAll('"','""')+'"',lit=s=>"'"+s.replaceAll("'","''")+"'";
const name=r=>`${q(r.schema)}.${q(r.name)}`;
let sql=`\\set ON_ERROR_STOP on\nDO $$ BEGIN IF current_database() NOT LIKE 'moralles_phase9_test_%' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_FIXTURES_ONLY'; END IF; END $$;\nSET check_function_bodies=off;\nCREATE SCHEMA reporting;\nCREATE SCHEMA multiunit_private;\n`;
for(const e of en.enums)sql+=`CREATE TYPE public.${q(e.name)} AS ENUM (${e.labels.map(lit).join(',')});\n`;
for(const s of x.sequences.filter(s=>s.schema==='public'))sql+=`CREATE SEQUENCE ${name(s)} START ${s.start} INCREMENT ${s.increment} MINVALUE ${s.min} MAXVALUE ${s.max} CACHE ${s.cache}${s.cycle?' CYCLE':''};\n`;
for(const f of c.functions.filter(f=>['sql','plpgsql'].includes(f.language)))sql+=f.definition+';\n';
const tables=c.relations.filter(r=>r.kind==='r');
for(const r of tables){
 const columns=c.columns.filter(a=>a.schema===r.schema&&a.table===r.name);
 sql+=`CREATE TABLE ${name(r)} (${columns.map(a=>`${q(a.column)} ${a.type}${a.generated?` GENERATED ALWAYS AS (${a.default}) STORED`:a.default?` DEFAULT ${a.default}`:''}${a.notnull?' NOT NULL':''}`).join(',\n')});\n`;
}
for(const kind of ['p','u','c'])for(const a of c.constraints.filter(a=>a.type===kind))sql+=`ALTER TABLE ${a.table} ADD CONSTRAINT ${q(a.name)} ${a.definition};\n`;
for(const r of c.relations.filter(r=>r.kind==='m'||r.kind==='v'))sql+=`CREATE ${r.kind==='m'?'MATERIALIZED ':''}VIEW ${name(r)} AS ${r.definition};\n`;
const constraints=new Set(c.constraints.filter(a=>['p','u'].includes(a.type)).map(a=>a.name));
for(const i of c.indexes.filter(i=>!constraints.has(i.indexname)))sql+=i.indexdef+';\n';
for(const a of c.constraints.filter(a=>a.type==='f'))sql+=`ALTER TABLE ${a.table} ADD CONSTRAINT ${q(a.name)} ${a.definition};\n`;
for(const t of c.triggers)sql+=t.definition+';\n';
for(const r of c.relations){
 sql+=`ALTER ${r.kind==='m'?'MATERIALIZED VIEW':r.kind==='v'?'VIEW':'TABLE'} ${name(r)} OWNER TO ${q(r.owner)};\n`;
 if(r.kind==='r'){if(r.rls)sql+=`ALTER TABLE ${name(r)} ENABLE ROW LEVEL SECURITY;\n`;if(r.force)sql+=`ALTER TABLE ${name(r)} FORCE ROW LEVEL SECURITY;\n`;}
}
for(const p of c.policies.filter(p=>['public','reporting'].includes(p.schemaname)))sql+=`CREATE POLICY ${q(p.policyname)} ON ${q(p.schemaname)}.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r=>r==='public'?'PUBLIC':q(r)).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''};\n`;
const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE',U:'USAGE'};
function grants(target,acl,owner){
 let out=`REVOKE ALL ON ${target} FROM PUBLIC,anon,authenticated,service_role;\n`;
 for(const entry of acl?.slice(1,-1).split(',')??[]){const [who,rest]=entry.split('=');const rights=rest.split('/')[0];
  if(rights.includes('*'))throw Error('Grant option exige restore dedicado');
  if(rights)out+=`GRANT ${[...rights].map(k=>privileges[k]??(()=>{throw Error('Unknown ACL '+k)})()).join(',')} ON ${target} TO ${who?q(who):'PUBLIC'};\n`;
 }
 return out;
}
for(const r of c.relations)sql+=grants(`TABLE ${name(r)}`,r.acl,r.owner);
for(const f of c.functions){sql+=`ALTER FUNCTION ${f.signature} OWNER TO ${q(f.owner)};\n`;if(f.acl!==null)sql+=grants(`FUNCTION ${f.signature}`,f.acl,f.owner);}
sql+='GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;\nSET check_function_bodies=on;\n';
fs.writeFileSync(`${scratch}/live-schema.sql`,sql);
console.log(JSON.stringify({tables:tables.length,functions:c.functions.filter(f=>['sql','plpgsql'].includes(f.language)).length,output:`${scratch}/live-schema.sql`,limits:'Auth SQL fixture; sem GoTrue/Storage/Realtime/snapshots privados históricos. Catálogo completo separado; comparar restore antes dos testes.'}));
