import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseRoot = join(root, 'release', 'multiunit-stabilization-20260916');
const evidenceDir = join(root, 'docs', 'multi-unidades', 'fase12-20260916');
const host = process.env.PGHOST || '127.0.0.1';
const port = process.env.PGPORT || '15440';
const user = process.env.PGUSER || 'postgres';
const template = process.env.STABILIZATION_LIVE_TEMPLATE || 'moralles_phase9_test_live';
if (host !== '127.0.0.1' || !/^moralles_phase9_test_live(?:_|$)/.test(template)) {
  throw new Error('LOCAL_DISPOSABLE_TEMPLATE_ONLY');
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const database = `moralles_stabilization_release_${stamp}`;
const manifestPath = join(releaseRoot, 'manifest.generated.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function command(program, args, label) {
  const started = Date.now();
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PGHOST: host, PGPORT: port, PGUSER: user },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    throw new Error(`${label} failed with exit ${result.status}`);
  }
  return {
    label,
    durationMs: Date.now() - started,
    outputSha256: sha256(output),
    outputTail: output.split(/\r?\n/).filter(Boolean).slice(-8),
  };
}

function psql(db, file, label) {
  return command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', file], label);
}

function query(db, sql, label) {
  return command('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], label);
}

function liveProcess(program, args, label) {
  const started = Date.now();
  const child = spawn(program, args, {
    cwd: root,
    env: { ...process.env, PGHOST: host, PGPORT: port, PGUSER: user },
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const done = new Promise((resolvePromise, rejectPromise) => {
    child.on('error', rejectPromise);
    child.on('close', (status) => resolvePromise({
      status,
      result: {
        label,
        durationMs: Date.now() - started,
        outputSha256: sha256(output),
        outputTail: output.split(/\r?\n/).filter(Boolean).slice(-8),
      },
      output,
    }));
  });
  const waitFor = async (marker, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (!output.includes(marker)) {
      if (Date.now() > deadline) throw new Error(`${label} did not emit ${marker}`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  };
  return { child, done, waitFor };
}

const checks = [];
for (const entry of manifest.entries) {
  const content = await readFile(join(releaseRoot, 'sql', entry.destination));
  if (sha256(content) !== entry.sha256) throw new Error(`RELEASE_HASH_DRIFT: ${entry.destination}`);
}

checks.push(command('createdb', ['-T', template, database], 'create fresh live-equivalent clone'));
checks.push(psql(database,
  join(releaseRoot, 'rehearsal', 'live-external-substrate.sql'),
  'restore omitted Storage/Realtime catalog substrate'));

const stageTests = new Map([
  ['20260916220000_phase2_containment_forward.sql', ['phase2', 'supabase/tests/database/phase2_global_containment.sql']],
  ['20260916220200_phase3_log_classifier_forward.sql', ['phase3', 'supabase/tests/database/phase3_logs.sql']],
  ['20260916220300_phase4_salmon_forward.sql', ['phase4', 'supabase/tests/database/phase4_salmon.sql']],
  ['20260916220400_phase5_supplier_forward.sql', ['phase5', 'supabase/tests/database/phase5_suppliers.sql']],
  ['20260916220500_phase6_catalog_forward.sql', ['phase6', 'supabase/tests/database/phase6_products.sql']],
  ['20260916221100_phase7_notifications_forward.sql', ['phase7', 'supabase/tests/database/phase7_security.sql']],
]);

const stageDatabases = [];
for (const entry of manifest.entries) {
  checks.push(psql(database, join(releaseRoot, 'sql', entry.destination), `apply ${entry.destination}`));
  const stage = stageTests.get(entry.destination);
  if (stage) {
    const [phase, test] = stage;
    const stageDb = `moralles_${phase}_test_release_${stamp}`;
    checks.push(command('createdb', ['-T', database, stageDb], `clone ${phase} stage`));
    checks.push(psql(stageDb, join(root, test), `${phase} database regression`));
    stageDatabases.push({ phase, database: stageDb, test });
  }
  if (entry.destination === '20260916221300_phase8_realtime_forward.sql') {
    checks.push(psql(database,
      join(root, 'docs', 'multi-unidades', 'fase8-20260916', 'pos-validacao.sql'),
      'phase8 Storage post-validation'));
  }
}

checks.push(psql(database,
  join(root, 'supabase', 'tests', 'database', 'multiunit_stabilization_residual.sql'),
  'residual integrated database regression'));

// Force two first conversions to queue behind the same row lock. Once the lock
// is released, one creates the order and the other must return an idempotent
// replay; neither process may surface SQLSTATE 23505.
checks.push(psql(database,
  join(releaseRoot, 'rehearsal', 'cotacao-concurrency-setup.sql'),
  'prepare synthetic RFQ concurrency fixture'));
const psqlBase = ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', database, '-c'];
const locker = liveProcess('psql', [...psqlBase, `BEGIN;
SELECT 'LOCK_ACQUIRED' FROM public.cotacoes
 WHERE id='dd000000-0000-4000-8000-000000000001' FOR UPDATE;
SELECT pg_sleep(2); COMMIT;`], 'hold RFQ row lock');
await locker.waitFor('LOCK_ACQUIRED');
const conversionSql = `
SELECT set_config('request.jwt.claims','{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',false);
SELECT set_config('request.headers','{"x-company-id":"db000000-0000-4000-8000-000000000001"}',false);
SET ROLE authenticated;
SELECT public.create_purchase_orders_from_cotacao_atomic('dd000000-0000-4000-8000-000000000001',NULL)::text;`;
const first = liveProcess('psql', [...psqlBase, conversionSql], 'RFQ concurrent conversion A');
const second = liveProcess('psql', [...psqlBase, conversionSql], 'RFQ concurrent conversion B');
const [lockResult, firstResult, secondResult] = await Promise.all([locker.done, first.done, second.done]);
for (const processResult of [lockResult, firstResult, secondResult]) {
  checks.push(processResult.result);
  if (processResult.status !== 0 || /23505|unique_violation/i.test(processResult.output)) {
    throw new Error(`${processResult.result.label} failed concurrency contract`);
  }
}
const concurrentOutput = firstResult.output + secondResult.output;
if (!concurrentOutput.includes('"idempotent": false') || !concurrentOutput.includes('"idempotent": true')) {
  throw new Error('RFQ concurrency did not produce one create and one idempotent replay');
}
const concurrencyInvariant = query(database, `SELECT jsonb_build_object(
 'orders',count(*),'items',coalesce(sum(item_count),0),'distinct_keys',count(DISTINCT idempotency_key))::text
FROM (
 SELECT o.id,o.idempotency_key,count(i.id) item_count
 FROM public.purchase_orders o LEFT JOIN public.purchase_order_items i
   ON i.order_id=o.id AND i.company_id=o.company_id
 WHERE o.company_id='db000000-0000-4000-8000-000000000001'
   AND o.origin='COTACAO' AND o.origin_ref='dd000000-0000-4000-8000-000000000001'
 GROUP BY o.id,o.idempotency_key
) q;`, 'RFQ concurrency invariant');
checks.push(concurrencyInvariant);
const concurrencyJson = JSON.parse(concurrencyInvariant.outputTail.at(-1));
if (concurrencyJson.orders !== 1 || concurrencyJson.items !== 1 || concurrencyJson.distinct_keys !== 1) {
  throw new Error(`RFQ_CONCURRENCY_INVARIANT_FAILED: ${JSON.stringify(concurrencyJson)}`);
}

const catalog = query(database, `
SELECT jsonb_build_object(
 'public_tables',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')),
 'public_functions',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace),
 'public_policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
 'storage_policies',(SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),
 'realtime_tables',(SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime'),
 'realtime_insert_update_only',(SELECT pubinsert AND pubupdate AND NOT pubdelete AND NOT pubtruncate
   FROM pg_publication WHERE pubname='supabase_realtime'),
 'old_salmon_overload',to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text)') IS NOT NULL,
 'new_salmon_contract',to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)') IS NOT NULL,
 'reference_hotfix_count',(SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND (
   (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
   (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
   (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
   (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
   (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
 )),
 'reference_hotfix_digest',(SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text) FROM pg_policies p WHERE p.schemaname='public' AND (
   (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
   (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
   (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
   (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
   (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
 ))
)::text;`, 'final catalog invariants');
checks.push(catalog);
const catalogJson = JSON.parse(catalog.outputTail.at(-1));
if (catalogJson.old_salmon_overload || !catalogJson.new_salmon_contract
    || catalogJson.reference_hotfix_count !== 17
    || catalogJson.reference_hotfix_digest !== manifest.policyHotfix.digest
    || catalogJson.storage_policies !== 4 || catalogJson.realtime_tables !== 6
    || catalogJson.realtime_insert_update_only !== true) {
  throw new Error(`FINAL_CATALOG_INVARIANT_FAILED: ${JSON.stringify(catalogJson)}`);
}

await mkdir(evidenceDir, { recursive: true });
const evidence = {
  generatedAt: new Date().toISOString(),
  environment: { host, port: Number(port), template, database, postgres: '17.10' },
  releaseManifestSha256: sha256(await readFile(manifestPath)),
  exactSequence: manifest.entries.map(({ order, destination, sha256: hash, mode }) => ({ order, destination, sha256: hash, mode })),
  stageDatabases,
  catalog: catalogJson,
  concurrency: concurrencyJson,
  checks,
  limitations: [
    'Storage bytes are not present; only the live catalog surface omitted by the public template is reconstructed.',
    'The local PostgreSQL cluster has wal_level below logical; publication membership is catalog-tested, not streamed.',
    'No hosted gateway, production write, deploy, migration repair, external message or paid integration was used.',
  ],
};
const evidencePath = join(evidenceDir, 'release-rehearsal.json');
await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
process.stdout.write(`PASS ${database}\n${evidencePath}\n`);
