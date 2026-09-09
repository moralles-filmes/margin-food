import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createCompanyClient, COMPANY_ACCESS_REVOKED_EVENT } from '@/integrations/supabase/companyClient';
import { useCompanyScope, type CompanyProfile } from '@/contexts/CompanyScopeContext';
import { resolveCompanySelection, readCompanyPreference, writeCompanyPreference, type AccessibleCompany } from '@/lib/companySelection';
import type { User, Session } from '@supabase/supabase-js';
import { loadAccessibleCompanies, loadCompanyProfile, type CompanyAccessMode } from '@/lib/companyAccess';

export type AppRole = 'admin' | 'operador' | 'viewer' | 'sem_role';
export type PermissionState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
export type AppPermission = string;
export type Sector = 'cozinha' | 'sushi' | 'limpeza' | 'salao' | 'copa';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoaded: boolean;
  permissionState: PermissionState;
  permissionError: string | null;
  roles: AppRole[];
  profile: CompanyProfile | null;
  effectivePermissions: string[];
  accessibleCompanies: AccessibleCompany[];
  companyAccessMode: CompanyAccessMode;
  activeCompanyId: string | null;
  switchingCompany: boolean;
  setActiveCompany: (companyId: string) => Promise<void>;
  refreshCompanies: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (...roles: AppRole[]) => boolean;
  hasPermission: (perm: string) => boolean;
  isMaster: boolean;
  canCreateSolicMercado: boolean;
  canApproveSolicMercado: boolean;
  isComprasAssistente: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  retryPermissions: () => void;
  sessionNonce: string;
  rbacDebug: { roles: AppRole[]; permissions: string[]; nonce: string; state: PermissionState };
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

