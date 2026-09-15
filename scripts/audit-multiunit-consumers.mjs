// Inventário estático, não um veredito de autorização. Executar na raiz do projeto.
// node scripts/audit-multiunit-consumers.mjs > inventario.json
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  }).sort();
}

const files = [];
for (const path of [...walk('src'), ...walk('supabase/functions')]) {
  if (/\.(test|spec)\./.test(path) || /[\\/]test[\\/]/.test(path)
    || path.replaceAll('\\', '/') === 'src/integrations/supabase/types.ts') continue;
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const result = { file: path.replaceAll('\\', '/'), imports: [], tables: [], rpcs: [], writes: [],
    queryKeys: [], realtime: [], persistence: [], scope: [], edgeInvocations: [] };
  const location = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null;
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const module = literal(node.moduleSpecifier);
      if (module?.includes('supabase') || module?.includes('CompanyScope')) {
        result.imports.push({ line: location(node), module, typeOnly: node.importClause?.isTypeOnly ?? false });
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'queryKey') result.queryKeys.push(location(node));
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && ['useSupabase', 'useCompanyId', 'useCompanyScope'].includes(node.expression.text)) {
        result.scope.push({ line: location(node), hook: node.expression.text });
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const first = literal(node.arguments[0]);
        const entry = { line: location(node), name: first ?? '<dynamic>' };
        if (method === 'from') result.tables.push(entry);
        if (method === 'rpc') result.rpcs.push(entry);
        if (['insert', 'upsert'].includes(method)) result.writes.push({ line: location(node), method });
        if (method === 'on' && first === 'postgres_changes') result.realtime.push(location(node));
        if (method === 'invoke') result.edgeInvocations.push(entry);
        if (['getItem', 'setItem', 'removeItem'].includes(method)) result.persistence.push({ line: location(node), method });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (Object.entries(result).some(([key, value]) => key !== 'file' && value.length)) files.push(result);
}
process.stdout.write(JSON.stringify({
  method: 'TypeScript AST; excludes tests and generated database types. Calls may be non-Supabase; dynamic targets and payload provenance require manual review.',
  files,
}, null, 2) + '\n');
