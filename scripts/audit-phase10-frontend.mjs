// Inventário de operações por símbolo TS; nunca usa nomes de variável como prova de escopo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const dir='docs/multi-unidades/fase10-20260916';
const config=ts.readConfigFile('tsconfig.app.json',ts.sys.readFile).config;
const parsed=ts.parseJsonConfigFileContent(config,ts.sys,process.cwd());
const program=ts.createProgram(parsed.fileNames,parsed.options), checker=program.getTypeChecker();
const live=JSON.parse(fs.readFileSync(`${dir}/revalidacao-viva.json`));
const catalog=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/catalogo-vivo.json'));
const contracts=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/contratos-types.json'));
const relative=f=>path.relative(process.cwd(),f).replaceAll('\\','/');
const loc=n=>({file:relative(n.getSourceFile().fileName),line:n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line+1});
function root(n){while(ts.isCallExpression(n)||ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n)||ts.isAsExpression(n)||ts.isParenthesizedExpression(n))n=n.expression;return n;}
function origin(n,seen=new Set()){
 n=root(n);const symbol=checker.getSymbolAtLocation(n);if(!symbol||seen.has(symbol))return {kind:'dinâmico',expression:n.getText()};seen.add(symbol);
 const declaration=symbol.valueDeclaration??symbol.declarations?.[0];if(!declaration)return {kind:'sem declaração'};
 const position=loc(declaration);
 if(ts.isImportSpecifier(declaration)){const module=declaration.parent.parent.parent.moduleSpecifier?.text;return {kind:declaration.isTypeOnly||declaration.parent.parent.isTypeOnly?'tipo':'import',module,...position};}
 if(ts.isParameter(declaration))return {kind:'parâmetro injetado: revisar chamadores',...position};
 if(ts.isVariableDeclaration(declaration)&&declaration.initializer){const init=declaration.initializer;
  if(ts.isCallExpression(init)&&init.expression.getText()==='useSupabase')return {kind:'useSupabase/CompanyScopeProvider',...position};
  if(ts.isCallExpression(init)&&init.expression.getText()==='createCompanyClient')return {kind:'cliente imutável explícito',...position};
  return {kind:'alias',...position,source:origin(init,seen)};
 }
 return {kind:ts.SyntaxKind[declaration.kind],...position};
}
const files=[],operations=[];
for(const source of program.getSourceFiles()){
 const file=relative(source.fileName);if(!file.startsWith('src/')||/\.test\.|\/test\/|integrations\/supabase\/types/.test(file))continue;
 const text=source.text, rows=[];
 const markers={};
 const patterns={scope:/useCompanyId|useSupabase|useAuth|companyAccessMode|presentationUnit|withCompanyId/,queryKey:/queryKey\s*:|new QueryClient/,lifetime:/AbortController|AbortSignal|abortSignal|isScopeActive|active = false|alive = false|dispose\(/,mutation:/\.insert\(|\.update\(|\.upsert\(|\.delete\(|mutateAsync|useMutation/,effects:/toast\.|emitDataEvent\(|invalidateQueries|downloadBlob|\.save\(|window\.print/,cache:/cacheGet|cacheSet|cacheInvalidate|new (Weak)?Map/,persistence:/localStorage|sessionStorage|usePersistedTab/,realtime:/\.channel\(|postgres_changes|removeChannel/,permission:/useCan\(|can\(|has_permission|has_any_permission|permissions\.includes/};
 text.split(/\r?\n/).forEach((line,i)=>{for(const [name,pattern] of Object.entries(patterns))if(pattern.test(line))(markers[name]??=[]).push({line:i+1,source:line.trim().slice(0,230)});});
 function visit(node){let expression=ts.isCallExpression(node)?node.expression:null;while(expression&&(ts.isParenthesizedExpression(expression)||ts.isAsExpression(expression)))expression=expression.expression;
 if(expression&&ts.isPropertyAccessExpression(expression)){
  const method=expression.name.text;
  if(['from','rpc','invoke','channel','insert','update','upsert','delete','upload','download','removeChannel'].includes(method)){
   const arg=node.arguments[0];const name=arg&&ts.isStringLiteralLike(arg)?arg.text:null;
   const row={...loc(node),method,name,expression:node.getText().slice(0,280),client:origin(expression.expression)};
   if(method==='rpc')row.liveSignatures=name?live.functions.filter(f=>f.signature.startsWith(name+'(')).map(f=>f.signature):'nome dinâmico';
   if(method==='from')row.liveRelation=name?catalog.relations.some(r=>r.name===name):null;
   rows.push(row);operations.push(row);
  }
 }ts.forEachChild(node,visit);}visit(source);
 const globalImports=source.statements.filter(ts.isImportDeclaration).filter(n=>/supabase\/client$/.test(n.moduleSpecifier.text??'')).map(n=>({...loc(n),typeOnly:n.importClause?.isTypeOnly??false,source:n.getText()}));
 if(rows.length||Object.keys(markers).length||globalImports.length)files.push({file,globalImports,markers,operationCount:rows.length,risk:globalImports.some(n=>!n.typeOnly)?'revisar import global por operação; Auth permitido':rows.some(r=>r.client.kind.startsWith('parâmetro'))?'cliente injetado; rastrear chamadores':'escopo/ciclo conforme marcadores; não prova runtime'});
}
const old=JSON.parse(fs.readFileSync('docs/multi-unidades/fase9-20260916/publicacao.json'));
const current=JSON.parse(fs.readFileSync(`${dir}/publicacao.json`));
const canonical=x=>JSON.stringify(x.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort());
const f9Functions=catalog.functions.filter(f=>f.schema==='public').map(({signature,md5,owner,acl})=>({signature,md5,owner,acl}));
const comparison={capturedAt:live.capturedAt,versions:live.versions.length,localMigrations:fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}.*\.sql$/.test(n)).length,absent:fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}.*\.sql$/.test(n)&&!live.versions.includes(n.slice(0,14))),functionsSame:canonical(f9Functions)===canonical(live.functions),edges:current.edges.map(e=>({slug:e.slug,same:old.edges.some(o=>o.slug===e.slug&&(o.bundleHash??o.hash)===e.bundleHash)})),vercel:current.vercel,typesUnchanged:crypto.createHash('sha256').update(fs.readFileSync('src/integrations/supabase/types.ts')).digest('hex')===contracts.sha256};
comparison.policiesSame=canonical(catalog.policies)===canonical(live.policies);
fs.writeFileSync(`${dir}/inventario-frontend.json`,JSON.stringify({scope:'Inventário estático por símbolo TS. Marcadores não certificam ausência de corridas. Imports globais Auth/tipo preservados.',files,operations},null,2)+'\n');
fs.writeFileSync(`${dir}/comparacao-f9.json`,JSON.stringify(comparison,null,2)+'\n');
const calls=operations.filter(r=>r.method==='rpc');
fs.writeFileSync(`${dir}/contratos-frontend.json`,JSON.stringify({typesSha256:contracts.sha256,calls,phase9Contracts:contracts.functions,limits:['Assinatura existente não prova Args/ACL nem execução','Nomes dinâmicos exigem leitura dos chamadores','Tipos candidatos não regenerados; catálogo vivo revalidado']},null,2)+'\n');
const markerNames=['scope','queryKey','lifetime','mutation','effects','cache','persistence','realtime','permission'];
fs.writeFileSync(`${dir}/MATRIZ-ARQUIVOS.md`,'# Índice por arquivo\n\nGerado por `scripts/audit-phase10-frontend.mjs`. Cada célula contém linhas de código, não um selo de aprovação. Origem de cliente por operação, expressão, nomes dinâmicos e assinaturas efetivas estão no JSON. Chamadas candidatas incluem também Map/Set/URLSearchParams; não somar esta contagem como operações de banco testadas. A revisão semântica e riscos estão em MATRIZ-FRONTEND.md.\n\n| Arquivo | Chamadas candidatas | '+markerNames.join(' | ')+' |\n|---|---:|'+markerNames.map(()=>'---').join('|')+'|\n'+files.map(f=>'| `'+f.file+'` | '+f.operationCount+' | '+markerNames.map(k=>(f.markers[k]??[]).map(m=>m.line).join(', ')||'—').join(' | ')+' |').join('\n')+'\n');
console.log(JSON.stringify({files:files.length,operations:operations.length,rpcCalls:calls.length,...comparison}));
