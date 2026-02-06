import React, { useEffect, useRef, useState } from 'react';
import { ReactWidget, Dialog, showDialog } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';
import type { DocumentRegistry } from '@jupyterlab/docregistry';

export class CodexPanel extends ReactWidget {
  private _notebooks: INotebookTracker;
  private _currentContext: DocumentRegistry.IContext<DocumentRegistry.IModel> | null = null;

  constructor(notebooks: INotebookTracker) {
    super();
    this._notebooks = notebooks;
    this.addClass('jp-CodexPanel');

    this._notebooks.currentChanged.connect(this._onNotebookChanged, this);
    this._onNotebookChanged();
  }

  render(): JSX.Element {
    return <CodexChat notebooks={this._notebooks} />;
  }

  private _onNotebookChanged(): void {
    if (this._currentContext) {
      this._currentContext.fileChanged.disconnect(this._onFileChanged, this);
    }

    const widget = this._notebooks.currentWidget;
    this._currentContext = widget ? widget.context : null;

    if (this._currentContext) {
      this._currentContext.fileChanged.connect(this._onFileChanged, this);
    }
  }

  private async _onFileChanged(): Promise<void> {
    if (!this._currentContext) {
      return;
    }

    const result = await showDialog({
      title: 'File changed on disk',
      body: 'The paired Jupytext file was modified. Reload this notebook?\n(Unsaved changes will be lost.)',
      buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Reload' })]
    });

    if (result.button.accept) {
      await this._currentContext.revert();
    }
  }
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

type RunState = 'ready' | 'running';
type PanelStatus = 'disconnected' | RunState;

type CodexChatProps = {
  notebooks: INotebookTracker;
};

type NotebookSession = {
  threadId: string;
  messages: ChatMessage[];
  runState: RunState;
  activeRunId: string | null;
};

type ModelOptionValue =
  | '__config__'
  | 'gpt-5.3-codex'
  | 'gpt-5.2-codex'
  | 'gpt-5.1-codex-max'
  | 'gpt-5.2'
  | 'gpt-5.1-codex-mini'
  | '__custom__';
type ModelOption = {
  label: string;
  value: ModelOptionValue;
};

const MODEL_OPTIONS: ModelOption[] = [
  { label: 'From CLI config', value: '__config__' },
  { label: 'GPT-5.3 Codex', value: 'gpt-5.3-codex' },
  { label: 'GPT-5.2 Codex', value: 'gpt-5.2-codex' },
  { label: 'GPT-5.1 Codex Max', value: 'gpt-5.1-codex-max' },
  { label: 'GPT-5.2', value: 'gpt-5.2' },
  { label: 'GPT-5.1 Codex Mini', value: 'gpt-5.1-codex-mini' },
  { label: 'Custom', value: '__custom__' }
];
const DEFAULT_MODEL = '';
const REASONING_OPTIONS = [
  { label: 'From CLI config', value: '__config__' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Extra high', value: 'xhigh' }
] as const;
type ReasoningOptionValue = (typeof REASONING_OPTIONS)[number]['value'];
const AUTO_SAVE_STORAGE_KEY = 'jupyterlab-codex:auto-save-before-send';
const MODEL_STORAGE_KEY = 'jupyterlab-codex:model';
const CUSTOM_MODEL_STORAGE_KEY = 'jupyterlab-codex:custom-model';
const REASONING_STORAGE_KEY = 'jupyterlab-codex:reasoning-effort';

function isKnownModelOption(value: string): value is ModelOptionValue {
  return MODEL_OPTIONS.some(option => option.value === value);
}

function createSession(path: string, intro: string): NotebookSession {
  return {
    threadId: crypto.randomUUID(),
    runState: 'ready',
    activeRunId: null,
    messages: [{ role: 'system', text: intro || `세션 시작: ${path || 'Untitled'}` }]
  };
}

function readStoredModel(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.localStorage.getItem(MODEL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readStoredCustomModel(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.localStorage.getItem(CUSTOM_MODEL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readStoredAutoSave(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    return window.localStorage.getItem(AUTO_SAVE_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function readStoredReasoningEffort(): ReasoningOptionValue {
  if (typeof window === 'undefined') {
    return '__config__';
  }
  try {
    const stored = window.localStorage.getItem(REASONING_STORAGE_KEY) ?? '';
    return REASONING_OPTIONS.some(option => option.value === stored)
      ? (stored as ReasoningOptionValue)
      : '__config__';
  } catch {
    return '__config__';
  }
}

function persistModel(model: string, customModel: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    window.localStorage.setItem(CUSTOM_MODEL_STORAGE_KEY, customModel);
  } catch {
    // Ignore storage errors; selector still works for current session.
  }
}

function persistAutoSave(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors; selector still works for current session.
  }
}

function persistReasoningEffort(value: ReasoningOptionValue): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(REASONING_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors; selector still works for current session.
  }
}

function CodexChat(props: CodexChatProps): JSX.Element {
  const [sessions, setSessions] = useState<Map<string, NotebookSession>>(new Map());
  const sessionsRef = useRef<Map<string, NotebookSession>>(new Map());
  const [currentNotebookPath, setCurrentNotebookPath] = useState<string>('');
  const currentNotebookPathRef = useRef<string>('');
  const [modelOption, setModelOption] = useState<ModelOptionValue>(() => {
    const savedModel = readStoredModel();
    return isKnownModelOption(savedModel) ? savedModel : '__config__';
  });
  const [customModel, setCustomModel] = useState<string>(() => {
    const savedModel = readStoredModel();
    if (savedModel && !isKnownModelOption(savedModel)) {
      return savedModel;
    }
    return readStoredCustomModel();
  });
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningOptionValue>(() =>
    readStoredReasoningEffort()
  );
  const [autoSaveBeforeSend, setAutoSaveBeforeSend] = useState<boolean>(() => readStoredAutoSave());
  const [input, setInput] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [attachCell, setAttachCell] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const runToPathRef = useRef<Map<string, string>>(new Map());
  const pendingRefreshPathsRef = useRef<Set<string>>(new Set());
  const selectedModel = modelOption === '__custom__' ? customModel.trim() : modelOption;
  const selectedReasoningEffort = reasoningEffort === '__config__' ? '' : reasoningEffort;

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    persistModel(selectedModel, customModel.trim());
  }, [selectedModel, customModel]);

  useEffect(() => {
    persistAutoSave(autoSaveBeforeSend);
  }, [autoSaveBeforeSend]);

  useEffect(() => {
    persistReasoningEffort(reasoningEffort);
  }, [reasoningEffort]);

  function replaceSessions(next: Map<string, NotebookSession>): void {
    sessionsRef.current = next;
    setSessions(next);
  }

  function updateSessions(
    updater: (prev: Map<string, NotebookSession>) => Map<string, NotebookSession>
  ): void {
    setSessions(prev => {
      const next = updater(prev);
      sessionsRef.current = next;
      return next;
    });
  }

  function ensureSession(path: string): NotebookSession {
    const normalizedPath = path || '';
    const existing = sessionsRef.current.get(normalizedPath);
    if (existing) {
      return existing;
    }

    const created = createSession(normalizedPath, `세션 시작: ${normalizedPath || 'Untitled'}`);
    const next = new Map(sessionsRef.current);
    next.set(normalizedPath, created);
    replaceSessions(next);
    return created;
  }

  function sendStartSession(session: NotebookSession, notebookPath: string): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'start_session',
        sessionId: session.threadId,
        notebookPath
      })
    );
  }

  function setSessionRunState(path: string, runState: RunState, runId: string | null): void {
    if (!path) {
      return;
    }

    updateSessions(prev => {
      const next = new Map(prev);
      const session = next.get(path) ?? createSession(path, `세션 시작: ${path || 'Untitled'}`);
      next.set(path, { ...session, runState, activeRunId: runId });
      return next;
    });
  }

  function resolveMessagePath(msg: any): string {
    const messagePath = typeof msg.notebookPath === 'string' ? msg.notebookPath : '';
    const runId = typeof msg.runId === 'string' ? msg.runId : '';

    if (messagePath) {
      if (runId) {
        runToPathRef.current.set(runId, messagePath);
      }
      return messagePath;
    }

    if (runId) {
      const mapped = runToPathRef.current.get(runId);
      if (mapped) {
        return mapped;
      }
    }

    return currentNotebookPathRef.current || '';
  }

  function appendMessage(path: string, role: ChatMessage['role'], text: string): void {
    if (!text) {
      return;
    }
    const targetPath = path || currentNotebookPathRef.current || '';
    if (!targetPath) {
      return;
    }

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetPath) ?? createSession(targetPath, `세션 시작: ${targetPath || 'Untitled'}`);
      const messages = session.messages;
      const last = messages[messages.length - 1];

      let updatedMessages: ChatMessage[];
      if (role === 'assistant' && last && last.role === 'assistant') {
        updatedMessages = [...messages.slice(0, -1), { ...last, text: last.text + text }];
      } else {
        updatedMessages = [...messages, { role, text }];
      }

      next.set(targetPath, { ...session, messages: updatedMessages });
      return next;
    });
  }

  function clearRunMappingForPath(path: string): void {
    const runToPath = runToPathRef.current;
    const next = new Map(runToPath);
    for (const [runId, mappedPath] of runToPath) {
      if (mappedPath === path) {
        next.delete(runId);
      }
    }
    runToPathRef.current = next;
  }

  async function refreshNotebook(path: string): Promise<void> {
    const widget = props.notebooks.currentWidget;
    if (!widget || widget.context.path !== path) {
      pendingRefreshPathsRef.current.add(path);
      return;
    }

    const context = widget.context;
    if (context.model.dirty) {
      const result = await showDialog({
        title: 'Notebook has unsaved changes',
        body: 'Codex updated the paired file. Reload notebook now? (Unsaved changes will be lost.)',
        buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Reload' })]
      });
      if (!result.button.accept) {
        pendingRefreshPathsRef.current.add(path);
        return;
      }
    }

    try {
      await context.revert();
      appendMessage(path, 'system', 'Notebook was refreshed after Codex file updates.');
      pendingRefreshPathsRef.current.delete(path);
    } catch (err) {
      appendMessage(path, 'system', `Failed to refresh notebook: ${String(err)}`);
      pendingRefreshPathsRef.current.add(path);
    }
  }

  useEffect(() => {
    const updateNotebook = () => {
      const path = getNotebookPath(props.notebooks);
      const previous = currentNotebookPathRef.current;

      if (path === previous) {
        return;
      }

      currentNotebookPathRef.current = path;
      setCurrentNotebookPath(path);
      setInput('');

      if (!path) {
        return;
      }

      const session = ensureSession(path);
      sendStartSession(session, path);
      if (pendingRefreshPathsRef.current.has(path)) {
        void refreshNotebook(path);
      }
    };

    updateNotebook();
    props.notebooks.currentChanged.connect(updateNotebook);

    return () => {
      props.notebooks.currentChanged.disconnect(updateNotebook);
    };
  }, [props.notebooks]);

  useEffect(() => {
    const settings = ServerConnection.makeSettings();
    const wsUrl = URLExt.join(settings.wsUrl, 'codex', 'ws');
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setSocketConnected(true);

      const notebookPath = currentNotebookPathRef.current || getNotebookPath(props.notebooks);
      if (!notebookPath) {
        return;
      }

      const session = ensureSession(notebookPath);
      sendStartSession(session, notebookPath);
    };

    socket.onclose = () => {
      setSocketConnected(false);
      runToPathRef.current = new Map();
    };

    socket.onmessage = event => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        appendMessage(currentNotebookPathRef.current, 'system', `Invalid message: ${String(event.data)}`);
        return;
      }

      const runId = typeof msg.runId === 'string' ? msg.runId : '';
      const targetPath = resolveMessagePath(msg);

      if (msg.type === 'status') {
        if (msg.state === 'running' && targetPath) {
          setSessionRunState(targetPath, 'running', runId || null);
        } else if (msg.state === 'ready' && targetPath) {
          setSessionRunState(targetPath, 'ready', null);
          if (runId) {
            runToPathRef.current.delete(runId);
          }
        }
        return;
      }

      if (msg.type === 'output') {
        appendMessage(targetPath, 'assistant', msg.text || '');
        return;
      }

      if (msg.type === 'error') {
        appendMessage(targetPath, 'system', msg.message || 'Unknown error');
        if (targetPath) {
          setSessionRunState(targetPath, 'ready', null);
        }
        if (runId) {
          runToPathRef.current.delete(runId);
        }
        return;
      }

      if (msg.type === 'done') {
        const fileChanged = Boolean(msg.fileChanged);
        if (fileChanged && targetPath) {
          void refreshNotebook(targetPath);
        }
        if (targetPath) {
          setSessionRunState(targetPath, 'ready', null);
        }
        if (runId) {
          runToPathRef.current.delete(runId);
        }
      }
    };

    return () => {
      socket.close();
      wsRef.current = null;
      runToPathRef.current = new Map();
    };
  }, [props.notebooks]);

  function startNewThread(): void {
    const path = currentNotebookPathRef.current || '';
    if (!path) {
      return;
    }

    const newSession = createSession(path, `새 스레드 시작: ${new Date().toLocaleTimeString()}`);
    updateSessions(prev => {
      const next = new Map(prev);
      next.set(path, newSession);
      return next;
    });
    clearRunMappingForPath(path);
    setInput('');
    sendStartSession(newSession, path);
  }

  async function sendMessage(): Promise<void> {
    const socket = wsRef.current;
    const notebookPath = currentNotebookPathRef.current || '';

    if (!notebookPath) {
      return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendMessage(notebookPath, 'system', 'WebSocket is not connected.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    if (modelOption === '__custom__' && !selectedModel) {
      appendMessage(notebookPath, 'system', 'Select a model before sending.');
      return;
    }

    const current = sessionsRef.current.get(notebookPath);
    if (current?.runState === 'running') {
      return;
    }

    const widget = props.notebooks.currentWidget;
    if (autoSaveBeforeSend && widget && widget.context.model.dirty) {
      try {
        await widget.context.save();
      } catch (err) {
        appendMessage(notebookPath, 'system', `Auto-save failed: ${String(err)}`);
        return;
      }
    }

    const selection = attachCell ? getActiveCellText(props.notebooks) : '';
    const session = ensureSession(notebookPath);

    socket.send(
      JSON.stringify({
        type: 'send',
        sessionId: session.threadId,
        content: trimmed,
        selection,
        notebookPath,
        model: selectedModel || undefined,
        reasoningEffort: selectedReasoningEffort || undefined
      })
    );

    appendMessage(notebookPath, 'user', trimmed);
    setSessionRunState(notebookPath, 'running', null);
    setInput('');
  }

  const currentSession = currentNotebookPath ? sessions.get(currentNotebookPath) : null;
  const messages = currentSession?.messages ?? [];
  const status: PanelStatus = socketConnected ? currentSession?.runState ?? 'ready' : 'disconnected';
  const displayPath = currentNotebookPath
    ? currentNotebookPath.split('/').pop() || 'Untitled'
    : 'No notebook';
  const canSend =
    status === 'ready' &&
    currentNotebookPath.length > 0 &&
    (modelOption !== '__custom__' || selectedModel.length > 0);

  return (
    <div className="jp-CodexChat">
      <div className="jp-CodexChat-header">
        <div className="jp-CodexChat-header-top">
          <span className={`jp-CodexChat-status jp-CodexChat-status-${status}`}>{status}</span>
          <span className="jp-CodexChat-notebook">{displayPath}</span>
          <button
            onClick={startNewThread}
            className="jp-CodexChat-newthread"
            disabled={!currentNotebookPath || status === 'running'}
          >
            New Thread
          </button>
        </div>
        <div className="jp-CodexChat-controls">
          <label className="jp-CodexChat-model">
            <span>Model</span>
            <select
              value={modelOption}
              onChange={e => setModelOption(e.currentTarget.value as ModelOptionValue)}
              disabled={status === 'running'}
            >
              {MODEL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="jp-CodexChat-model">
            <span>Reasoning</span>
            <select
              value={reasoningEffort}
              onChange={e => setReasoningEffort(e.currentTarget.value as ReasoningOptionValue)}
              disabled={status === 'running'}
            >
              {REASONING_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {modelOption === '__custom__' && (
            <input
              className="jp-CodexChat-model-input"
              value={customModel}
              onChange={e => setCustomModel(e.currentTarget.value)}
              placeholder={DEFAULT_MODEL || 'gpt-5.3-codex'}
              disabled={status === 'running'}
            />
          )}
          <label className="jp-CodexChat-toggle">
            <input
              type="checkbox"
              checked={attachCell}
              onChange={e => setAttachCell(e.currentTarget.checked)}
            />
            Attach active cell
          </label>
          <label className="jp-CodexChat-toggle">
            <input
              type="checkbox"
              checked={autoSaveBeforeSend}
              onChange={e => setAutoSaveBeforeSend(e.currentTarget.checked)}
              disabled={status === 'running'}
            />
            Auto-save before send
          </label>
        </div>
      </div>
      <div className="jp-CodexChat-messages">
        {messages.length === 0 && (
          <div className="jp-CodexChat-message jp-CodexChat-system">
            <div className="jp-CodexChat-role">system</div>
            <div className="jp-CodexChat-text">노트북을 선택한 뒤 대화를 시작하세요.</div>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`jp-CodexChat-message jp-CodexChat-${msg.role}`}>
            <div className="jp-CodexChat-role">{msg.role}</div>
            <div className="jp-CodexChat-text">{msg.text}</div>
          </div>
        ))}
        {status === 'running' && (
          <div className="jp-CodexChat-loading">
            <div className="jp-CodexChat-loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>
      <div className="jp-CodexChat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.currentTarget.value)}
          placeholder={currentNotebookPath ? 'Ask Codex...' : 'Select a notebook first'}
          rows={3}
          disabled={!canSend}
        />
        <button onClick={() => void sendMessage()} disabled={!canSend || !input.trim()}>
          {status === 'running' ? 'Sending...' : status === 'disconnected' ? 'Connecting...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function getNotebookPath(notebooks: INotebookTracker): string {
  return notebooks.currentWidget ? notebooks.currentWidget.context.path : '';
}

function getActiveCellText(notebooks: INotebookTracker): string {
  const widget = notebooks.currentWidget;
  if (!widget) {
    return '';
  }
  const activeCell = widget.content.activeCell;
  return activeCell ? activeCell.model.sharedModel.getSource() : '';
}
