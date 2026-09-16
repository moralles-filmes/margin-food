// Localizador de writers e catálogo: não certifica autorização por presença de tokens.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const dir='docs/multi-unidades/fase7-20260916/';
const catalog=JSON.parse(fs.readFileSync(dir+'catalogo-vivo.json','utf8'));
const integrity=JSON.parse(fs.readFileSync(dir+'integridade.json','utf8'));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const consumers=[]; const writes=[];
for(const file of [...walk('src'),...walk('supabase/functions')].filter(f=>/\.[jt]sx?$/.test(f)&&!/(?:\.test\.|\/test\/|\/types.ts$)/.test(f))){
 const text=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const unwrap=n=>{while(n&&(ts.isParenthesizedExpression(n)||ts.isAsExpression(n)||ts.isTypeAssertionExpression(n)||ts.isNonNullExpression(n)))n=n.expression;return n;};
 const scope=n=>{while(n&&!ts.isBlock(n)&&!ts.isSourceFile(n))n=n.parent;return n;};
 const declarations=[];
 const collect=n=>{if(ts.isVariableDeclaration(n)&&n.initializer)declarations.push(n);ts.forEachChild(n,collect);};collect(ast);
 const resolve=n=>{if(!n||!ts.isIdentifier(n))return n;for(let block=scope(n);block;block=scope(block.parent)){const d=declarations.filter(d=>d.name.getText(ast)===n.text&&d.pos<n.pos&&scope(d)===block).at(-1);if(d)return d.initializer;}return n;};
 const chain=input=>{const n=unwrap(input);if(n&&ts.isCallExpression(n)){const e=unwrap(n.expression);if(ts.isPropertyAccessExpression(e)){if(['from','rpc'].includes(e.name.text)){const arg=unwrap(n.arguments[0]);return {method:e.name.text,name:arg&&ts.isStringLiteralLike(arg)?arg.text:'<dynamic>'};}return chain(e.expression);}}return null;};
 const visit=n=>{
  const e=ts.isCallExpression(n)?unwrap(n.expression):null;
  if(ts.isCallExpression(n)&&e&&ts.isPropertyAccessExpression(e)){
   const method=e.name.text;
   if(['from','rpc'].includes(method))consumers.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,...chain(n)});
   if(['insert','upsert','update','delete'].includes(method)){
    const target=chain(e.expression);if(target?.method==='from'){
     const payload=n.arguments[0];const resolved=resolve(payload);
     writes.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,table:target.name,operation:method,payload:payload?.getText(ast)??null,resolved:resolved?.getText(ast)??null,options:n.arguments[1]?.getText(ast)??null,companyProvenance:/useCompanyId\(/.test(text)?'useCompanyId':/requestCompany|requireRequestCompany/.test(text)?'Edge resolver; revisar ação':'revisar declaração no caller',review:'Localizador AST; spreads, aliases e chamadas transitivas exigem revisão.'});
    }
   }
  }ts.forEachChild(n,visit);
 };visit(ast);
}
const global=new Map(Object.entries({app_config:'Configuração da plataforma; ACL e ausência de policy cliente.',permissions:'Catálogo de chaves RBAC global.',role_permissions:'Templates de roles globais; administração global.',unidades_medida:'Unidades de medida compartilhadas; não representam unidades operacionais.',security_risk_register:'Registro de riscos da plataforma.',companies:'Registro de unidades, descoberta/autorização própria.'}));
const mixed=new Map(Object.entries({profiles:'Identidade compartilhada; empresa de origem não acompanha navegação.',audit_logs:'Histórico misto, nulos legítimos/ambíguos; Fase 3 pendente.',audit_log:'Histórico misto; Fase 3 pendente.',integration_logs:'Histórico operacional com modelo misto Fase 3.',dashboard_cache:'Cache por chave global; payload pode conter agregado tenant. Helpers fechados na Fase 7.'}));
const relations=catalog.relations.map(r=>{
 const columns=catalog.columns.filter(c=>c.schema===r.schema&&c.table===r.name);const count=integrity.counts.find(c=>c.relation===r.name);
 let classification='indeterminada',reason='Finalidade técnica não comprovada por consumidor funcional.';
 if(global.has(r.name)){classification='global real';reason=global.get(r.name);}
 else if(mixed.has(r.name)){classification='mista/legada';reason=mixed.get(r.name);}
 else if(r.name.includes('_bkp_')||r.kind==='m'){classification='mista/legada';reason=r.kind==='m'?'Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner.':'Cópia histórica; preservar registros. Sem writer operacional localizado.';}
 else if(columns.some(c=>c.column==='company_id')){classification='tenant operacional';reason=['company_memberships','user_roles','user_permissions'].includes(r.name)?'Acesso por unidade; identidade referenciada é global.':'Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo.';}
 return {...r,classification,reason,count,consumers:consumers.filter(c=>c.method==='from'&&c.name===r.name),writers:writes.filter(w=>w.table===r.name),policies:catalog.policies.filter(p=>p.schemaname===r.schema&&p.tablename===r.name),columns,incoming:catalog.constraints.filter(c=>c.referenced===r.name||c.referenced===`${r.schema}.${r.name}`),outgoing:catalog.constraints.filter(c=>c.table===r.name||c.table===`${r.schema}.${r.name}`),triggers:catalog.triggers.filter(t=>t.table===r.name||t.table===`${r.schema}.${r.name}`)};
});
const functions=catalog.functions.map(f=>({...f,definition:undefined,bodyEvidence:dir+'catalogo-vivo.json',kind:f.returns==='trigger'?'trigger':!['sql','plpgsql'].includes(f.language)?'extension':'function',callers:consumers.filter(c=>c.method==='rpc'&&c.name===f.name),sqlCallers:catalog.functions.filter(g=>g.signature!==f.signature&&new RegExp(`\\b${f.name}\\s*\\(`).test(g.definition)).map(g=>g.signature),writes:[...f.definition.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map(m=>({operation:m[1],target:m[2],line:f.definition.slice(0,m.index).split('\n').length})),review:'ACL/owner/search_path e corpo disponíveis; triagem não equivale a ensaio de todos os ramos.'}));
fs.writeFileSync(dir+'matriz.json',JSON.stringify({coverage:{relations:relations.length,functions:functions.length,writes:writes.length,exposedSchemas:catalog.settings,limitation:'Configuração externa do gateway não confirmada. Public/reporting e dependências públicas cobertas; Edge callers publicados em artefato separado.'},relations,functions,writes},null,2)+'\n');
fs.writeFileSync(dir+'matriz.md',`# Matriz Fase 7\n\nDetalhes por objeto, ACL efetiva, policies, colunas, relações, triggers, callers e writers: [matriz.json](matriz.json). Corpos completos: [catalogo-vivo.json](catalogo-vivo.json). Classificação é de finalidade; não significa autorização certificada.\n\n| Objeto | Classe | Linhas | Consumidores diretos | Evidência |\n|---|---|---:|---:|---|\n${relations.map(r=>`| ${r.schema}.${r.name} | ${r.classification} | ${r.count?.rows??'—'} | ${r.consumers.length} | ${r.reason} |`).join('\n')}\n\n## Funções e overloads\n\n| Assinatura | Tipo | Definer | anon/auth/service | Callers SQL/diretos |\n|---|---|---|---|---|\n${functions.map(f=>`| ${f.signature} | ${f.kind} | ${f.definer} | ${f.anon}/${f.authenticated}/${f.service} | ${f.sqlCallers.length}/${f.callers.length} |`).join('\n')}\n\n## Writers locais\n\n| Fonte | Tabela | Operação | Empresa |\n|---|---|---|---|\n${writes.map(w=>`| ${w.file}:${w.line} | ${w.table} | ${w.operation} | ${w.companyProvenance} |`).join('\n')}\n`);
console.log(JSON.stringify({relations:relations.length,functions:functions.length,writes:writes.length,frontWrites:writes.filter(w=>w.file.startsWith('src/')&&['insert','upsert'].includes(w.operation)).length}));
