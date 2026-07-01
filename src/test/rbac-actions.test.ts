import { describe, it, expect } from 'vitest';
import { isAllowedAction, validatePermissionKey, ALLOWED_ACTIONS } from '../permissions/actions';
import { buildPermissionEntries, isValidPermission, ALL_PERMISSION_KEYS, LEGACY_PERMISSION_MAP } from '../permissions/registry';

describe('RBAC Action Set', () => {
  it('has exactly 11 allowed actions', () => {
    expect(ALLOWED_ACTIONS).toHaveLength(11);
  });

  it('validates known actions', () => {
    expect(isAllowedAction('view')).toBe(true);
    expect(isAllowedAction('approve')).toBe(true);
    expect(isAllowedAction('reconcile')).toBe(true);
    expect(isAllowedAction('simulate')).toBe(true);
  });

  it('rejects unknown actions', () => {
    expect(isAllowedAction('void')).toBe(false);
    expect(isAllowedAction('finish')).toBe(false);
    expect(isAllowedAction('hack')).toBe(false);
  });

  it('validatePermissionKey rejects bad format', () => {
    const r = validatePermissionKey('only-two-parts');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid format');
  });

  it('validatePermissionKey rejects invalid action', () => {
    const r = validatePermissionKey('financeiro:lancamentos:void');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Invalid action "void"');
  });

  it('validatePermissionKey accepts valid key', () => {
    const r = validatePermissionKey('financeiro:lancamentos:view');
    expect(r.valid).toBe(true);
  });
});

describe('Permission Registry Validation', () => {
  it('all registry keys use allowed actions only', () => {
    const entries = buildPermissionEntries();
    const invalidEntries = entries.filter(e => !isAllowedAction(e.action));
    expect(invalidEntries).toEqual([]);
  });

  it('all keys follow module:subtab:action format', () => {
    for (const key of ALL_PERMISSION_KEYS) {
      const parts = key.split(':');
      expect(parts).toHaveLength(3);
    }
  });

  it('isValidPermission returns false for non-existent key with invalid action', () => {
    expect(isValidPermission('fake:module:void')).toBe(false);
  });

  it('isValidPermission returns true for existing valid key', () => {
    expect(isValidPermission('financeiro:dashboard:view')).toBe(true);
  });

  it('compras:alertas_falta subtab is registered in registry', () => {
    expect(isValidPermission('compras:alertas_falta:view')).toBe(true);
    expect(isValidPermission('compras:alertas_falta:approve')).toBe(true);
  });

  it('all legacy map values reference valid registry keys', () => {
    for (const [legacyKey, mappedKeys] of Object.entries(LEGACY_PERMISSION_MAP)) {
      for (const key of mappedKeys as string[]) {
        const result = validatePermissionKey(key);
        expect(result.valid).toBe(true);
      }
    }
  });
});
