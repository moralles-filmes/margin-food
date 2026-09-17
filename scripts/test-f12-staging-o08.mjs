import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.F12_PLAYWRIGHT
  || 'C:/Users/Yuri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const JSZip = (await import('jszip')).default;

const projectRef = process.env.F12_STAGING_PROJECT_REF || 'jiufikblnfivgynrbfyq';
if (projectRef !== 'jiufikblnfivgynrbfyq') throw new Error('STAGING_PROJECT_REF_NOT_ALLOWED');
const supabaseUrl = `https://${projectRef}.supabase.co`;
const appUrl = 'http://127.0.0.1:8092';
const evidencePath = resolve('docs/multi-unidades/fase12-20260916/staging-o08.json');
const suffix = randomUUID().slice(0, 8);
const marker = `F12O08${suffix}`;
const email = `f12-o08-${suffix}@example.test`;
const password = `${randomUUID()}aA!9`;
const accountAId = randomUUID();
const accountBId = randomUUID();
const accountAName = `${marker} Conta A`;
const accountBName = `${marker} Conta B`;
const meetingTitle = `${marker} Reunião volumosa`;
const actionDescription = `${marker} Ação rastreável`;
const decisionIds = [];
const checks = [];
const browserErrors = [];
let sessionId;
let userId;
let companyA;
let companyB;
let companyAName;
let companyBName;
let browser;
let vite;

function pass(label) {
  checks.push(label);
  process.stdout.write(`PASS ${label}\n`);
}

function apiKeys() {
  const result = spawnSync('supabase', [
    'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json',
  ], { encoding: 'utf8', shell: true, windowsHide: true });
  if (result.status !== 0) throw new Error(`SUPABASE_KEYS_FAILED:${result.status}`);
  const keys = JSON.parse(result.stdout);
  const serviceKey = keys.find(key => key.name === 'service_role')?.api_key
    || keys.find(key => key.type === 'secret')?.api_key;
  const publishableKey = keys.find(key => key.type === 'publishable')?.api_key
    || keys.find(key => key.name === 'anon')?.api_key;
  if (!serviceKey || !publishableKey) throw new Error('STAGING_KEYS_INCOMPLETE');
  return { serviceKey, publishableKey };
}

async function expectOk(result, label) {
  if (result.error) {
    throw new Error(`${label}:${result.error.code || 'UNKNOWN'}:${result.error.message || 'unknown error'}`);
  }
  return result;
}

