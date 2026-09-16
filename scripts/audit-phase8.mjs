// Inventário reproduzível de fontes; localizadores AST não certificam autorização.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
const dir='docs/multi-unidades/fase8-20260916';
const published=JSON.parse(fs.readFileSync('.phase8.local/published.json','utf8'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const norm=s=>s.replaceAll('\r\n','\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
function locate(file,content){
 const ast=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);const calls=[],actions=[],imports=[];
 const visit=n=>{
  const line=ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;
  if(ts.isImportDeclaration(n))imports.push({line,path:n.moduleSpecifier.text});
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)){
   const method=n.expression.name.text;
   if(['rpc','from','invoke','channel','on','getUser','getClaims','upload','download','remove','move','copy','createSignedUrl','getPublicUrl','get'].includes(method))calls.push({line,method,receiver:n.expression.expression.getText(ast),argument:n.arguments[0]?.getText(ast)});
  }
  if(ts.isIfStatement(n)&&/\b(action|task)\b/.test(n.expression.getText(ast)))actions.push({line,condition:n.expression.getText(ast),body:n.thenStatement.getText(ast)});
  ts.forEachChild(n,visit);
 };visit(ast);
 return {imports,actions,calls,secrets:[...content.matchAll(/Deno\.env\.get\(["']([^"']+)["']\)/g)].map(m=>m[1]),auth:content.includes('.auth.getUser(')?'Auth getUser':content.includes('.auth.getClaims(')?'Auth getClaims':'CRON_SECRET (scheduler)'};
}
const evidence=published.map(edge=>{
 const files=edge.files.map(f=>{
  let local=f.name.includes('supabase/functions/')?f.name.slice(f.name.indexOf('supabase/functions/')):f.name.startsWith('functions/')?'supabase/'+f.name:f.name.includes('_shared/')?'supabase/functions/'+f.name.slice(f.name.indexOf('_shared/')):`supabase/functions/${edge.slug}/index.ts`;
  const baseline=execFileSync('git',['show','2b93c73:'+local],{encoding:'utf8'});
  const current=fs.readFileSync(local,'utf8');
  const content=norm(f.content);
  const diff=content!==norm(baseline);
  if(diff){const out=`${dir}/published/${edge.slug}/${path.basename(local)}.txt`;fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,content);}
  return {remotePath:f.name,local,sha256:sha(f.content),lfSha256:sha(content),baselineSha256:sha(norm(baseline)),candidateSha256:sha(norm(current)),comparisonToBaseline:diff?'different':f.content===baseline?'identical':'CRLF only',bodyEvidence:diff?`published/${edge.slug}/${path.basename(local)}.txt`:`git show 2b93c73:${local}`,published:locate(local,content),candidate:locate(local,norm(current))};
 });
 return {slug:edge.slug,version:edge.version,verify_jwt:edge.verify_jwt,entrypoint:edge.entrypoint_path,bundleHash:edge.ezbr_sha256,files};
});
const sources=walk('src').filter(f=>/\.[jt]sx?$/.test(f)&&!f.includes('.test.')&&!f.endsWith('/types.ts')).map(f=>({file:f,...locate(f,fs.readFileSync(f,'utf8'))}));
const consumers=sources.map(s=>({file:s.file,calls:s.calls.filter(c=>['invoke','channel','on','upload','download','remove','move','copy','createSignedUrl','getPublicUrl'].includes(c.method))})).filter(s=>s.calls.length);
const candidateShared=['company-scope.ts','cors.ts','request-cors.ts','admin-memberships.ts'].filter(f=>fs.existsSync('supabase/functions/_shared/'+f)).map(f=>{const local='supabase/functions/_shared/'+f;const content=norm(fs.readFileSync(local,'utf8'));return {local,sha256:sha(content),...locate(local,content)};});
fs.writeFileSync(`${dir}/edges.json`,JSON.stringify({capturedAt:'2026-09-16T14:32:55Z',baseline:'2b93c73',edges:evidence,candidateShared,consumers},null,2)+'\n');
const actionRows=evidence.flatMap(e=>e.files.filter(f=>f.local===`supabase/functions/${e.slug}/index.ts`).flatMap(f=>f.candidate.actions.map(a=>{
 const keys=[...new Set([...a.body.matchAll(/["']([a-z-]+(?::[a-z-]+){1,2})["']/g)].map(m=>m[1]))];
 const refs=[...new Set([...a.body.matchAll(/\.(?:rpc|from)\(["']([^"']+)["']/g)].map(m=>m[1]))];
 return `| ${e.slug}:${a.line} | ${a.condition.replaceAll('|','\\|').replace(/\s+/g,' ')} | ${keys.join(', ')||'gate comum/dinâmico; ver mapa'} | ${refs.join(', ')||'helper; ver corpo integral'} |`;
})));
fs.writeFileSync(`${dir}/acoes.md`,'# Índice por ação do candidato\n\nLeia com MAPA-DE-CONFIANCA.md. Extração AST de condições, literais e acessos diretos; não é certificação nem inventário transitivo. Corpos integrais por condição e chamadas do arquivo inteiro em edges.json. Gates comuns, interpolados e de helpers estão descritos no mapa e no fonte.\n\n| Fonte/linha | Condição | Literais de permissão presentes | Tabelas/RPCs diretas no bloco |\n|---|---|---|---|\n'+actionRows.join('\n')+'\n');
fs.writeFileSync(`${dir}/endpoints.md`,'# Localizadores de contratos Edge\n\nCorpos/versões/imports/hash e ações completas em [edges.json](edges.json). Identidade e efeitos exigem a revisão de RESULTADOS.md. `CRLF only` significa conteúdo igual após normalizar apenas finais de linha.\n\n| Edge | Versão | JWT gateway | Auth manual | Ações localizadas | Secrets referenciados (nomes) |\n|---|---:|---|---|---:|---|\n'+evidence.map(e=>{const entry=e.files.find(f=>f.local===`supabase/functions/${e.slug}/index.ts`);return `| ${e.slug} | ${e.version} | ${e.verify_jwt} | ${entry.published.auth} | ${entry.published.actions.length} | ${[...new Set(e.files.flatMap(f=>f.published.secrets))].join(', ')} |`;}).join('\n')+'\n');
console.log(JSON.stringify({edges:evidence.length,files:evidence.reduce((n,e)=>n+e.files.length,0),different:evidence.flatMap(e=>e.files.filter(f=>f.comparisonToBaseline==='different').map(f=>f.local)),consumers:consumers.length}));
