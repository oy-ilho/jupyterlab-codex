import { test, expect } from '@playwright/test';

import { parseModelCatalog } from '../../src/protocol';
import { handleCodexSocketMessage } from '../../src/handlers/handleCodexSocketMessage';
import { coerceRateLimitsSnapshot, coerceSessionHistory, truncateEnd, coerceSelectionPreview } from '../../src/handlers/codexMessageUtils';

type TextRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  sessionKey: string;
  role: TextRole;
  text: string;
  selectionPreview?: unknown;
  cellOutputPreview?: unknown;
}

interface TestState {
  messages: ChatMessage[];
  sessionPairs: Map<string, { runState: 'ready' | 'running'; activeRunId: string | null }>;
  pairings: Map<
    string,
    {
      pairedOk: boolean | null;
      pairedPath: string;
      pairedOsPath: string;
      pairedMessage: string;
    }
  >;
  progress: Map<string, { progress: string; kind: string }>;
  doneNotices: Array<{ sessionKey: string; notebookPath: string; cancelled: boolean; exitCode: number | null }>;
  refreshCalls: string[];
  rateLimits: unknown[];
  deleteAllPending: boolean;
  deleteAllCalls: number;
  commandPath: string;
  sessions: Map<string, Record<string, unknown>>;
  runToSessionKey: Map<string, string>;
}