function scopedClient(publishableKey, token, companyId) {
  return createClient(supabaseUrl, publishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-company-id': companyId } },
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite ainda inicializando.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('VITE_START_TIMEOUT');
}

function decisionSnapshot() {
  return {
    contractVersion: 'presentation-decision-snapshot-v1.0',
    referenceType: 'BASE',
    sourceMode: 'actual',
    period: { start: '2026-09-01', endExclusive: '2026-10-01' },
    granularity: 'day',
    cutoffDate: '2026-09-16',
    capturedAt: new Date().toISOString(),
    formulaVersion: 'presentation-plan-v1.0',
    metricFormulaVersion: 'managerial-result-v1.0',
    sources: {
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    },
    rules: { regime: 'competencia' },
    metrics: { revenue: 0, expense: 0, result: 0, marginPercent: null, cmv: null, cmvPercent: null },
    assumptions: [],
  };
}

function meetingSnapshot() {
  return {
    contractVersion: 'presentation-meeting-snapshot-v1.0',
    period: { start: '2026-09-01', endExclusive: '2026-10-01' },
    granularity: 'day',
    capturedAt: new Date().toISOString(),
    cutoffDate: '2026-09-16',
    formulaVersion: 'presentation-plan-v1.0',
    sources: {
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    },
    rules: {
      regime: 'competencia',
      budgetProration: 'daily',
      hierarchyPrecedence: 'specific',
      projectionFormula: 'linear',
      openItemsIncluded: false,
    },
    metrics: { revenue: 0, expense: 0, result: 0, marginPercent: null, cmv: null, cmvPercent: null },
    dataUnavailable: ['cmv', 'cmvPercent'],
    filters: { comparisonMode: 'actual', rankingLimit: 10 },
    decisions: [],
    actions: [],
  };
}

async function prepareFixtures(service, publishableKey) {
  const companies = await service.from('companies').select('id,nome')
    .eq('ativo', true)
    .neq('id', '00000000-0000-0000-0000-000000000001')
    .order('created_at', { ascending: true })
    .limit(2);
  await expectOk(companies, 'select staging companies');
  if ((companies.data || []).length !== 2) throw new Error('TWO_STAGING_COMPANIES_REQUIRED');
  [{ id: companyA, nome: companyAName }, { id: companyB, nome: companyBName }] = companies.data;

  const actor = await service.from('user_permissions').select('user_id')
    .eq('permission_key', 'system:global:manage')
    .eq('effect', 'ALLOW')
    .limit(1)
    .maybeSingle();
  await expectOk(actor, 'find staging fixture actor');
  if (!actor.data?.user_id) throw new Error('STAGING_FIXTURE_ACTOR_REQUIRED');
  await expectOk(await service.rpc('reserve_company_invitation', {
    p_actor_user_id: actor.data.user_id,
    p_company_id: companyA,
    p_email: email,
  }), 'reserve synthetic identity');

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: marker },
  });
  if (created.error || !created.data.user) throw new Error(`create user:${created.error?.code || 'UNKNOWN'}`);
  userId = created.data.user.id;

  await expectOk(await service.from('company_memberships').insert([
    { user_id: userId, company_id: companyA, status: 'active' },
    { user_id: userId, company_id: companyB, status: 'active' },
  ]), 'create memberships');
  const permissions = [
    'system:global:manage',
    'financeiro:dashboard:view',
    'financeiro:contas:view',
    'financeiro:relatorio-socios:view',
    'financeiro:relatorio-socios:export',
    'financeiro:relatorio-socios:manage',
    'financeiro:relatorio-socios:approve',
    'financeiro:relatorio-socios:simulate',
    'finance:read',
    'finance:manage',
    'finance:export',
  ];
  await expectOk(await service.from('user_permissions').insert(
    [companyA, companyB].flatMap(companyId => permissions.map(permission_key => ({
      user_id: userId,
      company_id: companyId,
      permission_key,
      effect: 'ALLOW',
    }))),
  ), 'grant browser permissions');
  await expectOk(await service.from('fin_contas').insert([
    { id: accountAId, company_id: companyA, nome: accountAName, tipo: 'CAIXA', saldo_inicial: 101 },
    { id: accountBId, company_id: companyB, nome: accountBName, tipo: 'CAIXA', saldo_inicial: 202 },
  ]), 'create scoped accounts');

  const loginClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await loginClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error(`fixture login:${login.error?.code || 'UNKNOWN'}`);
  const client = scopedClient(publishableKey, login.data.session.access_token, companyA);

  await expectOk(await client.rpc('get_fin_presentation_plan', {
    p_start: '2026-09-01',
    p_end_exclusive: '2026-10-01',
    p_granularity: 'day',
    p_category_nature: null,
    p_category_group: null,
    p_category_id: null,
    p_page: 1,
    p_page_size: 25,
  }), 'probe presentation plan');

  for (let index = 0; index < 21; index += 1) {
    const title = index === 0
      ? `${marker} Beta decisão`
      : `${marker} Alpha decisão ${String(index).padStart(2, '0')}`;
    const createdDecision = await client.rpc('_guarded_create_presentation_decision', {
      p_title: title,
      p_context: `${marker} contexto sintético`,
      p_period_start: '2026-09-01',
      p_period_end_exclusive: '2026-10-01',
      p_granularity: 'day',
      p_reference_type: 'BASE',
      p_snapshot: decisionSnapshot(),
      p_executive_responsible_user_id: userId,
    });
    await expectOk(createdDecision, `create decision ${index + 1}`);
    decisionIds.push(createdDecision.data.id);
  }

  const decisionDetail = await client.rpc('get_fin_presentation_decision', { p_decision_id: decisionIds[0] });
  await expectOk(decisionDetail, 'read decision for action');
  const expectedDecisionUpdatedAt = decisionDetail.data.decision.updatedAt;
  await expectOk(await client.rpc('_guarded_create_presentation_decision_action', {
    p_decision_id: decisionIds[0],
    p_description: actionDescription,
    p_responsible_user_id: userId,
    p_expected_decision_status: 'DRAFT',
    p_expected_decision_updated_at: expectedDecisionUpdatedAt,
    p_due_date: '2026-09-30',
    p_priority: 'HIGH',
  }), 'create decision action');

  const agenda = Array.from({ length: 35 }, (_, index) => ({
    itemType: 'FREE_TEXT',
    title: `${marker} Pauta ${String(index + 1).padStart(2, '0')}`,
    objective: `${marker} objetivo`,
    discussionNotes: `${marker} discussão sintética ${index + 1}`,
    conclusion: `${marker} conclusão ${index + 1}`,
    reviewState: index % 3 === 0 ? 'CONCLUDED' : 'DISCUSSED',
    referenceType: null,
    referenceId: null,
  }));
  const meeting = await client.rpc('_guarded_create_presentation_session', {
    p_title: meetingTitle,
    p_context: `${marker} contexto da reunião`,
    p_period_start: '2026-09-01',
    p_period_end_exclusive: '2026-10-01',
    p_granularity: 'day',
    p_meeting_date: '2026-09-16',
    p_minutes_responsible_user_id: userId,
    p_participant_user_ids: [userId],
    p_previous_session_id: null,
    p_agenda_items: agenda,
  });
  await expectOk(meeting, 'create large meeting');
  sessionId = meeting.data.id;

  let detail = await client.rpc('get_fin_presentation_session', { p_session_id: sessionId });
  await expectOk(detail, 'read draft meeting');
  await expectOk(await client.rpc('_guarded_start_presentation_session', {
    p_session_id: sessionId,
    p_snapshot: meetingSnapshot(),
    p_expected_status: 'DRAFT',
    p_expected_updated_at: detail.data.session.updatedAt,
  }), 'start meeting');
  detail = await client.rpc('get_fin_presentation_session', { p_session_id: sessionId });
  await expectOk(detail, 'read started meeting');
  await expectOk(await client.rpc('_guarded_submit_presentation_minutes', {
    p_session_id: sessionId,
    p_revision_reason: `${marker} revisão sintética`,
    p_expected_status: 'IN_PROGRESS',
    p_expected_updated_at: detail.data.session.updatedAt,
  }), 'submit minutes');
  detail = await client.rpc('get_fin_presentation_session', { p_session_id: sessionId });
  await expectOk(detail, 'read submitted meeting');
  await expectOk(await client.rpc('_guarded_transition_presentation_session', {
    p_session_id: sessionId,
    p_expected_status: 'IN_REVIEW',
    p_target_status: 'APPROVED',
    p_justification: `${marker} aprovação sintética`,
    p_expected_updated_at: detail.data.session.updatedAt,
  }), 'approve minutes');
}