function permissionsValue(profile: CompanyProfile | null, state: PermissionState, nonce: string) {
  const roles = (profile?.roles ?? []) as AppRole[];
  const effectivePermissions = profile?.permissions ?? [];
  const hasPermission = (key: string) => state === 'READY'
    && (effectivePermissions.includes('system:global:manage') || effectivePermissions.includes(key));
  return {
    profile, roles, effectivePermissions, permissionState: state,
    rolesLoaded: state === 'READY' || state === 'ERROR',
    hasRole: (role: AppRole) => state === 'READY' && roles.includes(role),
    hasAnyRole: (...values: AppRole[]) => state === 'READY' && values.some(role => roles.includes(role)),
    hasPermission, isMaster: hasPermission('system:global:manage'),
    canCreateSolicMercado: hasPermission('purchases:create') || hasPermission('compras:pedidos:create'),
    canApproveSolicMercado: hasPermission('purchases:approve') || hasPermission('compras:lista:approve'),
    isComprasAssistente: false,
    rbacDebug: { roles, permissions: effectivePermissions, nonce, state },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<PermissionState>('IDLE');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [accessibleCompanies, setCompanies] = useState<AccessibleCompany[]>([]);
  const [companyAccessMode, setCompanyAccessMode] = useState<CompanyAccessMode>('memberships');
  const [activeCompanyId, setActiveId] = useState<string | null>(null);
  const [switchingCompany, setSwitching] = useState(false);
  const [sessionNonce] = useState(() => crypto.randomUUID());
  const userRef = useRef<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const requestId = useRef(0);

  const loadContext = useCallback(async (userId: string, companyId: string, generation: number, mode: CompanyAccessMode) => {
    const resource = createCompanyClient(companyId, userId, mode);
    try {
      const next = await loadCompanyProfile(resource.client, userId, companyId, mode, AbortSignal.timeout(15_000));
      if (generation !== requestId.current || userId !== userRef.current) return;
      setCompanyAccessMode(mode);
      activeRef.current = companyId;
      setActiveId(companyId);
      setProfile(next);
      setPermissionState('READY');
      setPermissionError(null);
      writeCompanyPreference(userId, companyId);
    } finally { resource.dispose(); }
  }, []);

  const refreshCompanies = useCallback(async () => {
    const userId = userRef.current;
    if (!userId) return;
    const generation = ++requestId.current;
    try {
      const { companies, mode } = await loadAccessibleCompanies(supabase, userId, AbortSignal.timeout(15_000));
      if (generation !== requestId.current || userId !== userRef.current) return;
      setCompanies(companies);
      const selected = resolveCompanySelection(companies, activeRef.current ?? readCompanyPreference(userId));
      if (selected) await loadContext(userId, selected, generation, mode);
      else {
        setCompanyAccessMode(mode);
        activeRef.current = null;
        setActiveId(null);
        setProfile(null);
        setPermissionState('IDLE');
      }
    } catch (error) {
      if (generation !== requestId.current) return;
      console.error('[Auth] Falha ao validar unidades:', error);
      setProfile(null);
      setPermissionState('ERROR');
      setPermissionError('Não foi possível validar seu acesso às unidades. Tente novamente.');
    } finally {
      if (generation === requestId.current) { setLoading(false); setSwitching(false); }
    }
  }, [loadContext]);

  const setActiveCompany = useCallback(async (companyId: string) => {
    const userId = userRef.current;
    if (!userId || !accessibleCompanies.some(company => company.id === companyId)) return;
    const generation = ++requestId.current;
    setSwitching(true);
    setProfile(null);
    setPermissionState('LOADING');
    setPermissionError(null);
    try { await loadContext(userId, companyId, generation, companyAccessMode); }
    catch (error) {
      if (generation !== requestId.current) return;
      console.error('[Auth] Falha ao trocar unidade:', error);
      setPermissionState('ERROR');
      setPermissionError('Não foi possível acessar esta unidade. Atualize seus acessos e tente novamente.');
    } finally { if (generation === requestId.current) setSwitching(false); }
  }, [accessibleCompanies, companyAccessMode, loadContext]);

  useEffect(() => {
    let alive = true;
    let sessionObserved = false;
    // Drop legacy permission caches: their keys did not contain company_id.
    for (const key of ['marginpro_roles_cache','marginpro_profile_cache','marginpro_perms_cache']) {
      try { sessionStorage.removeItem(key); localStorage.removeItem(key); } catch { /* Storage opcional. */ }
    }
    const acceptSession = (next: Session | null) => {
      if (!alive) return;
      setSession(next);
      setUser(next?.user ?? null);
      const nextId = next?.user.id ?? null;
      if (nextId === userRef.current) { if (!nextId) setLoading(false); return; }
      userRef.current = nextId;
      activeRef.current = null;
      requestId.current++;
      setActiveId(null); setProfile(null); setCompanies([]); setPermissionError(null);
      setPermissionState(nextId ? 'LOADING' : 'IDLE');
      if (nextId) { setLoading(true); void refreshCompanies(); }
      else setLoading(false);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      sessionObserved = true;
      if (event === 'PASSWORD_RECOVERY') { window.location.href = '/reset-password#type=recovery'; return; }
      // Avoid awaiting another Auth method inside the GoTrue callback lock.
      queueMicrotask(() => acceptSession(next));
    });
    void supabase.auth.getSession().then(({ data }) => { if (!sessionObserved) acceptSession(data.session); }).catch(error => {
      console.error('[Auth] Falha ao restaurar sessão:', error);
      if (alive) { setLoading(false); setPermissionError('Falha ao restaurar sessão.'); }
    });
    const revalidate = () => { if (document.visibilityState !== 'hidden') void refreshCompanies(); };
    const revoked = () => { setProfile(null); setPermissionState('LOADING'); void refreshCompanies(); };
    const timer = window.setInterval(revalidate, 60_000);
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    window.addEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked);
    return () => {
      alive = false; requestId.current++; subscription.unsubscribe(); clearInterval(timer);
      window.removeEventListener('focus', revalidate); window.removeEventListener('online', revalidate);
      window.removeEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked);
    };
  }, [refreshCompanies]);

  const signOut = useCallback(async () => {
    requestId.current++; userRef.current = null; activeRef.current = null;
    setUser(null); setSession(null); setProfile(null); setCompanies([]); setActiveId(null); setPermissionState('IDLE');
    await supabase.auth.signOut();
  }, []);
  const value = useMemo<AuthContextType>(() => ({
    ...permissionsValue(profile, permissionState, sessionNonce),
    user, session, loading, permissionError, accessibleCompanies, companyAccessMode, activeCompanyId, switchingCompany,
    setActiveCompany, refreshCompanies, signOut, refreshRoles: refreshCompanies,
    retryPermissions: () => { void refreshCompanies(); }, sessionNonce,
  }), [profile, permissionState, sessionNonce, user, session, loading, permissionError, accessibleCompanies, companyAccessMode,
    activeCompanyId, switchingCompany, setActiveCompany, refreshCompanies, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  const scope = useCompanyScope();
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return useMemo(() => scope
    ? { ...value, ...permissionsValue(scope.profile, 'READY', value.sessionNonce) }
    : value, [value, scope]);
}
