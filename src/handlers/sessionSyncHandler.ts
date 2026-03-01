import {
  splitStoredMessagePreview as splitStoredMessagePreviewShared,
  truncateEnd
} from './codexMessageUtils';
import type { CodexSocketMessageHandlerContext } from './handleCodexSocketMessage';
import { isStructuredSessionStartResolution } from '../codexChatNotice';

type ChatEntry =
  | {
      kind: 'text';
      id: string;
      role: 'user' | 'assistant' | 'system';
      text: string;
      sessionResolution?: unknown;
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
      item: {
        category: 'reasoning' | 'command' | 'file' | 'tool' | 'event';
        phase: 'started' | 'completed' | '';
        title: string;
        detail: string;
        raw: string;
      };
    };

type SessionStartTextEntry = {
  kind: 'text';
  id: string;
  role: 'system';
  text: string;
  sessionResolution?: unknown;
  attachments?: unknown;
  selectionPreview?: unknown;
  cellOutputPreview?: unknown;
};

type SessionSyncMessage = {
  type: 'status' | 'error' | 'done';
  runId?: string;
  sessionId?: unknown;
  sessionResolution?: unknown;
  pairedOk?: unknown;
  pairedPath?: unknown;
  pairedOsPath?: unknown;
  pairedMessage?: unknown;
  notebookMode?: unknown;
  state?: unknown;
  role?: unknown;
  text?: unknown;
  payload?: unknown;
  exitCode?: unknown;
  fileChanged?: unknown;
  path?: unknown;
  runMode?: unknown;
  suggestedCommandPath?: unknown;
  message?: unknown;
  error?: unknown;
  history?: unknown;
  sessionResolutionNotice?: unknown;
  effectiveSandbox?: unknown;
  notebookPath?: unknown;
};

function makeSessionStartIntro(context: CodexSocketMessageHandlerContext, sessionResolution?: unknown): SessionStartTextEntry {
  return {
    kind: 'text',
    id: crypto.randomUUID(),
    role: 'system',
    text: context.normalizeSystemText('system', 'Session started'),
    sessionResolution
  };
}

function applySyncPairing(context: CodexSocketMessageHandlerContext, targetSessionKey: string, payload: any): void {
  const pairedOk = typeof payload?.pairedOk === 'boolean' ? payload.pairedOk : null;
  const pairedPath = typeof payload?.pairedPath === 'string' ? payload.pairedPath : '';
  const pairedOsPath = typeof payload?.pairedOsPath === 'string' ? payload.pairedOsPath : '';
  const pairedMessage = typeof payload?.pairedMessage === 'string' ? payload.pairedMessage : '';
  const notebookMode = context.coerceNotebookMode(payload?.notebookMode);
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

function appendHistoryFromStatus(
  context: CodexSocketMessageHandlerContext,
  targetSessionKey: string,
  msg: SessionSyncMessage
): void {
  const sessionId =
    typeof msg.sessionId === 'string' && msg.sessionId.trim() ? msg.sessionId.trim() : '';
  const history = context.coerceSessionHistory(msg.history);

  if (!(targetSessionKey && (sessionId || history.length > 0))) {
    return;
  }

  context.updateSessions(previous => {
    const next = new Map(previous);
    const existing =
      (next.get(targetSessionKey) as
        | {
            messages: ChatEntry[];
            threadId: string;
            conversationMode: 'resume' | 'fallback';
          }
        | undefined) ??
      context.createSession('', 'Session started', { sessionKey: targetSessionKey });

    const nextThreadId = sessionId || (existing.threadId as string);
    let nextMessages = existing.messages;

    const hasConversation = existing.messages.some(
      (entry) =>
        entry.kind === 'text' && (entry.role === 'user' || entry.role === 'assistant')
    );
    if (!hasConversation && history.length > 0) {
      const existingSystemEntry =
        existing.messages.find((entry): entry is ChatEntry => entry.kind === 'text' && entry.role === 'system') as
          | SessionStartTextEntry
          | undefined;
      const existingStartNoticeEntry =
        existingSystemEntry &&
        context.isSessionStartNotice(existingSystemEntry.text || '', msg.sessionResolution);
      const hasStructuredStartNotice = isStructuredSessionStartResolution(msg.sessionResolution);
      const introEntry =
        hasStructuredStartNotice
          ? makeSessionStartIntro(context, msg.sessionResolution)
          : existingStartNoticeEntry
            ? existingSystemEntry
            : existingSystemEntry ??
              makeSessionStartIntro(context, msg.sessionResolution);

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
          role: item.role as 'user' | 'assistant' | 'system',
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

export function handleSessionSyncMessage(
  msg: SessionSyncMessage,
  context: CodexSocketMessageHandlerContext,
  targetSessionKey: string,
  runId: string,
  rawMessage: { runId?: string; error?: string; message?: string; [key: string]: unknown } = {}
): boolean {
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

    appendHistoryFromStatus(context, targetSessionKey, msg);
    if (targetSessionKey) {
      applySyncPairing(context, targetSessionKey, msg);
    }

    if (msg.state === 'running' && targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'running', runId || null);
      context.setSessionProgress(targetSessionKey, '', '');
    } else if (msg.state === 'ready' && targetSessionKey) {
      if (runId) {
        context.setSessionRunState(targetSessionKey, 'ready', runId);
        context.setSessionProgress(targetSessionKey, '', '');
        context.runToSessionKeyRef.current.delete(runId);
      }
    }
    return true;
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
    context.appendMessage(targetSessionKey, 'system', (msg.message as string) || 'Unknown error');

    if (targetSessionKey) {
      applySyncPairing(context, targetSessionKey, msg);
    }

    if (targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'ready', runId || null);
      context.setSessionProgress(targetSessionKey, '', '');
    }
    if (runId) {
      context.runToSessionKeyRef.current.delete(runId);
    }
    return true;
  }

  if (msg.type === 'done') {
    if (targetSessionKey) {
      context.setSessionConversationMode(targetSessionKey, msg.runMode);
    }
    if (targetSessionKey) {
      applySyncPairing(context, targetSessionKey, msg);
    }

    const exitCode = typeof msg.exitCode === 'number' ? msg.exitCode : null;
    const cancelled = Boolean((msg as any).cancelled);
    const fileChanged = Boolean((msg as any).fileChanged);
    if (fileChanged && targetSessionKey) {
      void context.refreshNotebook(targetSessionKey);
    }
    if (!cancelled && exitCode !== null && exitCode !== 0) {
      const explicitError =
        (typeof rawMessage.error === 'string' && rawMessage.error.trim()) ||
        (typeof rawMessage.message === 'string' && rawMessage.message.trim()) ||
        '';
      const trimmedError = explicitError ? truncateEnd(explicitError, 600) : '';
      const failureMessage = trimmedError
        ? `Codex run failed (exit ${exitCode}): ${trimmedError}`
        : `Codex run failed (exit ${exitCode}). Check the logs above for the underlying error.`;
      context.appendMessage(targetSessionKey, 'system', failureMessage);
    }

    context.notifyRunDone(
      targetSessionKey,
      typeof msg.notebookPath === 'string'
        ? msg.notebookPath
        : typeof msg.path === 'string'
          ? msg.path
          : '',
      cancelled,
      exitCode
    );
    if (targetSessionKey) {
      context.setSessionRunState(targetSessionKey, 'ready', runId || null);
      context.setSessionProgress(targetSessionKey, '', '');
    }
    if (runId) {
      context.runToSessionKeyRef.current.delete(runId);
    }
    return true;
  }

  return false;
}