async function verifyDownload(page, buttonName, kind) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error(`DOWNLOAD_PATH_MISSING:${kind}`);
  const bytes = readFileSync(path);
  assert.ok(bytes.length > 5_000, `${kind} pequeno demais`);
  if (kind === 'pdf') assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  else {
    assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK');
    const archive = await JSZip.loadAsync(bytes);
    assert.ok(Object.keys(archive.files).some(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)));
  }
}

async function runBrowser(publishableKey) {
  const viteBin = resolve('node_modules/vite/bin/vite.js');
  const viteEnv = {
    ...process.env,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
  const build = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: process.cwd(),
    windowsHide: true,
    encoding: 'utf8',
    env: viteEnv,
  });
  if (build.status !== 0) throw new Error(`VITE_BUILD_FAILED:${build.status}`);
  vite = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '8092', '--strictPort'], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: viteEnv,
  });
  await waitForServer(appUrl);

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.F12_CHROMIUM
      || 'C:/Users/Yuri/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.on('pageerror', error => browserErrors.push(error.message));
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (['127.0.0.1', 'localhost', `${projectRef}.supabase.co`].includes(host)) return route.continue();
    return route.abort();
  });

  const button = name => page.getByRole('button', { name, exact: true });
  const selectCompany = async (label, name) => {
    await page.getByRole('button', { name: new RegExp(`^${escapeRegex(label)}:`) }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  const accountScoped = async (expected, absent) => {
    await page.getByText(expected, { exact: true }).first().waitFor();
    assert.equal(await page.getByText(absent, { exact: true }).count(), 0);
  };

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await button('Entrar').click();
  await page.getByRole('button', { name: companyAName, exact: true }).click();
  await page.getByRole('button', { name: `Trocar unidade: ${companyAName}`, exact: true }).waitFor();
  await page.waitForTimeout(1_000);
  await button('Financeiro').click();
  await page.getByRole('heading', { name: 'Financeiro', exact: true }).waitFor();
  await page.getByRole('main').getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contas Bancárias', exact: true }).click();
  await accountScoped(accountAName, accountBName);
  pass('desktop: login multiunidade e conta A isolada');

  let releaseContext;
  let contextHeld = false;
  const delayContext = async route => {
    if (!contextHeld && route.request().headers()['x-company-id'] === companyB) {
      contextHeld = true;
      await new Promise(resolve => { releaseContext = resolve; });
    }
    await route.continue();
  };
  await context.route('**/rest/v1/rpc/get_my_company_context', delayContext);
  await selectCompany('Trocar unidade', companyBName);
  await page.getByText('Carregando unidade…', { exact: true }).waitFor();
  assert.equal(await page.getByText(accountAName, { exact: true }).count(), 0);
  while (!releaseContext) await new Promise(resolve => setTimeout(resolve, 25));
  releaseContext();
  await accountScoped(accountBName, accountAName);
  await context.unroute('**/rest/v1/rpc/get_my_company_context', delayContext);
  pass('A→B atrasado: loading sem dado A e resposta B isolada');

  await selectCompany('Trocar unidade', companyAName);
  await accountScoped(accountAName, accountBName);
  const failContext = route => route.abort('connectionfailed');
  await context.route('**/rest/v1/rpc/get_my_company_context', failContext);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await button('Tentar novamente').waitFor();
  assert.equal(await page.getByText(accountAName, { exact: true }).count(), 0);
  await context.unroute('**/rest/v1/rpc/get_my_company_context', failContext);
  await button('Tentar novamente').click();
  await accountScoped(accountAName, accountBName);
  pass('falha de contexto remove dado anterior; retry remonta A');

  await page.setViewportSize({ width: 390, height: 844 });
  await button('Abrir menu').click();
  await page.getByRole('button', { name: `Trocar unidade: ${companyAName}`, exact: true }).waitFor();
  await selectCompany('Trocar unidade', companyBName);
  await button('Abrir menu').waitFor();
  pass('mobile 390×844: seletor troca para B');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${appUrl}/financeiro/apresentacao-socios?presentationUnit=${companyA}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('presentation-mode').waitFor();
  await verifyDownload(page, 'Exportar apresentação em PDF', 'pdf');
  await verifyDownload(page, 'Exportar apresentação em PowerPoint', 'pptx');
  pass('exports reais da apresentação: PDF e PowerPoint válidos');
  await button('Abrir preparação e governança').click();

  const planHeading = page.getByText('Metas, orçamento e projeção', { exact: true });
  const planFailure = page.getByText(/^(Planejamento indisponível|Planejamento sem acesso)$/).first();
  await Promise.race([
    planHeading.waitFor(),
    planFailure.waitFor().then(async () => { throw new Error(`BROWSER_PLAN_NOT_AVAILABLE:${await planFailure.innerText()}`); }),
  ]);
  const comparisonModes = page.getByRole('group', { name: 'Modo de comparação executiva', exact: true });
  for (const mode of ['Orçado', 'Projeção', 'Realizado']) {
    await comparisonModes.getByRole('button', { name: mode, exact: true }).click();
  }
  pass('planejamento integrado alterna realizado/orçado/projeção');

  const meetingSearch = page.getByLabel('Buscar sessão', { exact: true });
  await meetingSearch.fill(marker);
  await page.getByRole('button', { name: new RegExp(escapeRegex(meetingTitle)) }).click();
  await page.getByText(new RegExp(`^35\\. ${escapeRegex(marker)} Pauta 35$`)).waitFor();
  await page.getByText('35 item(ns)', { exact: false }).first().waitFor();
  pass('ata aprovada carrega detalhe volumoso com 35 itens');
  await verifyDownload(page, 'Ata PDF', 'pdf');
  await verifyDownload(page, 'Ata PowerPoint', 'pptx');
  pass('exports reais da ata: PDF e PowerPoint válidos');

  const decisionSearch = page.getByLabel('Buscar decisão', { exact: true });
  let releaseAlpha;
  let alphaHeld = false;
  const delayAlpha = async route => {
    const payload = route.request().postDataJSON?.() || {};
    if (!alphaHeld && String(payload.p_search || '').includes('alpha')) {
      alphaHeld = true;
      await new Promise(resolve => { releaseAlpha = resolve; });
    }
    await route.continue();
  };
  await context.route('**/rest/v1/rpc/list_fin_presentation_decisions', delayAlpha);
  await decisionSearch.fill(`${marker} Alpha`);
  while (!releaseAlpha) await new Promise(resolve => setTimeout(resolve, 25));
  await decisionSearch.fill(`${marker} Beta`);
  await page.getByText(`${marker} Beta decisão`, { exact: true }).waitFor();
  assert.equal(await page.getByText(`${marker} Alpha decisão 01`, { exact: true }).count(), 0);
  releaseAlpha();
  await page.waitForTimeout(500);
  assert.equal(await page.getByText(`${marker} Alpha decisão 01`, { exact: true }).count(), 0);
  await context.unroute('**/rest/v1/rpc/list_fin_presentation_decisions', delayAlpha);
  pass('corrida de filtro no mesmo lifetime mantém a resposta Beta mais nova');

  await page.getByText(`${marker} Beta decisão`, { exact: true }).click();
  await page.getByText('Plano de ação', { exact: true }).waitFor();
  await page.getByText(actionDescription, { exact: true }).waitFor();
  pass('decisão e plano de ação hospedados abrem detalhe canônico');
  await page.getByRole('button', { name: 'Fechar detalhe', exact: true }).click();
  await decisionSearch.fill(marker);
  await page.getByText('21 decisões', { exact: true }).waitFor();
  const decisionButtons = page.locator('button').filter({ hasText: marker });
  await page.waitForFunction(value => [...document.querySelectorAll('button')]
    .filter(node => node.textContent?.includes(value)).length >= 20, marker);
  await page.getByRole('button', { name: 'Próxima', exact: true }).last().click();
  await page.waitForFunction(value => [...document.querySelectorAll('button')]
    .filter(node => node.textContent?.includes(value)).length === 1, marker);
  assert.equal(await decisionButtons.count(), 1);
  pass('21 decisões paginam 20+1 sem truncamento silencioso');

  assert.deepEqual(browserErrors, []);
  await context.close();
}

async function cleanupSweep(service) {
  const issues = [];
  const record = (label, error) => {
    if (error) issues.push(`${label}:${error.code || 'UNKNOWN'}:${error.message || 'unknown error'}`);
  };
  if (sessionId) {
    record('session detach revision', (await service.from('fin_presentation_sessions')
      .update({ current_revision_id: null }).eq('id', sessionId)).error);
    record('session agenda', (await service.from('fin_presentation_agenda_items').delete().eq('session_id', sessionId)).error);
    record('session participants', (await service.from('fin_presentation_session_participants').delete().eq('session_id', sessionId)).error);
    record('session revisions', (await service.from('fin_presentation_minutes_revisions').delete().eq('session_id', sessionId)).error);
    record('session', (await service.from('fin_presentation_sessions').delete().eq('id', sessionId)).error);
  }
  if (decisionIds.length) {
    record('decisions detach revisions', (await service.from('fin_presentation_decisions')
      .update({ current_revision_id: null }).in('id', decisionIds)).error);
    record('decision actions', (await service.from('fin_presentation_decision_actions').delete().in('decision_id', decisionIds)).error);
    record('decision revisions', (await service.from('fin_presentation_decision_revisions').delete().in('decision_id', decisionIds)).error);
    record('decisions', (await service.from('fin_presentation_decisions').delete().in('id', decisionIds)).error);
  }
  record('accounts', (await service.from('fin_contas').delete().in('id', [accountAId, accountBId])).error);
  if (userId) {
    record('notifications recipient', (await service.from('notifications').delete().eq('recipient_user_id', userId)).error);
    record('notifications creator', (await service.from('notifications').delete().eq('created_by', userId)).error);
    record('finance audit', (await service.from('fin_audit_logs').delete().eq('user_id', userId)).error);
    record('permissions', (await service.from('user_permissions').delete().eq('user_id', userId)).error);
    record('roles', (await service.from('user_roles').delete().eq('user_id', userId)).error);
    record('memberships', (await service.from('company_memberships').delete().eq('user_id', userId)).error);
    record('admin actions', (await service.from('admin_actions_log').delete().eq('target_user_id', userId)).error);
    record('auth user', (await service.auth.admin.deleteUser(userId, false)).error);
    record('profile', (await service.from('profiles').delete().eq('id', userId)).error);
  }
  return issues;
}

async function cleanup(service) {
  let issues = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    issues = await cleanupSweep(service);
    if (!issues.length) return [];
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 300));
  }
  return issues;
}

