#!/usr/bin/env node
/**
 * RBAC Code Lint — Enterprise Quality Gate (v3)
 *
 * 13 checks organised by severity tier:
 *   BLOCKER  → must be fixed before deploy (exit 1)
 *   IMPORTANT → should be fixed, tracked in backlog (exit 0 with warnings)
 *   INFO      → nice-to-have improvement (exit 0)
 *
 * Usage: npx tsx scripts/rbac-lint.ts
 * Exit code: 0 = PASS, 1 = FAIL (blockers found)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

// ─── Config ───
const ALLOWED_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'manage', 'approve', 'close', 'reconcile', 'cancel', 'simulate'];
const SELECT_STAR_ALLOWLIST = ['useEstoqueGeralStore.ts', 'useSalmonStore.ts', 'types.ts'];
const EDGE_ALLOWLIST = ['check-password', 'scheduled-jobs'];
const CRITICAL_FILES = [
  'FinanceiroView', 'EstoqueGeralView', 'InventarioView', 'ConciliacaoBancariaSection',
  'DRESection', 'FluxoCaixaSection', 'DashboardFinanceiroSection',
  'useEstoqueGeralStore', 'useInventarioStore', 'useSalmonStore',
];
const CRITICAL_TABLES = [
  'fin_lancamentos', 'fin_contas_pagar', 'fin_contas_receber',
  'movimentacoes_estoque', 'produtos', 'inventarios',
  'rh_colaboradores', 'rh_folha_pagamento',
];
const ADMIN_RPC_ALLOWLIST = [
  'has_permission', 'admin_has_permission', 'has_any_permission',
  'audit_log_write', 'log_audit',
];

const ROOT = process.cwd();

type Tier = 'BLOCKER' | 'IMPORTANT' | 'INFO';

interface Finding {
  check: string;
  tier: Tier;
  file: string;
  detail: string;
  suggestion: string;
  allowlisted: boolean;
}

const findings: Finding[] = [];

function push(f: Omit<Finding, 'allowlisted'> & { allowlisted?: boolean }) {
  findings.push({ allowlisted: false, ...f });
}

// ─── Helpers ───
function readFile(p: string): string {
  try { return readFileSync(p, 'utf-8'); } catch { return ''; }
}

function walkDir(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, ext));
    else if (ext.some(e => entry.name.endsWith(e))) results.push(full);
  }
  return results;
}

// ─── 1) Registry Action Validation ── BLOCKER ───
function checkRegistryActions() {
  const path = join(ROOT, 'src/permissions/registry.ts');
  const content = readFile(path);
  if (!content) { push({ check: 'REGISTRY', tier: 'BLOCKER', file: path, detail: 'File not found', suggestion: 'Create src/permissions/registry.ts' }); return; }
  const used = new Set<string>();
  for (const m of content.matchAll(/action:\s*['"]([^'"]+)['"]/g)) used.add(m[1]);
  for (const a of used) {
    if (!ALLOWED_ACTIONS.includes(a)) {
      push({ check: 'REGISTRY', tier: 'BLOCKER', file: 'src/permissions/registry.ts', detail: `Invalid action: "${a}"`, suggestion: `Use one of: ${ALLOWED_ACTIONS.join(', ')}` });
    }
  }
  console.log(`  ✓ Registry: ${used.size} unique actions`);
}

// ─── 2) useModuleAccess() ── BLOCKER ───
function checkModuleAccessCalls() {
  const regContent = readFile(join(ROOT, 'src/permissions/registry.ts'));
  const moduleKeys = new Set<string>();
  for (const m of regContent.matchAll(/\{\s*key:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"]\s*,\s*subtabs:/g)) moduleKeys.add(m[1]);
  const files = walkDir(join(ROOT, 'src'), ['.tsx', '.ts']);
  for (const file of files) {
    if (file.includes('node_modules')) continue;
    const src = readFile(file);
    for (const m of src.matchAll(/useModuleAccess\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!moduleKeys.has(m[1])) {
        push({ check: 'MODULE_ACCESS', tier: 'BLOCKER', file: relative(ROOT, file), detail: `useModuleAccess('${m[1]}') — module not in registry`, suggestion: `Add '${m[1]}' to MODULE_MANIFESTS in registry.ts or fix the key` });
      }
    }
  }
  console.log(`  ✓ Module access: scanned ${files.length} files`);
}

// ─── 3) Edge function guards ── IMPORTANT ───
function checkEdgeFunctionGuards() {
  const edgeDir = join(ROOT, 'supabase/functions');
  if (!existsSync(edgeDir)) { console.log('  ⚠ No edge functions directory'); return; }
  for (const entry of readdirSync(edgeDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EDGE_ALLOWLIST.includes(entry.name)) continue;
    const indexPath = join(edgeDir, entry.name, 'index.ts');
    if (!existsSync(indexPath)) continue;
    const src = readFile(indexPath);
    if (!src.includes('has_permission')) {
      push({ check: 'EDGE_GUARD', tier: 'IMPORTANT', file: `supabase/functions/${entry.name}/index.ts`, detail: 'No has_permission call found', suggestion: 'Add admin_has_permission or has_any_permission check before business logic' });
    }
  }
  console.log(`  ✓ Edge functions: checked`);
}

// ─── 4) adminClient.rpc() misuse ── BLOCKER ───
function checkAdminClientRpcMisuse() {
  const edgeDir = join(ROOT, 'supabase/functions');
  if (!existsSync(edgeDir)) return;
  let count = 0;
  for (const entry of readdirSync(edgeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = join(edgeDir, entry.name, 'index.ts');
    if (!existsSync(indexPath)) continue;
    const lines = readFile(indexPath).split('\n');
    count++;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/adminClient\.rpc\(\s*['"]([\w]+)['"]/);
      if (!match || ADMIN_RPC_ALLOWLIST.includes(match[1])) continue;
      push({ check: 'ADMIN_RPC', tier: 'BLOCKER', file: `supabase/functions/${entry.name}/index.ts`, detail: `Line ${i + 1}: adminClient.rpc('${match[1]}')`, suggestion: 'Use userClient for RPCs that depend on auth.uid()' });
    }
  }
  console.log(`  ✓ Admin RPC: checked ${count} edge functions`);
}

// ─── 5) isMaster / isAdmin bypass ── BLOCKER ───
function checkBypassPatterns() {
  const allFiles = [...walkDir(join(ROOT, 'src/components'), ['.tsx', '.ts']), ...walkDir(join(ROOT, 'src/pages'), ['.tsx', '.ts'])];
  for (const file of allFiles) {
    const src = readFile(file);
    const rel = relative(ROOT, file);
    if (src.includes('isMaster') && !rel.includes('AuthContext')) {
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('isMaster') && (line.includes('if') || line.includes('&&') || line.includes('||') || line.includes('?'))) {
          if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            push({ check: 'BYPASS', tier: 'BLOCKER', file: rel, detail: `Line ${i + 1}: isMaster used in authorization logic`, suggestion: 'Replace with useCan() or has_permission RPC' });
          }
        }
      }
    }
    if (/hasRole\s*\(\s*['"]admin['"]\s*\)/.test(src)) {
      push({ check: 'BYPASS', tier: 'BLOCKER', file: rel, detail: "hasRole('admin') used for authorization", suggestion: 'Use granular permissions via useCan()' });
    }
  }
  console.log(`  ✓ Bypass patterns: scanned ${allFiles.length} files`);
}

// ─── 6) select('*') ── IMPORTANT ───
function checkSelectStar() {
  const allFiles = [...walkDir(join(ROOT, 'src/components'), ['.tsx', '.ts']), ...walkDir(join(ROOT, 'src/hooks'), ['.tsx', '.ts'])];
  let v = 0;
  for (const file of allFiles) {
    const rel = relative(ROOT, file);
    const isAllowlisted = SELECT_STAR_ALLOWLIST.some(a => rel.includes(a));
    const src = readFile(file);
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(".select('*')") || lines[i].includes('.select("*")')) {
        push({ check: 'SELECT_STAR', tier: 'IMPORTANT', file: rel, detail: `Line ${i + 1}: select('*')`, suggestion: 'Use explicit projection: .select(\'id, nome, valor\')', allowlisted: isAllowlisted });
        v++;
      }
    }
  }
  console.log(`  ✓ select('*'): ${v} occurrences`);
}

// ─── 7) Timezone patterns ── IMPORTANT ───
function checkTimezonePatterns() {
  const files = walkDir(join(ROOT, 'src/components'), ['.tsx', '.ts']);
  let v = 0;
  for (const file of files) {
    const lines = readFile(file).split('\n');
    const rel = relative(ROOT, file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if ((line.includes("toISOString().split('T')") || line.includes('toISOString().split("T")')) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        push({ check: 'TIMEZONE', tier: 'IMPORTANT', file: rel, detail: `Line ${i + 1}: toISOString().split('T')`, suggestion: 'Use todayBR() or formatDateBR() from src/lib/datetime.ts' });
        v++;
      }
    }
  }
  console.log(`  ✓ Timezone: ${v} violations`);
}

// ─── 8) Direct deletes on critical tables ── IMPORTANT ───
function checkDirectDeletes() {
  const allFiles = [...walkDir(join(ROOT, 'src/components'), ['.tsx', '.ts']), ...walkDir(join(ROOT, 'src/hooks'), ['.tsx', '.ts'])];
  let v = 0;
  for (const file of allFiles) {
    const src = readFile(file);
    const rel = relative(ROOT, file);
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('.delete()')) continue;
      for (const table of CRITICAL_TABLES) {
        if (src.includes(`'${table}'`) && lines.slice(Math.max(0, i - 3), i + 1).join('\n').includes(table)) {
          push({ check: 'DIRECT_DELETE', tier: 'IMPORTANT', file: rel, detail: `Line ${i + 1}: .delete() on '${table}'`, suggestion: 'Use a _guarded RPC for critical table mutations' });
          v++;
        }
      }
    }
  }
  console.log(`  ✓ Direct deletes: ${v} violations`);
}

// ─── 9) Missing RBAC view ── IMPORTANT ───
function checkMissingRbacView() {
  const files = walkDir(join(ROOT, 'src/components'), ['.tsx']);
  let flagged = 0;
  for (const file of files) {
    const src = readFile(file);
    const rel = relative(ROOT, file);
    if (rel.includes('/ui/') || rel.includes('NavLink') || rel.includes('Modal')) continue;
    if ((src.includes('supabase.from(') || src.includes('supabase.rpc(')) && !src.includes('useCan') && !src.includes('useModuleAccess') && !src.includes('RequirePermission')) {
      if (src.split('\n').length > 80) {
        push({ check: 'MISSING_RBAC', tier: 'IMPORTANT', file: rel, detail: `No useCan/useModuleAccess in component with DB queries`, suggestion: 'Add useCan(\'modulo:subaba:view\') and <NoAccess /> guard' });
        flagged++;
      }
    }
  }
  console.log(`  ✓ Missing RBAC: ${flagged} components`);
}

// ─── 10) Destructive without confirm ── IMPORTANT ───
function checkDestructiveWithoutConfirm() {
  const files = walkDir(join(ROOT, 'src/components'), ['.tsx']);
  let v = 0;
  for (const file of files) {
    const src = readFile(file);
    const rel = relative(ROOT, file);
    if (src.includes('.delete()') && !src.includes('confirm') && !src.includes('useConfirmDialog') && !src.includes('AlertDialog')) {
      if (src.split('\n').length > 50) {
        push({ check: 'NO_CONFIRM', tier: 'IMPORTANT', file: rel, detail: 'Has .delete() but no confirmation dialog', suggestion: 'Add useConfirmDialog() before destructive actions' });
        v++;
      }
    }
  }
  console.log(`  ✓ No confirm: ${v} violations`);
}

// ─── 11) as any in critical files ── INFO ───
function checkAsAnyInCritical() {
  const allFiles = [...walkDir(join(ROOT, 'src/components'), ['.tsx', '.ts']), ...walkDir(join(ROOT, 'src/hooks'), ['.tsx', '.ts'])];
  let total = 0;
  for (const file of allFiles) {
    const rel = relative(ROOT, file);
    if (!CRITICAL_FILES.some(p => rel.includes(p))) continue;
    const matches = readFile(file).match(/as any/g);
    if (matches && matches.length > 0) {
      total += matches.length;
      push({ check: 'AS_ANY', tier: 'INFO', file: rel, detail: `${matches.length} occurrences of 'as any'`, suggestion: 'Create typed interfaces or use narrowRows/narrowScalar from guards.ts' });
    }
  }
  console.log(`  ✓ as any critical: ${total} total`);
}

// ─── 12) Missing loading state ── INFO ───
function checkMissingLoadingState() {
  const files = walkDir(join(ROOT, 'src/components'), ['.tsx']);
  let v = 0;
  for (const file of files) {
    const src = readFile(file);
    const rel = relative(ROOT, file);
    if (src.split('\n').length < 80) continue;
    if ((src.includes('.insert(') || src.includes('.update(')) && !src.includes('saving') && !src.includes('loading') && !src.includes('Saving') && !src.includes('Loading') && !src.includes('Loader2')) {
      push({ check: 'NO_LOADING', tier: 'INFO', file: rel, detail: 'DB mutations without saving/loading state', suggestion: 'Add useState saving + setSaving guard or createSubmitGuard()' });
      v++;
    }
  }
  console.log(`  ✓ Missing loading: ${v} violations`);
}

// ─── 13) Missing export impl ── INFO ───
function checkMissingExportImpl() {
  const regContent = readFile(join(ROOT, 'src/permissions/registry.ts'));
  const exportPerms = [...regContent.matchAll(/'([a-z_]+:[a-z_]+):export'/g)].map(m => m[1]);
  const compFiles = walkDir(join(ROOT, 'src/components'), ['.tsx']);
  let missing = 0;
  for (const perm of exportPerms) {
    const mod = perm.split(':')[0];
    const has = compFiles.some(f => {
      if (!relative(ROOT, f).toLowerCase().includes(mod)) return false;
      const src = readFile(f);
      return src.includes('export') && (src.includes('download') || src.includes('csv') || src.includes('pdf') || src.includes('xlsx') || src.includes('Export') || src.includes('Exportar'));
    });
    if (!has) {
      push({ check: 'MISSING_EXPORT', tier: 'INFO', file: `registry: ${perm}:export`, detail: `No export impl found in ${mod} components`, suggestion: 'Use exportTableToPdf/exportTableToExcel from src/lib/exportHelpers.ts' });
      missing++;
    }
  }
  console.log(`  ✓ Missing export: ${missing}`);
}

// ─── Run ───
console.log('\n🔒 RBAC Quality Gate (v3)\n');
console.log('Checks:');

checkRegistryActions();
checkModuleAccessCalls();
checkEdgeFunctionGuards();
checkAdminClientRpcMisuse();
checkBypassPatterns();
checkSelectStar();
checkTimezonePatterns();
checkDirectDeletes();
checkMissingRbacView();
checkDestructiveWithoutConfirm();
checkAsAnyInCritical();
checkMissingLoadingState();
checkMissingExportImpl();

// ─── Report ───
console.log('\n═══════════════════════════════════════');
console.log('  📊 Quality Gate Results');
console.log('═══════════════════════════════════════\n');

const blockers   = findings.filter(f => f.tier === 'BLOCKER');
const important  = findings.filter(f => f.tier === 'IMPORTANT' && !f.allowlisted);
const allowlisted = findings.filter(f => f.allowlisted);
const info       = findings.filter(f => f.tier === 'INFO');

const ICONS: Record<Tier, string> = { BLOCKER: '🚫', IMPORTANT: '⚠️ ', INFO: 'ℹ️ ' };

function printSection(title: string, items: Finding[]) {
  if (items.length === 0) return;
  console.log(`── ${title} (${items.length}) ──\n`);
  for (const f of items) {
    console.log(`  ${ICONS[f.tier]} [${f.check}] ${f.file}`);
    console.log(`     ${f.detail}`);
    console.log(`     → ${f.suggestion}`);
    if (f.allowlisted) console.log(`     📋 ALLOWLISTED`);
    console.log('');
  }
}

printSection('BLOCKERS — Must fix before deploy', blockers);
printSection('IMPORTANT — Should fix / backlog', important);
printSection('ALLOWLISTED — Tracked exceptions', allowlisted);
printSection('INFO — Nice-to-have improvements', info);

console.log('─── Summary ───');
console.log(`  🚫 Blockers:    ${blockers.length}`);
console.log(`  ⚠️  Important:  ${important.length}`);
console.log(`  📋 Allowlisted: ${allowlisted.length}`);
console.log(`  ℹ️  Info:        ${info.length}`);

if (blockers.length > 0) {
  console.log('\n❌ FAIL — blockers found, deploy should be blocked\n');
  process.exit(1);
} else if (important.length > 0) {
  console.log('\n✅ PASS (with important warnings to address)\n');
  process.exit(0);
} else {
  console.log('\n✅ PASS — all clear\n');
  process.exit(0);
}
