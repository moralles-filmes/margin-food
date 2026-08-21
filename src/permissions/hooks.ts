/**
 * ─── Permission Hooks & Components ───
 *
 * Frontend helpers for granular RBAC:
 * - useCan(key) — check a single permission
 * - useCanAny(...keys) — check if user has any of the given permissions
 * - useCanAll(...keys) — check if user has all of the given permissions
 * - useModuleAccess(moduleKey) — get visible subtabs for a module
 * - RequirePermission — wrapper component
 * - RequireAnyPermission — wrapper for OR logic
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LEGACY_PERMISSION_MAP, MODULE_MANIFESTS, subtabViewKey } from './registry';

/** The super-admin permission key — grants access to everything */
const SYSTEM_ADMIN_KEY = 'system:global:manage';

// ─── Kill Switch: Legacy Permission Fallback ───
// Set VITE_ENABLE_LEGACY_PERMISSIONS=false to disable legacy fallback (strict mode)
const ENABLE_LEGACY_PERMISSIONS = import.meta.env.VITE_ENABLE_LEGACY_PERMISSIONS !== 'false';

// Debounce telemetry to avoid flooding: track which legacy keys were already logged this session
const _loggedLegacyKeys = new Set<string>();

/** Fire-and-forget telemetry for legacy permission usage */
function logLegacyUsage(legacyKey: string, resolvedTo: string[], userId?: string, companyId?: string | null) {
  const dedupeKey = `${userId || 'anon'}:${legacyKey}`;
  if (_loggedLegacyKeys.has(dedupeKey)) return;
  _loggedLegacyKeys.add(dedupeKey);

  if (import.meta.env.DEV) {
    console.debug(`[RBAC-LEGACY] Fallback used: "${legacyKey}" → [${resolvedTo.join(', ')}]`);
  }

  try {
    supabase.from('rbac_legacy_usage').insert({
      user_id: userId || null,
      legacy_key: legacyKey,
      resolved_to: resolvedTo,
      context: 'ui',
    } as any).then(() => {});
  } catch {
    // Swallow — telemetry must never block UI
  }
}

/**
 * Resolves both new granular keys and legacy keys.
 * Controlled by ENABLE_LEGACY_PERMISSIONS kill switch.
 * When legacy fallback fires, logs telemetry to rbac_legacy_usage.
 */
function resolvePermission(
  perm: string,
  effectivePermissions: string[],
  userId?: string,
  companyId?: string | null,
): boolean {
  // Direct match (new granular key)
  if (effectivePermissions.includes(perm)) return true;

  // Kill switch OFF → no legacy fallback (strict mode)
  if (!ENABLE_LEGACY_PERMISSIONS) {
    return false;
  }

  // Check if any legacy key in user's permissions maps to this granular key
  for (const legacyKey of effectivePermissions) {
    const mapped = LEGACY_PERMISSION_MAP[legacyKey];
    if (mapped && mapped.includes(perm)) {
      // Telemetry: log that legacy fallback was used
      logLegacyUsage(legacyKey, mapped, userId, companyId);
      return true;
    }
  }

  return false;
}

/** Check if user has super-admin permission (non-hook, array-based) */
function isSystemAdmin(effectivePermissions: string[]): boolean {
  return effectivePermissions.includes(SYSTEM_ADMIN_KEY);
}

/** Check a single granular permission */
export function useCan(perm: string): boolean {
  const { effectivePermissions, permissionState, user, profile } = useAuth();
  return useMemo(() => {
    if (permissionState !== 'READY') return false;
    if (isSystemAdmin(effectivePermissions)) return true;
    return resolvePermission(perm, effectivePermissions, user?.id, profile?.company_id);
  }, [perm, effectivePermissions, permissionState, user?.id, profile]);
}

/** Check if user has ANY of the given permissions */
export function useCanAny(...perms: string[]): boolean {
  const { effectivePermissions, permissionState, user, profile } = useAuth();
  return useMemo(() => {
    if (permissionState !== 'READY') return false;
    if (isSystemAdmin(effectivePermissions)) return true;
    return perms.some(p => resolvePermission(p, effectivePermissions, user?.id, profile?.company_id));
  }, [perms, effectivePermissions, permissionState, user?.id, profile]);
}

/** Check if user has ALL of the given permissions */
export function useCanAll(...perms: string[]): boolean {
  const { effectivePermissions, permissionState, user, profile } = useAuth();
  return useMemo(() => {
    if (permissionState !== 'READY') return false;
    if (isSystemAdmin(effectivePermissions)) return true;
    return perms.every(p => resolvePermission(p, effectivePermissions, user?.id, profile?.company_id));
  }, [perms, effectivePermissions, permissionState, user?.id, profile]);
}

/** Get visible subtab keys for a module based on :view permissions */
export function useModuleAccess(moduleKey: string) {
  const { effectivePermissions, permissionState, user, profile } = useAuth();

  return useMemo(() => {
    const manifest = MODULE_MANIFESTS.find(m => m.key === moduleKey);
    if (!manifest) return { visibleSubtabs: [], canView: false };
    if (permissionState !== 'READY') return { visibleSubtabs: [], canView: false };

    if (isSystemAdmin(effectivePermissions)) {
      return {
        visibleSubtabs: manifest.subtabs.map(s => s.key),
        canView: true,
      };
    }

    const uid = user?.id;
    const cid = profile?.company_id;

    const visibleSubtabs = manifest.subtabs
      .filter(sub => {
        const viewKey = subtabViewKey(moduleKey, sub.key);
        const hasViewAction = sub.actions.some(a => a.action === 'view');
        const hasAnyGrantedAction = sub.actions.some(a =>
          resolvePermission(`${moduleKey}:${sub.key}:${a.action}`, effectivePermissions, uid, cid)
        );

        if (hasViewAction) {
          return resolvePermission(viewKey, effectivePermissions, uid, cid) || hasAnyGrantedAction;
        }

        return hasAnyGrantedAction;
      })
      .map(s => s.key);

    return {
      visibleSubtabs,
      canView: visibleSubtabs.length > 0,
    };
  }, [moduleKey, effectivePermissions, permissionState, user?.id, profile]);
}

/** Imperative permission check (non-hook, for callbacks) */
export function createPermissionChecker(effectivePermissions: string[], permissionState: string, userId?: string, companyId?: string | null) {
  return (perm: string): boolean => {
    if (permissionState !== 'READY') return false;
    if (isSystemAdmin(effectivePermissions)) return true;
    return resolvePermission(perm, effectivePermissions, userId, companyId);
  };
}
