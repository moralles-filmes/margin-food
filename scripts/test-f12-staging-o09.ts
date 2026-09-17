import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  completeRhDocumentUpload,
  createRhDocumentStorageOps,
  deleteRhDocumentStorage,
  type RhDocumentStorageOps,
} from '../src/lib/rhDocumentStorageSaga';
import type { Database } from '../src/integrations/supabase/types';

const projectRef = process.env.F12_STAGING_PROJECT_REF || 'jiufikblnfivgynrbfyq';
if (projectRef !== 'jiufikblnfivgynrbfyq') throw new Error('STAGING_PROJECT_REF_NOT_ALLOWED');
const url = `https://${projectRef}.supabase.co`;
const evidencePath = resolve('docs/multi-unidades/fase12-20260916/staging-o09.json');
const runId = randomUUID();
const suffix = runId.slice(0, 8);
let companyA = '';
let companyB = '';
const collaboratorA = randomUUID();
const collaboratorB = randomUUID();
const email = `f12-o09-${suffix}@example.test`;
const password = `${randomUUID()}aA!9`;
const objectPaths = new Set<string>();
const documentIds = new Set<string>();
const checks: string[] = [];
let userId: string | undefined;

function pass(label: string) {
  checks.push(label);
  process.stdout.write(`PASS ${label}\n`);
}

function keysFromCli() {
  const result = spawnSync('supabase', [
    'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json',
  ], { encoding: 'utf8', shell: true, windowsHide: true });
  if (result.status !== 0) throw new Error(`SUPABASE_KEYS_FAILED:${result.status}`);
  const keys = JSON.parse(result.stdout) as Array<{ name?: string; type?: string; api_key?: string }>;
  // GoTrue Admin still requires the legacy service_role JWT; the new sb_secret_
  // key is accepted by the Data API but is rejected by this hosted Auth endpoint.
  const serviceKey = keys.find(key => key.name === 'service_role')?.api_key
    || keys.find(key => key.type === 'secret')?.api_key;
  const publishableKey = keys.find(key => key.type === 'publishable')?.api_key
    || keys.find(key => key.name === 'anon')?.api_key;
  if (!serviceKey || !publishableKey) throw new Error('STAGING_KEYS_INCOMPLETE');
  return { serviceKey, publishableKey };
}

function clientWithToken(publishableKey: string, token: string, companyId: string) {
  return createClient<Database>(url, publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-company-id': companyId } },
  });
}

async function expectNoError<T extends { error: unknown }>(result: T, label: string): Promise<T> {
  if (result.error) throw new Error(`${label}:${JSON.stringify(result.error)}`);
  return result;
}

async function insertMetadata(
  client: SupabaseClient<Database>,
  input: { id: string; path: string; companyId?: string; collaboratorId?: string; state?: string },
) {
  documentIds.add(input.id);
  const result = await client.from('rh_documentos').insert({
    id: input.id,
    company_id: input.companyId || companyA,
    colaborador_id: input.collaboratorId || collaboratorA,
    tipo: 'outro',
    nome: `Documento sintético ${suffix}`,
    arquivo_path: input.path,
    arquivo_nome: 'synthetic.txt',
    arquivo_tamanho: 20,
    uploaded_by: userId!,
    storage_state: input.state || 'PENDING_UPLOAD',
  }).select('id').single();
  await expectNoError(result, 'insert metadata');
}

async function rowState(service: SupabaseClient<Database>, id: string) {
  const result = await service.from('rh_documentos').select('storage_state').eq('id', id).maybeSingle();
  await expectNoError(result, 'read metadata state');
  return result.data?.storage_state ?? null;
}

async function objectExists(service: SupabaseClient<Database>, path: string) {
  const result = await service.storage.from('rh-documentos').download(path);
  return !result.error;
}

