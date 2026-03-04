export const PROTOCOL_VERSION = '1.0.0' as const;

export type ServerProtocolVersion = typeof PROTOCOL_VERSION;
export type ProtocolVersion = string;

export type RunMode = 'resume' | 'fallback';
export type StatusState = 'ready' | 'running';

export interface SelectionPreview {
  locationLabel: string;
  previewText: string;
}

export interface ModelCatalogEntry {
  model: string;
  displayName: string;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface ServerMessageBase {
  protocolVersion?: ProtocolVersion;
  type: string;
}

export interface ServerCliDefaultsMessage extends ServerMessageBase {
  type: 'cli_defaults';
  model?: string | null;
  reasoningEffort?: string | null;
  availableModels?: ModelCatalogEntry[];
}

export interface ServerRateLimitsMessage extends ServerMessageBase {
  type: 'rate_limits';
  snapshot: unknown;
}

export type ServerSessionResolution =
  | 'client'
  | 'client-new'
  | 'force-new'
  | 'mapping'
  | 'mapping-on-missing'
  | 'mapping-on-mismatch'
  | 'new'
  | 'new-on-mismatch';

export interface ServerDeleteAllSessionsMessage extends ServerMessageBase {
  type: 'delete_all_sessions';
  ok: boolean;
  deletedCount: number;
  failedCount: number;
  message: string;
}

export interface ServerStatusMessage extends ServerMessageBase {
  type: 'status';
  state: StatusState;
  runId?: string;
  sessionId?: string;
  sessionContextKey?: string;
  notebookPath?: string;
  runMode?: RunMode;
  pairedOk?: boolean;
  pairedPath?: string;
  pairedOsPath?: string;
  pairedMessage?: string;
  notebookMode?: string;
  sessionResolution?: ServerSessionResolution | string;
  sessionResolutionNotice?: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    selectionPreview?: SelectionPreview;
    cellOutputPreview?: SelectionPreview;
  }>;
  effectiveSandbox?: string;
}

