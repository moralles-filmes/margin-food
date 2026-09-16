import type { CompanyAccessMode } from './companyAccess';

export interface ClientScope {
  companyId: string;
  userId: string;
  mode: CompanyAccessMode;
  signal: AbortSignal;
}

// Metadados por instância, nunca uma empresa mutável compartilhada.
const scopes = new WeakMap<object, ClientScope>();
export function registerClientScope(client: object, scope: ClientScope) { scopes.set(client, scope); }
export function getClientScope(client: object) { return scopes.get(client); }
export function isCompanyClientActive(client: object) { return !scopes.get(client)?.signal.aborted; }
export function clientScopeKey(scope: Pick<ClientScope, 'companyId' | 'userId' | 'mode'>) {
  return JSON.stringify([scope.userId, scope.companyId, scope.mode]);
}
