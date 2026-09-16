// Inventário offline: fingerprints são evidência textual, não equivalência semântica.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {splitSql} from './phase9-sql.mjs';
const dir='docs/multi-unidades/fase9-20260916';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const save=(f,x)=>fs.writeFileSync(`${dir}/${f}`,JSON.stringify(x,null,2)+'\n');
const hash=(s,algo='sha256')=>crypto.createHash(algo).update(s).digest('hex');
const lf=s=>s.replaceAll('\r\n','\n');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','ignore']}).trimEnd();
const catalog=read(`${dir}/catalogo-vivo.json`), extra=read(`${dir}/catalogo-complementar.json`), history=read(`${dir}/historico-vivo.json`);
const normalized=read(`${dir}/historico-normalizado.json`);
const refs=git('for-each-ref','--format=%(refname)').split('\n');
const blobs=new Map(), refTrees=[];
for(const ref of ['HEAD',...refs]){
 const files=git('ls-tree','-r',ref,'--','supabase/migrations').split('\n').filter(Boolean).map(line=>{
  const [meta,file]=line.split('\t');const oid=meta.split(' ')[2];
  if(!blobs.has(oid))blobs.set(oid,{oid,content:execFileSync('git',['cat-file','blob',oid],{encoding:'utf8',maxBuffer:32*1024*1024}),files:new Set(),refs:new Set()});
  blobs.get(oid).files.add(file);blobs.get(oid).refs.add(ref);return {file,oid};
 });refTrees.push({ref,commit:git('rev-parse',ref),files});
}
const local=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).map(name=>{
 const file=`supabase/migrations/${name}`,content=fs.readFileSync(file,'utf8');
 return {file,version:name.split('_')[0],name:name.replace(/^\d+_/,'').replace(/\.sql$/,''),rawSha256:hash(content),lfSha256:hash(lf(content)),rawMd5:hash(content,'md5'),lfMd5:hash(lf(content),'md5'),content};
});
const historicalBlobs=[...blobs.values()].map(b=>({oid:b.oid,files:[...b.files],refs:[...b.refs],sha256:hash(b.content),lfSha256:hash(lf(b.content))}));
save('git-refs.json',{capturedAt:new Date().toISOString(),head:git('rev-parse','HEAD'),originMain:git('rev-parse','origin/main'),aheadBehind:git('rev-list','--left-right','--count','HEAD...origin/main'),refs:refTrees.map(({files,...r})=>({...r,fileCount:files.length})),blobs:historicalBlobs,limit:'Refs existentes apenas; reflogs/refs apagados não são inventariados. Cada blob lista paths/refs em que ocorre. Hash bruto preserva bytes UTF-8; normalizado muda somente CRLF.'});
const versions=[...new Set([...local.map(f=>f.version),...history.map(h=>h.version)])].sort().map(version=>{
 const files=local.filter(f=>f.version===version),remote=history.find(h=>h.version===version);
 const byName=files.flatMap(f=>history.filter(h=>h.name===f.name&&h.version!==version).map(h=>h.version));
 const remoteHashes=normalized.find(h=>h.version===version)?.statement_normalized_md5;
 const localStatements=files.map(f=>{try{return {file:f.file,hashes:splitSql(lf(f.content)).map(s=>hash(s,'md5'))};}catch(e){return {file:f.file,error:e.message};}});
 const statementMatch=localStatements.some(f=>JSON.stringify(f.hashes)===JSON.stringify(remoteHashes)&&remoteHashes?.length);
 const fullMatch=files.some(f=>[f.rawMd5,f.lfMd5].includes(remote?.statements_md5));
 return {version,files:files.map(({content,...f})=>f),remote:remote??null,localStatements,statementMatch,sameNameOtherVersions:byName,classification:files.length>1?'versao local duplicada':!remote?'candidato local':!files.length?'historico sem arquivo no checkout':statementMatch?'statements equivalentes (LF/delimitadores)':fullMatch?'texto integral equivalente':remote.statement_count==null?'historico sem statements':'historico presente; formato/conteudo exige comparacao',action:!remote?'Nao marcar applied. Publicacao depende de preflight e equivalencia.':fullMatch||statementMatch?'Comparar estado efetivo e overrides posteriores antes de aceitar.':'Sem repair automatico; conferir matriz de objetos e statements.',refOccurrences:historicalBlobs.filter(b=>b.files.some(f=>path.basename(f).startsWith(version+'_'))).map(b=>b.oid)};
});save('matriz-versoes.json',versions);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const callers=[];
for(const file of [...walk('src'),...walk('supabase/functions')].filter(f=>/\.[jt]sx?$/.test(f)&&!/(\.test\.|\/types.ts$)/.test(f))){
 const src=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true);
 const visit=n=>{if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['rpc','from'].includes(n.expression.name.text)){const arg=n.arguments[0];callers.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,kind:n.expression.name.text,name:arg&&ts.isStringLiteralLike(arg)?arg.text:'<dynamic>'});}ts.forEachChild(n,visit);};visit(ast);
}
const f8=read('docs/multi-unidades/fase8-20260916/edges.json');
const publishedCallers=f8.edges.flatMap(e=>e.files.flatMap(f=>f.published.calls.filter(c=>c.method==='rpc').map(c=>({edge:e.slug,version:e.version,file:f.local,line:c.line,name:c.argument?.replace(/^['"]|['"]$/g,''),lfSha256:f.lfSha256}))));
const old=read('docs/multi-unidades/fase7-20260916/catalogo-vivo.json');
const old8=read('docs/multi-unidades/fase8-20260916/catalogo-vivo.json');
const objects=catalog.functions.map(f=>{
 const previous=old8.functions.find(g=>g.signature===f.signature),meta=extra.functions.find(g=>g.identity===f.signature&&g.schema===f.schema);
 const touched=local.filter(l=>new RegExp(`\\b${f.name}\\s*\\(`).test(l.content)).map(l=>({version:l.version,published:history.some(h=>h.version===l.version)}));
 return {...f,definition:undefined,metadata:meta,previousMd5:previous?.md5,classification:previous&&previous.md5===f.md5&&previous.acl===f.acl&&previous.owner===f.owner?'equivalente ao snapshot F8':'mudanca desde F8 ou novo objeto',sourceCandidates:touched,callers:callers.filter(c=>c.kind==='rpc'&&c.name===f.name),publishedCallers:publishedCallers.filter(c=>c.name===f.name),sqlCallers:catalog.functions.filter(g=>g.signature!==f.signature&&new RegExp(`\\b${f.name}\\s*\\(`).test(g.definition)).map(g=>g.signature),evidence:'catalogo-vivo.json + catalogo-complementar.json; sourceCandidates sao localizadores, nao causalidade'};
});
const changed={};
for(const group of ['relations','columns','constraints','indexes','triggers','policies']){
 const key=x=>group==='relations'?`${x.schema}.${x.name}`:group==='columns'?`${x.schema}.${x.table}.${x.column}`:group==='policies'?`${x.schemaname}.${x.tablename}.${x.policyname}`:group==='indexes'?`${x.schemaname}.${x.indexname}`:`${x.table}.${x.name}`;
 const before=new Map((old[group]??[]).map(x=>[key(x),x])),after=new Map((catalog[group]??[]).map(x=>[key(x),x]));
 const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
 const stable=x=>JSON.stringify(sorted(x));
 changed[group]=[...new Set([...before.keys(),...after.keys()])].filter(k=>stable(before.get(k)??{})!==stable(after.get(k)??{})).map(k=>({object:k,before:before.get(k),after:after.get(k),classification:'diferenca desde F7; conferir hotfix 20260916153928',evidence:'catalogos antes/depois'}));
}
save('matriz-objetos.json',{functions:objects,changedSinceF7:changed,relations:catalog.relations.map(r=>({...r,callers:callers.filter(c=>c.kind==='from'&&c.name===r.name),evidence:'columns/constraints/indexes/triggers/policies no catalogo-vivo.json'})),dynamicCallers:callers.filter(c=>c.name==='<dynamic>'),limits:'SQL callers por localizador textual; tipos gerados nao provam chamada; callbacks/caches/browser e consumidores externos nao certificados.'});
const types=fs.readFileSync('src/integrations/supabase/types.ts','utf8'),ast=ts.createSourceFile('types.ts',types,ts.ScriptTarget.Latest,true);
const typeFunctions=[];
const visit=n=>{if(ts.isPropertySignature(n)&&n.name.getText(ast)==='Functions'&&n.type&&ts.isTypeLiteralNode(n.type))for(const m of n.type.members)typeFunctions.push({name:m.name?.getText(ast),line:ast.getLineAndCharacterOfPosition(m.getStart(ast)).line+1,contract:m.type?.getText(ast)});ts.forEachChild(n,visit);};visit(ast);
save('contratos-types.json',{sha256:hash(types),functions:typeFunctions.map(t=>({...t,liveIdentities:objects.filter(o=>o.schema==='public'&&o.name===t.name).map(o=>({signature:o.signature,args:o.metadata?.args,returns:o.returns})),callers:callers.filter(c=>c.kind==='rpc'&&c.name===t.name)})),liveMissingInTypes:objects.filter(o=>o.schema==='public'&&!typeFunctions.some(t=>t.name===o.name)).map(o=>o.signature),warning:'Unions de overloads e Args homonimos exigem resolucao real PostgREST; nao regenerar tipos candidatos a partir do vivo atrasado.'});
const counts=versions.reduce((a,v)=>(a[v.classification]=(a[v.classification]??0)+1,a),{});
save('nomes-repetidos.json',[...new Set(history.map(h=>h.name))].map(name=>({name,versions:history.filter(h=>h.name===name).map(h=>h.version)})).filter(g=>g.versions.length>1));
save('resumo-inventario.json',{counts,refs:refTrees.length,blobs:blobs.size,local:local.length,history:history.length,functions:objects.length,typeFunctions:typeFunctions.length,changed:Object.fromEntries(Object.entries(changed).map(([k,v])=>[k,v.length])),f8ChangedFunctions:objects.filter(o=>o.classification!=='equivalente ao snapshot F8').map(o=>o.signature),sameNameDifferentVersionGroups:read(`${dir}/nomes-repetidos.json`).length,absent:versions.filter(v=>!v.remote).map(v=>v.version),noLocal:versions.filter(v=>!v.files.length).map(v=>v.version)});
console.log(JSON.stringify(read(`${dir}/resumo-inventario.json`)));