function createFixture(sessionKey = 'doc:test') {
  const state: TestState = {
    messages: [],
    sessionPairs: new Map(),
    pairings: new Map(),
    progress: new Map(),
    doneNotices: [],
    refreshCalls: [],
    rateLimits: [],
    deleteAllPending: false,
    deleteAllCalls: 0,
    commandPath: '',
    sessions: new Map(),
    runToSessionKey: new Map()
  };

  const context = {
    appendMessage(sessionKey: string, role: TextRole, text: string): void {
      state.messages.push({ sessionKey, role, text });
    },
    clearDeleteAllPending(): void {
      state.deleteAllPending = false;
    },
    coerceModelCatalog(rawModels: unknown) {
      return parseModelCatalog(rawModels);
    },
    coerceReasoningEffort(value: string): string {
      return value.trim().toLowerCase();
    },
    coerceRateLimitsSnapshot(raw: unknown) {
      return coerceRateLimitsSnapshot(raw) as any;
    },
    coerceSessionHistory(raw: unknown) {
      return coerceSessionHistory(raw);
    },
    coerceNotebookMode(rawMode: unknown) {
      return rawMode === 'ipynb' || rawMode === 'jupytext_py' || rawMode === 'plain_py' || rawMode === 'unsupported'
        ? (rawMode as 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported')
        : null;
    },
    createSession(path: string, intro: string, options?: { sessionKey?: string; threadId?: string; reuseStoredThread?: boolean }) {
      const session = {
        threadId:
          options?.threadId?.trim() ||
          (options?.reuseStoredThread === false ? '' : path ? `${path}:stored` : '') ||
          `new-thread-${path || 'default'}`,
        messages: [
          {
            kind: 'text',
            id: 't-intro',
            role: 'system',
            text: intro
          }
        ],
        runState: 'ready' as const,
        activeRunId: null as string | null,
        runStartedAt: null as number | null,
        progress: '',
        progressKind: '' as '',
        pairedOk: null as boolean | null,
        pairedPath: '',
        pairedOsPath: '',
        pairedMessage: '',
        notebookMode: null as 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported' | null,
        selectedModelOption: '__config__' as const,
        selectedReasoningEffort: 'medium' as const,
        selectedSandboxMode: 'workspace-write' as const,
        effectiveSandboxMode: null as string | null,
        conversationMode: 'resume' as 'resume' | 'fallback'
      };
      const targetKey = options?.sessionKey || sessionKey;
      state.sessions.set(targetKey, session);
      return session;
    },
    deleteAllSessionsOnServer(): boolean {
      state.deleteAllCalls += 1;
      return true;
    },
    getCommandPath: () => state.commandPath,
    getCurrentSessionKey: () => sessionKey,
    getSessionThreadId(sessionKeyArg: string): string {
      const session = state.sessions.get(sessionKeyArg) as { threadId?: string } | undefined;
      return session?.threadId?.trim() || '';
    },
    getStoredSelectionPreviews: () => {
      const map = new Map<string, Array<{ contentHash: string; preview: any | null }>>();
      map.set('thread-restore', [
        { contentHash: 'hello', preview: { selectionPreview: { locationLabel: 'Cell 1', previewText: 'stored' } } }
      ]);
      return map;
    },
    hashSelectionPreviewContent(text: string): string {
      return text.trim();
    },
    hasDeleteAllPending: () => state.deleteAllPending,
    isNoiseCodexEvent(payload: unknown): boolean {
      return (payload as { type?: string })?.type === 'noise';
    },
    isSessionStartNotice(text: string): boolean {
      return text.startsWith('Session started');
    },
    markDeleteAllPending(): void {
      state.deleteAllPending = true;
    },
    normalizeSystemText(_: TextRole, text: string): string {
      return text;
    },
    notifyRunDone(sessionKey: string, notebookPath: string, cancelled: boolean, exitCode: number | null): void {
      state.doneNotices.push({ sessionKey, notebookPath, cancelled, exitCode });
    },
    refreshNotebook(sessionKey: string): Promise<void> {
      state.refreshCalls.push(sessionKey);
      return Promise.resolve();
    },
    resolveMessageSessionKey(message: unknown): string {
      const raw = message as Record<string, unknown>;
      return (
        (typeof raw?.sessionContextKey === 'string' && raw.sessionContextKey.trim()) ||
        (typeof raw?.sessionId === 'string' && raw.sessionId.trim()) ||
        sessionKey
      );
    },
    runToSessionKeyRef: { current: state.runToSessionKey },
    setCliDefaults: (updater: (value: any) => any) => {
      return updater({ model: null, reasoningEffort: null });
    },
    setCommandPath: (commandPath: string): void => {
      state.commandPath = commandPath;
    },
    setRateLimits: (value: unknown) => {
      state.rateLimits.push(value);
    },
    setSessionConversationMode: () => {},
    setSessionPairing(sessionKeyArg: string, payload: unknown) {
      const next = payload as {
        pairedOk: boolean | null;
        pairedPath: string;
        pairedOsPath: string;
        pairedMessage: string;
      };
      state.pairings.set(sessionKeyArg, next);
    },
    setSessionProgress(sessionKeyArg: string, progress: string, progressKind: string) {
      state.progress.set(sessionKeyArg, { progress, kind: progressKind });
    },
    setSessionRunState(sessionKeyArg: string, runState: 'ready' | 'running', activeRunId: string | null) {
      const session = state.sessions.get(sessionKeyArg) as any;
      if (session) {
        session.runState = runState;
        session.activeRunId = activeRunId;
      }
      state.sessionPairs.set(sessionKeyArg, { runState, activeRunId });
    },
    summarizeCodexEvent(payload: unknown) {
      const detail =
        typeof payload === 'object' && payload !== null && 'detail' in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).detail)
          : String(payload ?? '');
      return {
        activity: { category: 'event', phase: '', title: 'Event', detail, raw: JSON.stringify(payload ?? {}) },
        progress: `Event: ${detail || 'ok'}`,
        progressKind: '' as ''
      };
    },
    appendActivityItem(sessionKeyArg: string, item: { category: string; phase: string; title: string; detail: string; raw: string }) {
      state.messages.push({
        sessionKey: sessionKeyArg,
        role: 'system',
        text: `activity:${item.category}:${item.title}:${item.phase}:${item.detail}:${truncateEnd(item.raw, 20)}`
      });
    },
    syncEffectiveSandboxFromStatus: () => {},
    updateSessions(updater: (value: Map<string, Record<string, unknown>>) => Map<string, Record<string, unknown>>) {
      state.sessions = updater(state.sessions);
    }
  };

  return { state, context, sessionKey };
}

test('status message restores history and maps thread id', () => {
  const { state, context } = createFixture();
  context.createSession('', 'Session started', { sessionKey: 'doc:test' });

  handleCodexSocketMessage(
    {
      type: 'status',
      state: 'running',
      sessionContextKey: 'doc:test',
      sessionId: 'thread-restore',
      notebookPath: '/notebook.ipynb',
      sessionResolutionNotice: 'Session already running',
      history: [{ role: 'user', content: 'hello' }, { role: 'system', content: 'ack' }]
    },
    context
  );

  const session = state.sessions.get('doc:test') as Record<string, any>;
  expect(session).toBeTruthy();
  expect(session.threadId).toBe('thread-restore');
  const restored = session.messages.filter((entry: any) => entry.kind === 'text');
  const userEntry = restored.find((entry: any) => entry.role === 'user' && entry.text === 'hello');
  expect(userEntry).toBeTruthy();
  expect(userEntry.selectionPreview).toEqual(coerceSelectionPreview({ locationLabel: 'Cell 1', previewText: 'stored' }));
  expect(userEntry.cellOutputPreview).toBeUndefined();
  const progress = state.progress.get('doc:test');
  expect(progress).toBeTruthy();
  expect(progress?.progress).toBe('');
  expect(state.sessionPairs.get('doc:test')?.runState).toBe('running');
});

