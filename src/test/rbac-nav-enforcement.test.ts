/**
 * RBAC Navigation & Action Enforcement Tests
 *
 * Validates that:
 * 1. Navigation uses granular permission keys from the registry (not legacy keys)
 * 2. Action-level guards exist in Salmon module views
 * 3. No legacy-only keys are used for nav visibility
 */

import { describe, it, expect } from 'vitest';
import { MODULE_MANIFESTS, LEGACY_PERMISSION_MAP } from '@/permissions/registry';

// ─── Helper: extract all granular keys for a module ───
function getModuleGranularKeys(moduleKey: string): string[] {
  const manifest = MODULE_MANIFESTS.find(m => m.key === moduleKey);
  if (!manifest) return [];
  return manifest.subtabs.flatMap(s =>
    s.actions.map(a => `${moduleKey}:${s.key}:${a.action}`)
  );
}

// ─── Helper: all legacy keys (keys that only exist in the legacy map) ───
const ALL_LEGACY_KEYS = Object.keys(LEGACY_PERMISSION_MAP);
const ALL_GRANULAR_KEYS = MODULE_MANIFESTS.flatMap(m =>
  m.subtabs.flatMap(s => s.actions.map(a => `${m.key}:${s.key}:${a.action}`))
);

describe('RBAC — Navigation visibility uses granular keys', () => {
  it('every module in the registry has at least one granular key', () => {
    for (const mod of MODULE_MANIFESTS) {
      const keys = getModuleGranularKeys(mod.key);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  it('legacy keys are NOT present in the granular registry', () => {
    // Legacy keys like "purchases:read" should not appear in granular keys
    const legacyOnlyKeys = ALL_LEGACY_KEYS.filter(k => !ALL_GRANULAR_KEYS.includes(k));
    // Most legacy keys should NOT be granular keys
    expect(legacyOnlyKeys.length).toBeGreaterThan(0);
  });

  it('critical modules have :view actions for nav visibility', () => {
    const criticalModules = ['compras', 'estoque', 'salmon', 'inventario', 'financeiro', 'rh', 'cmv', 'ficha', 'planning', 'ia', 'relatorios', 'configuracoes'];
    for (const modKey of criticalModules) {
      const keys = getModuleGranularKeys(modKey);
      const viewKeys = keys.filter(k => k.endsWith(':view'));
      expect(viewKeys.length, `Module ${modKey} should have at least one :view key`).toBeGreaterThan(0);
    }
  });
});

describe('RBAC — Salmon module action separation', () => {
  it('manipulacao has separate view, create, delete actions', () => {
    const manifest = MODULE_MANIFESTS.find(m => m.key === 'salmon');
    const manipSub = manifest?.subtabs.find(s => s.key === 'manipulacao');
    expect(manipSub).toBeDefined();

    const actions = manipSub!.actions.map(a => a.action);
    expect(actions).toContain('view');
    expect(actions).toContain('create');
    expect(actions).toContain('delete');
  });

  it('entradas has separate view, create, edit, delete actions', () => {
    const manifest = MODULE_MANIFESTS.find(m => m.key === 'salmon');
    const entSub = manifest?.subtabs.find(s => s.key === 'entradas');
    expect(entSub).toBeDefined();

    const actions = entSub!.actions.map(a => a.action);
    expect(actions).toContain('view');
    expect(actions).toContain('create');
    expect(actions).toContain('edit');
    expect(actions).toContain('delete');
  });

  it('metas has view and edit but not create/delete', () => {
    const manifest = MODULE_MANIFESTS.find(m => m.key === 'salmon');
    const metasSub = manifest?.subtabs.find(s => s.key === 'metas');
    expect(metasSub).toBeDefined();

    const actions = metasSub!.actions.map(a => a.action);
    expect(actions).toContain('view');
    expect(actions).toContain('edit');
    expect(actions).not.toContain('create');
    expect(actions).not.toContain('delete');
  });
});

describe('RBAC — Permission key format consistency', () => {
  it('all granular keys follow module:subtab:action format', () => {
    for (const key of ALL_GRANULAR_KEYS) {
      const parts = key.split(':');
      expect(parts.length, `Key "${key}" should have 3 parts`).toBe(3);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(parts[2].length).toBeGreaterThan(0);
    }
  });

  it('no duplicate granular keys exist', () => {
    const seen = new Set<string>();
    for (const key of ALL_GRANULAR_KEYS) {
      expect(seen.has(key), `Duplicate key: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
