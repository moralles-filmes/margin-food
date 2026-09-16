import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migrations = join(root, 'supabase', 'migrations');
const releaseRoot = join(root, 'release', 'multiunit-stabilization-20260916');
const sqlDir = join(releaseRoot, 'sql');

const sources = {
  phase2: '20260915140812_contain_global_maintenance_and_companies.sql',
  phase3: '20260915144030_trusted_log_writers_and_readers.sql',
  phase3Classifier: '20260915144031_classify_legacy_logs_safely.sql',
  phase4: '20260915200818_harden_salmon_internal_functions.sql',
  phase5: '20260915225538_isolate_supplier_prices.sql',
  phase6: '20260915232846_align_product_catalog_permissions.sql',
  phase7Containment: '20260916133617_phase7_contain_non_rls_privileges.sql',
  phase7References: '20260916133618_phase7_align_reference_catalogs.sql',
  phase7Writers: '20260916133619_phase7_guard_sql_writers.sql',
  phase7Conflicts: '20260916134848_phase7_scope_upsert_conflicts.sql',
  phase7Readers: '20260916135928_phase7_guard_stock_readers.sql',
  phase7Notifications: '20260916141000_phase7_scope_notification_writer.sql',
  phase8Storage: '20260916143153_phase8_storage_scope.sql',
  phase8Realtime: '20260916144830_phase8_realtime_events.sql',
  residual: '20260916211110_stabilize_multiunit_residual_contracts.sql',
};

const expectedSourceHashes = {
  [sources.phase2]: 'd680729197c1db8effcf9d83518853a047f179bc396c7c466a9491de43273063',
  [sources.phase3]: 'c7922c7569b53482c341a274648db77a3a11af93a77bee6737e614ee47d00b80',
  [sources.phase3Classifier]: '5caf5ad11ad0cff6964675fdc5cac7d3c1f8b288802a9ff06c54b3a13b354b2d',
  [sources.phase4]: '1b8a0fb45b9c1c750a58164cba27ccb125ee57ce42960a2c9dc0f1a84114fcb7',
  [sources.phase5]: '2e25ed4afb4827157a0592f9c74ee210e99a2d18ac58b837a41477e8a4e67690',
  [sources.phase6]: 'e6557452c9c809e4320fae08412f5beeb426f8a5c7ab5f18a155044b35a8dc49',
  [sources.phase7Containment]: 'f366f533f5fef8ff254267cfafced35ca54cd458d77f203ee5ad6e3dc072ab79',
  [sources.phase7References]: '816565b5c5c0311d6eadf7c944e85c8a852492aab15874912bebff11a8a47dcc',
  [sources.phase7Writers]: '31009b9e7ec96ddd3ccc84d756efc0384bd3a442536b0bb2c0f04e62492ce36b',
  [sources.phase7Conflicts]: 'e8bd35ed5fafd2cedfd630ae7196c2a2bfc5f1df6a53872928f64967a8180cad',
  [sources.phase7Readers]: 'ead47a752e592ff8d9aa744f5a0d4b7023c77b314f5abe791a5d07235ddc0b79',
  [sources.phase7Notifications]: '7eafe6ff948a5563dfd7ce777f5654e02c1317b6ab91a842622010865c401fb8',
  [sources.phase8Storage]: 'f7e0247639c92f6654c23f2ed05f7dec616274a935b871144cb03a9adbdefbed',
  [sources.phase8Realtime]: 'aeeae880dba46ca4f838611b6f9e48a2a3355f1e3c219f613bc5946ef54dec6d',
};