test('error message saves suggested command path and logs error', () => {
  const { state, context } = createFixture();
  context.createSession('', 'Session started', { sessionKey: 'doc:test' });

  handleCodexSocketMessage(
    {
      type: 'error',
      runId: 'run-error',
      sessionContextKey: 'doc:test',
      sessionId: 'thread-error',
      message: 'boom',
      suggestedCommandPath: '/usr/bin/codex'
    },
    context
  );

  expect(state.commandPath).toBe('/usr/bin/codex');
  expect(state.messages.map(item => item.text).join('\n')).toContain('Suggested command path has been saved to settings: /usr/bin/codex');
  expect(state.messages.map(item => item.text).join('\n')).toContain('boom');
  expect(state.sessionPairs.get('doc:test')?.runState).toBe('ready');
  expect(state.runToSessionKey.get('run-error')).toBeUndefined();
});

test('done message marks non-zero exit as failure and refreshes', async () => {
  const { state, context } = createFixture();
  context.createSession('', 'Session started', { sessionKey: 'doc:test', threadId: 'thread-done' });
  state.runToSessionKey.set('run-done', 'doc:test');

  handleCodexSocketMessage(
    {
      type: 'done',
      runId: 'run-done',
      sessionContextKey: 'doc:test',
      sessionId: 'thread-done',
      notebookPath: '/notebook.ipynb',
      exitCode: 2,
      fileChanged: true,
      runMode: 'resume'
    },
    context
  );

  const failureText = state.messages.map(item => item.text).join('\n');
  expect(failureText).toContain('Codex run failed (exit 2).');
  expect(state.refreshCalls).toEqual(['doc:test']);
  expect(state.doneNotices).toEqual([
    { sessionKey: 'doc:test', notebookPath: '/notebook.ipynb', cancelled: false, exitCode: 2 }
  ]);
  expect(state.sessionPairs.get('doc:test')).toEqual({ runState: 'ready', activeRunId: null });
  expect(state.runToSessionKey.has('run-done')).toBe(false);
});

test('delete_all_sessions tracks pending state on failure', () => {
  const { state, context } = createFixture();
  context.createSession('', 'Session started', { sessionKey: 'doc:test' });

  handleCodexSocketMessage(
    {
      type: 'delete_all_sessions',
      ok: false,
      deletedCount: 1,
      failedCount: 2,
      message: 'network'
    },
    context
  );

  expect(state.deleteAllPending).toBe(true);
  expect(state.deleteAllCalls).toBe(0);
  expect(state.messages.map(item => item.text).join('\n')).toContain('Failed to delete 2 conversations');
  expect(state.messages[state.messages.length - 1].text).toContain('network');
});

test('rate limit payload is normalized', () => {
  const { state, context } = createFixture();
  const payload = {
    updatedAt: '2025-01-01T00:00:00Z',
    primary: { usedPercent: 10.4, windowMinutes: 20.8, resetsAt: 11.8 },
    secondary: { usedPercent: 12.3, windowMinutes: 30, resetsAt: 13 },
    contextWindow: { windowTokens: 100.5, usedTokens: 80.2, leftTokens: 19.8, usedPercent: 75.4 }
  };

  handleCodexSocketMessage(
    {
      type: 'rate_limits',
      snapshot: payload
    },
    context
  );

  expect(state.rateLimits).toEqual([coerceRateLimitsSnapshot(payload)]);
});

test('event noise is ignored and non-noise updates progress', () => {
  const { state, context } = createFixture();
  context.createSession('', 'Session started', { sessionKey: 'doc:test' });
  const beforeNoiseMessages = state.messages.length;

  handleCodexSocketMessage(
    {
      type: 'event',
      runId: 'run-noise',
      sessionContextKey: 'doc:test',
      sessionId: 'thread',
      notebookPath: '/notebook.ipynb',
      payload: { type: 'noise' }
    },
    context
  );

  expect(state.messages.length).toBe(beforeNoiseMessages);

  handleCodexSocketMessage(
    {
      type: 'event',
      runId: 'run-noise',
      sessionContextKey: 'doc:test',
      sessionId: 'thread',
      notebookPath: '/notebook.ipynb',
      payload: { type: 'agent_update', detail: 'thinking' }
    },
    context
  );

  expect(state.progress.get('doc:test')?.progress).toContain('Event');
  expect(state.messages.some(item => item.text.startsWith('activity:event'))).toBeTruthy();
});