async function cleanup(service: SupabaseClient<Database>) {
  const issues: string[] = [];
  const record = (label: string, error: { code?: string; message?: string } | null) => {
    if (error) issues.push(`${label}:${error.code || 'UNKNOWN'}:${error.message || 'unknown error'}`);
  };
  if (objectPaths.size) {
    const result = await service.storage.from('rh-documentos').remove([...objectPaths]);
    record('storage objects', result.error);
  }
  if (documentIds.size) {
    const result = await service.from('rh_documentos').delete().in('id', [...documentIds]);
    record('document ids', result.error);
  }
  record('collaborators', (await service.from('rh_colaboradores').delete().in('id', [collaboratorA, collaboratorB])).error);
  if (userId) {
    record('user permissions', (await service.from('user_permissions').delete().eq('user_id', userId)).error);
    record('user roles', (await service.from('user_roles').delete().eq('user_id', userId)).error);
    record('memberships', (await service.from('company_memberships').delete().eq('user_id', userId)).error);
    record('notifications', (await service.from('notifications').delete().eq('recipient_user_id', userId)).error);
    record('finance audit logs', (await service.from('fin_audit_logs').delete().eq('user_id', userId)).error);
    record('admin actions', (await service.from('admin_actions_log').delete().eq('target_user_id', userId)).error);
    record('auth user', (await service.auth.admin.deleteUser(userId, false)).error);
    record('profile id', (await service.from('profiles').delete().eq('id', userId)).error);
  }
  return issues;
}