const plan = [
  ['phase2', '20260916220000_phase2_containment_forward.sql', 'byte-identical'],
  ['phase3', '20260916220100_phase3_logs_compatible_forward.sql', 'compatible-forward'],
  ['phase3Classifier', '20260916220200_phase3_log_classifier_forward.sql', 'byte-identical'],
  ['phase4', '20260916220300_phase4_salmon_forward.sql', 'byte-identical'],
  ['phase5', '20260916220400_phase5_supplier_forward.sql', 'byte-identical'],
  ['phase6', '20260916220500_phase6_catalog_forward.sql', 'compatible-forward'],
  ['phase7Containment', '20260916220600_phase7_containment_compatible_forward.sql', 'compatible-forward'],
  ['phase7References', '20260916220700_phase7_preserve_reference_hotfix.sql', 'superseded-by-live-hotfix'],
  ['phase7Writers', '20260916220800_phase7_writers_forward.sql', 'byte-identical'],
  ['phase7Conflicts', '20260916220900_phase7_conflicts_forward.sql', 'byte-identical'],
  ['phase7Readers', '20260916221000_phase7_readers_forward.sql', 'byte-identical'],
  ['phase7Notifications', '20260916221100_phase7_notifications_forward.sql', 'byte-identical'],
  ['phase8Storage', '20260916221200_phase8_storage_forward.sql', 'byte-identical'],
  ['phase8Realtime', '20260916221300_phase8_realtime_forward.sql', 'byte-identical'],
  ['residual', '20260916221400_stabilization_residual_forward.sql', 'new-forward'],
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function replaceGuardLine(sql, marker, replacement) {
  const lines = sql.split(/\r?\n/);
  const indexes = lines.flatMap((line, index) => line.includes(marker) ? [index] : []);
  if (indexes.length !== 1) throw new Error(`Expected one guard for ${marker}, got ${indexes.length}`);
  lines[indexes[0]] = replacement;
  return lines.join('\n');
}

function compatiblePhase3(original) {
  let sql = original;
  sql = replaceGuardLine(sql,
    "public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text)'",
    " IF to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)') IS NULL OR to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text)') IS NOT NULL OR position('expiration_date' in pg_get_functiondef(to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)'))) = 0 OR position('ON CONFLICT (supplier_id, stock_item_id, company_id)' in pg_get_functiondef(to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)'))) = 0 THEN RAISE EXCEPTION 'PHASE3_SALMON_ENTRY_CONTRACT_DRIFT'; END IF;");
  sql = replaceGuardLine(sql,
    "'cancel_salmon_entry_atomic(uuid,text)'; END IF;",
    " IF to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)') IS NULL OR position('INSERT INTO movimentacoes_estoque' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)'))) = 0 OR position('UPDATE movimentacoes_estoque SET' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)'))) = 0 OR position('INSERT INTO movimentacoes_estoque' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)'))) > position('UPDATE movimentacoes_estoque SET' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)'))) THEN RAISE EXCEPTION 'PHASE3_SALMON_ENTRY_CANCEL_ORDER_DRIFT'; END IF;");
  sql = replaceGuardLine(sql,
    "'cancel_salmon_manipulation_atomic(uuid,text)'; END IF;",
    " IF to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)') IS NULL OR position('INSERT INTO movimentacoes_estoque' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)'))) = 0 OR position('UPDATE movimentacoes_estoque SET' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)'))) = 0 OR position('INSERT INTO movimentacoes_estoque' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)'))) > position('UPDATE movimentacoes_estoque SET' in pg_get_functiondef(to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)'))) THEN RAISE EXCEPTION 'PHASE3_SALMON_MANIP_CANCEL_ORDER_DRIFT'; END IF;");
  sql = replaceGuardLine(sql,
    "'storno_purchase_order_stock(uuid)'; END IF;",
    " IF to_regprocedure('public.storno_purchase_order_stock(uuid)') IS NULL OR position('company_id' in pg_get_functiondef(to_regprocedure('public.storno_purchase_order_stock(uuid)'))) = 0 OR position('FOR UPDATE' in pg_get_functiondef(to_regprocedure('public.storno_purchase_order_stock(uuid)'))) = 0 THEN RAISE EXCEPTION 'PHASE3_PURCHASE_STORNO_TENANT_DRIFT'; END IF;");
  return '-- Generated compatible F3 forward; historical source is unchanged.\n' + sql;
}

function compatiblePhase7Containment(original) {
  const preflight = `DO $preflight$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'PHASE7_MIGRATION_REQUIRES_POSTGRES'; END IF;
 IF to_regnamespace('log_private') IS NULL
    OR to_regprocedure('public.deactivate_produto(uuid)') IS NULL
    OR to_regprocedure('public.upsert_supplier_price(text,uuid,numeric,text)') IS NULL
 THEN RAISE EXCEPTION 'PHASE7_REQUIRES_F3_F6_FORWARD_CHAIN'; END IF;
 IF has_function_privilege('authenticated','public.cleanup_old_audit_logs(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.refresh_materialized_views()','EXECUTE')
 THEN RAISE EXCEPTION 'PHASE7_REQUIRES_PHASE2_CONTAINMENT'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND (
      (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
      (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
      (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
      (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
      (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
    )) <> 17 THEN RAISE EXCEPTION 'PHASE7_HOTFIX_POLICY_COUNT_DRIFT'; END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text) FROM pg_policies p WHERE p.schemaname='public' AND (
      (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
      (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
      (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
      (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
      (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
    )) <> '9a49d198cabb2ec4f9fd1984e8c20404' THEN RAISE EXCEPTION 'PHASE7_HOTFIX_POLICY_DIGEST_DRIFT'; END IF;
END $preflight$;`;
  const replaced = original.replace(/DO \$preflight\$[\s\S]*?END \$preflight\$;/, preflight);
  if (replaced === original) throw new Error('Phase 7 containment preflight was not replaced');
  return '-- Generated compatible F7 containment forward; historical source is unchanged.\n' + replaced;
}

function compatiblePhase6(original) {
  const oldHash = '2532768bddc2d5b2ff4bab2c0ad72f75';
  const hardenedHash = '42354d656d3eece177c32e4a1eab03d1';
  if (!original.includes(oldHash)) throw new Error('Phase 6 expected receive hash was not found');
  let sql = original.replace(oldHash, hardenedHash);
  const marker = " IF actual IS DISTINCT FROM $expected$";
  const line = sql.split(/\r?\n/).find((value) => value.includes(marker) && value.includes('PHASE6_FUNCTION_DRIFT'));
  if (!line) throw new Error('Phase 6 function guard was not found');
  const semantic = `${line}\n IF position('SET search_path TO ''public'', ''pg_temp''' in pg_get_functiondef(to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)'))) = 0 OR position('supplier_item_prices' in pg_get_functiondef(to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)'))) = 0 OR position('company_id' in pg_get_functiondef(to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)'))) = 0 OR position('assert_tenant' in pg_get_functiondef(to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)'))) = 0 THEN RAISE EXCEPTION 'PHASE6_RECEIVE_PURCHASE_HARDENING_DRIFT'; END IF;`;
  sql = sql.replace(line, semantic);
  return '-- Generated compatible F6 forward; preserves the Phase 5 pg_temp hardening.\n' + sql;
}

function preservedReferenceHotfix() {
  return `-- Historical Phase 7 reference alignment is superseded by live hotfix
-- 20260916153928. Do not recreate phase7_active_consumers or weaken granular
-- ALLOW + legacy DENY behavior. This forward records and verifies the advance.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $verify$
DECLARE v_count integer; v_digest text;
BEGIN
 SELECT count(*),md5(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text)
 INTO v_count,v_digest FROM pg_policies p WHERE p.schemaname='public' AND (
   (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
   (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
   (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
   (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
   (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
 );
 IF v_count<>17 OR v_digest<>'9a49d198cabb2ec4f9fd1984e8c20404' THEN
   RAISE EXCEPTION 'PHASE7_REFERENCE_HOTFIX_DRIFT count=% digest=%',v_count,v_digest;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('stock_categories','stock_locations','stock_sectors')
   AND policyname='phase7_active_consumers') THEN
   RAISE EXCEPTION 'PHASE7_SUPERSEDED_POLICY_PRESENT';
 END IF;
END $verify$;
COMMIT;
`;
}

await mkdir(sqlDir, { recursive: true });
const loaded = {};
for (const [key, file] of Object.entries(sources)) {
  const content = await readFile(join(migrations, file), 'utf8');
  const expected = expectedSourceHashes[file];
  if (expected && sha256(content) !== expected) {
    throw new Error(`Source drift for ${file}: ${sha256(content)} != ${expected}`);
  }
  loaded[key] = content;
}

const entries = [];
for (const [key, destination, mode] of plan) {
  let content = loaded[key];
  if (key === 'phase3') content = compatiblePhase3(content);
  if (key === 'phase6') content = compatiblePhase6(content);
  if (key === 'phase7Containment') content = compatiblePhase7Containment(content);
  if (key === 'phase7References') content = preservedReferenceHotfix();
  await writeFile(join(sqlDir, destination), content, 'utf8');
  entries.push({
    order: entries.length + 1,
    destination,
    sha256: sha256(content),
    mode,
    source: sources[key],
    sourceSha256: sha256(loaded[key]),
  });
}

const manifest = {
  format: 1,
  generatedAt: new Date().toISOString(),
  projectId: 'wuzxpbixprrgssoeeaez',
  liveHistoryBase: '20260916153928',
  forbiddenOperations: ['push', 'production deploy', 'production migration apply', 'migration repair'],
  policyHotfix: { count: 17, digest: '9a49d198cabb2ec4f9fd1984e8c20404' },
  entries,
  futureHistory: {
    historicalCandidatesRemainUnapplied: Object.values(sources).filter((name) => name < sources.residual),
    forwardVersions: entries.map((entry) => entry.destination.slice(0, 14)),
    rule: 'Only forward versions are recorded remotely; historical candidate versions remain absent. No repair or renumbering.',
  },
};
await writeFile(join(releaseRoot, 'manifest.generated.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
process.stdout.write(`${entries.length} release files written to ${sqlDir}\n`);
for (const entry of entries) process.stdout.write(`${entry.sha256}  ${basename(entry.destination)}\n`);
