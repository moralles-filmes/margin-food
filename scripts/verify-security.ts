/**
 * CI Security Gate — RBAC & SQL Lint Enforcement
 *
 * Runs two checks before allowing a deploy:
 * 1. rbac_sql_lint_report() via Supabase RPC (requires service_role key)
 * 2. bun run rbac:lint (static code analysis)
 *
 * Exit 0 = all clear, Exit 1 = block deploy.
 *
 * Usage:
 *   SUPABASE_URL=... SB_SECRET_KEY=... bun x tsx scripts/verify-security.ts
 *
 * Local secrets can live in .env.local (gitignored) or .env.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

function getEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];

  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;

    const line = readFileSync(file, 'utf8')
      .split(String.fromCharCode(10))
      .find((entry) => entry.trim().startsWith(`${name}=`));

    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
  }

  return undefined;
}

const SUPABASE_URL = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
const SUPABASE_SERVICE_KEY =
  getEnv('SB_SECRET_KEY')
  ?? getEnv('SUPABASE_SERVICE_ROLE_KEY')
  ?? getEnv('SB_SECRET_KEY_EDGE_FUNCTIONS_PROD')
  ?? getEnv('SB_SECRET_KEY_DEFALUT');
const SQL_LINT_ACTOR_USER_ID =
  getEnv('RBAC_SQL_LINT_ACTOR_USER_ID')
  ?? getEnv('SQL_LINT_ACTOR_USER_ID')
  ?? getEnv('SUPABASE_ACTOR_USER_ID');

let exitCode = 0;

async function supabaseRestGet<T>(path: string): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!res.ok) return null;
  return await res.json() as T;
}

async function resolveSqlLintActorUserId(): Promise<string | undefined> {
  if (SQL_LINT_ACTOR_USER_ID) return SQL_LINT_ACTOR_USER_ID;

  const directGrant = await supabaseRestGet<Array<{ user_id: string }>>(
    'user_permissions?select=user_id&permission_key=eq.system%3Aglobal%3Amanage&effect=eq.ALLOW&limit=1',
  );
  if (directGrant?.[0]?.user_id) return directGrant[0].user_id;

  const roles = await supabaseRestGet<Array<{ role: string }>>(
    'role_permissions?select=role&permission_key=eq.system%3Aglobal%3Amanage',
  );
  const roleList = roles?.map((entry) => entry.role).filter(Boolean) ?? [];
  if (roleList.length === 0) return undefined;

  const encodedRoles = roleList.map((role) => `"${role.replace(/"/g, '')}"`).join(',');
  const roleUsers = await supabaseRestGet<Array<{ user_id: string }>>(
    `user_roles?select=user_id&role=in.(${encodeURIComponent(encodedRoles)})&limit=1`,
  );
  return roleUsers?.[0]?.user_id;
}

// ─── Step 1: SQL Lint via Supabase REST ───
async function runSqlLint() {
  console.log('\n🔍 [1/2] Running rbac_sql_lint_report() ...');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('⚠️  SUPABASE_URL or SB_SECRET_KEY not set — skipping SQL lint (CI-only check).');
    return;
  }

  try {
    const actorUserId = await resolveSqlLintActorUserId();
    let rpcName = actorUserId ? 'rbac_sql_lint_report_admin' : 'rbac_sql_lint_report';
    let body = actorUserId ? JSON.stringify({ p_actor_user_id: actorUserId }) : '{}';

    if (actorUserId) {
      console.log('ℹ️  Using explicit system:global:manage actor for SQL lint.');
    }

    const callRpc = () => fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body,
      });

    let res = await callRpc();

    if (!res.ok) {
      const errText = await res.text();
      const timedOut = errText.includes('57014') || errText.includes('statement timeout');
      if (timedOut && actorUserId) {
        console.warn('⚠️  Full SQL lint timed out; falling back to rbac_sql_lint_report_quick().');
        rpcName = 'rbac_sql_lint_report_quick';
        body = JSON.stringify({ p_actor_user_id: actorUserId });
        res = await callRpc();
      } else {
        console.error(`❌ rbac_sql_lint_report() HTTP ${res.status}: ${errText}`);
        exitCode = 1;
        return;
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ rbac_sql_lint_report() HTTP ${res.status}: ${errText}`);
      exitCode = 1;
      return;
    }

    const report = await res.json();

    // Check top-level status
    if (report.status === 'FAIL') {
      console.error('❌ rbac_sql_lint_report() returned FAIL:');
      console.error(JSON.stringify(report, null, 2));
      exitCode = 1;
      return;
    }

    // Check individual sections for fail_count > 0
    const sections = [
      'tables_without_rls',
      'tables_without_force_rls',
      'policies_missing_company_filter',
      'functions_without_search_path',
      'auth_bypass_functions',
      'has_permission_one_arg_calls',
    ];

    for (const section of sections) {
      const s = report[section];
      if (s && typeof s === 'object' && (s.count > 0 || s.fail_count > 0)) {
        console.error(`❌ Section "${section}" has ${s.count ?? s.fail_count} finding(s):`);
        console.error(JSON.stringify(s.items ?? s, null, 2));
        exitCode = 1;
      }
    }

    if (exitCode === 0) {
      console.log('✅ rbac_sql_lint_report() — PASS');
    }
  } catch (err) {
    console.error('❌ Failed to call rbac_sql_lint_report():', err);
    exitCode = 1;
  }
}

// ─── Step 2: Code Lint ───
function runCodeLint() {
  const prefersBun = Boolean(process.versions.bun) || process.env.npm_config_user_agent?.includes('bun') || existsSync('bun.lock');
  const runner = prefersBun ? 'bun run rbac:lint' : 'npm run rbac:lint';
  console.log(`\n🔍 [2/2] Running ${runner} ...`);
  try {
    execSync(runner, { stdio: 'inherit' });
    console.log('✅ rbac:lint — PASS');
  } catch {
    console.error('❌ rbac:lint — FAIL');
    exitCode = 1;
  }
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🛡️  MarginPro Security Gate');
  console.log('═══════════════════════════════════════');

  await runSqlLint();
  runCodeLint();

  console.log('\n═══════════════════════════════════════');
  if (exitCode === 0) {
    console.log('  ✅ All security checks PASSED');
  } else {
    console.log('  ❌ Security checks FAILED — deploy blocked');
  }
  console.log('═══════════════════════════════════════\n');

  process.exit(exitCode);
}

main();
