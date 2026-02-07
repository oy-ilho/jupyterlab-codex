import React, { useEffect, useRef, useState } from 'react';
import { ReactWidget, Dialog, showDialog } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ServerConnection } from '@jupyterlab/services';
import { URLExt } from '@jupyterlab/coreutils';
import type { DocumentRegistry } from '@jupyterlab/docregistry';

function PlusIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 19V5m0 0l-7 7m7-7l7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GearIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 12a7.5 7.5 0 0 0-.1-1l2-1.6-1.9-3.2-2.4 1a8 8 0 0 0-1.8-1l-.4-2.5H9.2l-.4 2.5a8 8 0 0 0-1.8 1l-2.4-1-1.9 3.2 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 1.9 3.2 2.4-1a8 8 0 0 0 1.8 1l.4 2.5h5.6l.4-2.5a8 8 0 0 0 1.8-1l2.4 1 1.9-3.2-2-1.6c.1-.3.1-.7.1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M21 11.5 12.8 19.7a6 6 0 0 1-8.5-8.5L12.9 2.6a4.5 4.5 0 1 1 6.4 6.4L10.7 17.6a3 3 0 0 1-4.2-4.2l8.3-8.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChipIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="7"
        y="7"
        width="10"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function GaugeIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M5 16a7 7 0 1 1 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 13l3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 16h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReasoningEffortIcon(
  props: React.SVGProps<SVGSVGElement> & { effort: ReasoningOptionValue }
): JSX.Element {
  const { effort, ...svgProps } = props;
  if (effort === '__config__') {
    return <GaugeIcon {...svgProps} />;
  }
  const activeBars =
    effort === 'low' ? 1 : effort === 'medium' ? 2 : effort === 'high' ? 3 : effort === 'xhigh' ? 4 : 0;

  const bars = [
    { x: 6, top: 14 },
    { x: 10, top: 10 },
    { x: 14, top: 6 },
    { x: 18, top: 2 }
  ];

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      {bars.map((bar, idx) => (
        <path
          key={idx}
          d={`M${bar.x} 20V${bar.top}`}
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity={idx < activeBars ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

type ActivityLevel = 'info' | 'warn' | 'error';
type ActivityItem = {
  id: string;
  ts: number;
  level: ActivityLevel;
  summary: string;
  raw?: any;
};

type RunState = 'ready' | 'running';
type PanelStatus = 'disconnected' | RunState;

type CodexChatProps = {
  notebooks: INotebookTracker;
};

type NotebookSession = {
  threadId: string;
  messages: ChatMessage[];
  activity: ActivityItem[];
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
const SHOW_THINKING_STORAGE_KEY = 'jupyterlab-codex:show-thinking';
const SHOW_RAW_EVENTS_STORAGE_KEY = 'jupyterlab-codex:show-raw-events';
const SETTINGS_OPEN_STORAGE_KEY = 'jupyterlab-codex:settings-open';

const MAX_ACTIVITY_ITEMS = 400;

function isKnownModelOption(value: string): value is ModelOptionValue {
  return MODEL_OPTIONS.some(option => option.value === value);
}

function createSession(path: string, intro: string): NotebookSession {
  return {
    threadId: crypto.randomUUID(),
    runState: 'ready',
    activeRunId: null,
    messages: [{ role: 'system', text: intro || `세션 시작: ${path || 'Untitled'}` }],
    activity: []
  };
}

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors; settings still work for current session.
  }
}

function readStoredModel(): string {
  return safeLocalStorageGet(MODEL_STORAGE_KEY) ?? '';
}

function readStoredCustomModel(): string {
  return safeLocalStorageGet(CUSTOM_MODEL_STORAGE_KEY) ?? '';
}

function readStoredAutoSave(): boolean {
  return (safeLocalStorageGet(AUTO_SAVE_STORAGE_KEY) ?? 'true') !== 'false';
}

function readStoredReasoningEffort(): ReasoningOptionValue {
  try {
    const stored = safeLocalStorageGet(REASONING_STORAGE_KEY) ?? '';
    return REASONING_OPTIONS.some(option => option.value === stored)
      ? (stored as ReasoningOptionValue)
      : '__config__';
  } catch {
    return '__config__';
  }
}

function persistModel(model: string, customModel: string): void {
  safeLocalStorageSet(MODEL_STORAGE_KEY, model);
  safeLocalStorageSet(CUSTOM_MODEL_STORAGE_KEY, customModel);
}

function persistAutoSave(enabled: boolean): void {
  safeLocalStorageSet(AUTO_SAVE_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistReasoningEffort(value: ReasoningOptionValue): void {
  safeLocalStorageSet(REASONING_STORAGE_KEY, value);
}

function readStoredShowThinking(): boolean {
  return (safeLocalStorageGet(SHOW_THINKING_STORAGE_KEY) ?? 'true') !== 'false';
}

function readStoredShowRawEvents(): boolean {
  return (safeLocalStorageGet(SHOW_RAW_EVENTS_STORAGE_KEY) ?? 'false') === 'true';
}

function readStoredSettingsOpen(): boolean {
  return (safeLocalStorageGet(SETTINGS_OPEN_STORAGE_KEY) ?? 'false') === 'true';
}

function persistShowThinking(enabled: boolean): void {
  safeLocalStorageSet(SHOW_THINKING_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistShowRawEvents(enabled: boolean): void {
  safeLocalStorageSet(SHOW_RAW_EVENTS_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistSettingsOpen(enabled: boolean): void {
  safeLocalStorageSet(SETTINGS_OPEN_STORAGE_KEY, enabled ? 'true' : 'false');
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const ellipsis = '...';
  if (max <= ellipsis.length) {
    return value.slice(0, max);
  }
  const head = Math.max(0, Math.floor((max - ellipsis.length) * 0.6));
  const tail = Math.max(0, max - head - ellipsis.length);
  return `${value.slice(0, head)}${ellipsis}${value.slice(value.length - tail)}`;
}

function safePreview(value: unknown, max = 220): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return truncateMiddle(value, max);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return truncateMiddle(JSON.stringify(value), max);
  } catch {
    return '';
  }
}

function redactEventPayload(value: any, depth = 0): any {
  const MAX_DEPTH = 6;
  const MAX_STRING = 2000;
  const MAX_ARRAY = 50;
  const MAX_KEYS = 120;
  const REDACT_KEYS = new Set([
    'analysis',
    'reasoning',
    'chain_of_thought',
    'cot',
    'system_prompt',
    'prompt',
    'instructions',
    'input',
    'raw_prompt'
  ]);

  if (value == null) {
    return value;
  }
  if (depth > MAX_DEPTH) {
    return '[omitted]';
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) {
      return `${value.slice(0, MAX_STRING)}... [truncated]`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const trimmed = value.length > MAX_ARRAY ? value.slice(0, MAX_ARRAY) : value;
    const mapped = trimmed.map(item => redactEventPayload(item, depth + 1));
    if (value.length > MAX_ARRAY) {
      mapped.push(`[omitted ${value.length - MAX_ARRAY} more]`);
    }
    return mapped;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    const entries = Object.entries(value as Record<string, any>);
    const trimmed = entries.length > MAX_KEYS ? entries.slice(0, MAX_KEYS) : entries;
    for (const [key, item] of trimmed) {
      if (REDACT_KEYS.has(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redactEventPayload(item, depth + 1);
    }
    if (entries.length > MAX_KEYS) {
      out.__omitted__ = `[omitted ${entries.length - MAX_KEYS} more keys]`;
    }
    return out;
  }

  try {
    return safePreview(value);
  } catch {
    return '[unserializable]';
  }
}

function summarizeCodexEvent(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return 'event';
  }

  const type =
    (typeof payload.type === 'string' && payload.type) ||
    (typeof payload.event === 'string' && payload.event) ||
    'event';

  // Common Codex CLI shape: { type: "item.completed", item: { type: "...", ... } }
  if (type === 'item.completed' && payload.item && typeof payload.item === 'object') {
    const itemType = typeof payload.item.type === 'string' ? payload.item.type : '';
    const toolName =
      (typeof payload.item.tool_name === 'string' && payload.item.tool_name) ||
      (typeof payload.item.tool === 'string' && payload.item.tool) ||
      (typeof payload.item.name === 'string' && payload.item.name) ||
      '';
    const path =
      (typeof payload.item.path === 'string' && payload.item.path) ||
      (typeof payload.item.filename === 'string' && payload.item.filename) ||
      '';

    if (itemType && toolName) {
      return `${type}: ${itemType} (${toolName})${path ? ` ${truncateMiddle(path, 80)}` : ''}`;
    }
    if (itemType) {
      return `${type}: ${itemType}`;
    }
  }

  const label =
    (typeof payload.name === 'string' && payload.name) ||
    (typeof payload.label === 'string' && payload.label) ||
    (typeof payload.tool_name === 'string' && payload.tool_name) ||
    (typeof payload.tool === 'string' && payload.tool) ||
    '';
  if (label && label !== type) {
    return `${type}: ${truncateMiddle(label, 120)}`;
  }

  const commandHint = safePreview(payload.command);
  if (commandHint) {
    return `${type}: ${commandHint}`;
  }

  const pathHint = safePreview(payload.path);
  if (pathHint) {
    return `${type}: ${pathHint}`;
  }

  return type;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browser contexts.
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

type MessageBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lang: string; code: string };

function splitFencedCodeBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let rest = text;

  while (rest.length > 0) {
    const fenceStart = rest.indexOf('```');
    if (fenceStart === -1) {
      blocks.push({ kind: 'text', text: rest });
      break;
    }

    if (fenceStart > 0) {
      blocks.push({ kind: 'text', text: rest.slice(0, fenceStart) });
    }

    const afterFence = rest.slice(fenceStart + 3);
    const fenceEnd = afterFence.indexOf('```');
    if (fenceEnd === -1) {
      // Unclosed fence; treat as plain text.
      blocks.push({ kind: 'text', text: rest.slice(fenceStart) });
      break;
    }

    const raw = afterFence.slice(0, fenceEnd);
    rest = afterFence.slice(fenceEnd + 3);

    let lang = '';
    let code = raw;
    const firstNewline = raw.indexOf('\n');
    if (firstNewline !== -1) {
      const candidate = raw.slice(0, firstNewline).trim();
      // Avoid interpreting arbitrary first lines as language labels.
      if (candidate.length > 0 && candidate.length <= 20 && /^[A-Za-z0-9+#_.-]+$/.test(candidate)) {
        lang = candidate;
        code = raw.slice(firstNewline + 1);
      }
    }

    blocks.push({ kind: 'code', lang, code: code.replace(/\n$/, '') });
  }

  return blocks.filter(block => (block.kind === 'text' ? block.text.length > 0 : true));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function StatusPill(props: { status: PanelStatus }): JSX.Element {
  const label =
    props.status === 'disconnected' ? 'Disconnected' : props.status === 'running' ? 'Running' : 'Ready';
  return (
    <span className={`jp-CodexStatusPill jp-CodexStatusPill-${props.status}`}>
      <span className="jp-CodexStatusPill-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function CodeBlock(props: { lang: string; code: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyToClipboard(props.code);
    if (!ok) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
  }

  return (
    <div className="jp-CodexCodeBlockWrap">
      <div className="jp-CodexCodeBlockBar">
        <span className="jp-CodexCodeBlockMeta">
          {props.lang ? <span className="jp-CodexCodeBlockLang">{props.lang}</span> : <span />}
        </span>
        <button className="jp-CodexBtn jp-CodexBtn-ghost jp-CodexBtn-xs" onClick={() => void onCopy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="jp-CodexCodeBlock">
        <code>{props.code}</code>
      </pre>
    </div>
  );
}

function MessageText(props: { text: string }): JSX.Element {
  const blocks = splitFencedCodeBlocks(props.text);
  return (
    <div className="jp-CodexChat-text">
      {blocks.map((block, idx) => {
        if (block.kind === 'code') {
          return <CodeBlock key={idx} lang={block.lang} code={block.code} />;
        }
        return <span key={idx}>{block.text}</span>;
      })}
    </div>
  );
}

function ActivityPanel(props: {
  status: PanelStatus;
  items: ActivityItem[];
  showRaw: boolean;
  onClear: () => void;
}): JSX.Element {
  return (
    <div className="jp-CodexActivity">
      <div className="jp-CodexActivityHeader">
        <div className="jp-CodexActivityTitle">
          <span className="jp-CodexActivityLabel">Thinking</span>
          {props.status === 'running' && <span className="jp-CodexActivityPulse" aria-hidden="true" />}
        </div>
        <button className="jp-CodexBtn jp-CodexBtn-ghost jp-CodexBtn-xs" onClick={props.onClear}>
          Clear
        </button>
      </div>
      <div className="jp-CodexActivityBody" role="log" aria-live="polite">
        {props.items.length === 0 && (
          <div className="jp-CodexActivityEmpty">
            {props.status === 'running' ? 'Waiting for events...' : 'No activity yet.'}
          </div>
        )}
        {props.items.map(item => (
          <div key={item.id} className={`jp-CodexActivityRow jp-CodexActivityRow-${item.level}`}>
            <span className="jp-CodexActivityTime">{formatTime(item.ts)}</span>
            <span className="jp-CodexActivitySummary">{item.summary}</span>
            {props.showRaw && item.raw != null && (
              <pre className="jp-CodexActivityRaw">{JSON.stringify(item.raw, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CodexChat(props: CodexChatProps): JSX.Element {
  const [sessions, setSessions] = useState<Map<string, NotebookSession>>(new Map());
  const sessionsRef = useRef<Map<string, NotebookSession>>(new Map());
  const [currentNotebookPath, setCurrentNotebookPath] = useState<string>('');
  const currentNotebookPathRef = useRef<string>('');
  const [modelOption, setModelOption] = useState<ModelOptionValue>(() => {
    const savedModel = readStoredModel();
    if (isKnownModelOption(savedModel)) {
      return savedModel;
    }
    // If we previously stored a custom model name, keep the UI in "Custom" mode.
    return savedModel ? '__custom__' : '__config__';
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
  const [showThinking, setShowThinking] = useState<boolean>(() => readStoredShowThinking());
  const [showRawEvents, setShowRawEvents] = useState<boolean>(() => readStoredShowRawEvents());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => readStoredSettingsOpen());
  const [input, setInput] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [attachCell, setAttachCell] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const runToPathRef = useRef<Map<string, string>>(new Map());
  const pendingRefreshPathsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const modelMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const customModelInputRef = useRef<HTMLInputElement | null>(null);
  const selectedModel =
    modelOption === '__custom__'
      ? customModel.trim()
      : modelOption === '__config__'
        ? ''
        : modelOption;
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

  useEffect(() => {
    persistShowThinking(showThinking);
  }, [showThinking]);

  useEffect(() => {
    persistShowRawEvents(showRawEvents);
  }, [showRawEvents]);

  useEffect(() => {
    persistSettingsOpen(settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    if (!modelMenuOpen) {
      return;
    }
    if (modelOption !== '__custom__') {
      return;
    }
    const id = window.setTimeout(() => customModelInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [modelMenuOpen, modelOption]);

  useEffect(() => {
    if (!modelMenuOpen && !reasoningMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const inModel = modelMenuWrapRef.current?.contains(target) ?? false;
      const inReasoning = reasoningMenuWrapRef.current?.contains(target) ?? false;
      if (inModel || inReasoning) {
        return;
      }

      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modelMenuOpen, reasoningMenuOpen]);

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

  function appendActivity(
    path: string,
    summary: string,
    options?: { level?: ActivityLevel; raw?: any; ts?: number }
  ): void {
    if (!summary) {
      return;
    }
    const targetPath = path || currentNotebookPathRef.current || '';
    if (!targetPath) {
      return;
    }

    const item: ActivityItem = {
      id: crypto.randomUUID(),
      ts: options?.ts ?? Date.now(),
      level: options?.level ?? 'info',
      summary,
      raw: options?.raw != null ? redactEventPayload(options.raw) : undefined
    };

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetPath) ?? createSession(targetPath, `세션 시작: ${targetPath || 'Untitled'}`);
      const activity = [...(session.activity ?? []), item];
      const trimmed =
        activity.length > MAX_ACTIVITY_ITEMS
          ? activity.slice(activity.length - MAX_ACTIVITY_ITEMS)
          : activity;
      next.set(targetPath, { ...session, activity: trimmed });
      return next;
    });
  }

  function clearActivity(path: string): void {
    const targetPath = path || currentNotebookPathRef.current || '';
    if (!targetPath) {
      return;
    }
    updateSessions(prev => {
      const next = new Map(prev);
      const session = next.get(targetPath);
      if (!session) {
        return prev;
      }
      next.set(targetPath, { ...session, activity: [] });
      return next;
    });
  }

  function scrollToBottom(): void {
    endRef.current?.scrollIntoView({ block: 'end' });
  }

  function onScrollMessages(): void {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const threshold = 80;
    const atBottom = node.scrollHeight - (node.scrollTop + node.clientHeight) < threshold;
    setIsAtBottom(atBottom);
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
      setIsAtBottom(true);

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
        appendActivity(currentNotebookPathRef.current, 'ws: invalid message', {
          level: 'error',
          raw: event.data
        });
        return;
      }

      const runId = typeof msg.runId === 'string' ? msg.runId : '';
      const targetPath = resolveMessagePath(msg);

      if (msg.type === 'status') {
        if (msg.state === 'running' && targetPath) {
          setSessionRunState(targetPath, 'running', runId || null);
          appendActivity(targetPath, `run: started${runId ? ` (${runId})` : ''}`, { raw: msg });
        } else if (msg.state === 'ready' && targetPath) {
          setSessionRunState(targetPath, 'ready', null);
          appendActivity(targetPath, `run: ready${runId ? ` (${runId})` : ''}`, { raw: msg });
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

      if (msg.type === 'event') {
        const payload = msg.payload;
        appendActivity(targetPath, summarizeCodexEvent(payload), { raw: payload });
        return;
      }

      if (msg.type === 'error') {
        appendMessage(targetPath, 'system', msg.message || 'Unknown error');
        appendActivity(targetPath, `error: ${msg.message || 'Unknown error'}`, { level: 'error', raw: msg });
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
        const exitCode =
          typeof msg.exitCode === 'number'
            ? String(msg.exitCode)
            : msg.exitCode == null
              ? 'null'
              : String(msg.exitCode);
        appendActivity(
          targetPath,
          `done: exit=${exitCode}${fileChanged ? ', file changed' : ''}${msg.cancelled ? ', cancelled' : ''}`,
          { raw: msg }
        );
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

  useEffect(() => {
    if (!isAtBottom) {
      return;
    }
    const id = window.requestAnimationFrame(() => scrollToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [isAtBottom, sessions, currentNotebookPath, showThinking, showRawEvents, socketConnected]);

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

  function cancelRun(): void {
    const socket = wsRef.current;
    const notebookPath = currentNotebookPathRef.current || '';
    const session = notebookPath ? sessionsRef.current.get(notebookPath) : null;
    const runId = session?.activeRunId ?? null;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendActivity(notebookPath, 'cancel: websocket not connected', { level: 'error' });
      return;
    }
    if (!runId) {
      appendActivity(notebookPath, 'cancel: run id not available yet', { level: 'warn' });
      return;
    }

    appendActivity(notebookPath, `cancel: ${runId}`, { level: 'warn' });
    socket.send(JSON.stringify({ type: 'cancel', runId }));
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
  const activity = currentSession?.activity ?? [];
  const status: PanelStatus = socketConnected ? currentSession?.runState ?? 'ready' : 'disconnected';
  const displayPath = currentNotebookPath
    ? currentNotebookPath.split('/').pop() || 'Untitled'
    : 'No notebook';
  const canSend =
    status === 'ready' &&
    currentNotebookPath.length > 0 &&
    (modelOption !== '__custom__' || selectedModel.length > 0);
  const runningSummary =
    status === 'running'
      ? (activity.length ? activity[activity.length - 1].summary : '') || 'Working...'
      : '';
  const selectedModelLabel =
    modelOption === '__custom__'
      ? customModel.trim() || 'Custom'
      : MODEL_OPTIONS.find(option => option.value === modelOption)?.label ?? 'Model';
  const selectedReasoningLabel =
    REASONING_OPTIONS.find(option => option.value === reasoningEffort)?.label ?? 'Reasoning';

  return (
    <div className="jp-CodexChat">
      <div className="jp-CodexChat-header">
        <div className="jp-CodexChat-header-top">
          <StatusPill status={status} />
          <span className="jp-CodexChat-notebook" title={currentNotebookPath || ''}>
            {displayPath}
          </span>
          <div className="jp-CodexChat-header-actions">
            <button
              type="button"
              onClick={startNewThread}
              className="jp-CodexHeaderBtn"
              disabled={!currentNotebookPath || status === 'running'}
              aria-label="New thread"
              title="New thread"
            >
              <PlusIcon width={16} height={16} />
              <span className="jp-CodexHeaderBtn-label">New</span>
            </button>
            <button
              type="button"
              onClick={cancelRun}
              className="jp-CodexHeaderBtn jp-CodexHeaderBtn-danger"
              disabled={status !== 'running' || !currentSession?.activeRunId}
              title={
                currentSession?.activeRunId
                  ? `runId: ${currentSession.activeRunId}`
                  : 'Waiting for run id...'
              }
              aria-label="Stop run"
            >
              <StopIcon width={16} height={16} />
              <span className="jp-CodexHeaderBtn-label">Stop</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(open => !open)}
              className={`jp-CodexHeaderBtn jp-CodexHeaderBtn-icon${settingsOpen ? ' is-active' : ''}`}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              title="Settings"
            >
              <GearIcon width={16} height={16} />
            </button>
          </div>
        </div>
        {runningSummary && (
          <div className="jp-CodexChat-subtitle" title={runningSummary}>
            {runningSummary}
          </div>
        )}

        {settingsOpen && (
          <div className="jp-CodexSettingsPanel">
            <div className="jp-CodexSettingsPanel-top">
              <div className="jp-CodexSettingsPanel-title">Settings</div>
              <button
                type="button"
                className="jp-CodexHeaderBtn jp-CodexHeaderBtn-icon"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                title="Close"
              >
                <XIcon width={16} height={16} />
              </button>
            </div>
            <div className="jp-CodexChat-controls">
              <label className="jp-CodexChat-toggle">
                <input
                  type="checkbox"
                  checked={autoSaveBeforeSend}
                  onChange={e => setAutoSaveBeforeSend(e.currentTarget.checked)}
                  disabled={status === 'running'}
                />
                Auto-save before send
              </label>
              <label className="jp-CodexChat-toggle">
                <input
                  type="checkbox"
                  checked={showThinking}
                  onChange={e => setShowThinking(e.currentTarget.checked)}
                />
                Show thinking
              </label>
              <label className="jp-CodexChat-toggle">
                <input
                  type="checkbox"
                  checked={showRawEvents}
                  onChange={e => setShowRawEvents(e.currentTarget.checked)}
                  disabled={!showThinking}
                />
                Raw events
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="jp-CodexChat-body">
        <div className="jp-CodexChat-messages" ref={scrollRef} onScroll={onScrollMessages}>
          {messages.length === 0 && (
            <div className="jp-CodexChat-message jp-CodexChat-system">
              <div className="jp-CodexChat-role">system</div>
              <div className="jp-CodexChat-text">노트북을 선택한 뒤 대화를 시작하세요.</div>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`jp-CodexChat-message jp-CodexChat-${msg.role}`}>
              <div className="jp-CodexChat-role">{msg.role}</div>
              <div className="jp-CodexChat-message-actions">
                <button
                  className="jp-CodexBtn jp-CodexBtn-ghost jp-CodexBtn-xs"
                  onClick={() => void copyToClipboard(msg.text)}
                >
                  Copy
                </button>
              </div>
              <MessageText text={msg.text} />
            </div>
          ))}

          {showThinking && (
            <ActivityPanel
              status={status}
              items={activity}
              showRaw={showRawEvents}
              onClear={() => clearActivity(currentNotebookPath)}
            />
          )}

          {status === 'running' && !showThinking && (
            <div className="jp-CodexChat-loading" aria-label="Running">
              <div className="jp-CodexChat-loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {!isAtBottom && (
          <div className="jp-CodexJumpBar">
            <button className="jp-CodexBtn jp-CodexBtn-primary jp-CodexBtn-xs" onClick={scrollToBottom}>
              Jump to latest
            </button>
          </div>
        )}
      </div>

      <div className="jp-CodexChat-input">
        <div className="jp-CodexComposer">
          <textarea
            value={input}
            onChange={e => setInput(e.currentTarget.value)}
            placeholder={currentNotebookPath ? 'Ask Codex...' : 'Select a notebook first'}
            rows={3}
            disabled={!canSend}
            onKeyDown={e => {
              // Avoid interfering with IME composition (Korean/Japanese/etc.)
              const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number };
              if (native.isComposing || native.keyCode === 229) {
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
          />
          <div className="jp-CodexComposer-toolbar">
            <div className="jp-CodexComposer-toolbarLeft">
              <button
                type="button"
                className={`jp-CodexIconBtn ${attachCell ? 'is-active' : ''}`}
                onClick={() => setAttachCell(v => !v)}
                disabled={status === 'running'}
                aria-label="Attach active cell"
                aria-pressed={attachCell}
                title={attachCell ? 'Attach active cell: on' : 'Attach active cell: off'}
              >
                <PaperclipIcon width={18} height={18} />
              </button>

              <div className="jp-CodexMenuWrap jp-CodexModelWrap" ref={modelMenuWrapRef}>
                <button
                  type="button"
                  className={`jp-CodexModelBtn ${modelMenuOpen ? 'is-open' : ''}`}
                  onClick={() => {
                    setModelMenuOpen(open => !open);
                    setReasoningMenuOpen(false);
                  }}
                  disabled={status === 'running'}
                  aria-label={`Model: ${selectedModelLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                  title={`Model: ${selectedModelLabel}`}
                >
                  <span className="jp-CodexModelBtn-label">{selectedModelLabel}</span>
                  <ChevronDownIcon className="jp-CodexModelBtn-caret" width={14} height={14} />
                </button>

                {modelMenuOpen && (
                  <div className="jp-CodexMenu" role="menu" aria-label="Model">
                    {MODEL_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`jp-CodexMenuItem ${modelOption === option.value ? 'is-active' : ''}`}
                        onClick={() => {
                          setModelOption(option.value);
                          if (option.value !== '__custom__') {
                            setModelMenuOpen(false);
                          }
                        }}
                      >
                        <span className="jp-CodexMenuItemLabel">{option.label}</span>
                        {modelOption === option.value && (
                          <CheckIcon className="jp-CodexMenuCheck" width={16} height={16} />
                        )}
                      </button>
                    ))}

                    {modelOption === '__custom__' && (
                      <>
                        <div className="jp-CodexMenuDivider" role="separator" />
                        <div className="jp-CodexMenuCustom">
                          <div className="jp-CodexMenuCustomLabel">Custom model</div>
                          <input
                            ref={customModelInputRef}
                            className="jp-CodexMenuInput"
                            value={customModel}
                            onChange={e => setCustomModel(e.currentTarget.value)}
                            placeholder={DEFAULT_MODEL || 'gpt-5.3-codex'}
                            disabled={status === 'running'}
                            aria-label="Custom model"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setModelMenuOpen(false);
                              }
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="jp-CodexMenuWrap" ref={reasoningMenuWrapRef}>
                <button
                  type="button"
                  className={`jp-CodexIconBtn ${reasoningMenuOpen ? 'is-open' : ''}`}
                  onClick={() => {
                    setReasoningMenuOpen(open => !open);
                    setModelMenuOpen(false);
                  }}
                  disabled={status === 'running'}
                  aria-label={`Reasoning: ${selectedReasoningLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={reasoningMenuOpen}
                  title={`Reasoning: ${selectedReasoningLabel}`}
                >
                  <ReasoningEffortIcon effort={reasoningEffort} width={18} height={18} />
                </button>

                {reasoningMenuOpen && (
                  <div className="jp-CodexMenu" role="menu" aria-label="Reasoning">
                    {REASONING_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`jp-CodexMenuItem ${reasoningEffort === option.value ? 'is-active' : ''}`}
                        onClick={() => {
                          setReasoningEffort(option.value as ReasoningOptionValue);
                          setReasoningMenuOpen(false);
                        }}
                      >
                        <span className="jp-CodexMenuItemLabel">{option.label}</span>
                        {reasoningEffort === option.value && (
                          <CheckIcon className="jp-CodexMenuCheck" width={16} height={16} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="jp-CodexComposer-toolbarRight">
              <div className="jp-CodexComposer-hint">Enter to send, Shift+Enter for newline</div>
              <button
                type="button"
                className="jp-CodexSendBtn"
                onClick={() => void sendMessage()}
                disabled={!canSend || !input.trim()}
                aria-label="Send"
                title={
                  status === 'running'
                    ? 'Sending...'
                    : status === 'disconnected'
                      ? 'Connecting...'
                      : 'Send'
                }
              >
                <ArrowUpIcon width={18} height={18} />
              </button>
            </div>
          </div>
        </div>
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
