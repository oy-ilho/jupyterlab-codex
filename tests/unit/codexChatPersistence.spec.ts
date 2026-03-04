import { expect, test } from '@playwright/test';

import {
  coerceSessionThreadSyncEvent,
  buildSessionThreadSyncEvent,
  getStoredSessionThreadCount,
  hasDeleteAllPending,
  hasStoredDeleteAllPending,
  markDeleteAllPending,
  parseSessionKey,
  persistStoredSessionThreads,
  readStoredSessionThreads,
  readStoredThreadId,
  STORAGE_KEY_SESSION_THREADS,
  STORAGE_KEY_SESSION_THREADS_EVENT,
  writeSessionThreadSyncEvent,
  clearDeleteAllPending,
  STORAGE_KEY_DELETE_ALL_PENDING
} from '../../src/codexChatPersistence';

type FakeStorage = {
  clear: () => void;
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
};

function createInMemoryStorage(): FakeStorage {
  const data = new Map<string, string>();
  return {
    clear: () => {
      data.clear();
    },
    getItem: key => data.get(key) ?? null,
    removeItem: key => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

const fakeStorage = createInMemoryStorage();
(globalThis as any).window = {
  localStorage: fakeStorage
} as any;

test.beforeEach(() => {
  fakeStorage.clear();
});

function separatorText(): string {
  return '\u0000';
}

test('parseSessionKey returns raw session path when no separator exists', () => {
  const parsed = parseSessionKey('/tmp/notebook.ipynb');
  expect(parsed.path).toBe('/tmp/notebook.ipynb');
});

test('parseSessionKey extracts path before first separator when present', () => {
  const path = '/tmp/notebook.ipynb';
  const key = `${path}${separatorText()}run`;
  expect(parseSessionKey(key).path).toBe(path);
});

test('getStoredSessionThreadCount dedupes by normalized path', () => {
  fakeStorage.clear();
  const path = '/tmp/notebook.ipynb';
  fakeStorage.setItem(
    STORAGE_KEY_SESSION_THREADS,
    JSON.stringify({
      [`${path}${separatorText()}abc`]: 'thread-abc',
      [`${path}${separatorText()}def`]: 'thread-def',
      [`other${separatorText()}x`]: 'thread-x'
    })
  );

  expect(getStoredSessionThreadCount()).toBe(2);
});

test('readStoredThreadId uses exact session key first then fallback by path', () => {
  fakeStorage.clear();
  fakeStorage.setItem(
    STORAGE_KEY_SESSION_THREADS,
    JSON.stringify({
      [`/tmp/foo${separatorText()}one`]: 'thread-one',
      [`/tmp/foo${separatorText()}two`]: 'thread-two'
    })
  );

  expect(readStoredThreadId('/tmp/foo', `/tmp/foo${separatorText()}two`)).toBe('thread-two');
  expect(readStoredThreadId('/tmp/foo', '/tmp/foo:missing')).toBe('thread-one');
  expect(readStoredThreadId('/tmp/bar', `/tmp/bar${separatorText()}x`)).toBe('');
});

test('persistStoredSessionThreads stores only valid session keys with thread ids', () => {
  fakeStorage.clear();
  const sessions = new Map([
    ['doc-a', { threadId: 'thread-a' }],
    ['', { threadId: 'ignored' }],
    ['doc-b', {} as { threadId?: string }],
    ['doc-c', { threadId: 'thread-c' }]
  ]);
  persistStoredSessionThreads(sessions);

  const raw = fakeStorage.getItem(STORAGE_KEY_SESSION_THREADS);
  expect(raw).toBeTruthy();
  const parsed = raw ? JSON.parse(raw) : {};
  expect(parsed).toEqual({
    'doc-a': 'thread-a',
    'doc-c': 'thread-c'
  });
});

test('readStoredSessionThreads parses valid json object', () => {
  fakeStorage.clear();
  fakeStorage.setItem(STORAGE_KEY_SESSION_THREADS, JSON.stringify({ docA: 'thread-a', docB: 1 }));
  expect(readStoredSessionThreads()).toEqual({ docA: 'thread-a' });
});

test('coerceSessionThreadSyncEvent parses and validates payload', () => {
  const payload = JSON.stringify({
    kind: 'new-thread',
    sessionKey: '  docA ',
    notebookPath: ' /tmp/file.ipynb ',
    threadId: '  t1 ',
    source: 'local-tab',
    id: 'evt-1',
    issuedAt: 1719852800000
  });
  const event = coerceSessionThreadSyncEvent(payload);
  expect(event).toEqual({
    kind: 'new-thread',
    sessionKey: 'docA',
    notebookPath: '/tmp/file.ipynb',
    threadId: 't1',
    source: 'local-tab',
    id: 'evt-1',
    issuedAt: 1719852800000
  });
});

test('coerceSessionThreadSyncEvent returns null for malformed payload', () => {
  expect(coerceSessionThreadSyncEvent('not-json')).toBeNull();
  expect(coerceSessionThreadSyncEvent(JSON.stringify({ kind: 'wrong', sessionKey: 'a', notebookPath: 'b', threadId: 'c', id: 'd' }))).toBeNull();
});

test('buildSessionThreadSyncEvent normalizes values and sets issue time', () => {
  const issuedAt = Date.now();
  const event = buildSessionThreadSyncEvent({
    sessionKey: ' /tmp/doc ',
    notebookPath: '/tmp/doc ',
    threadId: ' thread-1 ',
    source: ' local ',
    createEventId: () => 'evt-1'
  });
  expect(event).toMatchObject({
    kind: 'new-thread',
    sessionKey: '/tmp/doc',
    notebookPath: '/tmp/doc',
    threadId: 'thread-1',
    source: 'local',
    id: 'evt-1'
  });
  expect(event.issuedAt).toBeGreaterThanOrEqual(issuedAt);
});

test('writeSessionThreadSyncEvent persists serialized event', () => {
  fakeStorage.clear();
  const event = buildSessionThreadSyncEvent({
    sessionKey: 'doc',
    notebookPath: '/tmp/doc',
    threadId: 't1',
    source: 'local',
    createEventId: () => 'evt-1'
  });
  writeSessionThreadSyncEvent(event);

  const saved = fakeStorage.getItem(STORAGE_KEY_SESSION_THREADS_EVENT);
  expect(saved).toBeTruthy();
  expect(saved).toEqual(JSON.stringify(event));
});

test('delete-all pending helpers track persistence state', () => {
  fakeStorage.clear();
  expect(hasDeleteAllPending()).toBe(false);
  expect(hasStoredDeleteAllPending()).toBe(false);

  markDeleteAllPending();
  expect(hasDeleteAllPending()).toBe(true);
  expect(hasStoredDeleteAllPending()).toBe(true);
  expect(fakeStorage.getItem(STORAGE_KEY_DELETE_ALL_PENDING)).toBe('1');

  clearDeleteAllPending();
  expect(hasDeleteAllPending()).toBe(false);
  expect(hasStoredDeleteAllPending()).toBe(false);
});
