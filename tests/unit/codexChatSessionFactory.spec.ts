import { expect, test } from '@playwright/test';

import { createSession, createThreadResetSession } from '../../src/codexChatSessionFactory';

const defaultDeps = {
  readStoredThreadId(path: string, sessionKey: string): string {
    return sessionKey === 'stored' && path === '/tmp/notebook' ? 'stored-thread' : '';
  },
  readDefaultModelOption(): string {
    return '__config__';
  },
  readDefaultReasoningEffortOption(): string {
    return 'medium';
  },
  readDefaultSandboxModeOption(): string {
    return 'workspace-write';
  },
  normalizeSystemText(role: 'user' | 'assistant' | 'system', text: string): string {
    return role === 'system' && text.startsWith('Session started') ? `normalized:${text}` : text;
  }
};

test('createSession falls back to stored thread id when thread id missing', () => {
  const session = createSession<{ threadId: string; messages: Array<{ role: string; text: string }>; [key: string]: unknown }>(
    '/tmp/notebook',
    'Session started',
    { sessionKey: 'stored' },
    defaultDeps
  );
  expect(session.threadId).toBe('stored-thread');
});

test('createSession uses explicit thread id when provided', () => {
  const session = createSession<{ threadId: string; messages: Array<{ role: string; text: string }>; [key: string]: unknown }>(
    '/tmp/notebook',
    'Session started',
    { threadId: 'explicit-thread' },
    defaultDeps
  );
  expect(session.threadId).toBe('explicit-thread');
});

test('createSession seeds selected defaults and system text normalized', () => {
  const session = createSession<{
    threadId: string;
    messages: Array<{ kind: 'text'; role: 'system'; text: string }>;
    selectedModelOption: string;
    selectedReasoningEffort: string;
    selectedSandboxMode: string;
    effectiveSandboxMode: unknown;
    conversationMode: 'resume' | 'fallback';
    notebookMode: null;
    runState: 'ready' | 'running';
    activeRunId: string | null;
    runStartedAt: number | null;
    progress: string;
    progressKind: '' | 'reasoning';
    pairedOk: boolean | null;
    pairedPath: string;
    pairedOsPath: string;
    pairedMessage: string;
  }>(
    '/tmp/notebook',
    'Session started',
    { sessionKey: '' },
    defaultDeps
  );
  expect(session.selectedModelOption).toBe('__config__');
  expect(session.selectedReasoningEffort).toBe('medium');
  expect(session.selectedSandboxMode).toBe('workspace-write');
  expect(session.conversationMode).toBe('resume');
  expect(session.messages[0].text).toBe('normalized:Session started');
  expect(session.progress).toBe('');
  expect(session.runState).toBe('ready');
});

test('createThreadResetSession uses time label and forced thread id', () => {
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = () => '14:00:00';
  const session = createThreadResetSession<{
    threadId: string;
    messages: Array<{ kind: 'text'; role: string; text: string }>;
    [key: string]: unknown;
  }>(
    '/tmp/notebook',
    'doc-key',
    'thread-reset',
    defaultDeps
  );
  expect(session.threadId).toBe('thread-reset');
  expect(session.messages[0].text).toBe('normalized:Session started (14:00:00)');
  Date.prototype.toLocaleTimeString = originalToLocaleTimeString;
});

