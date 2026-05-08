/**
 * CI Security Gate — RBAC & SQL Lint Enforcement
 *
 * Runs two checks before allowing a deploy:
 * 1. rbac_sql_lint_report() via Supabase RPC (requires service_role key)
 * 2. npm run rbac:lint (static code analysis)
 *
 * Exit 0 = all clear, Exit 1 = block deploy.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... npx tsx scripts/verify-security.ts
 */

import { execSync } from 'child_process';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

let exitCode = 0;

// ─── Step 1: SQL Lint via Supabase REST ───
async function runSqlLint() {
  console.log('\n🔍 [1/2] Running rbac_sql_lint_report() ...');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_SECRET_KEY not set — skipping SQL lint (CI-only check).');
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rbac_sql_lint_report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: '{}',
    });

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
  console.log('\n🔍 [2/2] Running npm run rbac:lint ...');
  try {
    execSync('npm run rbac:lint', { stdio: 'inherit' });
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
