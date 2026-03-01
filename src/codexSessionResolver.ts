import { makeSessionKey } from './codexChatSessionKey';

export type MessageLike = {
  notebookPath?: unknown;
  sessionContextKey?: unknown;
  runId?: unknown;
};

export type ResolveMessageSessionKeyParams = {
  message: MessageLike;
  runToSessionKey: Map<string, string>;
  activeSessionKeyByPath: Map<string, string>;
  currentSessionKey: string;
};

export function resolveMessageSessionKey(params: ResolveMessageSessionKeyParams): string {
  const { message, runToSessionKey, activeSessionKeyByPath, currentSessionKey } = params;
  const messagePath = typeof message?.notebookPath === 'string' ? message.notebookPath : '';
  const sessionContextKey = typeof message?.sessionContextKey === 'string' ? message.sessionContextKey : '';
  if (sessionContextKey) {
    return sessionContextKey;
  }

  const runId = typeof message?.runId === 'string' ? message.runId : '';
  if (runId) {
    const mapped = runToSessionKey.get(runId);
    if (mapped) {
      return mapped;
    }
  }

  if (messagePath) {
    if (runId) {
      const activeSessionKey = activeSessionKeyByPath.get(messagePath);
      if (activeSessionKey) {
        runToSessionKey.set(runId, activeSessionKey);
        return activeSessionKey;
      }
    }
    const activeSessionKey = activeSessionKeyByPath.get(messagePath);
    if (activeSessionKey) {
      return activeSessionKey;
    }
    return makeSessionKey(messagePath);
  }

  if (runId) {
    const mapped = runToSessionKey.get(runId);
    if (mapped) {
      return mapped;
    }
  }

  return currentSessionKey;
}

