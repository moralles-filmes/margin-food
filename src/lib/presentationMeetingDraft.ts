import {
  parsePresentationMeetingDraft,
  type PresentationMeetingDraft,
} from '@/domain/financeiro/presentation';

const STORAGE_VERSION = 'presentation-meeting-draft-v1.0';
const TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BYTES = 196_608;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredDraft {
  version: typeof STORAGE_VERSION;
  savedAt: string;
  expiresAt: string;
  draft: PresentationMeetingDraft;
}

function storageKey(userId: string, companyId: string, sessionId: string): string {
  if (![userId, companyId, sessionId].every(value => UUID_PATTERN.test(value))) {
    throw new Error('INVALID_DRAFT_SCOPE');
  }
  return `presentation-meeting:${companyId}:${userId}:${sessionId}`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function savePresentationMeetingDraft(input: {
  userId: string;
  companyId: string;
  sessionId: string;
  draft: PresentationMeetingDraft;
  now?: Date;
}): void {
  const draft = parsePresentationMeetingDraft(input.draft);
  const now = input.now ?? new Date();
  const payload: StoredDraft = {
    version: STORAGE_VERSION,
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    draft,
  };
  const serialized = JSON.stringify(payload);
  if (byteLength(serialized) > MAX_BYTES) throw new Error('DRAFT_TOO_LARGE');
  sessionStorage.setItem(storageKey(input.userId, input.companyId, input.sessionId), serialized);
}

export function loadPresentationMeetingDraft(input: {
  userId: string;
  companyId: string;
  sessionId: string;
  now?: Date;
}): PresentationMeetingDraft | null {
  const key = storageKey(input.userId, input.companyId, input.sessionId);
  const serialized = sessionStorage.getItem(key);
  if (!serialized) return null;
  try {
    if (byteLength(serialized) > MAX_BYTES) throw new Error('DRAFT_TOO_LARGE');
    const payload = JSON.parse(serialized) as Partial<StoredDraft>;
    if (payload.version !== STORAGE_VERSION || typeof payload.expiresAt !== 'string') {
      throw new Error('DRAFT_VERSION_UNKNOWN');
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(Date.parse(payload.expiresAt)) || Date.parse(payload.expiresAt) <= now.getTime()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsePresentationMeetingDraft(payload.draft);
  } catch (error) {
    console.error('Rascunho local da ata rejeitado:', error);
    sessionStorage.removeItem(key);
    return null;
  }
}

export function clearPresentationMeetingDraft(input: {
  userId: string;
  companyId: string;
  sessionId: string;
}): void {
  sessionStorage.removeItem(storageKey(input.userId, input.companyId, input.sessionId));
}