async function verifyCleanup(service) {
  const residues = [];
  for (const [label, table, column, values] of [
    ['accounts', 'fin_contas', 'id', [accountAId, accountBId]],
    ['decisions', 'fin_presentation_decisions', 'id', decisionIds],
    ['session', 'fin_presentation_sessions', 'id', sessionId ? [sessionId] : []],
    ['profile', 'profiles', 'id', userId ? [userId] : []],
  ]) {
    if (!values.length) continue;
    const result = await service.from(table).select(column, { count: 'exact', head: true }).in(column, values);
    if (result.error) throw new Error(`CLEANUP_VERIFY_${label}:${result.error.code}`);
    if ((result.count || 0) !== 0) residues.push(`${label}:${result.count}`);
  }
  if (residues.length) throw new Error(`CLEANUP_RESIDUE:${residues.join(',')}`);
}

const { serviceKey, publishableKey } = apiKeys();
const service = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let primaryError;
let cleanupIssues = [];
try {
  await prepareFixtures(service, publishableKey);
  await runBrowser(publishableKey);
} catch (error) {
  primaryError = error;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (vite) vite.kill();
  cleanupIssues = await cleanup(service);
  await verifyCleanup(service).catch(error => cleanupIssues.push(error.message));
}

if (primaryError) {
  for (const issue of cleanupIssues) process.stderr.write(`CLEANUP ${issue}\n`);
  throw primaryError;
}
if (cleanupIssues.length) throw new Error(`CLEANUP_FAILED:${cleanupIssues.join('|')}`);

pass('zero resíduo sintético de conta, governança e identidade');
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  capturedAt: new Date().toISOString(),
  environment: { kind: 'authorized-hosted-staging', projectRef, browser: 'Chromium/Playwright' },
  checks,
  result: 'PASS',
  privateData: 'No credentials, tokens, emails, UUIDs, company names, screenshots or export bytes persisted.',
}, null, 2)}\n`, 'utf8');