export interface ServerOutputMessage extends ServerMessageBase {
  type: 'output';
  runId: string;
  sessionId: string;
  sessionContextKey?: string;
  notebookPath: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface ServerEventMessage extends ServerMessageBase {
  type: 'event';
  runId: string;
  sessionId: string;
  sessionContextKey?: string;
  notebookPath: string;
  payload: unknown;
}

export interface ServerDoneMessage extends ServerMessageBase {
  type: 'done';
  runId: string;
  sessionId: string;
  sessionContextKey?: string;
  notebookPath: string;
  exitCode: number | null;
  cancelled?: boolean;
  fileChanged?: boolean;
  runMode?: RunMode;
  pairedOk?: boolean;
  pairedPath?: string;
  pairedOsPath?: string;
  pairedMessage?: string;
  notebookMode?: string;
}

export interface ServerErrorMessage extends ServerMessageBase {
  type: 'error';
  runId?: string;
  sessionId?: string;
  sessionContextKey?: string;
  notebookPath?: string;
  message: string;
  runMode?: RunMode;
  suggestedCommandPath?: string;
  pairedOk?: boolean;
  pairedPath?: string;
  pairedOsPath?: string;
  pairedMessage?: string;
  notebookMode?: string;
}

export type ServerMessage =
  | ServerCliDefaultsMessage
  | ServerRateLimitsMessage
  | ServerDeleteAllSessionsMessage
  | ServerStatusMessage
  | ServerOutputMessage
  | ServerEventMessage
  | ServerDoneMessage
  | ServerErrorMessage;

export interface ParsedServerStartSessionMessage {
  type: 'start_session';
  sessionId: string;
  sessionContextKey: string;
  notebookPath: string;
  forceNewThread: boolean;
  commandPath: string;
}

export interface ParsedClientSendMessage {
  type: 'send';
  sessionId: string;
  sessionContextKey: string;
  content: string;
  notebookPath: string;
  commandPath: string;
  model: string;
  reasoningEffort: string;
  sandbox: string;
  selection: string;
  cellOutput: string;
  images: unknown[];
  uiSelectionPreview?: unknown;
  uiCellOutputPreview?: unknown;
  selectionTruncated: boolean;
  cellOutputTruncated: boolean;
}

export interface ParsedClientDeleteSessionMessage {
  type: 'delete_session';
  sessionId: string;
}

export interface ParsedClientCancelMessage {
  type: 'cancel';
  runId: string;
}

export interface ParsedClientEndSessionMessage {
  type: 'end_session';
  sessionId: string;
}

export interface ParsedClientRefreshRateLimitsMessage {
  type: 'refresh_rate_limits';
}

export interface ParsedClientDeleteAllSessionsMessage {
  type: 'delete_all_sessions';
}

export interface ParsedClientStartSessionMessage {
  type: 'start_session';
  sessionId: string;
  notebookPath: string;
  sessionContextKey: string;
  forceNewThread: boolean;
  commandPath: string;
}

export type ParsedClientMessage =
  | ParsedClientSendMessage
  | ParsedClientDeleteSessionMessage
  | ParsedClientDeleteAllSessionsMessage
  | ParsedClientCancelMessage
  | ParsedClientEndSessionMessage
  | ParsedClientRefreshRateLimitsMessage
  | ParsedClientStartSessionMessage;

export interface ClientStartSessionMessage {
  type: 'start_session';
  sessionId: string;
  notebookPath: string;
  sessionContextKey: string;
  forceNewThread: boolean;
  commandPath?: string;
}

export interface ClientSendMessage {
  type: 'send';
  sessionId: string;
  sessionContextKey: string;
  content: string;
  notebookPath: string;
  commandPath?: string;
  model: string;
  reasoningEffort: string;
  sandbox: string;
  selection?: string;
  cellOutput?: string;
  images?: { name: string; dataUrl: string }[];
  uiSelectionPreview?: unknown;
  uiCellOutputPreview?: unknown;
  selectionTruncated?: boolean;
  cellOutputTruncated?: boolean;
}

export interface ClientCancelMessage {
  type: 'cancel';
  runId: string;
}

export interface ClientDeleteSessionMessage {
  type: 'delete_session';
  sessionId: string;
}

export interface ClientDeleteAllSessionsMessage {
  type: 'delete_all_sessions';
}

export type ClientMessage =
  | ClientStartSessionMessage
  | ClientSendMessage
  | ClientCancelMessage
  | ClientDeleteSessionMessage
  | ClientDeleteAllSessionsMessage;

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string' && (raw === null || typeof raw !== 'object')) {
    return null;
  }
  const parsed = typeof raw === 'string' ? parseJson(raw) : raw;
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  const message = parsed as Record<string, unknown>;
  const type = typeof message.type === 'string' ? message.type : '';
  if (!type) {
    return null;
  }

  switch (type) {
    case 'cli_defaults':
      const cliDefaultsMessage: ServerCliDefaultsMessage = {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined
      };
      if (Object.prototype.hasOwnProperty.call(message, 'model')) {
        cliDefaultsMessage.model =
          typeof message.model === 'string' || message.model === null ? (message.model as string | null) : null;
      }
      if (Object.prototype.hasOwnProperty.call(message, 'reasoningEffort')) {
        cliDefaultsMessage.reasoningEffort =
          typeof message.reasoningEffort === 'string' || message.reasoningEffort === null
            ? (message.reasoningEffort as string | null)
            : null;
      }
      if (Object.prototype.hasOwnProperty.call(message, 'availableModels')) {
        cliDefaultsMessage.availableModels = parseModelCatalog(
          Array.isArray(message.availableModels) ? message.availableModels : []
        );
      }
      return cliDefaultsMessage;
    case 'rate_limits':
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        snapshot: message.snapshot ?? null
      } as ServerRateLimitsMessage;
    case 'delete_all_sessions':
      if (
        typeof message.ok !== 'boolean' ||
        !Number.isFinite(Number(message.deletedCount)) ||
        !Number.isFinite(Number(message.failedCount)) ||
        typeof message.message !== 'string'
      ) {
        return null;
      }
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        ok: message.ok,
        deletedCount: Number(message.deletedCount),
        failedCount: Number(message.failedCount),
        message: message.message
      } as ServerDeleteAllSessionsMessage;
    case 'status':
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        state: message.state === 'running' ? 'running' : 'ready',
        runId: typeof message.runId === 'string' ? message.runId : undefined,
        sessionId: typeof message.sessionId === 'string' ? message.sessionId : undefined,
        sessionContextKey: typeof message.sessionContextKey === 'string' ? message.sessionContextKey : undefined,
        notebookPath: typeof message.notebookPath === 'string' ? message.notebookPath : undefined,
        runMode: message.runMode === 'fallback' ? 'fallback' : message.runMode === 'resume' ? 'resume' : undefined,
        pairedOk: typeof message.pairedOk === 'boolean' ? message.pairedOk : undefined,
        pairedPath: typeof message.pairedPath === 'string' ? message.pairedPath : undefined,
        pairedOsPath: typeof message.pairedOsPath === 'string' ? message.pairedOsPath : undefined,
        pairedMessage: typeof message.pairedMessage === 'string' ? message.pairedMessage : undefined,
        notebookMode: typeof message.notebookMode === 'string' ? message.notebookMode : undefined,
        sessionResolution: typeof message.sessionResolution === 'string' ? message.sessionResolution : undefined,
        sessionResolutionNotice:
          typeof message.sessionResolutionNotice === 'string' ? message.sessionResolutionNotice : undefined,
        history: Array.isArray(message.history) ? (message.history as ServerStatusMessage['history']) : undefined,
        effectiveSandbox: typeof message.effectiveSandbox === 'string' ? message.effectiveSandbox : undefined
      };
    case 'output':
      if (
        typeof message.runId !== 'string' ||
        typeof message.sessionId !== 'string' ||
        typeof message.notebookPath !== 'string' ||
        typeof message.text !== 'string'
      ) {
        return null;
      }
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        runId: message.runId,
        sessionId: message.sessionId,
        sessionContextKey: typeof message.sessionContextKey === 'string' ? message.sessionContextKey : undefined,
        notebookPath: message.notebookPath,
        role: typeof message.role === 'string' ? (message.role as 'user' | 'assistant' | 'system') : 'assistant',
        text: message.text
      };
    case 'event':
      if (
        typeof message.runId !== 'string' ||
        typeof message.sessionId !== 'string' ||
        typeof message.notebookPath !== 'string'
      ) {
        return null;
      }
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        runId: message.runId,
        sessionId: message.sessionId,
        sessionContextKey: typeof message.sessionContextKey === 'string' ? message.sessionContextKey : undefined,
        notebookPath: message.notebookPath,
        payload: message.payload
      } as ServerEventMessage;
    case 'done':
      if (
        typeof message.runId !== 'string' ||
        typeof message.sessionId !== 'string' ||
        typeof message.notebookPath !== 'string'
      ) {
        return null;
      }
      let exitCode: number | null = null;
      if (message.exitCode === null) {
        exitCode = null;
      } else if (typeof message.exitCode === 'number' && Number.isFinite(message.exitCode)) {
        exitCode = message.exitCode;
      } else if (typeof message.exitCode === 'string') {
        const parsedExitCode = Number(message.exitCode.trim());
        exitCode = Number.isFinite(parsedExitCode) ? parsedExitCode : null;
      }
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        runId: message.runId,
        sessionId: message.sessionId,
        sessionContextKey: typeof message.sessionContextKey === 'string' ? message.sessionContextKey : undefined,
        notebookPath: message.notebookPath,
        exitCode,
        cancelled: typeof message.cancelled === 'boolean' ? message.cancelled : false,
        fileChanged: typeof message.fileChanged === 'boolean' ? message.fileChanged : false,
        runMode: message.runMode === 'fallback' ? 'fallback' : message.runMode === 'resume' ? 'resume' : undefined,
        pairedOk: typeof message.pairedOk === 'boolean' ? message.pairedOk : undefined,
        pairedPath: typeof message.pairedPath === 'string' ? message.pairedPath : undefined,
        pairedOsPath: typeof message.pairedOsPath === 'string' ? message.pairedOsPath : undefined,
        pairedMessage: typeof message.pairedMessage === 'string' ? message.pairedMessage : undefined,
        notebookMode: typeof message.notebookMode === 'string' ? message.notebookMode : undefined
      };
    case 'error':
      if (typeof message.message !== 'string') {
        return null;
      }
      return {
        type,
        protocolVersion: typeof message.protocolVersion === 'string' ? message.protocolVersion : undefined,
        runId: typeof message.runId === 'string' ? message.runId : undefined,
        sessionId: typeof message.sessionId === 'string' ? message.sessionId : undefined,
        sessionContextKey: typeof message.sessionContextKey === 'string' ? message.sessionContextKey : undefined,
        notebookPath: typeof message.notebookPath === 'string' ? message.notebookPath : undefined,
        message: message.message,
        runMode: message.runMode === 'fallback' ? 'fallback' : message.runMode === 'resume' ? 'resume' : undefined,
        suggestedCommandPath:
          typeof message.suggestedCommandPath === 'string' ? message.suggestedCommandPath : undefined,
        pairedOk: typeof message.pairedOk === 'boolean' ? message.pairedOk : undefined,
        pairedPath: typeof message.pairedPath === 'string' ? message.pairedPath : undefined,
        pairedOsPath: typeof message.pairedOsPath === 'string' ? message.pairedOsPath : undefined,
        pairedMessage: typeof message.pairedMessage === 'string' ? message.pairedMessage : undefined,
        notebookMode: typeof message.notebookMode === 'string' ? message.notebookMode : undefined
      };
  }
  return null;
}

