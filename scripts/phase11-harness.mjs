// Reexecuta runners revisados em descartáveis NOVOS e evidências F11 separadas.
// Não altera migrations, assertions, fixtures anteriores ou baselines de evidência.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const task = process.argv[2];
const sources = {
  prepare: 'prepare-phase10-stack.mjs', fixtures: 'phase10-fixtures.mjs',
  http: 'test-phase10-http.mjs', browser: 'test-phase10-browser.mjs',
  sql: 'test-phase9-db.mjs', guards: 'test-phase9-guards.mjs',
};
assert.ok(Object.hasOwn(sources, task), 'prepare|fixtures|http|browser|sql|guards');
const scratch = '.phase11.local';
const out = 'docs/multi-unidades/fase11-20260916';
fs.mkdirSync(scratch, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const source = `scripts/${sources[task]}`;
const original = fs.readFileSync(source, 'utf8');
let code = original;
const replacements = [];
const replace = (from, to) => { const count = code.split(from).length - 1; if (count) { code = code.split(from).join(to); replacements.push({ from, to, count }); } };
if (['sql','guards'].includes(task)) {
  // Os templates F7/F9 são somente leitura; apenas os clones recebem nome F11.
  replace('moralles_phase9_test_', 'moralles_phase11_test_');
  replace("clone('live','moralles_phase11_test_live')", "clone('live','moralles_phase9_test_live')");
  replace("clone('refs','moralles_phase11_test_live')", "clone('refs','moralles_phase9_test_live')");
  replace("clone('history','moralles_phase11_test_live')", "clone('history','moralles_phase9_test_live')");
  replace("'./phase9-sql.mjs'", "'../scripts/phase9-sql.mjs'");
  replace("scratch='.phase9.local'", "scratch='.phase11.local'");
  replace("fs.writeFileSync(`${dir}/ensaios.json`", "fs.writeFileSync('docs/multi-unidades/fase11-20260916/sql.json'");
  replace("fs.readFileSync(`${dir}/ensaios.json`", "fs.readFileSync('docs/multi-unidades/fase11-20260916/sql.json'");
  replace("fs.writeFileSync(`${dir}/ensaios-guards-recuo.json`", "fs.writeFileSync('docs/multi-unidades/fase11-20260916/guards-recuo.json'");
} else {
  for (const [a,b] of [['phase10','phase11'],['fase10-20260916','fase11-20260916'],['PHASE10','PHASE11'],['F10','F11'],['f10','f11'],['5662','5672'],['5663','5673'],['8085','8087'],['8086','8088']]) replace(a,b);
}
if(task==='browser'){
 replace("await page.getByLabel('Recolher menu',{exact:true}).click();await page.screenshot", "await page.getByLabel('Recolher menu',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('aside')?.getBoundingClientRect().width===64);await page.screenshot");
 const exportsAnchor="await page.screenshot({path:`${dir}/presentation-b.png`});";
 replace(exportsAnchor,exportsAnchor+`\n
 for(const [kind,label] of [['pdf','PDF'],['pptx','PowerPoint']]){
   const pending=page.waitForEvent('download');
   await button('Exportar apresentação em '+label).click();
   const download=await pending;
   assert.match(download.suggestedFilename(),/f11-shopping/i);
   const bytes=fs.readFileSync(await download.path());
   let content;
   if(kind==='pdf'){content=bytes.toString('latin1');assert.ok(content.startsWith('%PDF-'));}
   else {const JSZip=(await import('jszip')).default;const zip=await JSZip.loadAsync(bytes);content=(await Promise.all(Object.keys(zip.files).filter(n=>/^ppt\\/slides\\/slide\\d+\\.xml$/.test(n)).map(n=>zip.file(n).async('string')))).join('\\n');}
   assert.ok(content.includes('F11 Shopping'));assert.ok(!content.includes('F11 Centro'));assert.ok(content.includes('222,00'));
   fs.writeFileSync(dir+'/presentation-b.'+kind,bytes);
   pass('download real '+label+': unidade B e R$222; não contém unidade global A');
 }
 await button('Ativar tema escuro').click();await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
 await page.screenshot({path:dir+'/presentation-dark.png'});await button('Ativar tema claro').click();
 pass('apresentação B renderiza em tema escuro e retorna ao claro');
 `);
 const anchor="await page.reload();await account(1);pass('reload restaura preferência válida');";
 assert.ok(code.includes(anchor));
 replace(anchor,anchor+`\n
 // Falha de transporte real: nenhuma resposta/linha do banco é substituída.
 const failContext=route=>route.abort('connectionfailed');
 await context.route('**/rest/v1/rpc/get_my_company_context',failContext);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await button('Tentar novamente').waitFor();
 assert.equal(await page.getByText('Conta F11 1',{exact:true}).count(),0);
 await page.screenshot({path:dir+'/context-error.png'});
 await context.unroute('**/rest/v1/rpc/get_my_company_context',failContext);
 const retryStart=performance.now(); await button('Tentar novamente').click(); await account(1);
 pass('erro de contexto remove dados; retry valida backend real e remonta A ('+Math.round(performance.now()-retryStart)+'ms locais)');
 `);
 replace("assert.deepEqual(failures,[]);", `
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(({id,unit})=>localStorage.setItem('marginpro:last-company:'+id,unit),{id:users.multi.id,unit:units.b});
 assert.equal((await service.from('company_memberships').update({status:'inactive'}).eq('user_id',users.multi.id).eq('company_id',units.b)).error,null);
 await page.reload(); await page.getByText('F11 Centro',{exact:true}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Trocar unidade: F11 Shopping',exact:true}).count(),0);
 pass('preferência antes válida torna-se obsoleta; reload recusa membership inativo');
 assert.equal((await service.from('company_memberships').update({status:'active'}).eq('user_id',users.multi.id).eq('company_id',units.b)).error,null);
 assert.deepEqual(failures,[]);`);
 replace("'exports e falhas/retry cobertos separadamente por testes de componente'", "'exports pós-cleanup são testes de componente; erro/retry também exercitado neste browser'");
 replace("'CLI agent-browser timeout; Chromium via Playwright'", "'Chromium via runner Playwright revisado; tráfego externo bloqueado'");
}
const generated = `${scratch}/${task}.mjs`;
fs.writeFileSync(generated, code);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(`${out}/harness-${task}.json`, JSON.stringify({ source, sha256:sha(original), generatedSha256:sha(code), replacements, capturedAt:new Date().toISOString() }, null, 2)+'\n');
const result = spawnSync(process.execPath, [generated], { env:process.env, stdio:'inherit', windowsHide:true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