const { serviceKey, publishableKey } = keysFromCli();
const service = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let primaryError: unknown;
let cleanupError: unknown;
try {
  const companyResult = await service.from('companies').select('id')
    .eq('ativo', true)
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .order('created_at', { ascending: true })
    .limit(2);
  await expectNoError(companyResult, 'select staging companies');
  if ((companyResult.data || []).length !== 2) throw new Error('TWO_STAGING_COMPANIES_REQUIRED');
  [companyA, companyB] = companyResult.data!.map(row => row.id);

  const actorResult = await service.from('user_permissions').select('user_id')
    .eq('permission_key', 'system:global:manage')
    .eq('effect', 'ALLOW')
    .limit(1)
    .maybeSingle();
  await expectNoError(actorResult, 'find staging fixture actor');
  if (!actorResult.data?.user_id) throw new Error('STAGING_FIXTURE_ACTOR_REQUIRED');
  await expectNoError(await service.rpc('reserve_company_invitation', {
    p_actor_user_id: actorResult.data.user_id,
    p_company_id: companyA,
    p_email: email,
  }), 'reserve synthetic identity');

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: `F12 O09 ${suffix}` },
  });
  if (created.error || !created.data.user) throw new Error(`create user:${created.error?.message}`);
  userId = created.data.user.id;

  await expectNoError(await service.from('company_memberships').insert([
    { user_id: userId, company_id: companyA, status: 'active' },
    { user_id: userId, company_id: companyB, status: 'active' },
  ]), 'create memberships');
  const permissionKeys = [
    'rh:documentos:view', 'rh:documentos:create', 'rh:documentos:edit',
    'rh:documentos:delete', 'rh:documentos:manage', 'rh:manage',
  ];
  await expectNoError(await service.from('user_permissions').insert(
    [companyA, companyB].flatMap(companyId => permissionKeys.map(permission_key => ({
      user_id: userId!, company_id: companyId, permission_key, effect: 'ALLOW',
    }))),
  ), 'grant synthetic permissions');
  await expectNoError(await service.from('rh_colaboradores').insert([
    { id: collaboratorA, company_id: companyA, nome: `Colaborador A ${suffix}`, created_by: userId },
    { id: collaboratorB, company_id: companyB, nome: `Colaborador B ${suffix}`, created_by: userId },
  ]), 'create collaborators');

  const auth = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error(`sign in:${signedIn.error?.message}`);
  const token = signedIn.data.session.access_token;
  const a = clientWithToken(publishableKey, token, companyA);

  const canonical = `${companyA}/${collaboratorA}/contract.txt`;
  const legacy = `${collaboratorA}/contract.txt`;
  const cross = `${companyB}/${collaboratorB}/contract.txt`;
  const canonicalCheck = await a.rpc('can_access_company_document', { p_path: canonical, p_action: 'create' });
  const legacyCheck = await a.rpc('can_access_company_document', { p_path: legacy, p_action: 'view' });
  const crossCheck = await a.rpc('can_access_company_document', { p_path: cross, p_action: 'create' });
  if (canonicalCheck.error || canonicalCheck.data !== true
      || legacyCheck.error || legacyCheck.data !== true
      || crossCheck.error || crossCheck.data !== false) {
    throw new Error('STORAGE_PATH_POLICY_MISMATCH');
  }
  pass('path canônico e legado autorizados; prefixo de outra empresa recusado');

  const happyId = randomUUID();
  const happyPath = `${companyA}/${collaboratorA}/${happyId}_happy.txt`;
  objectPaths.add(happyPath);
  await insertMetadata(a, { id: happyId, path: happyPath });
  await completeRhDocumentUpload(createRhDocumentStorageOps(a), {
    id: happyId,
    path: happyPath,
    file: new File(['staging-o09-happy'], 'synthetic.txt', { type: 'text/plain' }),
  });
  if (await rowState(service, happyId) !== 'ACTIVE' || !(await objectExists(service, happyPath))) {
    throw new Error('HAPPY_UPLOAD_NOT_ACTIVE');
  }
  await deleteRhDocumentStorage(createRhDocumentStorageOps(a), {
    id: happyId, arquivo_path: happyPath, storage_state: 'ACTIVE',
  });
  if (await rowState(service, happyId) !== null || await objectExists(service, happyPath)) {
    throw new Error('HAPPY_DELETE_RESIDUE');
  }
  pass('upload real ativa metadata; delete real remove objeto e linha');

  const deniedId = randomUUID();
  await insertMetadata(a, { id: deniedId, path: cross });
  await completeRhDocumentUpload(createRhDocumentStorageOps(a), {
    id: deniedId,
    path: cross,
    file: new File(['denied'], 'synthetic.txt', { type: 'text/plain' }),
  }).then(() => { throw new Error('CROSS_UPLOAD_ACCEPTED'); }, () => undefined);
  if (await rowState(service, deniedId) !== null || await objectExists(service, cross)) {
    throw new Error('UPLOAD_FAILURE_COMPENSATION_RESIDUE');
  }
  pass('falha real após metadata remove a linha pendente e não cria objeto cruzado');

  const activationId = randomUUID();
  const activationPath = `${companyA}/${collaboratorA}/${activationId}_activation.txt`;
  objectPaths.add(activationPath);
  await insertMetadata(a, { id: activationId, path: activationPath });
  const activationOps = createRhDocumentStorageOps(a);
  await completeRhDocumentUpload({
    ...activationOps,
    transition: async () => { throw new Error('synthetic activation failure'); },
  }, {
    id: activationId,
    path: activationPath,
    file: new File(['activation-failure'], 'synthetic.txt', { type: 'text/plain' }),
  }).then(() => { throw new Error('ACTIVATION_FAILURE_ACCEPTED'); }, () => undefined);
  if (await rowState(service, activationId) !== null || await objectExists(service, activationPath)) {
    throw new Error('ACTIVATION_FAILURE_COMPENSATION_RESIDUE');
  }
  pass('falha após objeto compensa bytes reais e metadata pendente');

  const removeId = randomUUID();
  const removePath = `${companyA}/${collaboratorA}/${removeId}_remove.txt`;
  objectPaths.add(removePath);
  await insertMetadata(a, { id: removeId, path: removePath });
  await completeRhDocumentUpload(createRhDocumentStorageOps(a), {
    id: removeId,
    path: removePath,
    file: new File(['remove-retry'], 'synthetic.txt', { type: 'text/plain' }),
  });
  const realRemoveOps = createRhDocumentStorageOps(a);
  const failedRemoveOps: RhDocumentStorageOps = {
    ...realRemoveOps,
    remove: async () => { throw new Error('synthetic object removal failure'); },
  };
  await deleteRhDocumentStorage(failedRemoveOps, {
    id: removeId, arquivo_path: removePath, storage_state: 'ACTIVE',
  }).then(() => { throw new Error('REMOVE_FAILURE_ACCEPTED'); }, () => undefined);
  if (await rowState(service, removeId) !== 'ACTIVE' || !(await objectExists(service, removePath))) {
    throw new Error('REMOVE_FAILURE_DID_NOT_ROLL_BACK');
  }
  await deleteRhDocumentStorage(realRemoveOps, {
    id: removeId, arquivo_path: removePath, storage_state: 'ACTIVE',
  });
  if (await rowState(service, removeId) !== null || await objectExists(service, removePath)) {
    throw new Error('REMOVE_RETRY_RESIDUE');
  }
  pass('falha de remoção restaura ACTIVE; retry real conclui sem resíduo');

  const metadataId = randomUUID();
  const metadataPath = `${companyA}/${collaboratorA}/${metadataId}_metadata.txt`;
  objectPaths.add(metadataPath);
  await insertMetadata(a, { id: metadataId, path: metadataPath });
  await completeRhDocumentUpload(createRhDocumentStorageOps(a), {
    id: metadataId,
    path: metadataPath,
    file: new File(['metadata-retry'], 'synthetic.txt', { type: 'text/plain' }),
  });
  const realMetadataOps = createRhDocumentStorageOps(a);
  await deleteRhDocumentStorage({
    ...realMetadataOps,
    deleteMetadata: async () => { throw new Error('synthetic metadata deletion failure'); },
  }, {
    id: metadataId, arquivo_path: metadataPath, storage_state: 'ACTIVE',
  }).then(() => { throw new Error('METADATA_FAILURE_ACCEPTED'); }, () => undefined);
  if (await rowState(service, metadataId) !== 'DELETING' || await objectExists(service, metadataPath)) {
    throw new Error('METADATA_FAILURE_NOT_RECOVERABLE');
  }
  await deleteRhDocumentStorage(realMetadataOps, {
    id: metadataId, arquivo_path: metadataPath, storage_state: 'DELETING',
  });
  if (await rowState(service, metadataId) !== null) throw new Error('METADATA_RETRY_RESIDUE');
  pass('falha final deixa DELETING explícito; retry idempotente remove metadata');

  const pendingId = randomUUID();
  const pendingPath = `${companyA}/${collaboratorA}/${pendingId}_pending.txt`;
  objectPaths.add(pendingPath);
  await insertMetadata(a, { id: pendingId, path: pendingPath });
  await deleteRhDocumentStorage(createRhDocumentStorageOps(a), {
    id: pendingId, arquivo_path: pendingPath, storage_state: 'PENDING_UPLOAD',
  });
  if (await rowState(service, pendingId) !== null) throw new Error('PENDING_DELETE_FALSE_SUCCESS');
  pass('PENDING_UPLOAD é reconciliado por DELETING sem falso sucesso');

  const beforeCleanup = await service.from('rh_documentos').select('id', { count: 'exact', head: true })
    .in('company_id', [companyA, companyB]);
  await expectNoError(beforeCleanup, 'count document residues');
  if ((beforeCleanup.count || 0) !== 0) throw new Error(`DOCUMENT_RESIDUES:${beforeCleanup.count}`);
  pass('zero metadata sintética antes da limpeza de identidade');

  const evidence = {
    capturedAt: new Date().toISOString(),
    environment: { kind: 'authorized-hosted-staging', projectRef },
    migration: {
      version: '20260916221500',
      sha256: createHash('sha256').update(
        await Bun.file('release/multiunit-stabilization-20260916/sql/20260916221500_rh_document_storage_contract_forward.sql').text(),
      ).digest('hex'),
    },
    checks,
    result: 'PASS',
    privateData: 'No credentials, tokens, emails, UUIDs, object names or payloads persisted.',
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
} catch (error) {
  primaryError = error;
} finally {
  const cleanupIssues = await cleanup(service);
  for (const issue of cleanupIssues) process.stderr.write(`CLEANUP ${issue}\n`);
  const companyResidue = userId
    ? await service.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId)
    : { error: null, count: 0 };
  if (companyResidue.error) cleanupError = new Error(`CLEANUP_VERIFY_FAILED:${companyResidue.error.code}`);
  if ((companyResidue.count || 0) !== 0) cleanupError = new Error(`CLEANUP_IDENTITY_RESIDUE:${companyResidue.count}`);
}

if (primaryError) throw primaryError;
if (cleanupError) throw cleanupError;
