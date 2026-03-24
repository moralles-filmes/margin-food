/**
 * ─── Permission Gate Components ───
 */
import { ReactNode } from 'react';
import { useCan, useCanAny } from './hooks';

interface RequirePermissionProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Render children only if user has the specified permission */
export function RequirePermission({ permission, children, fallback = null }: RequirePermissionProps) {
  const allowed = useCan(permission);
  return <>{allowed ? children : fallback}</>;
}

interface RequireAnyPermissionProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** Render children if user has ANY of the specified permissions */
export function RequireAnyPermission({ permissions, children, fallback = null }: RequireAnyPermissionProps) {
  const allowed = useCanAny(...permissions);
  return <>{allowed ? children : fallback}</>;
}
