import { type SetStateAction } from 'react';
import { parseServerMessage, type ModelCatalogEntry } from '../protocol';
import {
  type HistoryEntry,
  type TextRole,
  type ProgressKind,
  splitStoredMessagePreview as splitStoredMessagePreviewShared,
  truncateEnd
} from './codexMessageUtils';
import type {
  CodexRateLimitsSnapshot
} from './codexMessageTypes';

type ActivityPhase = 'started' | 'completed' | '';
type ActivityCategory = 'reasoning' | 'command' | 'file' | 'tool' | 'event';
type NotebookMode = 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported';
type RunState = 'ready' | 'running';

interface ActivityItem {
  category: ActivityCategory;
  phase: ActivityPhase;
  title: string;
  detail: string;
  raw: string;
}

type ChatEntry =
  | {
  kind: 'text';
  id: string;
  role: TextRole;
  text: string;
  attachments?: unknown;
  selectionPreview?: unknown;
  cellOutputPreview?: unknown;
}
  | {
  kind: 'run-divider';
  id: string;
  elapsedMs: number;
}
  | {
  kind: 'activity';
  id: string;
  item: ActivityItem;
};

interface NotebookSessionLike {
  threadId: string;
  messages: ChatEntry[];
  runState: 'ready' | 'running';
  activeRunId: string | null;
  runStartedAt: number | null;
  progress: string;
  progressKind: ProgressKind;
  pairedOk: boolean | null;
  pairedPath: string;
  pairedOsPath: string;
  pairedMessage: string;
  notebookMode: NotebookMode | null;
  selectedModelOption: string;
  selectedReasoningEffort: string;
  selectedSandboxMode: string;
  effectiveSandboxMode: string | null;
  conversationMode: 'resume' | 'fallback';
}

export type PairingPayload = {
  pairedOk: boolean | null;
  pairedPath: string;
  pairedOsPath: string;
  pairedMessage: string;
  notebookMode: NotebookMode | null;
};

export interface ActivitySummary {
  activity: {
    category: ActivityCategory;
    phase: ActivityPhase;
    title: string;
    detail: string;
    raw: string;
  };
  progress: string;
  progressKind: ProgressKind;
}

export interface CliDefaults {
  model: string | null;
  reasoningEffort: string | null;
  availableModels?: ModelCatalogEntry[];
}

export interface CodexSocketMessageHandlerContext {
  appendMessage: (sessionKey: string, role: 'user' | 'assistant' | 'system', text: string) => void;
  clearDeleteAllPending: () => void;
  coerceModelCatalog: (rawModels: unknown) => ModelCatalogEntry[];
  coerceReasoningEffort: (reasoningEffort: string) => string | null;
  coerceRateLimitsSnapshot: (snapshot: unknown) => CodexRateLimitsSnapshot | null;
  coerceSessionHistory: (history: unknown) => HistoryEntry[];
  coerceNotebookMode: (rawMode: unknown) => NotebookMode | null;
  createSession: (
    path: string,
    title: string,
    options?: { sessionKey?: string; threadId?: string; reuseStoredThread?: boolean }
  ) => NotebookSessionLike;
  deleteAllSessionsOnServer: () => boolean;
  getCommandPath: () => string;
  getCurrentSessionKey: () => string;
  getSessionThreadId?: (sessionKey: string) => string;
  getStoredSelectionPreviews: () => Map<string, Array<{ contentHash: string; preview: unknown | null }>>;
  hashSelectionPreviewContent: (text: string) => string;
  hasDeleteAllPending: () => boolean;
  isNoiseCodexEvent: (payload: unknown) => boolean;
  isSessionStartNotice: (text: string) => boolean;
  markDeleteAllPending: () => void;
  normalizeSystemText: (role: 'user' | 'assistant' | 'system', text: string) => string;
  notifyRunDone: (sessionKey: string, notebookPath: string, cancelled: boolean, exitCode: number | null) => void;
  refreshNotebook: (sessionKey: string) => void | Promise<void>;
  resolveMessageSessionKey: (message: unknown) => string;
  runToSessionKeyRef: { current: Map<string, string> };
  setCliDefaults: (updater: SetStateAction<CliDefaults>) => void;
  setCommandPath: (commandPath: string) => void;
  setRateLimits: (snapshot: SetStateAction<CodexRateLimitsSnapshot | null>) => void;
  setSessionConversationMode: (sessionKey: string, rawMode: unknown) => void;
  setSessionPairing: (sessionKey: string, pairing: PairingPayload) => void;
  setSessionProgress: (sessionKey: string, progress: string, kind: ProgressKind) => void;
  setSessionRunState: (sessionKey: string, runState: 'running' | 'ready', runId: string | null) => void;
  summarizeCodexEvent: (payload: unknown) => ActivitySummary;
  appendActivityItem: (sessionKey: string, item: Omit<ActivityItem, 'id' | 'ts'>) => void;
  syncEffectiveSandboxFromStatus: (sessionKey: string, rawMode: unknown) => void;
  updateSessions: (
    updater: (
      previous: Map<string, Record<string, unknown>>
    ) => Map<string, Record<string, unknown>>
  ) => void;
}

