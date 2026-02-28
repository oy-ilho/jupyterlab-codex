import { type SetStateAction } from 'react';
import { parseServerMessage, type ModelCatalogEntry } from '../protocol';
import { type HistoryEntry, type TextRole, type ProgressKind } from './codexMessageUtils';
import type { CodexRateLimitsSnapshot } from './codexMessageTypes';
import { handleSessionSyncMessage } from './sessionSyncHandler';
import { isNoiseCodexEvent, summarizeCodexEvent } from './activitySummarizer';

type ActivityPhase = 'started' | 'completed' | '';
type ActivityCategory = 'reasoning' | 'command' | 'file' | 'tool' | 'event';
type NotebookMode = 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported';

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

  if (msg.type === 'status' || msg.type === 'error' || msg.type === 'done') {
    if (handleSessionSyncMessage(msg, context, targetSessionKey, runId, genericMessage)) {
      return;
    }
  }

  if (msg.type === 'output') {
    const role = msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'assistant';
    context.appendMessage(targetSessionKey, role, msg.text || '');
    return;
  }

  if (msg.type === 'event') {
    const payload = msg.payload;
    if (isNoiseCodexEvent(payload)) {
      return;
    }
    const summary = summarizeCodexEvent(payload);
    if (summary.activity.category !== 'reasoning') {
      context.appendActivityItem(targetSessionKey, summary.activity);
    }
    context.setSessionProgress(targetSessionKey, summary.progress, summary.progressKind);
    return;
  }
}

