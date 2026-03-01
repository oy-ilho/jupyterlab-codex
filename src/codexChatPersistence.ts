import {
  hasStoredValue,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from './codexChatStorage';

const SESSION_THREADS_STORAGE_KEY = 'jupyterlab-codex:session-threads';
const SESSION_THREADS_EVENT_KEY = 'jupyterlab-codex:session-threads:event';
const DELETE_ALL_PENDING_KEY = 'jupyterlab-codex:delete-all-pending';
export const SESSION_KEY_SEPARATOR = '\u0000';

export type SessionThreadSyncEvent = {
  kind: 'new-thread';
  sessionKey: string;
  notebookPath: string;
  threadId: string;
  source: string;
  id: string;
  issuedAt: number;
};

export const STORAGE_KEY_SESSION_THREADS = SESSION_THREADS_STORAGE_KEY;
export const STORAGE_KEY_SESSION_THREADS_EVENT = SESSION_THREADS_EVENT_KEY;
export const STORAGE_KEY_DELETE_ALL_PENDING = DELETE_ALL_PENDING_KEY;

export function parseSessionKey(sessionKey: string): { path: string } {
  if (!sessionKey) {
    return { path: '' };
  }
  const separatorIndex = sessionKey.indexOf(SESSION_KEY_SEPARATOR);
  if (separatorIndex < 0) {
    return { path: sessionKey };
  }
  return { path: sessionKey.slice(0, separatorIndex) };
}

export function readStoredSessionThreads(): Record<string, string> {
  const raw = safeLocalStorageGet(STORAGE_KEY_SESSION_THREADS);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key || typeof value !== 'string') {
        continue;
      }
      const threadId = value.trim();
      if (!threadId) {
        continue;
      }
      result[key] = threadId;
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredSessionThreadCount(): number {
  const mapping = readStoredSessionThreads();
  const uniquePaths = new Set<string>();
  for (const key of Object.keys(mapping)) {
    const { path } = parseSessionKey(key);
    if (path) {
      uniquePaths.add(path);
    }
  }
  return uniquePaths.size;
}

export function readStoredThreadId(path: string, sessionKey: string): string {
  const normalizedPath = path.trim();
  const normalizedSessionKey = sessionKey || '';
  if (!normalizedSessionKey) {
    return '';
  }
  const mapping = readStoredSessionThreads();
  const exactMatch = mapping[normalizedSessionKey];
  if (exactMatch) {
    return exactMatch;
  }

  if (!normalizedPath) {
    return '';
  }
  for (const [key, threadId] of Object.entries(mapping)) {
    if (!threadId) {
      continue;
    }
    const parsed = parseSessionKey(key);
    if (parsed.path === normalizedPath) {
      return threadId;
    }
  }
  return '';
}

export function persistStoredSessionThreads(sessions: Map<string, { threadId?: string }>): void {
  const mapping: Record<string, string> = {};
  for (const [sessionKey, session] of sessions) {
    if (!sessionKey || !session?.threadId) {
      continue;
    }
    mapping[sessionKey] = session.threadId;
  }
  try {
    safeLocalStorageSet(STORAGE_KEY_SESSION_THREADS, JSON.stringify(mapping));
  } catch {
    // Ignore storage failures; in-memory sessions still work.
  }
}

export function coerceSessionThreadSyncEvent(value: string): SessionThreadSyncEvent | null {
  if (!value) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const event = raw as Record<string, unknown>;
  const sessionKey = typeof event.sessionKey === 'string' ? event.sessionKey.trim() : '';
  const notebookPath = typeof event.notebookPath === 'string' ? event.notebookPath.trim() : '';
  const threadId = typeof event.threadId === 'string' ? event.threadId.trim() : '';
  const source = typeof event.source === 'string' ? event.source.trim() : '';
  const id = typeof event.id === 'string' ? event.id.trim() : '';
  if (!sessionKey || !notebookPath || !threadId || !id || event.kind !== 'new-thread') {
    return null;
  }
  const issuedAt =
    typeof event.issuedAt === 'number' && Number.isFinite(event.issuedAt) ? event.issuedAt : Date.now();
  return { kind: 'new-thread', sessionKey, notebookPath, threadId, source, id, issuedAt };
}

export function buildSessionThreadSyncEvent(params: {
  sessionKey: string;
  notebookPath: string;
  threadId: string;
  source: string;
  createEventId: () => string;
}): SessionThreadSyncEvent {
  const sessionKey = params.sessionKey.trim();
  const notebookPath = params.notebookPath.trim();
  const threadId = params.threadId.trim();
  const source = params.source.trim();
  return {
    kind: 'new-thread',
    sessionKey,
    notebookPath,
    threadId,
    source,
    id: params.createEventId(),
    issuedAt: Date.now()
  };
}

export function writeSessionThreadSyncEvent(payload: SessionThreadSyncEvent): void {
  try {
    safeLocalStorageSet(STORAGE_KEY_SESSION_THREADS_EVENT, JSON.stringify(payload));
  } catch {
    // Ignore sync write failures; local tab still updates immediately.
  }
}

export function markDeleteAllPending(): void {
  safeLocalStorageSet(STORAGE_KEY_DELETE_ALL_PENDING, '1');
}

export function clearDeleteAllPending(): void {
  safeLocalStorageRemove(STORAGE_KEY_DELETE_ALL_PENDING);
}

export function hasDeleteAllPending(): boolean {
  return safeLocalStorageGet(STORAGE_KEY_DELETE_ALL_PENDING) === '1';
}

export function hasStoredDeleteAllPending(): boolean {
  return hasStoredValue(STORAGE_KEY_DELETE_ALL_PENDING);
}