export function parseModelCatalog(rawModels: unknown): ModelCatalogEntry[] {
  if (!Array.isArray(rawModels)) {
    return [];
  }
  const seen = new Set<string>();
  const catalog: ModelCatalogEntry[] = [];
  for (const item of rawModels) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rawModel = (item as Record<string, unknown>).model;
    const rawDisplayName = (item as Record<string, unknown>).displayName;
    const rawReasoningEfforts =
      (item as Record<string, unknown>).reasoningEfforts ??
      (item as Record<string, unknown>).supportedReasoningEfforts;
    const rawDefaultReasoningEffort = (item as Record<string, unknown>).defaultReasoningEffort;
    if (typeof rawModel !== 'string') {
      continue;
    }
    const model = rawModel.trim();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    const displayName =
      typeof rawDisplayName === 'string' && rawDisplayName.trim() ? rawDisplayName.trim() : model;
    const defaultReasoningEffort =
      typeof rawDefaultReasoningEffort === 'string' && rawDefaultReasoningEffort.trim()
        ? rawDefaultReasoningEffort.trim()
        : '';

    const reasoningEfforts = Array.isArray(rawReasoningEfforts)
      ? rawReasoningEfforts.reduce<string[]>((acc, effortCandidate: unknown) => {
          const effort = coerceReasoningEffortEntry(effortCandidate);
          if (!effort || acc.includes(effort)) {
            return acc;
          }
          acc.push(effort);
          return acc;
        }, [])
      : [];

    catalog.push({
      model,
      displayName,
      ...(reasoningEfforts.length > 0 ? { reasoningEfforts } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {})
    });
  }
  return catalog;
}

