import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'operador';

export type PermissionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

// Legacy type kept for backward compat — new system uses string-based permission keys
export type AppPermission = string;

export type Sector = 'cozinha' | 'sushi' | 'limpeza' | 'salao' | 'copa'; // legacy, kept for compat

const ROLES_CACHE_KEY = 'marginpro_roles_cache';
const PROFILE_CACHE_KEY = 'marginpro_profile_cache';
const PERMS_CACHE_KEY = 'marginpro_perms_cache';
const CACHE_TTL = 5 * 60 * 1000;
const LOADING_TIMEOUT = 15000;
const AUTH_BOOTSTRAP_TIMEOUT = 12000;

interface CachedData<T> {
  data: T;
  timestamp: number;
  userId: string;
}

function setCache<T>(key: string, data: T, userId: string) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), userId } as CachedData<T>));
  } catch { /* ignore */ }
}

function getCache<T>(key: string, userId: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const cached: CachedData<T> = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(key);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function clearCache() {
  try {
    sessionStorage.removeItem(ROLES_CACHE_KEY);
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    sessionStorage.removeItem(PERMS_CACHE_KEY);
    sessionStorage.removeItem('marginpro_session_nonce');
    localStorage.removeItem(ROLES_CACHE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(PERMS_CACHE_KEY);
    localStorage.removeItem('marginpro_session_nonce');
  } catch { /* ignore */ }
}

function generateNonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ProfileData {
  nome: string;
  email: string;
  avatar_url: string;
  sector: string | null;
  job_role_id: string | null;
  company_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoaded: boolean;
  permissionState: PermissionState;
  roles: AppRole[];
  profile: ProfileData | null;
  effectivePermissions: string[];
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (...roles: AppRole[]) => boolean;
  hasPermission: (perm: string) => boolean;
  /** @deprecated Use useCan('system:global:manage') instead */
  isMaster: boolean;
  canCreateSolicMercado: boolean;
  canApproveSolicMercado: boolean;
  isComprasAssistente: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  retryPermissions: () => void;
  permissionError: string | null;
  sessionNonce: string;
  rbacDebug: { roles: AppRole[]; permissions: string[]; nonce: string; state: PermissionState };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<PermissionState>('IDLE');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>([]);
  const [sessionNonce] = useState(() => generateNonce());
  const initializedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const retryCountRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;

  const clearLoadingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(r => r.role as AppRole);
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('nome, email, avatar_url, sector, job_role_id, company_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as ProfileData;
  }, []);

  const fetchEffectivePermissions = useCallback(async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase.rpc('get_effective_permissions', { _user_id: userId });
    if (error) throw error;
    return (data as string[]) || [];
  }, []);

  const loadUserData = useCallback(async (userId: string, useCache = true) => {
    const requestId = ++loadRequestIdRef.current;

    if (useCache) {
      const cachedRoles = getCache<AppRole[]>(ROLES_CACHE_KEY, userId);
      const cachedProfile = getCache<ProfileData>(PROFILE_CACHE_KEY, userId);
      const cachedPerms = getCache<string[]>(PERMS_CACHE_KEY, userId);
      if (cachedRoles && cachedProfile && cachedPerms) {
        setRoles(cachedRoles);
        setProfile(cachedProfile);
        setEffectivePermissions(cachedPerms);
        setPermissionState('READY');
        setPermissionError(null);

        // Background revalidation
        Promise.all([fetchRoles(userId), fetchProfile(userId), fetchEffectivePermissions(userId)])
          .then(([freshRoles, freshProfile, freshPerms]) => {
            if (!abortRef.current && requestId === loadRequestIdRef.current) {
              setRoles(freshRoles);
              if (freshProfile) setProfile(freshProfile);
              setEffectivePermissions(freshPerms);
              setCache(ROLES_CACHE_KEY, freshRoles, userId);
              setCache(PROFILE_CACHE_KEY, freshProfile, userId);
              setCache(PERMS_CACHE_KEY, freshPerms, userId);
            }
          })
          .catch(err => console.warn('Background revalidation failed:', err));
        return;
      }
    }

    setPermissionState('LOADING');
    setPermissionError(null);
    clearLoadingTimeout();

    timeoutRef.current = setTimeout(() => {
      if (requestId !== loadRequestIdRef.current || abortRef.current) return;
      if (retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current++;
        console.warn(`[Auth] Permission load timeout, auto-retry ${retryCountRef.current}/${MAX_AUTO_RETRIES}`);
        loadUserData(userId, false);
        return;
      }
      setPermissionState('ERROR');
      setPermissionError('Tempo esgotado ao carregar permissões.');
    }, LOADING_TIMEOUT);

    try {
      const [freshRoles, freshProfile, freshPerms] = await Promise.all([
        fetchRoles(userId),
        fetchProfile(userId),
        fetchEffectivePermissions(userId),
      ]);
      if (abortRef.current || requestId !== loadRequestIdRef.current) return;

      clearLoadingTimeout();
      setRoles(freshRoles);
      setProfile(freshProfile);
      setEffectivePermissions(freshPerms);
      setCache(ROLES_CACHE_KEY, freshRoles, userId);
      setCache(PROFILE_CACHE_KEY, freshProfile, userId);
      setCache(PERMS_CACHE_KEY, freshPerms, userId);
      setPermissionState('READY');
      setPermissionError(null);
      retryCountRef.current = 0;
    } catch (err: any) {
      if (abortRef.current || requestId !== loadRequestIdRef.current) return;

      clearLoadingTimeout();
      console.error('Error loading permissions:', err);
      setPermissionState('ERROR');
      setPermissionError(err?.message || 'Falha ao carregar permissões.');
    }
  }, [fetchRoles, fetchProfile, fetchEffectivePermissions, clearLoadingTimeout]);

  const retryPermissions = useCallback(() => {
    if (user) {
      loadUserData(user.id, false);
    }
  }, [user, loadUserData]);

  useEffect(() => {
    abortRef.current = false;
    let initialUserId: string | null = null;

    const finishBootstrap = () => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    };

    const bootstrapTimer = setTimeout(() => {
      if (!abortRef.current && !initializedRef.current) {
        console.warn('[Auth] Bootstrap timeout; forcing UI unlock.');
        finishBootstrap();
      }
    }, AUTH_BOOTSTRAP_TIMEOUT);

    const triggerUserDataLoad = (userId: string) => {
      retryCountRef.current = 0;
      void loadUserData(userId).catch((err) => {
        console.error('[Auth] Failed to load user data:', err);
      });
    };

    // 1) Subscribe first (best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (abortRef.current) return;

      // PASSWORD_RECOVERY: redirect to reset-password page before setting session
      if (event === 'PASSWORD_RECOVERY') {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        finishBootstrap();
        window.location.href = '/reset-password#type=recovery';
        return;
      }

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const isRelevantEvent = event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED';
        const alreadyHandledSameUser = initializedRef.current && newSession.user.id === initialUserId;

        if (isRelevantEvent && !alreadyHandledSameUser) {
          initialUserId = newSession.user.id;
          triggerUserDataLoad(newSession.user.id);
        }
      } else {
        setRoles([]);
        setProfile(null);
        setEffectivePermissions([]);
        setPermissionState('IDLE');
        clearCache();
      }

      finishBootstrap();
    });

    // 2) Restore session from storage with hard fail-safe
    void supabase.auth.getSession()
      .then(({ data: { session: initialSession } }) => {
        if (abortRef.current || initializedRef.current) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          initialUserId = initialSession.user.id;
          triggerUserDataLoad(initialSession.user.id);
        } else {
          setPermissionState('IDLE');
        }
      })
      .catch((err) => {
        if (abortRef.current) return;
        console.error('[Auth] getSession failed:', err);
        setSession(null);
        setUser(null);
        setPermissionState('IDLE');
      })
      .finally(() => {
        if (!abortRef.current) finishBootstrap();
      });

    return () => {
      abortRef.current = true;
      clearLoadingTimeout();
      clearTimeout(bootstrapTimer);
      subscription.unsubscribe();
    };
  }, [loadUserData, clearLoadingTimeout]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const hasAnyRole = useCallback((...r: AppRole[]) => r.some(role => roles.includes(role)), [roles]);

  const hasPermission = useCallback((perm: string) => {
    // CRITICAL: deny-by-default — if permissions aren't fully loaded, deny everything
    if (permissionState !== 'READY') return false;
    
    // Master switch: if user has global manage, they have all permissions
    if (effectivePermissions.includes('system:global:manage')) return true;
    
    return effectivePermissions.includes(perm);
  }, [effectivePermissions, permissionState]);

  // isMaster is now derived from PERMISSION, not from role — kept for backward compat but deprecated
  const isMaster = permissionState === 'READY' && effectivePermissions.includes('system:global:manage');
  const rolesLoaded = permissionState === 'READY' || permissionState === 'ERROR';

  const signOut = async () => {
    clearCache();
    setUser(null);
    setSession(null);
    setRoles([]);
    setProfile(null);
    setEffectivePermissions([]);
    setPermissionState('IDLE');
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (user) {
      try {
        const [freshRoles, freshPerms] = await Promise.all([
          fetchRoles(user.id),
          fetchEffectivePermissions(user.id),
        ]);
        setRoles(freshRoles);
        setEffectivePermissions(freshPerms);
        setCache(ROLES_CACHE_KEY, freshRoles, user.id);
        setCache(PERMS_CACHE_KEY, freshPerms, user.id);
      } catch (err) {
        console.error('Error refreshing roles:', err);
      }
    }
  };

  const rbacDebug = useMemo(() => ({
    roles,
    permissions: effectivePermissions,
    nonce: sessionNonce,
    state: permissionState,
  }), [roles, effectivePermissions, sessionNonce, permissionState]);

  return (
    <AuthContext.Provider value={{
      user, session, loading, rolesLoaded, permissionState, permissionError,
      roles, profile, effectivePermissions,
      hasRole, hasAnyRole, hasPermission, isMaster,
      canCreateSolicMercado: hasPermission('purchases:create') || hasPermission('compras:pedidos:create'),
      canApproveSolicMercado: hasPermission('purchases:approve') || hasPermission('compras:lista:approve'),
      isComprasAssistente: false, // legacy, kept for compat
      signOut, refreshRoles, retryPermissions,
      sessionNonce, rbacDebug,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Check a single permission for the current user */
export function useCan(perm: string): boolean {
  const { hasPermission, permissionState } = useAuth();
  if (permissionState !== 'READY') return false;
  return hasPermission(perm);
}

/** Check if user has ANY of the given permissions */
export function useCanAny(...perms: string[]): boolean {
  const { hasPermission, permissionState } = useAuth();
  if (permissionState !== 'READY') return false;
  return perms.some(p => hasPermission(p));
}
