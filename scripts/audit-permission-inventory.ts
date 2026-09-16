/** Localizador reproduzível. Não conecta à rede, não lê ambiente/dados de usuários. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { ALL_PERMISSION_KEYS, LEGACY_PERMISSION_MAP } from '../src/permissions/registry';
import { ALLOWED_ACTIONS } from '../src/permissions/actions';

const registered = new Set(ALL_PERMISSION_KEYS);
const legacy = new Set(Object.keys(LEGACY_PERMISSION_MAP));
export function classifyPermission(key: string | null, divergent = false) {
  if (divergent) return 'DIVERGENTE';
  if (key === null) return 'NÃO ENCONTRADA';
  if (key === 'system:global:manage') return 'GLOBAL';
  if (registered.has(key)) return 'VÁLIDA';
  if (legacy.has(key)) return 'LEGADA';
  return 'FANTASMA';
}
type Occurrence = { source: string; object: string; line: number; key: string | null; expression?: string; kind: string; operation: string; classification: string; evidence: string; lifecycle: string };
type LiveFunction = { signature: string; name: string; definition: string; md5: string; acl: string; owner: string; definer: boolean; anon: boolean; authenticated: boolean; service: boolean };
type LivePolicy = { schemaname: string; tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null; permissive: string; roles: string[] };
const keyPattern = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){1,3}$/;
const gatePattern = /^(can|canAny|canAll|useCan|useCanAny|useCanAll|hasPermission|hasAnyPermission|requirePermission|requireAnyPermission|assertPermission|usePermission|useModuleAccess|useModulePermission|useSubmodulePermission)$/;
export function scanTypeScript(source: string, text: string): Occurrence[] {
  const ast = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  const rows: Occurrence[] = [];
  const lifecycle = /(?:\/test\/|\.(?:test|spec)\.)/.test(source) ? 'test' : source.endsWith('/types.ts') ? 'type' : 'current-source';
  const line = (n: ts.Node) => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1;
  function parentObject(node: ts.Node): string {
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
      if (ts.isVariableDeclaration(p)) return p.name.getText(ast);
    }
    return '<module>';
  }
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) && keyPattern.test(node.text)) {
      const context = node.parent.getText(ast).slice(0, 500);
      rows.push({ source, object: parentObject(node), line: line(node), key: node.text, kind: 'literal', operation: node.text.split(':').at(-1)!, classification: classifyPermission(node.text), evidence: context, lifecycle });
    }
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(ast);
      if (gatePattern.test(name)) {
        for (const arg of node.arguments) if (!ts.isStringLiteralLike(arg) && !ts.isArrayLiteralExpression(arg)) {
          rows.push({ source, object: parentObject(node), line: line(node), key: null, expression: arg.getText(ast).slice(0, 500), kind: 'dynamic-gate', operation: name, classification: classifyPermission(null), evidence: node.getText(ast).slice(0, 700), lifecycle });
        }
      }
      if (ts.isPropertyAccessExpression(node.expression) && ['rpc', 'from', 'invoke'].includes(node.expression.name.text)) {
        rows.push({ source, object: parentObject(node), line: line(node), key: null, expression: node.arguments[0]?.getText(ast), kind: 'caller', operation: node.expression.name.text, classification: 'NÃO ENCONTRADA', evidence: node.getText(ast).slice(0, 700), lifecycle });
      }
    }
    if (ts.isJsxAttribute(node) && /^(permission|permissionKey|anyOf|allOf)$/.test(node.name.getText(ast)) && node.initializer && ts.isJsxExpression(node.initializer)) {
      rows.push({ source, object: parentObject(node), line: line(node), key: null, expression: node.initializer.getText(ast), kind: 'dynamic-jsx', operation: node.name.getText(ast), classification: 'NÃO ENCONTRADA', evidence: node.getText(ast), lifecycle });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (![ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token)) continue;
    for (const m of scanner.getTokenText().matchAll(/\b[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){1,3}\b/g)) {
      rows.push({ source, object: '<comment>', line: ast.getLineAndCharacterOfPosition(scanner.getTokenPos() + m.index!).line + 1, key: m[0], kind: 'comment', operation: 'documentation', classification: classifyPermission(m[0]), evidence: m[0], lifecycle: 'comment' });
    }
  }
  return rows;
}
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).split('\\').join('/')]).sort();
}
function scanSql(source: string, text: string, object: string, operation: string, lifecycle: string): Occurrence[] {
  const rows: Occurrence[] = [];
  // Mantém offsets para linha. Comentários não certificam gates executáveis.
  const clean = text.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
  const headers = [...clean.matchAll(/(?:CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|(?:CREATE|ALTER)\s+POLICY)\s+([^\n]+)/gi)];
  for (const match of clean.matchAll(/'([a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){1,3})'/g)) {
    const preceding = headers.filter(h => h.index! <= match.index!).at(-1);
    const divergent = lifecycle === 'live' && ['public.produtos.produtos_insert', 'public.produtos.produtos_update'].includes(object);
    rows.push({ source, object: lifecycle === 'live' ? object : preceding?.[1] ?? object, line: clean.slice(0, match.index).split('\n').length, key: match[1], kind: 'sql-literal', operation, classification: classifyPermission(match[1], divergent), evidence: clean.slice(Math.max(0, match.index! - 120), match.index! + 220).trim(), lifecycle });
  }
  for (const m of clean.matchAll(/(?:has_(?:any_)?permission(?:_quick)?|assert_permission)\s*\(([^;\n]+)\)/g)) {
    if (!/'[a-z][a-z0-9_-]*:[a-z]/.test(m[1])) rows.push({ source, object, line: clean.slice(0, m.index).split('\n').length, key: null, expression: m[0], kind: 'dynamic-sql', operation, classification: 'NÃO ENCONTRADA', evidence: m[0], lifecycle });
  }
  return rows;
}

if (import.meta.main) {
  const catalogPath = process.argv[2] ?? 'docs/multi-unidades/fase6-20260915/catalogo-vivo.json';
  const output = process.argv[3] ?? 'docs/multi-unidades/fase6-20260915/permissoes.json';
  const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { functions: LiveFunction[]; policies: LivePolicy[]; captured_at: string } : null;
  const rows: Occurrence[] = [];
  const sources = [...walk('src'), ...walk('supabase/functions')].filter(p => /\.[cm]?[jt]sx?$/.test(p));
  for (const file of sources) rows.push(...scanTypeScript(file, fs.readFileSync(file, 'utf8')));
  const migrations = walk('supabase/migrations').filter(p => p.endsWith('.sql'));
  for (const file of migrations) rows.push(...scanSql(file, fs.readFileSync(file, 'utf8'), '<migration>', 'historical-sql', 'migration-history-not-proof-of-deployment'));
  for (const f of catalog?.functions ?? []) rows.push(...scanSql(catalogPath, f.definition, f.signature, 'function', 'live'));
  for (const p of catalog?.policies ?? []) rows.push(...scanSql(catalogPath, [p.qual, p.with_check].filter(Boolean).join('\n'), `${p.schemaname}.${p.tablename}.${p.policyname}`, p.cmd, 'live'));
  const callers = rows.filter(r => r.kind === 'caller' && r.operation === 'rpc');
  const objects = (catalog?.functions ?? []).map(f => ({ ...f, definition: undefined,
    callers: callers.filter(c => c.expression === `'${f.name}'` || c.expression === `"${f.name}"`).map(c => ({ source: c.source, line: c.line, object: c.object, lifecycle: c.lifecycle })),
    sqlCallers: catalog!.functions.filter(c => c.signature !== f.signature && new RegExp(`\\b${f.name}\\s*\\(`).test(c.definition)).map(c => c.signature),
    permissionLiterals: [...new Set(rows.filter(r => r.source === catalogPath && (r.object === f.signature || r.object.startsWith(`public.${f.name}(`))).map(r => r.key).filter(Boolean))],
    review: f.name === 'recalc_product_costs' ? 'DIVERGENTE: writer público sem tenant; contenção local Fase 6.' : 'Manual: delegação/SQL dinâmico, overloads, ACL herdada e finalidade requerem revisão.' }));
  const missing = ALL_PERMISSION_KEYS.filter(k => !rows.some(r => r.key === k && r.lifecycle !== 'comment' && r.lifecycle !== 'type' && r.lifecycle !== 'test'));
  const summary = Object.fromEntries(['VÁLIDA','LEGADA','FANTASMA','NÃO ENCONTRADA','DIVERGENTE','GLOBAL'].map(k => [k, rows.filter(r => r.classification === k).length]));
  const result = { version: 1, coverage: { sources: sources.length, migrations: migrations.length, liveAvailable: !!catalog, liveCapturedAt: catalog?.captured_at ?? null, liveFunctions: objects.length, livePolicies: catalog?.policies.length ?? null, edgeDeployedBodies: 'unavailable-in-this-artifact; local source only', secretsOrPrivateRowsRead: false }, actions: ALLOWED_ACTIONS, registry: ALL_PERMISSION_KEYS, legacyMap: LEGACY_PERMISSION_MAP, summary, registryWithoutLiteralOccurrence: missing, objects, policies: catalog?.policies ?? [], occurrences: rows };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  const phantom = [...new Set(rows.filter(r => r.classification === 'FANTASMA' && r.lifecycle === 'live').map(r => r.key))].sort();
  fs.writeFileSync(output.replace(/\.json$/, '.md'), `# Inventário automático de permissões\n\nGerar: \`bun scripts/audit-permission-inventory.ts [catalogo.json] [saida.json]\`. Sem conexão de rede. Snapshot vivo: ${catalog?.captured_at ?? 'INDISPONÍVEL'}.\n\n## Critérios e precedência\n\n1. DIVERGENTE: evidência semântica revisada de operação incompatível (M01 vivo; helper de custo em objects).\n2. NÃO ENCONTRADA: expressão dinâmica não resolvida; callers não são gates. registryWithoutLiteralOccurrence significa ausência de literal apenas nas fontes cobertas, não ausência de autorização. Snapshot ausente é indisponibilidade, nunca aprovação.\n3. GLOBAL: chave explícita system:global:manage; não classifica automaticamente o recurso como global.\n4. VÁLIDA: chave exata no registry, ação permitida.\n5. LEGADA: chave exata no LEGACY_PERMISSION_MAP. system:admin permanece local, não implica global.\n6. FANTASMA: candidato textual fora das duas fontes. Não equivale a vulnerabilidade comprovada.\n\n## Cobertura\n\n${sources.length} arquivos TS/TSX; ${migrations.length} migrations; ${objects.length} funções SQL/PLpgSQL vivas e ${catalog?.policies.length ?? 'indisponíveis'} policies. JSON preserva caminho, linha, objeto/assinatura, operação, trecho e callers. Linhas vivas são relativas à definição/expressão no snapshot, não ao JSON. Imports dinâmicos, overload por tipo e SQL construído exigem revisão.\n\n| Classe | Ocorrências |\n|---|---:|\n${Object.entries(summary).map(([k,v])=>`| ${k} | ${v} |`).join('\n')}\n\n## Candidatos fantasmas vivos\n\n${phantom.map(k=>`- \`${k}\``).join('\n')}\n\n## Revisão obrigatória\n\n- Literais em eventos, exemplos, tipos e testes não são autorização; lifecycle e evidence os distinguem. Regex SQL não é parser PostgreSQL; texto dentro de corpo dinâmico também aparece.\n- Arrays de OR e policies permissivas somam caminhos; restritivas exigem interseção. Consultar policies completas e ACLs efetivas de objects. A presença de uma chave válida não prova que o caminho a exige.\n- DENY prevalece por chave nas permissões efetivas; outra chave no OR ainda pode conceder. O banco não expande aliases do frontend.\n- Gate dinâmico como can(module, action) precisa de resolução dos argumentos/callers. Helpers internos podem delegar autorização; ausência de literal no corpo não prova ausência de guard.\n- Este artefato classifica ocorrências de permissões. ACLs de tabelas e avaliação semântica devem ser conferidas no catálogo de entrada e no relatório da fase; a classificação textual não certifica isolamento.\n- Migration é histórico, inclusive esta candidata não publicada. Fonte Edge local não comprova corpo publicado. Não houve sync, concessão em massa ou exclusão de chaves.\n`);
  console.log(JSON.stringify({ output, coverage: result.coverage, summary }));
}