export function buildStartSessionMessage(input: {
  sessionId: string;
  sessionContextKey: string;
  notebookPath: string;
  forceNewThread?: boolean;
  commandPath?: string;
}): ClientStartSessionMessage {
  return {
    type: 'start_session',
    sessionId: input.sessionId,
    sessionContextKey: input.sessionContextKey,
    notebookPath: input.notebookPath,
    forceNewThread: input.forceNewThread === true,
    commandPath: input.commandPath ? input.commandPath.trim() : undefined
  };
}

export function buildSendMessage(input: {
  sessionId: string;
  sessionContextKey: string;
  notebookPath: string;
  commandPath: string;
  content: string;
  model: string;
  reasoningEffort: string;
  sandbox: string;
  selection?: string;
  cellOutput?: string;
  images?: { name: string; dataUrl: string }[];
  uiSelectionPreview?: unknown;
  uiCellOutputPreview?: unknown;
  selectionTruncated?: boolean;
  cellOutputTruncated?: boolean;
}): ClientSendMessage {
  return {
    type: 'send',
    sessionId: input.sessionId,
    sessionContextKey: input.sessionContextKey,
    notebookPath: input.notebookPath,
    ...(input.commandPath ? { commandPath: input.commandPath } : {}),
    content: input.content,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    sandbox: input.sandbox,
    ...(input.selection ? { selection: input.selection } : {}),
    ...(input.cellOutput ? { cellOutput: input.cellOutput } : {}),
    ...(input.images ? { images: input.images } : {}),
    ...(input.uiSelectionPreview ? { uiSelectionPreview: input.uiSelectionPreview } : {}),
    ...(input.uiCellOutputPreview ? { uiCellOutputPreview: input.uiCellOutputPreview } : {}),
    ...(input.selectionTruncated ? { selectionTruncated: true } : {}),
    ...(input.cellOutputTruncated ? { cellOutputTruncated: true } : {})
  };
}

export function buildCancelMessage(runId: string): ClientCancelMessage {
  return {
    type: 'cancel',
    runId
  };
}

export function buildDeleteSessionMessage(sessionId: string): ClientDeleteSessionMessage {
  return {
    type: 'delete_session',
    sessionId
  };
}

export function buildDeleteAllSessionsMessage(): ClientDeleteAllSessionsMessage {
  return {
    type: 'delete_all_sessions'
  };
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function coerceReasoningEffortEntry(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (
    value &&
    typeof value === 'object' &&
    'reasoningEffort' in (value as Record<string, unknown>)
  ) {
    const candidate = (value as { reasoningEffort?: unknown }).reasoningEffort;
    return typeof candidate === 'string' ? candidate.trim() : '';
  }
  return '';
}
