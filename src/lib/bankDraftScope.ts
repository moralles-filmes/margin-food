/** Um UUID de conta não separa duas identidades que acessam a mesma unidade. */
export function bankDraftScope(userId: string | undefined, companyId: string | null | undefined, accountId: string) {
  if (!userId || !companyId || !accountId) return '';
  return JSON.stringify(['v2', userId, companyId, accountId]);
}