export function handleCodexSocketMessage(
  rawMessage: unknown,
  context: CodexSocketMessageHandlerContext
): void {
  const msg = parseServerMessage(rawMessage);
  if (msg === null) {
    context.appendMessage(context.getCurrentSessionKey() || '', 'system', `Invalid message: ${String(rawMessage)}`);
    return;
  }

  const genericMessage = msg as { runId?: string; error?: string; message?: string };
  const runId = typeof genericMessage.runId === 'string' ? genericMessage.runId : '';
  const targetSessionKey = context.resolveMessageSessionKey(msg);

  if (msg.type === 'cli_defaults') {
    const modelIsPresent = Object.prototype.hasOwnProperty.call(msg, 'model');
    const reasoningIsPresent = Object.prototype.hasOwnProperty.call(msg, 'reasoningEffort');
    const availableModelsIsPresent = Object.prototype.hasOwnProperty.call(msg, 'availableModels');
    const model =
      modelIsPresent && typeof msg.model === 'string' && msg.model.trim() ? msg.model.trim() : null;
    const reasoningEffort = reasoningIsPresent
      ? context.coerceReasoningEffort(typeof msg.reasoningEffort === 'string' ? msg.reasoningEffort : '')
      : null;
    const normalizedAvailableModels = availableModelsIsPresent
      ? context.coerceModelCatalog(msg.availableModels)
      : undefined;
    context.setCliDefaults(prev => ({
      model: modelIsPresent ? model : prev.model,
      reasoningEffort: reasoningIsPresent ? reasoningEffort : prev.reasoningEffort,
      availableModels: availableModelsIsPresent ? normalizedAvailableModels : prev.availableModels
    }));
    return;
  }

  if (msg.type === 'rate_limits') {
    context.setRateLimits(context.coerceRateLimitsSnapshot(msg.snapshot));
    return;
  }

  if (msg.type === 'delete_all_sessions') {
    const ok = msg.ok === true;
    if (ok) {
      context.clearDeleteAllPending();
    }
    const deletedCount = Number.isFinite(Number(msg.deletedCount)) ? Number(msg.deletedCount) : 0;
    const failedCount = Number.isFinite(Number(msg.failedCount)) ? Number(msg.failedCount) : 0;
    const deletedSummary = deletedCount === 1 ? 'Deleted 1 conversation' : `Deleted ${deletedCount} conversations`;
    const feedbackSession = context.getCurrentSessionKey();
    const feedbackText = ok
      ? `${deletedSummary} from the server.`
      : `${deletedSummary} from the server. Failed to delete ${failedCount} conversations. ${
          typeof msg.message === 'string' ? msg.message : 'Server error'
        }. Retry after reconnect.`;
    if (feedbackSession) {
      context.appendMessage(feedbackSession, 'system', feedbackText);
    }
    if (!ok && !context.hasDeleteAllPending()) {
      context.markDeleteAllPending();
    }
    return;
  }

  if (msg.type === 'status') {
    if (targetSessionKey) {
      context.syncEffectiveSandboxFromStatus(targetSessionKey, msg.effectiveSandbox);
      context.setSessionConversationMode(targetSessionKey, msg.runMode);
    }
    const sessionResolutionNotice =
      typeof msg.sessionResolutionNotice === 'string' ? msg.sessionResolutionNotice.trim() : '';
    if (targetSessionKey && sessionResolutionNotice && !runId) {
      context.appendMessage(targetSessionKey, 'system', sessionResolutionNotice);
    }
    const sessionId = typeof msg.sessionId === 'string' && msg.sessionId.trim() ? msg.sessionId.trim() : '';
    const history = context.coerceSessionHistory(msg.history);
      if (targetSessionKey && (sessionId || history.length > 0)) {
        context.updateSessions(previous => {
          const next = new Map(previous);
          const existing =
            (next.get(targetSessionKey) as NotebookSessionLike | undefined) ??
            context.createSession('', `Session started`, { sessionKey: targetSessionKey });
          const nextThreadId = sessionId || (existing.threadId as string);
          let nextMessages = existing.messages;

          const hasConversation = existing.messages.some(
            entry =>
              entry.kind === 'text' && (entry.role === 'user' || entry.role === 'assistant')
          );
          if (!hasConversation && history.length > 0) {
            const introEntry =
              existing.messages.find(
                (entry): entry is Extract<ChatEntry, { kind: 'text'; role: 'system'; text: string }> =>
                  entry.kind === 'text' &&
                  entry.role === 'system' &&
                  context.isSessionStartNotice(entry.text || '')
              ) ??
            ({
              kind: 'text',
              id: crypto.randomUUID(),
              role: 'system',
              text: context.normalizeSystemText('system', 'Session started')
            } as { kind: 'text'; id: string; role: 'system'; text: string });

          const storedUserEntries = context.getStoredSelectionPreviews().get(nextThreadId) ?? [];
          let storedUserCursor = 0;
              const restoredEntries = history.map(item => {
                const text = context.normalizeSystemText(item.role, item.content);
                let selectionPreview: unknown;
                let cellOutputPreview: unknown;
                if (item.role === 'user') {
                  selectionPreview = item.selectionPreview;
                  cellOutputPreview = item.cellOutputPreview;
                  if (!selectionPreview && !cellOutputPreview) {
                    const contentHash = context.hashSelectionPreviewContent(item.content);
                    while (storedUserCursor < storedUserEntries.length) {
                      const candidate = storedUserEntries[storedUserCursor];
                      storedUserCursor += 1;
                      if (!candidate || candidate.contentHash !== contentHash) {
                        continue;
                      }
                      const storedPreview = splitStoredMessagePreviewShared(candidate.preview);
                      selectionPreview = storedPreview.selectionPreview;
                      cellOutputPreview = storedPreview.cellOutputPreview;
                      break;
                    }
                  }
                }
                return {
                  kind: 'text' as const,
                  id: crypto.randomUUID(),
                  role: item.role,
                  text,
                  selectionPreview,
                  cellOutputPreview
                };
              });
          nextMessages = [introEntry, ...restoredEntries];
        }

        if (nextThreadId === existing.threadId && nextMessages === existing.messages) {
          return previous;
        }
        return new Map(previous).set(targetSessionKey, { ...existing, threadId: nextThreadId, messages: nextMessages });
      });
    }

    if (targetSessionKey) {
      const pairedOk = typeof msg.pairedOk === 'boolean' ? msg.pairedOk : null;
      const pairedPath = typeof msg.pairedPath === 'string' ? msg.pairedPath : '';
      const pairedOsPath = typeof msg.pairedOsPath === 'string' ? msg.pairedOsPath : '';
      const pairedMessage = typeof msg.pairedMessage === 'string' ? msg.pairedMessage : '';
      const notebookMode = context.coerceNotebookMode(msg.notebookMode);
      if (pairedOk !== null || pairedPath || pairedOsPath || pairedMessage || notebookMode !== null) {
        context.setSessionPairing(targetSessionKey, {
          pairedOk,
          pairedPath,
          pairedOsPath,
          pairedMessage,
          notebookMode
        });
      }
    }
    if (msg.state === 'running' && targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'running', runId || null);
      context.setSessionProgress(targetSessionKey, '', '');
    } else if (msg.state === 'ready' && targetSessionKey) {
      if (runId) {
        context.setSessionRunState(targetSessionKey, 'ready', null);
        context.setSessionProgress(targetSessionKey, '', '');
        context.runToSessionKeyRef.current.delete(runId);
      }
    }
    return;
  }

  if (msg.type === 'output') {
    const role = msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'assistant';
    context.appendMessage(targetSessionKey, role, msg.text || '');
    return;
  }

  if (msg.type === 'event') {
    const payload = msg.payload;
    if (context.isNoiseCodexEvent(payload)) {
      return;
    }
    const summary = context.summarizeCodexEvent(payload);
    if (summary.activity.category !== 'reasoning') {
      context.appendActivityItem(targetSessionKey, summary.activity);
    }
    context.setSessionProgress(targetSessionKey, summary.progress, summary.progressKind);
    return;
  }

  if (msg.type === 'error') {
    if (targetSessionKey) {
      context.setSessionConversationMode(targetSessionKey, msg.runMode);
    }
    const suggestedCommandPath =
      typeof msg.suggestedCommandPath === 'string' ? msg.suggestedCommandPath.trim() : '';
    if (suggestedCommandPath && !context.getCommandPath()) {
      context.setCommandPath(suggestedCommandPath);
      context.appendMessage(
        targetSessionKey,
        'system',
        `Suggested command path has been saved to settings: ${suggestedCommandPath}`
      );
    }
    context.appendMessage(targetSessionKey, 'system', msg.message || 'Unknown error');
    if (targetSessionKey) {
      const pairedOk = typeof msg.pairedOk === 'boolean' ? msg.pairedOk : null;
      const pairedPath = typeof msg.pairedPath === 'string' ? msg.pairedPath : '';
      const pairedOsPath = typeof msg.pairedOsPath === 'string' ? msg.pairedOsPath : '';
      const pairedMessage = typeof msg.pairedMessage === 'string' ? msg.pairedMessage : '';
      const notebookMode = context.coerceNotebookMode(msg.notebookMode);
      if (pairedOk !== null || pairedPath || pairedOsPath || pairedMessage || notebookMode !== null) {
        context.setSessionPairing(targetSessionKey, {
          pairedOk,
          pairedPath,
          pairedOsPath,
          pairedMessage,
          notebookMode
        });
      }
    }
    if (targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'ready', null);
      context.setSessionProgress(targetSessionKey, '', '');
    }
    if (runId) {
      context.runToSessionKeyRef.current.delete(runId);
    }
    return;
  }

  if (msg.type === 'done') {
    if (targetSessionKey) {
      context.setSessionConversationMode(targetSessionKey, msg.runMode);
    }
    if (targetSessionKey) {
      const pairedOk = typeof msg.pairedOk === 'boolean' ? msg.pairedOk : null;
      const pairedPath = typeof msg.pairedPath === 'string' ? msg.pairedPath : '';
      const pairedOsPath = typeof msg.pairedOsPath === 'string' ? msg.pairedOsPath : '';
      const pairedMessage = typeof msg.pairedMessage === 'string' ? msg.pairedMessage : '';
      const notebookMode = context.coerceNotebookMode(msg.notebookMode);
      if (pairedOk !== null || pairedPath || pairedOsPath || pairedMessage || notebookMode !== null) {
        context.setSessionPairing(targetSessionKey, {
          pairedOk,
          pairedPath,
          pairedOsPath,
          pairedMessage,
          notebookMode
        });
      }
    }
    const exitCode = typeof msg.exitCode === 'number' ? msg.exitCode : null;
    const cancelled = Boolean(msg.cancelled);
    const fileChanged = Boolean(msg.fileChanged);
    if (fileChanged && targetSessionKey) {
      void context.refreshNotebook(targetSessionKey);
    }
    if (!cancelled && exitCode !== null && exitCode !== 0) {
      const explicitError =
        (typeof genericMessage.error === 'string' && genericMessage.error.trim()) ||
        (typeof genericMessage.message === 'string' && genericMessage.message.trim()) ||
        '';
      const trimmedError = explicitError ? truncateEnd(explicitError, 600) : '';
      const failureMessage = trimmedError
        ? `Codex run failed (exit ${exitCode}): ${trimmedError}`
        : `Codex run failed (exit ${exitCode}). Check the logs above for the underlying error.`;
      context.appendMessage(targetSessionKey, 'system', failureMessage);
    }
    context.notifyRunDone(
      targetSessionKey,
      typeof msg.notebookPath === 'string' ? msg.notebookPath : '',
      cancelled,
      exitCode
    );
    if (targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'ready', null);
      context.setSessionProgress(targetSessionKey, '', '');
    }
    if (runId) {
      context.runToSessionKeyRef.current.delete(runId);
    }
  }
}
