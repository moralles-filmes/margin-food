/**
 * ─── Official Action Set ───
 *
 * Single source of truth for all valid RBAC actions.
 * Any permission key MUST use one of these actions as its suffix.
 *
 * Base actions:  view, create, edit, delete, export, manage
 * Extra actions: approve, close, reconcile, cancel, simulate
 */

export const BASE_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'manage'] as const;

export const EXTRA_ACTIONS = ['approve', 'close', 'reconcile', 'cancel', 'simulate'] as const;

/** All 11 officially allowed actions */
export const ALLOWED_ACTIONS = [...BASE_ACTIONS, ...EXTRA_ACTIONS] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_ACTIONS);

/** Returns true if the action string is in the official set */
export function isAllowedAction(action: string): action is AllowedAction {
  return ALLOWED_SET.has(action);
}

/** Validates a permission key format: <module>:<subtab>:<action> with allowed action */
export function validatePermissionKey(key: string): { valid: boolean; error?: string } {
  const parts = key.split(':');
  if (parts.length !== 3) {
    return { valid: false, error: `Invalid format "${key}": expected <module>:<subtab>:<action>` };
  }
  const action = parts[2];
  if (!isAllowedAction(action)) {
    return { valid: false, error: `Invalid action "${action}" in key "${key}". Allowed: ${ALLOWED_ACTIONS.join(', ')}` };
  }
  return { valid: true };
}
