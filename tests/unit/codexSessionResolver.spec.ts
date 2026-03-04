import { expect, test } from '@playwright/test';

import { resolveMessageSessionKey } from '../../src/codexSessionResolver';

test('resolveMessageSessionKey returns sessionContextKey when provided', () => {
  const runToSessionKey = new Map<string, string>();
  const activeSessionKeyByPath = new Map<string, string>();
  const result = resolveMessageSessionKey({
    message: {
      sessionContextKey: 'ctx-1',
      runId: 'run-1',
      notebookPath: '/ignored'
    },
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('ctx-1');
  expect(runToSessionKey.size).toBe(0);
});

test('resolveMessageSessionKey resolves mapped run id', () => {
  const runToSessionKey = new Map([['run-1', 'mapped-session']]);
  const activeSessionKeyByPath = new Map<string, string>();
  const result = resolveMessageSessionKey({
    message: {
      runId: 'run-1',
      notebookPath: '/tmp/foo.ipynb'
    },
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('mapped-session');
});

test('resolveMessageSessionKey caches active session by run id when available', () => {
  const runToSessionKey = new Map<string, string>();
  const activeSessionKeyByPath = new Map([['/tmp/foo.ipynb', 'session-foo']]);
  const result = resolveMessageSessionKey({
    message: {
      runId: 'run-2',
      notebookPath: '/tmp/foo.ipynb'
    },
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('session-foo');
  expect(runToSessionKey.get('run-2')).toBe('session-foo');
});

test('resolveMessageSessionKey returns active session by path when no run map exists', () => {
  const runToSessionKey = new Map<string, string>();
  const activeSessionKeyByPath = new Map([['/tmp/foo.ipynb', 'session-foo']]);
  const result = resolveMessageSessionKey({
    message: {
      notebookPath: '/tmp/foo.ipynb'
    },
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('session-foo');
});

test('resolveMessageSessionKey returns makeSessionKey result when path has no active session', () => {
  const runToSessionKey = new Map<string, string>();
  const activeSessionKeyByPath = new Map<string, string>();
  const result = resolveMessageSessionKey({
    message: {
      notebookPath: '  /tmp/foo.ipynb  '
    },
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('/tmp/foo.ipynb');
});

test('resolveMessageSessionKey falls back to current session key', () => {
  const runToSessionKey = new Map<string, string>();
  const activeSessionKeyByPath = new Map<string, string>();
  const result = resolveMessageSessionKey({
    message: {},
    runToSessionKey,
    activeSessionKeyByPath,
    currentSessionKey: 'current'
  });
  expect(result).toBe('current');
});

