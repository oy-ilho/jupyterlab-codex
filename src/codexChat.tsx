import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactWidget, Dialog, showDialog } from '@jupyterlab/apputils';
import type { JupyterFrontEnd } from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import type { DocumentRegistry } from '@jupyterlab/docregistry';
import { Message } from '@lumino/messaging';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { useCodexSocket } from './hooks/useCodexSocket';
import { handleCodexSocketMessage } from './handlers/handleCodexSocketMessage';
import {
  type ModelCatalogEntry,
  parseModelCatalog,
  buildCancelMessage,
  buildDeleteAllSessionsMessage,
  buildSendMessage,
  buildStartSessionMessage
} from './protocol';

marked.use(
  markedKatex({
    throwOnError: false
  })
);

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

function ArrowDownIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 5v14m0 0l-7-7m7 7l7-7"
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

function ImageIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path
        d="M21 16l-5.2-5.2a1 1 0 0 0-1.4 0L8.2 17 6 14.8a1 1 0 0 0-1.4 0L3 16.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  props: React.SVGProps<SVGSVGElement> & {
    effort: ReasoningOptionValue;
    effortOptions?: readonly ReasoningOption[];
  }
): JSX.Element {
  const { effort, effortOptions = [], ...svgProps } = props;
  if (effort === '__config__') {
    return <GaugeIcon {...svgProps} />;
  }
  const activeBars = getReasoningEffortBars(effort, effortOptions);

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

function BatteryIcon(
  props: React.SVGProps<SVGSVGElement> & { level?: number | null }
): JSX.Element {
  const { level, ...svgProps } = props;
  const clamped =
    typeof level === 'number' && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
  const innerWidth = 14;
  const fillWidth = clamped == null ? 0 : Math.max(0, Math.round(innerWidth * clamped));
  const dashed = clamped == null;

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      <rect
        x="2"
        y="7"
        width="18"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dashed ? '4 2' : undefined}
      />
      <rect x="21" y="10" width="2" height="4" rx="1" fill="currentColor" opacity={0.85} />
      {fillWidth > 0 && (
        <rect x="4" y="9" width={fillWidth} height="6" rx="1.4" fill="currentColor" opacity={0.9} />
      )}
    </svg>
  );
}

function ContextWindowIcon(
  props: React.SVGProps<SVGSVGElement> & { level?: number | null }
): JSX.Element {
  const { level, ...svgProps } = props;
  const clamped =
    typeof level === 'number' && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : null;
  const radius = 7.3;
  const circumference = 2 * Math.PI * radius;
  const fillRatio = clamped == null ? 0.35 : Math.max(0.05, clamped);
  const fillLength = circumference * fillRatio;
  const gapLength = Math.max(0, circumference - fillLength);
  const dashed = clamped == null;

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...svgProps}>
      <circle cx="12" cy="12" r={radius} stroke="currentColor" strokeWidth="2.8" opacity={0.22} />
      <circle
        cx="12"
        cy="12"
        r={radius}
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeDasharray={`${fillLength} ${gapLength}`}
        strokeDashoffset={circumference * 0.25}
        opacity={dashed ? 0.55 : 0.92}
      />
    </svg>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M12 2.8 19 5.9v6.2c0 5-3 9.2-7 9.9-4-.7-7-4.9-7-9.9V5.9l7-3.1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PortalMenu(props: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  popoverRef: React.RefObject<HTMLDivElement>;
  className?: string;
  role?: 'dialog' | 'menu';
  align?: 'left' | 'right';
  ariaLabel?: string;
  constrainHeightToViewport?: boolean;
  viewportMargin?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}): JSX.Element | null {
  const {
    open,
    anchorRef,
    popoverRef,
    className,
    role = 'dialog',
    align = 'left',
    ariaLabel,
    constrainHeightToViewport = false,
    viewportMargin,
    onMouseEnter,
    onMouseLeave,
    children
  } = props;
  const [style, setStyle] = useState<React.CSSProperties>(() => ({
    left: 0,
    top: 0,
    visibility: 'hidden'
  }));

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) {
        return;
      }

      const margin = Math.max(0, Math.floor(viewportMargin ?? 8));
      const offset = 10;
      const viewportW = window.visualViewport?.width ?? window.innerWidth;
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const viewportLeft = window.visualViewport?.offsetLeft ?? 0;
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const bubbleEl = anchor.closest('.jp-CodexChat-message');
      let bubbleMarginY = 0;
      if (bubbleEl && bubbleEl instanceof HTMLElement) {
        const bubbleStyle = window.getComputedStyle(bubbleEl);
        const bubbleMarginTop = Number.parseFloat(bubbleStyle.marginTop) || 0;
        const bubbleMarginBottom = Number.parseFloat(bubbleStyle.marginBottom) || 0;
        bubbleMarginY = Math.max(0, Math.max(bubbleMarginTop, bubbleMarginBottom));
      }
      const viewportEdgePadding = margin + Math.round(bubbleMarginY);
      const anchorRect = anchor.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const maxHeight = Math.max(80, Math.floor(viewportH - viewportEdgePadding * 2));
      const effectiveHeight = constrainHeightToViewport
        ? Math.min(popRect.height, maxHeight)
        : popRect.height;

      // Default: above, aligned to the anchor.
      let left = align === 'right' ? anchorRect.right - popRect.width : anchorRect.left;
      left = clampNumber(
        left,
        viewportLeft + margin,
        Math.max(viewportLeft + margin, viewportLeft + viewportW - popRect.width - margin)
      );

      let top = anchorRect.top - offset - effectiveHeight;
      const belowTop = anchorRect.bottom + offset;
      const minTop = viewportTop + viewportEdgePadding;
      const maxBottom = viewportTop + viewportH;
      if (top < minTop && belowTop + effectiveHeight + viewportEdgePadding <= maxBottom) {
        top = belowTop;
      }
      top = clampNumber(
        top,
        minTop,
        Math.max(minTop, maxBottom - effectiveHeight - viewportEdgePadding)
      );

      setStyle({
        left: Math.round(left),
        top: Math.round(top),
        ...(constrainHeightToViewport
          ? {
              maxHeight: `${maxHeight}px`,
              overflowY: 'auto',
              overflowX: 'auto'
            }
          : {}),
        visibility: 'visible'
      });
    };

    const raf = window.requestAnimationFrame(update);
    const onResize = () => update();
    const onScroll = () => update();
    window.addEventListener('resize', onResize);
    // Capture scroll events from any scroll container.
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorRef, popoverRef, align, constrainHeightToViewport, viewportMargin]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={`jp-CodexMenu jp-CodexMenuPortal${className ? ` ${className}` : ''}`}
      role={role}
      aria-label={ariaLabel}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
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

function FileIcon(props: React.SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M8 3h6l5 5v10.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13A2.5 2.5 0 0 1 7.5 3H8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  private _app: JupyterFrontEnd;
  private _notebooks: INotebookTracker;

  constructor(app: JupyterFrontEnd, notebooks: INotebookTracker) {
    super();
    this._app = app;
    this._notebooks = notebooks;
    this.addClass('jp-CodexPanel');
  }

  render(): JSX.Element {
    return <CodexChat app={this._app} notebooks={this._notebooks} />;
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this.focusComposer();
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    this.focusComposer();
  }

  private focusComposer(): void {
    window.setTimeout(() => {
      const textarea = this.node.querySelector<HTMLTextAreaElement>('.jp-CodexComposer textarea');
      if (!textarea || textarea.disabled) {
        return;
      }
      textarea.focus({ preventScroll: true });
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  }
}

type TextRole = 'user' | 'assistant' | 'system';
type ChatAttachments = {
  images?: number;
};
type SelectionPreview = {
  locationLabel: string;
  previewText: string;
};
type MessageContextPreview = {
  selectionPreview?: SelectionPreview;
  cellOutputPreview?: SelectionPreview;
};
type StoredSelectionPreviewEntry = {
  contentHash: string;
  preview: MessageContextPreview | null;
};
type ChatEntry =
  | {
      kind: 'text';
      id: string;
      role: TextRole;
      text: string;
      attachments?: ChatAttachments;
      selectionPreview?: SelectionPreview;
      cellOutputPreview?: SelectionPreview;
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

type PendingImageAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type RunState = 'ready' | 'running';
type PanelStatus = 'disconnected' | RunState;
type ProgressKind = '' | 'reasoning';
type ActivityPhase = 'started' | 'completed' | '';
type ActivityCategory = 'reasoning' | 'command' | 'file' | 'tool' | 'event';
type ActivityItem = {
  id: string;
  ts: number;
  category: ActivityCategory;
  phase: ActivityPhase;
  title: string;
  detail: string;
  raw: string;
};

type RateLimitWindowSnapshot = {
  usedPercent: number | null;
  windowMinutes: number | null;
  resetsAt: number | null;
};

type ContextWindowSnapshot = {
  windowTokens: number | null;
  usedTokens: number | null;
  leftTokens: number | null;
  usedPercent: number | null;
};

type CodexRateLimitsSnapshot = {
  updatedAt: string | null;
  primary: RateLimitWindowSnapshot | null;
  secondary: RateLimitWindowSnapshot | null;
  contextWindow: ContextWindowSnapshot | null;
};

type CodexChatProps = {
  app: JupyterFrontEnd;
  notebooks: INotebookTracker;
};

type CliDefaultsSnapshot = {
  model: string | null;
  reasoningEffort: string | null;
  availableModels?: ModelCatalogEntry[];
};

type ConversationMode = 'resume' | 'fallback';
type NotebookMode = 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported';

type NotebookSession = {
  threadId: string;
  messages: ChatEntry[];
  runState: RunState;
  activeRunId: string | null;
  runStartedAt: number | null;
  progress: string;
  progressKind: ProgressKind;
  pairedOk: boolean | null;
  pairedPath: string;
  pairedOsPath: string;
  pairedMessage: string;
  notebookMode: NotebookMode | null;
  selectedModelOption: ModelOptionValue;
  selectedReasoningEffort: ReasoningOptionValue;
  selectedSandboxMode: SandboxMode;
  effectiveSandboxMode: SandboxMode | null;
  conversationMode: ConversationMode;
};

type SessionThreadSyncEvent = {
  kind: 'new-thread';
  sessionKey: string;
  notebookPath: string;
  threadId: string;
  source: string;
  id: string;
  issuedAt: number;
};

type ModelOptionValue = '__config__' | string;
type ModelOption = {
  label: string;
  value: string;
};

const FALLBACK_MODEL_OPTIONS: ModelOption[] = [];
type ReasoningOption = {
  label: string;
  value: string;
};
type ReasoningOptionValue = '__config__' | string;
const DEFAULT_REASONING_EFFORT = 'medium';
const MAX_REASONING_EFFORT_BARS = 4;
const SANDBOX_OPTIONS = [
  { label: 'Default permission', value: 'workspace-write' },
  { label: 'Full access', value: 'danger-full-access' },
  { label: 'Read only', value: 'read-only' }
] as const;
type SandboxMode = (typeof SANDBOX_OPTIONS)[number]['value'];

function readDefaultModelOption(): ModelOptionValue {
  const savedModel = readStoredModel();
  if (savedModel && savedModel !== '__config__' && savedModel !== '__custom__') {
    return savedModel;
  }
  return '__config__';
}

function readDefaultReasoningEffortOption(): ReasoningOptionValue {
  return readStoredReasoningEffort();
}

function readDefaultSandboxModeOption(): SandboxMode {
  return readStoredSandboxMode();
}
const AUTO_SAVE_STORAGE_KEY = 'jupyterlab-codex:auto-save-before-send';
const MODEL_STORAGE_KEY = 'jupyterlab-codex:model';
const COMMAND_PATH_STORAGE_KEY = 'jupyterlab-codex:command-path';
const REASONING_STORAGE_KEY = 'jupyterlab-codex:reasoning-effort';
const SANDBOX_MODE_STORAGE_KEY = 'jupyterlab-codex:sandbox-mode';
const SETTINGS_OPEN_STORAGE_KEY = 'jupyterlab-codex:settings-open';
const NOTIFY_ON_DONE_STORAGE_KEY = 'jupyterlab-codex:notify-on-done';
const NOTIFY_ON_DONE_MIN_SECONDS_STORAGE_KEY = 'jupyterlab-codex:notify-on-done-min-seconds';
const INCLUDE_ACTIVE_CELL_STORAGE_KEY = 'jupyterlab-codex:include-active-cell';
const INCLUDE_ACTIVE_CELL_OUTPUT_STORAGE_KEY = 'jupyterlab-codex:include-active-cell-output';
const SESSION_THREADS_STORAGE_KEY = 'jupyterlab-codex:session-threads';
const SESSION_THREADS_EVENT_KEY = 'jupyterlab-codex:session-threads:event';
const SELECTION_PREVIEWS_STORAGE_KEY = 'jupyterlab-codex:selection-previews';
const DELETE_ALL_PENDING_KEY = 'jupyterlab-codex:delete-all-pending';
const SESSION_KEY_SEPARATOR = '\u0000';

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024; // Avoid huge WebSocket payloads.
const MAX_IMAGE_ATTACHMENT_TOTAL_BYTES = 6 * 1024 * 1024;
const MESSAGE_SELECTION_PREVIEW_DISPLAY_MAX_CHARS = 500;
const MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS = 500;
const MAX_STORED_SELECTION_PREVIEW_THREADS = 80;
const MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD = 10;
const READ_ONLY_PERMISSION_WARNING = 'Code changes are not available with the current permission (Read only).';

function findModelLabel(model: string, options: readonly ModelOption[]): string {
  const match = options.find(option => option.value === model);
  return match ? match.label : truncateMiddle(model, 32);
}

function coerceReasoningEffort(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function coerceReasoningText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coerceReasoningEffortEntry(value: unknown): string {
  if (typeof value === 'string') {
    return coerceReasoningText(value);
  }
  if (value && typeof value === 'object' && 'reasoningEffort' in (value as Record<string, unknown>)) {
    return coerceReasoningText((value as { reasoningEffort?: unknown }).reasoningEffort);
  }
  return '';
}

function readModelOptions(rawModels: unknown): ModelOption[] {
  const catalog = parseModelCatalog(rawModels);
  return catalog.map(entry => ({ label: entry.displayName, value: entry.model }));
}

function getReasoningEffortBars(
  effort: string,
  effortOptions: readonly ReasoningOption[]
): number {
  if (!effort || effort === '__config__') {
    return 0;
  }
  if (effortOptions.length <= 0) {
    return 0;
  }
  const index = effortOptions.findIndex(option => option.value === effort);
  if (index < 0) {
    return 0;
  }
  if (effortOptions.length === 1) {
    return 1;
  }
  const scale = MAX_REASONING_EFFORT_BARS - 1;
  return Math.max(
    1,
    Math.min(
      MAX_REASONING_EFFORT_BARS,
      Math.floor((index * scale) / (effortOptions.length - 1)) + 1
    )
  );
}

function buildReasoningOptions(rawModels: unknown, selectedModel: string): ReasoningOption[] {
  const catalog = parseModelCatalog(rawModels);
  const normalizedModel = selectedModel.trim();
  const modelByName = catalog.find(item => item.model === normalizedModel);
  const reasons =
    modelByName?.reasoningEfforts && modelByName.reasoningEfforts.length > 0
      ? modelByName.reasoningEfforts
      : modelByName?.defaultReasoningEffort
        ? [modelByName.defaultReasoningEffort]
        : catalog.flatMap(item => item.reasoningEfforts ?? []);

  const deduped = new Map<string, ReasoningOption>();
  for (const reason of reasons) {
    const label = coerceReasoningEffortEntry(reason);
    const normalized = coerceReasoningEffort(label);
    if (!normalized || deduped.has(normalized)) {
      continue;
    }
    deduped.set(normalized, { value: normalized, label: label || normalized });
  }

  return Array.from(deduped.values());
}

function resolveFallbackReasoningEffort(options: readonly ReasoningOption[]): string {
  const medium = options.find(option => coerceReasoningEffort(option.value) === DEFAULT_REASONING_EFFORT);
  if (medium) {
    return medium.value;
  }
  return options[0]?.value ?? DEFAULT_REASONING_EFFORT;
}

function findReasoningLabel(value: string, options: readonly ReasoningOption[]): string {
  const match = options.find(option => option.value === value);
  if (match) {
    return match.label;
  }
  const raw = coerceReasoningText(value);
  if (!raw) {
    return 'Reasoning';
  }
  return raw;
}

function isKnownSandboxMode(value: string): value is SandboxMode {
  return SANDBOX_OPTIONS.some(option => option.value === value);
}

function coerceSandboxMode(value: unknown): SandboxMode | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  return isKnownSandboxMode(normalized) ? normalized : null;
}

function coerceNotebookMode(value: unknown): NotebookMode | null {
  if (value === 'ipynb' || value === 'jupytext_py' || value === 'plain_py' || value === 'unsupported') {
    return value;
  }
  return null;
}

function coerceConversationMode(value: unknown): ConversationMode | null {
  if (value === 'resume' || value === 'fallback') {
    return value;
  }
  return null;
}

function inferNotebookModeFromPath(path: string): NotebookMode {
  const normalized = (path || '').trim().toLowerCase();
  if (normalized.endsWith('.ipynb')) {
    return 'ipynb';
  }
  if (normalized.endsWith('.py')) {
    return 'plain_py';
  }
  return 'unsupported';
}

function makeSessionKey(path: string): string {
  const normalizedPath = (path || '').trim();
  if (!normalizedPath) {
    return '';
  }
  return normalizedPath;
}

function createSessionEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 0x100000000).toString(16)}`;
}

function parseSessionKey(sessionKey: string): { path: string } {
  if (!sessionKey) {
    return { path: '' };
  }
  const separatorIndex = sessionKey.indexOf(SESSION_KEY_SEPARATOR);
  if (separatorIndex < 0) {
    return { path: sessionKey };
  }
  return { path: sessionKey.slice(0, separatorIndex) };
}

function readStoredSessionThreads(): Record<string, string> {
  const raw = safeLocalStorageGet(SESSION_THREADS_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key || typeof value !== 'string') {
        continue;
      }
      const threadId = value.trim();
      if (!threadId) {
        continue;
      }
      result[key] = threadId;
    }
    return result;
  } catch {
    return {};
  }
}

function getStoredSessionThreadCount(): number {
  const mapping = readStoredSessionThreads();
  const uniquePaths = new Set<string>();
  for (const key of Object.keys(mapping)) {
    const { path } = parseSessionKey(key);
    if (path) {
      uniquePaths.add(path);
    }
  }
  return uniquePaths.size;
}

function readStoredThreadId(path: string, sessionKey: string): string {
  const normalizedPath = path.trim();
  const normalizedSessionKey = sessionKey || '';
  if (!normalizedSessionKey) {
    return '';
  }
  const mapping = readStoredSessionThreads();
  const exactMatch = mapping[normalizedSessionKey];
  if (exactMatch) {
    return exactMatch;
  }

  if (!normalizedPath) {
    return '';
  }
  for (const [key, threadId] of Object.entries(mapping)) {
    if (!threadId) {
      continue;
    }
    const parsed = parseSessionKey(key);
    if (parsed.path === normalizedPath) {
      return threadId;
    }
  }
  return '';
}

function persistStoredSessionThreads(sessions: Map<string, NotebookSession>): void {
  const mapping: Record<string, string> = {};
  for (const [sessionKey, session] of sessions) {
    if (!sessionKey || !session?.threadId) {
      continue;
    }
    mapping[sessionKey] = session.threadId;
  }
  try {
    safeLocalStorageSet(SESSION_THREADS_STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    // Ignore storage failures; in-memory sessions still work.
  }
}

function hashSelectionPreviewContent(content: string): string {
  // Stable lightweight hash for local UI-only metadata matching.
  const normalized = (content || '').replace(/\r\n/g, '\n');
  let hash = 2166136261;
  for (let idx = 0; idx < normalized.length; idx += 1) {
    hash ^= normalized.charCodeAt(idx);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeStoredSelectionPreviewEntry(
  value: unknown
): StoredSelectionPreviewEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const contentHash = typeof raw.contentHash === 'string' ? raw.contentHash.trim() : '';
  if (!contentHash) {
    return null;
  }

  const previewRaw = raw.preview;
  if (!previewRaw) {
    return { contentHash, preview: null };
  }
  const preview = coerceMessageContextPreview(previewRaw);
  if (!preview) {
    return { contentHash, preview: null };
  }
  return {
    contentHash,
    preview
  };
}

function readStoredSelectionPreviewsByThread(): Map<string, StoredSelectionPreviewEntry[]> {
  const raw = safeLocalStorageGet(SELECTION_PREVIEWS_STORAGE_KEY);
  if (!raw) {
    return new Map();
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return new Map();
    }

    const next = new Map<string, StoredSelectionPreviewEntry[]>();
    for (const [threadIdRaw, entriesRaw] of Object.entries(parsed as Record<string, unknown>)) {
      const threadId = typeof threadIdRaw === 'string' ? threadIdRaw.trim() : '';
      if (!threadId || !Array.isArray(entriesRaw)) {
        continue;
      }
      const entries: StoredSelectionPreviewEntry[] = [];
      for (const entryCandidate of entriesRaw) {
        const entry = normalizeStoredSelectionPreviewEntry(entryCandidate);
        if (!entry) {
          continue;
        }
        entries.push(entry);
      }
      if (entries.length <= 0) {
        continue;
      }
      next.set(threadId, entries.slice(-MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD));
    }
    return next;
  } catch {
    return new Map();
  }
}

function persistStoredSelectionPreviewsByThread(
  previewsByThread: Map<string, StoredSelectionPreviewEntry[]>
): void {
  const serialized: Record<string, Array<{ contentHash: string; preview?: MessageContextPreview }>> = {};
  const entries = Array.from(previewsByThread.entries()).slice(-MAX_STORED_SELECTION_PREVIEW_THREADS);
  for (const [threadId, threadEntries] of entries) {
    if (!threadId || !Array.isArray(threadEntries) || threadEntries.length <= 0) {
      continue;
    }
    const normalizedEntries = threadEntries
      .filter(item => item && typeof item.contentHash === 'string' && item.contentHash)
      .slice(-MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD)
      .map(item =>
        item.preview
          ? { contentHash: item.contentHash, preview: item.preview }
          : { contentHash: item.contentHash }
      );
    if (normalizedEntries.length > 0) {
      serialized[threadId] = normalizedEntries;
    }
  }
  safeLocalStorageSet(SELECTION_PREVIEWS_STORAGE_KEY, JSON.stringify(serialized));
}

function coerceSessionThreadSyncEvent(value: string): SessionThreadSyncEvent | null {
  if (!value) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const event = raw as Record<string, unknown>;
  const sessionKey = typeof event.sessionKey === 'string' ? event.sessionKey.trim() : '';
  const notebookPath = typeof event.notebookPath === 'string' ? event.notebookPath.trim() : '';
  const threadId = typeof event.threadId === 'string' ? event.threadId.trim() : '';
  const source = typeof event.source === 'string' ? event.source.trim() : '';
  const id = typeof event.id === 'string' ? event.id.trim() : '';
  if (!sessionKey || !notebookPath || !threadId || !id || event.kind !== 'new-thread') {
    return null;
  }
  const issuedAt = typeof event.issuedAt === 'number' && Number.isFinite(event.issuedAt) ? event.issuedAt : Date.now();
  return { kind: 'new-thread', sessionKey, notebookPath, threadId, source, id, issuedAt };
}

function coerceSelectionPreview(value: unknown): SelectionPreview | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const locationLabel = typeof raw.locationLabel === 'string' ? raw.locationLabel.trim() : '';
  const previewText =
    typeof raw.previewText === 'string'
      ? truncateEnd(normalizeSelectionPreviewText(raw.previewText), MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
      : '';
  if (!locationLabel || !previewText) {
    return undefined;
  }
  return { locationLabel, previewText };
}

function coerceMessageContextPreview(value: unknown): MessageContextPreview | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const selectionPreview = coerceSelectionPreview(raw.selectionPreview);
  const cellOutputPreview = coerceSelectionPreview(raw.cellOutputPreview);
  if (selectionPreview || cellOutputPreview) {
    return {
      ...(selectionPreview ? { selectionPreview } : {}),
      ...(cellOutputPreview ? { cellOutputPreview } : {})
    };
  }

  // Legacy format: a single preview object was stored as selection preview.
  const legacySelectionPreview = coerceSelectionPreview(raw);
  if (legacySelectionPreview) {
    return { selectionPreview: legacySelectionPreview };
  }
  return undefined;
}

function coerceSessionHistory(
  raw: any
): Array<{
  role: TextRole;
  content: string;
  selectionPreview?: SelectionPreview;
  cellOutputPreview?: SelectionPreview;
}> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: Array<{
    role: TextRole;
    content: string;
    selectionPreview?: SelectionPreview;
    cellOutputPreview?: SelectionPreview;
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const role = (item as any).role;
    const content = (item as any).content;
    if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') {
      continue;
    }
    const selectionPreview = coerceSelectionPreview((item as any).selectionPreview);
    const cellOutputPreview = coerceSelectionPreview((item as any).cellOutputPreview);
    result.push({ role, content, selectionPreview, cellOutputPreview });
  }
  return result;
}

function createSession(
  path: string,
  intro: string,
  options?: {
    threadId?: string;
    reuseStoredThread?: boolean;
    sessionKey?: string;
  }
): NotebookSession {
  const defaultIntro = 'Session started';
  const systemText = normalizeSystemText('system', intro || defaultIntro);
  const requestedThreadId = (options?.threadId || '').trim();
  const storedThreadId = options?.reuseStoredThread === false ? '' : readStoredThreadId(path, options?.sessionKey || '');
  const threadId = requestedThreadId || storedThreadId || crypto.randomUUID();
  return {
    threadId,
    runState: 'ready',
    activeRunId: null,
    runStartedAt: null,
    progress: '',
    progressKind: '',
    messages: [
      {
        kind: 'text',
        id: crypto.randomUUID(),
        role: 'system',
        text: systemText
      }
    ],
    pairedOk: null,
    pairedPath: '',
    pairedOsPath: '',
    pairedMessage: '',
    notebookMode: null,
    selectedModelOption: readDefaultModelOption(),
    selectedReasoningEffort: readDefaultReasoningEffortOption(),
    selectedSandboxMode: readDefaultSandboxModeOption(),
    effectiveSandboxMode: null,
    conversationMode: 'resume',
  };
}

function createThreadResetSession(path: string, sessionKey: string, threadId: string): NotebookSession {
  const time = new Date().toLocaleTimeString();
  return createSession(path, `Session started (${time})`, {
    threadId,
    reuseStoredThread: false,
    sessionKey
  });
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

function hasStoredValue(key: string): boolean {
  return safeLocalStorageGet(key) !== null;
}

function extractTrailingParenValue(text: string): { rest: string; value: string | null } {
  const trimmed = text.trim();
  if (!trimmed.endsWith(')')) {
    return { rest: trimmed, value: null };
  }
  const start = trimmed.lastIndexOf('(');
  if (start < 0) {
    return { rest: trimmed, value: null };
  }
  const inner = trimmed.slice(start + 1, -1).trim();
  if (!inner) {
    return { rest: trimmed, value: null };
  }
  return { rest: trimmed.slice(0, start).trimEnd(), value: inner };
}

function formatSessionStartedNotice(label: string, time: string | null): string {
  return `${label}${time ? ` (${time})` : ''}`;
}

function normalizeSessionStartedNotice(text: string): string | null {
  const raw = text.trim();

  // Korean legacy messages (normalize to English UI text)
  if (raw.startsWith('세션 시작')) {
    const { rest, value } = extractTrailingParenValue(raw);
    if (rest.startsWith('세션 시작')) {
      return formatSessionStartedNotice('Session started', value);
    }
  }

  // English (case-insensitive)
  const lower = raw.toLowerCase();
  if (lower.startsWith('session started')) {
    const { rest, value } = extractTrailingParenValue(raw);
    if (rest.toLowerCase().startsWith('session started')) {
      return formatSessionStartedNotice('Session started', value);
    }
  }

  return null;
}

function normalizeSystemText(role: TextRole, text: string): string {
  if (role !== 'system') {
    return text;
  }
  return normalizeSessionStartedNotice(text) ?? text;
}

function isSessionStartNotice(text: string): boolean {
  if (normalizeSessionStartedNotice(text) !== null) {
    return true;
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith('새 스레드 시작:')) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('session start:') ||
    lower.startsWith('new thread started:') ||
    lower.startsWith('new thread started')
  );
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

function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors; settings still work for current session.
  }
}

function markDeleteAllPending(): void {
  safeLocalStorageSet(DELETE_ALL_PENDING_KEY, '1');
}

function clearDeleteAllPending(): void {
  safeLocalStorageRemove(DELETE_ALL_PENDING_KEY);
}

function hasDeleteAllPending(): boolean {
  return safeLocalStorageGet(DELETE_ALL_PENDING_KEY) === '1';
}

function readStoredModel(): string {
  return safeLocalStorageGet(MODEL_STORAGE_KEY) ?? '';
}

function readStoredCommandPath(): string {
  return safeLocalStorageGet(COMMAND_PATH_STORAGE_KEY) ?? '';
}

function readStoredAutoSave(): boolean {
  return (safeLocalStorageGet(AUTO_SAVE_STORAGE_KEY) ?? 'true') !== 'false';
}

function readStoredIncludeActiveCell(): boolean {
  return (safeLocalStorageGet(INCLUDE_ACTIVE_CELL_STORAGE_KEY) ?? 'true') !== 'false';
}

function readStoredIncludeActiveCellOutput(): boolean {
  return (safeLocalStorageGet(INCLUDE_ACTIVE_CELL_OUTPUT_STORAGE_KEY) ?? 'true') !== 'false';
}

function readStoredReasoningEffort(): ReasoningOptionValue {
  try {
    const stored = safeLocalStorageGet(REASONING_STORAGE_KEY) ?? '';
    if (stored === '__config__') {
      return '__config__';
    }
    const normalized = stored.trim();
    return normalized ? (normalized as ReasoningOptionValue) : '__config__';
  } catch {
    return '__config__';
  }
}

function readStoredSandboxMode(): SandboxMode {
  const stored = safeLocalStorageGet(SANDBOX_MODE_STORAGE_KEY) ?? '';
  return isKnownSandboxMode(stored) ? stored : SANDBOX_OPTIONS[0].value;
}

function persistModel(model: string): void {
  safeLocalStorageSet(MODEL_STORAGE_KEY, model);
}

function persistCommandPath(commandPath: string): void {
  safeLocalStorageSet(COMMAND_PATH_STORAGE_KEY, commandPath);
}

function persistAutoSave(enabled: boolean): void {
  safeLocalStorageSet(AUTO_SAVE_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistIncludeActiveCell(enabled: boolean): void {
  safeLocalStorageSet(INCLUDE_ACTIVE_CELL_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistIncludeActiveCellOutput(enabled: boolean): void {
  safeLocalStorageSet(INCLUDE_ACTIVE_CELL_OUTPUT_STORAGE_KEY, enabled ? 'true' : 'false');
}

function persistReasoningEffort(value: ReasoningOptionValue): void {
  safeLocalStorageSet(REASONING_STORAGE_KEY, value);
}

function persistSandboxMode(value: SandboxMode): void {
  safeLocalStorageSet(SANDBOX_MODE_STORAGE_KEY, value);
}

function readStoredSettingsOpen(): boolean {
  return (safeLocalStorageGet(SETTINGS_OPEN_STORAGE_KEY) ?? 'false') === 'true';
}

function persistSettingsOpen(enabled: boolean): void {
  safeLocalStorageSet(SETTINGS_OPEN_STORAGE_KEY, enabled ? 'true' : 'false');
}

function readStoredNotifyOnDone(): boolean {
  return (safeLocalStorageGet(NOTIFY_ON_DONE_STORAGE_KEY) ?? 'true') === 'true';
}

function persistNotifyOnDone(enabled: boolean): void {
  safeLocalStorageSet(NOTIFY_ON_DONE_STORAGE_KEY, enabled ? 'true' : 'false');
}

function readStoredNotifyOnDoneMinSeconds(): number {
  const raw = safeLocalStorageGet(NOTIFY_ON_DONE_MIN_SECONDS_STORAGE_KEY);
  if (raw == null) {
    return 30;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function persistNotifyOnDoneMinSeconds(seconds: number): void {
  safeLocalStorageSet(NOTIFY_ON_DONE_MIN_SECONDS_STORAGE_KEY, String(Math.max(0, Math.trunc(seconds))));
}

function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
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

function coerceRateLimitWindow(raw: any): RateLimitWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const usedPercent = typeof raw.usedPercent === 'number' && Number.isFinite(raw.usedPercent) ? raw.usedPercent : null;
  const windowMinutes =
    typeof raw.windowMinutes === 'number' && Number.isFinite(raw.windowMinutes) ? Math.round(raw.windowMinutes) : null;
  const resetsAt = typeof raw.resetsAt === 'number' && Number.isFinite(raw.resetsAt) ? Math.round(raw.resetsAt) : null;
  return { usedPercent, windowMinutes, resetsAt };
}

function coerceContextWindowSnapshot(raw: any): ContextWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const windowTokens =
    typeof raw.windowTokens === 'number' && Number.isFinite(raw.windowTokens) ? Math.round(raw.windowTokens) : null;
  const usedTokens =
    typeof raw.usedTokens === 'number' && Number.isFinite(raw.usedTokens) ? Math.round(raw.usedTokens) : null;
  const leftTokens =
    typeof raw.leftTokens === 'number' && Number.isFinite(raw.leftTokens) ? Math.round(raw.leftTokens) : null;
  const usedPercent =
    typeof raw.usedPercent === 'number' && Number.isFinite(raw.usedPercent) ? raw.usedPercent : null;
  if (windowTokens == null && usedTokens == null && leftTokens == null && usedPercent == null) {
    return null;
  }
  return { windowTokens, usedTokens, leftTokens, usedPercent };
}

function coerceRateLimitsSnapshot(raw: any): CodexRateLimitsSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : null;
  return {
    updatedAt,
    primary: coerceRateLimitWindow(raw.primary),
    secondary: coerceRateLimitWindow(raw.secondary),
    contextWindow: coerceContextWindowSnapshot(raw.contextWindow)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentLeftFromUsed(usedPercent: number | null): number | null {
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) {
    return null;
  }
  return Math.round(clampNumber(100 - usedPercent, 0, 100));
}

function safeParseDateMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0m';
  }
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatRunDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0s';
  }
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatResetsIn(resetsAtSec: number | null, nowMs: number): string {
  if (typeof resetsAtSec !== 'number' || !Number.isFinite(resetsAtSec)) {
    return 'Unknown';
  }
  const diffMs = resetsAtSec * 1000 - nowMs;
  if (diffMs <= 0) {
    return 'Overdue';
  }
  return formatDurationShort(diffMs);
}

function formatTokenCount(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return value.toLocaleString();
}

function truncateEnd(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max <= 3) {
    return text.slice(0, max);
  }
  return `${text.slice(0, max - 3)}...`;
}

function safeJsonPreview(value: any, maxChars = 6000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxChars) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxChars - 40))}\n... (truncated)`;
  } catch {
    return '';
  }
}

function humanizeToken(value: string): string {
  const input = (value || '').trim();
  if (!input) {
    return '';
  }
  return input
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fileNameFromPath(path: string): string {
  const raw = (path || '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function extractFileChangePaths(item: any): string[] {
  if (!item || typeof item !== 'object') {
    return [];
  }

  const seen = new Set<string>();
  const paths: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value !== 'string') {
      return;
    }
    const path = value.trim();
    if (!path || seen.has(path)) {
      return;
    }
    seen.add(path);
    paths.push(path);
  };

  const directKeys = [
    'path',
    'filename',
    'filePath',
    'file_path',
    'targetPath',
    'target_path',
    'newPath',
    'new_path',
    'oldPath',
    'old_path',
    'sourcePath',
    'source_path',
    'destinationPath',
    'destination_path'
  ];
  for (const key of directKeys) {
    push(item[key]);
  }

  const nestedObjectKeys = ['file', 'target', 'source', 'destination'];
  for (const key of nestedObjectKeys) {
    const nested = item[key];
    if (!nested || typeof nested !== 'object') {
      continue;
    }
    push((nested as any).path);
    push((nested as any).filename);
    push((nested as any).filePath);
    push((nested as any).file_path);
  }

  const listKeys = ['paths', 'files', 'changes', 'edits'];
  for (const key of listKeys) {
    const list = item[key];
    if (!Array.isArray(list)) {
      continue;
    }
    for (const entry of list) {
      if (typeof entry === 'string') {
        push(entry);
        continue;
      }
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      push((entry as any).path);
      push((entry as any).filename);
      push((entry as any).filePath);
      push((entry as any).file_path);
      push((entry as any).targetPath);
      push((entry as any).target_path);
      push((entry as any).newPath);
      push((entry as any).new_path);
      push((entry as any).oldPath);
      push((entry as any).old_path);
    }
  }

  // Fallback: recursively scan nested objects for path-like keys.
  if (paths.length === 0) {
    const queue: unknown[] = [item];
    let visited = 0;
    while (queue.length > 0 && visited < 300) {
      const current = queue.shift();
      visited += 1;
      if (!current || typeof current !== 'object') {
        continue;
      }
      if (Array.isArray(current)) {
        for (const value of current) {
          queue.push(value);
        }
        continue;
      }

      for (const [rawKey, value] of Object.entries(current as Record<string, unknown>)) {
        const key = rawKey.trim().toLowerCase();
        if (
          typeof value === 'string' &&
          (key === 'filename' ||
            key.endsWith('path') ||
            key.endsWith('_path') ||
            key.endsWith('filepath') ||
            key.endsWith('file_path'))
        ) {
          push(value);
        }
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }
  }

  return paths;
}

function summarizeCodexEvent(payload: any): {
  progress: string;
  progressKind: ProgressKind;
  activity: Omit<ActivityItem, 'id' | 'ts'>;
} {
  if (!payload || typeof payload !== 'object') {
    return {
      progress: 'Event',
      progressKind: '',
      activity: { category: 'event', phase: '', title: 'Event', detail: '', raw: safeJsonPreview(payload) }
    };
  }

  const type =
    (typeof payload.type === 'string' && payload.type) ||
    (typeof payload.event === 'string' && payload.event) ||
    'event';

  const raw = safeJsonPreview(payload);

  // Common Codex CLI shape: { type: "item.completed|item.started", item: { type: "...", ... } }
  if (
    (type === 'item.completed' || type === 'item.started') &&
    payload.item &&
    typeof payload.item === 'object'
  ) {
    const item: any = payload.item;
    const itemType = typeof item.type === 'string' ? item.type : '';
    const toolName =
      (typeof item.tool_name === 'string' && item.tool_name) ||
      (typeof item.tool === 'string' && item.tool) ||
      (typeof item.name === 'string' && item.name) ||
      '';
    const path = (typeof item.path === 'string' && item.path) || (typeof item.filename === 'string' && item.filename) || '';
    const phase: ActivityPhase = type === 'item.started' ? 'started' : type === 'item.completed' ? 'completed' : '';

    let category: ActivityCategory = 'event';
    let progressKind: ProgressKind = '';

    if (itemType === 'reasoning') {
      category = 'reasoning';
      progressKind = 'reasoning';
    } else if (itemType === 'command_execution') {
      category = 'command';
    } else if (itemType === 'file_change') {
      category = 'file';
    } else if (toolName) {
      category = 'tool';
    }

    let title = '';
    let detail = '';

    if (itemType === 'command_execution') {
      const commandField =
        item.command ?? item.cmd ?? item.shell_command ?? item.argv ?? item.args ?? item.commandLine ?? item.command_line;
      let commandHint = '';
      if (typeof commandField === 'string') {
        commandHint = commandField;
      } else if (
        Array.isArray(commandField) &&
        commandField.length > 0 &&
        commandField.every((token: any) => typeof token === 'string')
      ) {
        commandHint = commandField.join(' ');
      } else {
        commandHint = safePreview(commandField);
      }
      const exitCode = typeof item.exit_code === 'number' ? item.exit_code : typeof item.exitCode === 'number' ? item.exitCode : null;
      title = phase === 'started' ? 'Running command' : phase === 'completed' ? 'Command finished' : 'Command';
      detail = commandHint || '';
      if (exitCode != null) {
        detail = detail ? `${detail}\n(exit ${exitCode})` : `(exit ${exitCode})`;
      }
    } else if (itemType === 'file_change') {
      const filePaths = extractFileChangePaths(item);
      const primaryPath = filePaths[0] || path || '';
      const fileName = fileNameFromPath(primaryPath);
      const baseTitle = phase === 'started' ? 'Update file' : phase === 'completed' ? 'File updated' : 'File change';
      title = fileName ? `${baseTitle}: ${fileName}` : baseTitle;
      detail = filePaths.length > 0 ? filePaths.join('\n') : path || '';
    } else if (itemType === 'reasoning') {
      title = phase === 'started' ? 'Reasoning' : phase === 'completed' ? 'Reasoning step' : 'Reasoning';
      detail = toolName ? `(${toolName})` : '';
    } else {
      const base = humanizeToken(itemType) || humanizeToken(type) || 'Event';
      title = phase === 'started' ? `${base} started` : phase === 'completed' ? `${base} completed` : base;
      const detailParts: string[] = [];
      if (toolName) {
        detailParts.push(`tool: ${toolName}`);
      }
      if (path) {
        detailParts.push(`path: ${path}`);
      }
      detail = detailParts.join('\n');
    }

    if (!title) {
      title = humanizeToken(itemType) || 'Event';
    }
    detail = truncateEnd(detail, 1400);

    const progressParts: string[] = [];
    if (title) {
      progressParts.push(title);
    }
    if (detail) {
      const oneLine = detail.replace(/\s+/g, ' ').trim();
      progressParts.push(truncateMiddle(oneLine, 200));
    }
    const progress = progressParts.join(': ') || humanizeToken(type) || 'Event';

    return {
      progress,
      progressKind,
      activity: {
        category,
        phase,
        title,
        detail,
        raw
      }
    };
  }

  const label =
    (typeof payload.name === 'string' && payload.name) ||
    (typeof payload.label === 'string' && payload.label) ||
    (typeof payload.tool_name === 'string' && payload.tool_name) ||
    (typeof payload.tool === 'string' && payload.tool) ||
    '';
  if (label && label !== type) {
    const progress = `${humanizeToken(type) || type}: ${truncateMiddle(label, 120)}`;
    return {
      progress,
      progressKind: '',
      activity: { category: 'event', phase: '', title: humanizeToken(type) || type, detail: label, raw }
    };
  }

  const commandHint = safePreview(payload.command);
  if (commandHint) {
    const progress = `${humanizeToken(type) || type}: ${commandHint}`;
    return {
      progress,
      progressKind: '',
      activity: { category: 'event', phase: '', title: humanizeToken(type) || type, detail: commandHint, raw }
    };
  }

  const pathHint = safePreview(payload.path);
  if (pathHint) {
    const progress = `${humanizeToken(type) || type}: ${pathHint}`;
    return {
      progress,
      progressKind: '',
      activity: { category: 'event', phase: '', title: humanizeToken(type) || type, detail: pathHint, raw }
    };
  }

  return {
    progress: humanizeToken(type) || type,
    progressKind: '',
    activity: { category: 'event', phase: '', title: humanizeToken(type) || type, detail: '', raw }
  };
}

function isNoiseCodexEvent(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const type =
    (typeof payload.type === 'string' && payload.type) ||
    (typeof payload.event === 'string' && payload.event) ||
    '';
  // These are useful for debugging but not meaningful for end users.
  return type === 'thread.started' || type === 'turn.started' || type === 'turn.completed';
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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHighlightLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  const aliasMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    'c++': 'cpp',
    'c#': 'csharp',
    'objective-c': 'objectivec',
    objc: 'objectivec'
  };
  return aliasMap[normalized] ?? normalized;
}

function renderHighlightedCodeToSafeHtml(code: string, lang: string): string {
  const fallback = escapeHtml(code);
  let highlighted = fallback;
  try {
    const normalizedLang = normalizeHighlightLanguage(lang);
    if (normalizedLang && hljs.getLanguage(normalizedLang)) {
      highlighted = hljs.highlight(code, { language: normalizedLang, ignoreIllegals: true }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }
  } catch {
    highlighted = fallback;
  }
  try {
    return DOMPurify.sanitize(highlighted, { USE_PROFILES: { html: true } });
  } catch {
    return escapeHtml(highlighted);
  }
}

function renderMarkdownToSafeHtml(markdown: string): string {
  if (!markdown) {
    return '';
  }
  const normalizedMarkdown = normalizeMathDelimiters(markdown);
  let html = '';
  try {
    html = marked.parse(normalizedMarkdown, {
      gfm: true,
      breaks: true
    }) as string;
  } catch {
    return escapeHtml(markdown).replace(/\n/g, '<br />');
  }
  try {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  } catch {
    return escapeHtml(markdown).replace(/\n/g, '<br />');
  }
}

function normalizeSelectionPreviewText(text: string): string {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function normalizeMathDelimiters(markdown: string): string {
  const normalizedEscapedBlock = markdown.replace(
    /(^|[^\\])\\\[([\s\S]*?)\\\]/g,
    (_match, prefix: string, body: string) => `${prefix}\n$$\n${body}\n$$\n`
  );

  const normalizedEscapedInline = normalizedEscapedBlock.replace(
    /(^|[^\\])\\\((.+?)\\\)/g,
    (_match, prefix: string, body: string) => `${prefix}$${body}$`
  );

  // Some model outputs arrive with bare bracket delimiters:
  // [
  //   ...latex...
  // ]
  // Promote those to $$...$$ when the body looks like math.
  return normalizedEscapedInline.replace(
    /(^|\n)[ \t]*\[\s*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g,
    (_match, prefix: string, body: string) => {
      const trimmed = body.trim();
      if (!looksLikeLatexMath(trimmed)) {
        return `${prefix}[\n${body}\n]`;
      }
      return `${prefix}\n$$\n${trimmed}\n$$\n`;
    }
  );
}

function looksLikeLatexMath(value: string): boolean {
  if (!value) {
    return false;
  }
  return /\\[A-Za-z]+/.test(value) || /[_^{}]/.test(value);
}

function StatusPill(props: { status: PanelStatus }): JSX.Element {
  // Visual: dot only. Keep an accessible label + tooltip for status.
  const label =
    props.status === 'disconnected' ? 'Disconnected' : props.status === 'running' ? 'Running' : 'Ready';
  return (
    <span
      className={`jp-CodexStatusPill jp-CodexStatusPill-${props.status}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className="jp-CodexStatusPill-dot" aria-hidden="true" />
    </span>
  );
}

function CodeBlock(props: { lang: string; code: string; canCopy: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const highlightedCode = useMemo(
    () => renderHighlightedCodeToSafeHtml(props.code, props.lang),
    [props.code, props.lang]
  );

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
        {props.canCopy && (
          <button
            className="jp-CodexBtn jp-CodexBtn-ghost jp-CodexBtn-xs jp-CodexCodeBlockCopyBtn"
            onClick={() => void onCopy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <pre className="jp-CodexCodeBlock">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
}

function MessageText(props: { text: string; canCopyCode?: boolean }): JSX.Element {
  const blocks = splitFencedCodeBlocks(props.text);
  return (
    <div className="jp-CodexChat-text">
      {blocks.map((block, idx) => {
        if (block.kind === 'code') {
          return <CodeBlock key={idx} lang={block.lang} code={block.code} canCopy={Boolean(props.canCopyCode)} />;
        }
        const html = renderMarkdownToSafeHtml(block.text);
        return <div key={idx} className="jp-CodexMarkdown" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

function SelectionPreviewCode(props: { code: string }): JSX.Element {
  const displayCode = formatSelectionPreviewTextForDisplay(props.code);
  const highlightedCode = useMemo(
    () => renderHighlightedCodeToSafeHtml(displayCode, ''),
    [displayCode]
  );
  return (
    <pre className="jp-CodexCodeBlock jp-CodexChat-selectionCode">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
    </pre>
  );
}

function CodexChat(props: CodexChatProps): JSX.Element {
  const [sessions, setSessions] = useState<Map<string, NotebookSession>>(new Map());
  const sessionsRef = useRef<Map<string, NotebookSession>>(new Map());
  const [currentNotebookPath, setCurrentNotebookPath] = useState<string>('');
  const currentNotebookPathRef = useRef<string>('');
  const [currentNotebookSessionKey, setCurrentNotebookSessionKey] = useState<string>('');
  const currentNotebookSessionKeyRef = useRef<string>('');
  const [cliDefaults, setCliDefaults] = useState<CliDefaultsSnapshot>({ model: null, reasoningEffort: null });
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(() => FALLBACK_MODEL_OPTIONS);
  const [modelOption, setModelOption] = useState<ModelOptionValue>(() => readDefaultModelOption());
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningOptionValue>(() =>
    readDefaultReasoningEffortOption()
  );
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>(() => readDefaultSandboxModeOption());
  const [commandPath, setCommandPath] = useState<string>(() => readStoredCommandPath());
  const [autoSaveBeforeSend, setAutoSaveBeforeSend] = useState<boolean>(() => readStoredAutoSave());
  const [includeActiveCell, setIncludeActiveCell] = useState<boolean>(() => readStoredIncludeActiveCell());
  const [includeActiveCellOutput, setIncludeActiveCellOutput] = useState<boolean>(() =>
    readStoredIncludeActiveCellOutput()
  );
  const [excludeCellAttachmentForNextSend, setExcludeCellAttachmentForNextSend] = useState<boolean>(false);
  const [notifyOnDone, setNotifyOnDone] = useState<boolean>(() => readStoredNotifyOnDone());
  const [notifyOnDoneMinSeconds, setNotifyOnDoneMinSeconds] = useState<number>(() => readStoredNotifyOnDoneMinSeconds());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => readStoredSettingsOpen());
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImageAttachment[]>([]);
  const pendingImagesRef = useRef<PendingImageAttachment[]>([]);
  const inputRef = useRef<string>('');
  const inputDraftsRef = useRef<Map<string, string>>(new Map());
  const {
    socketRef: wsRef,
    socketConnected,
    isReconnecting,
    reconnect: reconnectSocket
  } = useCodexSocket({
    onOpen: onSocketOpen,
    onClose: onSocketClose,
    onMessage: onSocketMessage
  });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [usagePopoverOpen, setUsagePopoverOpen] = useState(false);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [selectionPopover, setSelectionPopover] = useState<{
    messageId: string;
    preview: MessageContextPreview;
  } | null>(null);
  const storedSelectionPreviewsRef = useRef<Map<string, StoredSelectionPreviewEntry[]>>(
    readStoredSelectionPreviewsByThread()
  );
  const previousSessionThreadIdsRef = useRef<Map<string, string>>(new Map());
  const [rateLimits, setRateLimits] = useState<CodexRateLimitsSnapshot | null>(null);
  const runToSessionKeyRef = useRef<Map<string, string>>(new Map());
  const activeSessionKeyByPathRef = useRef<Map<string, string>>(new Map());
  const sessionThreadSyncIdRef = useRef<string>(createSessionEventId());
  const lastRateLimitsRefreshRef = useRef<number>(0);
  const pendingRefreshPathsRef = useRef<Set<string>>(new Set());
  const activeDocumentWidgetRef = useRef<DocumentWidgetLike | null>(null);
  const notifyOnDoneRef = useRef<boolean>(notifyOnDone);
  const notifyOnDoneMinSecondsRef = useRef<number>(notifyOnDoneMinSeconds);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const modelMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const usageMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const permissionMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const modelPopoverRef = useRef<HTMLDivElement>(null);
  const reasoningBtnRef = useRef<HTMLButtonElement>(null);
  const reasoningPopoverRef = useRef<HTMLDivElement>(null);
  const usageBtnRef = useRef<HTMLButtonElement>(null);
  const usagePopoverRef = useRef<HTMLDivElement>(null);
  const permissionBtnRef = useRef<HTMLButtonElement>(null);
  const permissionPopoverRef = useRef<HTMLDivElement>(null);
  const selectionPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const selectionPopoverRef = useRef<HTMLDivElement>(null);
  const notebookLabelRef = useRef<HTMLSpanElement | null>(null);
  const [isNotebookLabelTruncated, setIsNotebookLabelTruncated] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const storedThreadCount = useMemo<number>(() => getStoredSessionThreadCount(), [sessions]);
  const selectedModel = modelOption === '__config__' ? '' : modelOption;
  const autoModel = cliDefaults.model;
  const autoReasoningEffort = cliDefaults.reasoningEffort;
  const reasoningModel = modelOption === '__config__' ? (autoModel || '') : modelOption;
  const reasoningOptions = useMemo<ReasoningOption[]>(
    () => buildReasoningOptions(cliDefaults.availableModels, reasoningModel),
    [cliDefaults.availableModels, reasoningModel]
  );

  useEffect(() => {
    const dynamicModelOptions = readModelOptions(cliDefaults.availableModels);
    setModelOptions(dynamicModelOptions);
  }, [cliDefaults.availableModels]);

  useEffect(() => {
    if (reasoningEffort === '__config__') {
      return;
    }
    if (reasoningOptions.length > 0 && !reasoningOptions.some(option => option.value === reasoningEffort)) {
      setCurrentSessionReasoningEffort('__config__');
    }
  }, [reasoningEffort, reasoningOptions]);

  useEffect(() => {
    if (reasoningEffort !== '__config__') {
      return;
    }
    if (coerceReasoningEffort(autoReasoningEffort || '')) {
      return;
    }
    const fallbackReasoning = resolveFallbackReasoningEffort(reasoningOptions);
    setCurrentSessionReasoningEffort(fallbackReasoning);
  }, [reasoningEffort, autoReasoningEffort, reasoningOptions]);

  useEffect(() => {
    if (modelOption === '__config__') {
      return;
    }
    if (!modelOptions.some(option => option.value === modelOption)) {
      setCurrentSessionModelOption('__config__');
    }
  }, [modelOption, modelOptions]);

  useEffect(() => {
    if (modelOption !== '__config__') {
      return;
    }
    if ((autoModel || '').trim()) {
      return;
    }
    const firstModel = modelOptions[0]?.value;
    if (!firstModel) {
      return;
    }
    setCurrentSessionModelOption(firstModel);
  }, [modelOption, autoModel, modelOptions]);

  function saveCurrentInputDraft(value: string): void {
    const sessionKey = currentNotebookSessionKeyRef.current || '';
    if (!sessionKey) {
      return;
    }

    const nextDrafts = new Map(inputDraftsRef.current);
    if (value) {
      nextDrafts.set(sessionKey, value);
    } else {
      nextDrafts.delete(sessionKey);
    }
    inputDraftsRef.current = nextDrafts;
  }

  function clearInputForCurrentSession(): void {
    const sessionKey = currentNotebookSessionKeyRef.current || '';
    if (!sessionKey) {
      setInput('');
      inputRef.current = '';
      return;
    }
    saveCurrentInputDraft('');
    setInput('');
    inputRef.current = '';
  }

  function updateInput(nextValue: string): void {
    saveCurrentInputDraft(nextValue);
    setInput(nextValue);
    inputRef.current = nextValue;
  }

  function restoreInput(sessionKey: string): void {
    const restoredInput = sessionKey ? inputDraftsRef.current.get(sessionKey) || '' : '';
    inputRef.current = restoredInput;
    setInput(restoredInput);
  }

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    sessionsRef.current = sessions;
    currentNotebookSessionKeyRef.current = currentNotebookSessionKey;
  }, [sessions]);

  useEffect(() => {
    currentNotebookSessionKeyRef.current = currentNotebookSessionKey;
    persistStoredSessionThreads(sessions);
  }, [sessions, currentNotebookSessionKey]);

  useEffect(() => {
    const sessionKey = currentNotebookSessionKey || '';
    if (!sessionKey) {
      return;
    }
    const session = sessions.get(sessionKey);
    if (!session) {
      return;
    }
    setModelOption(prev => (prev === session.selectedModelOption ? prev : session.selectedModelOption));
    setReasoningEffort(prev =>
      prev === session.selectedReasoningEffort ? prev : session.selectedReasoningEffort
    );
    setSandboxMode(prev => (prev === session.selectedSandboxMode ? prev : session.selectedSandboxMode));
  }, [currentNotebookSessionKey, sessions]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    return () => {
      // Avoid leaking blob URLs if the panel unmounts.
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    persistModel(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    persistAutoSave(autoSaveBeforeSend);
  }, [autoSaveBeforeSend]);

  useEffect(() => {
    persistIncludeActiveCell(includeActiveCell);
  }, [includeActiveCell]);

  useEffect(() => {
    // If the user enables "Include active cell" for the first time, default output to ON as well.
    if (includeActiveCell && !includeActiveCellOutput && !hasStoredValue(INCLUDE_ACTIVE_CELL_OUTPUT_STORAGE_KEY)) {
      setIncludeActiveCellOutput(true);
    }
  }, [includeActiveCell, includeActiveCellOutput]);

  useEffect(() => {
    persistIncludeActiveCellOutput(includeActiveCellOutput);
  }, [includeActiveCellOutput]);

  useEffect(() => {
    // Reset one-time exclusion when the base setting is turned off.
    if (!includeActiveCell && excludeCellAttachmentForNextSend) {
      setExcludeCellAttachmentForNextSend(false);
    }
  }, [includeActiveCell, excludeCellAttachmentForNextSend]);

  useEffect(() => {
    persistCommandPath(commandPath);
  }, [commandPath]);

  useEffect(() => {
    persistReasoningEffort(reasoningEffort);
  }, [reasoningEffort]);

  useEffect(() => {
    persistSandboxMode(sandboxMode);
  }, [sandboxMode]);

  useEffect(() => {
    persistSettingsOpen(settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    notifyOnDoneRef.current = notifyOnDone;
    persistNotifyOnDone(notifyOnDone);
  }, [notifyOnDone]);

  useEffect(() => {
    const normalized = Number.isFinite(notifyOnDoneMinSeconds) ? Math.max(0, Math.floor(notifyOnDoneMinSeconds)) : 0;
    notifyOnDoneMinSecondsRef.current = normalized;
    persistNotifyOnDoneMinSeconds(normalized);
  }, [notifyOnDoneMinSeconds]);

  useEffect(() => {
    if (!modelMenuOpen && !reasoningMenuOpen && !usagePopoverOpen && !permissionMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const inModel = modelMenuWrapRef.current?.contains(target) ?? false;
      const inReasoning = reasoningMenuWrapRef.current?.contains(target) ?? false;
      const inUsage = usageMenuWrapRef.current?.contains(target) ?? false;
      const inPermission = permissionMenuWrapRef.current?.contains(target) ?? false;
      const inModelPopover = modelPopoverRef.current?.contains(target) ?? false;
      const inReasoningPopover = reasoningPopoverRef.current?.contains(target) ?? false;
      const inUsagePopover = usagePopoverRef.current?.contains(target) ?? false;
      const inPermissionPopover = permissionPopoverRef.current?.contains(target) ?? false;
      if (
        inModel ||
        inReasoning ||
        inUsage ||
        inPermission ||
        inModelPopover ||
        inReasoningPopover ||
        inUsagePopover ||
        inPermissionPopover
      ) {
        return;
      }

      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
      setUsagePopoverOpen(false);
      setPermissionMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
      setUsagePopoverOpen(false);
      setPermissionMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modelMenuOpen, reasoningMenuOpen, usagePopoverOpen, permissionMenuOpen]);

  useEffect(() => {
    if (!selectionPopover) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const inAnchor = selectionPopoverAnchorRef.current?.contains(target) ?? false;
      const inPopover = selectionPopoverRef.current?.contains(target) ?? false;
      if (inAnchor || inPopover) {
        return;
      }

      setSelectionPopover(null);
      selectionPopoverAnchorRef.current = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      setSelectionPopover(null);
      selectionPopoverAnchorRef.current = null;
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectionPopover]);

  function closeSelectionPopover(): void {
    setSelectionPopover(null);
    selectionPopoverAnchorRef.current = null;
  }

  function toggleSelectionPopover(
    messageId: string,
    preview: MessageContextPreview,
    event: React.MouseEvent<HTMLButtonElement>
  ): void {
    if (!messageId) {
      return;
    }
    if (selectionPopover?.messageId === messageId) {
      closeSelectionPopover();
      return;
    }
    selectionPopoverAnchorRef.current = event.currentTarget;
    setSelectionPopover({ messageId, preview });
  }

  function commitStoredSelectionPreviews(
    nextByThread: Map<string, StoredSelectionPreviewEntry[]>
  ): void {
    const trimmed = new Map<string, StoredSelectionPreviewEntry[]>();
    const entries = Array.from(nextByThread.entries()).slice(-MAX_STORED_SELECTION_PREVIEW_THREADS);
    for (const [threadId, threadEntries] of entries) {
      if (!threadId || !Array.isArray(threadEntries) || threadEntries.length <= 0) {
        continue;
      }
      trimmed.set(threadId, threadEntries.slice(-MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD));
    }
    storedSelectionPreviewsRef.current = trimmed;
    persistStoredSelectionPreviewsByThread(trimmed);
  }

  function appendStoredSelectionPreviewEntry(
    threadId: string,
    content: string,
    preview: MessageContextPreview | undefined
  ): void {
    const normalizedThreadId = (threadId || '').trim();
    if (!normalizedThreadId) {
      return;
    }
    const hash = hashSelectionPreviewContent(content || '');
    if (!hash) {
      return;
    }

    const next = new Map(storedSelectionPreviewsRef.current);
    const existing = next.get(normalizedThreadId) ?? [];
    const entry: StoredSelectionPreviewEntry = {
      contentHash: hash,
      preview: preview ?? null
    };
    next.delete(normalizedThreadId);
    next.set(
      normalizedThreadId,
      [...existing, entry].slice(-MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD)
    );
    commitStoredSelectionPreviews(next);
  }

  function migrateStoredSelectionPreviewEntries(fromThreadId: string, toThreadId: string): void {
    const from = (fromThreadId || '').trim();
    const to = (toThreadId || '').trim();
    if (!from || !to || from === to) {
      return;
    }

    const current = storedSelectionPreviewsRef.current;
    const sourceEntries = current.get(from);
    if (!sourceEntries || sourceEntries.length <= 0) {
      return;
    }

    const next = new Map(current);
    const targetEntries = next.get(to) ?? [];
    next.delete(from);
    next.delete(to);
    next.set(
      to,
      [...targetEntries, ...sourceEntries].slice(-MAX_STORED_SELECTION_PREVIEW_MESSAGES_PER_THREAD)
    );
    commitStoredSelectionPreviews(next);
  }

  function clearStoredSelectionPreviews(): void {
    storedSelectionPreviewsRef.current = new Map();
    safeLocalStorageRemove(SELECTION_PREVIEWS_STORAGE_KEY);
  }

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

  function resolveSessionKey(path: string): string {
    const normalizedPath = path || '';
    return makeSessionKey(normalizedPath);
  }

  function resolveCurrentSessionKey(path: string): string {
    return resolveSessionKey(path);
  }

  function ensureSession(path: string, sessionKey?: string): NotebookSession {
    const normalizedPath = path || '';
    const effectiveSessionKey = sessionKey || resolveCurrentSessionKey(normalizedPath);
    const existing = sessionsRef.current.get(effectiveSessionKey);
    if (existing) {
      return existing;
    }

    const created = createSession(normalizedPath, `Session started`, { sessionKey: effectiveSessionKey });
    const seeded: NotebookSession = {
      ...created,
      selectedModelOption: modelOption,
      selectedReasoningEffort: reasoningEffort,
      selectedSandboxMode: sandboxMode,
    };
    const next = new Map(sessionsRef.current);
    next.set(effectiveSessionKey, seeded);
    activeSessionKeyByPathRef.current.set(normalizedPath, effectiveSessionKey);
    replaceSessions(next);
    return seeded;
  }

  function updateSessionSelection(
    sessionKey: string,
    selection: Partial<
      Pick<
        NotebookSession,
        'selectedModelOption' | 'selectedReasoningEffort' | 'selectedSandboxMode' | 'effectiveSandboxMode'
      >
    >
  ): void {
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }
    updateSessions(prev => {
      const next = new Map(prev);
      const existing =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      const selectedModelOption = selection.selectedModelOption ?? existing.selectedModelOption;
      const selectedReasoningEffort =
        selection.selectedReasoningEffort ?? existing.selectedReasoningEffort;
      const selectedSandboxMode = selection.selectedSandboxMode ?? existing.selectedSandboxMode;
      const effectiveSandboxMode =
        selection.effectiveSandboxMode ?? existing.effectiveSandboxMode;
      if (
        selectedModelOption === existing.selectedModelOption &&
        selectedReasoningEffort === existing.selectedReasoningEffort &&
        selectedSandboxMode === existing.selectedSandboxMode &&
        effectiveSandboxMode === existing.effectiveSandboxMode
      ) {
        return prev;
      }
      next.set(targetSessionKey, {
        ...existing,
        selectedModelOption,
        selectedReasoningEffort,
        selectedSandboxMode,
        effectiveSandboxMode,
      });
      return next;
    });
  }

  function setCurrentSessionModelOption(nextValue: ModelOptionValue): void {
    setModelOption(nextValue);
    updateSessionSelection(currentNotebookSessionKeyRef.current || '', { selectedModelOption: nextValue });
  }

  function setCurrentSessionReasoningEffort(nextValue: ReasoningOptionValue): void {
    setReasoningEffort(nextValue);
    updateSessionSelection(currentNotebookSessionKeyRef.current || '', { selectedReasoningEffort: nextValue });
  }

  function setCurrentSessionSandboxMode(nextValue: SandboxMode): void {
    setSandboxMode(nextValue);
    updateSessionSelection(currentNotebookSessionKeyRef.current || '', { selectedSandboxMode: nextValue });
  }

  function requestRateLimitsRefresh(force = false): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastRateLimitsRefreshRef.current < 15000) {
      return;
    }
    lastRateLimitsRefreshRef.current = now;

    socket.send(JSON.stringify({ type: 'refresh_rate_limits' }));
  }

  function toggleUsagePopover(): void {
    setUsagePopoverOpen(open => {
      const next = !open;
      if (next) {
        requestRateLimitsRefresh();
      }
      return next;
    });
    setModelMenuOpen(false);
    setReasoningMenuOpen(false);
    setPermissionMenuOpen(false);
  }

  async function updateNotifyOnDone(enabled: boolean): Promise<void> {
    if (!enabled) {
      setNotifyOnDone(false);
      return;
    }

    const permission = getBrowserNotificationPermission();
    const systemSessionKey = currentNotebookSessionKeyRef.current || '';
    if (permission === 'unsupported') {
      appendMessage(systemSessionKey, 'system', 'Browser notifications are not supported in this environment.');
      setNotifyOnDone(false);
      return;
    }
    if (permission === 'granted') {
      setNotifyOnDone(true);
      return;
    }
    if (permission === 'denied') {
      appendMessage(
        systemSessionKey,
        'system',
        'Browser notifications are blocked for this site. Allow notifications in browser settings to enable this option.'
      );
      setNotifyOnDone(false);
      return;
    }

    try {
      const requested = await window.Notification.requestPermission();
      if (requested === 'granted') {
        setNotifyOnDone(true);
        return;
      }
      if (requested === 'denied') {
        appendMessage(
          systemSessionKey,
          'system',
          'Browser notification permission was denied. Allow notifications in browser settings to enable this option.'
        );
      }
      setNotifyOnDone(false);
    } catch {
      appendMessage(systemSessionKey, 'system', 'Failed to request browser notification permission.');
      setNotifyOnDone(false);
    }
  }

  function getRunDurationMs(sessionKey: string): number | null {
    if (!sessionKey) {
      return null;
    }
    const session = sessionsRef.current.get(sessionKey);
    if (!session || typeof session.runStartedAt !== 'number' || !Number.isFinite(session.runStartedAt)) {
      return null;
    }
    return Math.max(0, Date.now() - session.runStartedAt);
  }

  function formatElapsedForNotification(elapsedMs: number): string {
    const totalSeconds = Math.round(Math.max(0, elapsedMs) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
      return `${totalSeconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  }

  function notifyRunDone(sessionKey: string, notebookPath: string, cancelled: boolean, exitCode: number | null): void {
    if (!notifyOnDoneRef.current) {
      return;
    }
    const permission = getBrowserNotificationPermission();
    if (permission !== 'granted' || typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return;
    }

    const elapsedMs = getRunDurationMs(sessionKey);
    const minimumMs = notifyOnDoneMinSecondsRef.current * 1000;
    if (minimumMs > 0 && (elapsedMs === null || elapsedMs < minimumMs)) {
      return;
    }

    const parsed = parseSessionKey(sessionKey);
    const pathLabel = parsed.path || notebookPath || currentNotebookPathRef.current || 'current notebook';
    const pathSummary = truncateMiddle(pathLabel, 120);
    const elapsedText = elapsedMs === null ? '' : ` (${formatElapsedForNotification(elapsedMs)} elapsed)`;
    const body = cancelled
      ? `Run cancelled in ${pathSummary}${elapsedText}`
      : exitCode === null || exitCode === 0
        ? `Run completed in ${pathSummary}${elapsedText}`
        : `Run failed (exit ${exitCode}) in ${pathSummary}${elapsedText}`;

    try {
      const notification = new window.Notification('Codex run finished', {
        body,
        tag: sessionKey ? `codex-done-${sessionKey}` : undefined
      });
      window.setTimeout(() => notification.close(), 12000);
    } catch {
      // Ignore failures; completion is still shown in the panel.
    }
  }

  function emitSessionThreadEvent(sessionKey: string, notebookPath: string, threadId: string): void {
    const source = sessionThreadSyncIdRef.current;
    const payload: SessionThreadSyncEvent = {
      kind: 'new-thread',
      sessionKey,
      notebookPath,
      threadId,
      source,
      id: createSessionEventId(),
      issuedAt: Date.now()
    };
    try {
      window.localStorage.setItem(SESSION_THREADS_EVENT_KEY, JSON.stringify(payload));
    } catch {
      // Ignore sync write failures; local tab still updates immediately.
    }
  }

  function sendStartSession(
    session: NotebookSession,
    notebookPath: string,
    sessionKey: string,
    options?: { forceNewThread?: boolean }
  ): void {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const normalizedCommandPath = commandPath.trim();

    socket.send(
      JSON.stringify(
        buildStartSessionMessage({
          sessionId: session.threadId,
          sessionContextKey: sessionKey,
          notebookPath,
          forceNewThread: options?.forceNewThread === true,
          commandPath: normalizedCommandPath || undefined
        })
      )
    );
  }

  function syncEffectiveSandboxFromStatus(sessionKey: string, rawMode: unknown): void {
    if (!sessionKey) {
      return;
    }
    const nextMode = coerceSandboxMode(rawMode);
    if (!nextMode) {
      return;
    }
    updateSessionSelection(sessionKey, { effectiveSandboxMode: nextMode });
  }

  function deleteAllSessionsOnServer(): boolean {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(buildDeleteAllSessionsMessage()));
      return true;
    } catch {
      return false;
    }
  }

  function setSessionRunState(sessionKey: string, runState: RunState, runId: string | null): void {
    if (!sessionKey) {
      return;
    }

    const now = Date.now();
    updateSessions(prev => {
      const next = new Map(prev);
      const existing = next.get(sessionKey) ?? createSession('', `Session started`, { sessionKey });
      const session = next.get(sessionKey) ?? existing;
      let messages = session.messages;
      let runStartedAt = session.runStartedAt;

      if (runState === 'running' && session.runState !== 'running') {
        runStartedAt = now;
      }
      if (runState === 'ready' && session.runState === 'running') {
        const startedAt = runStartedAt;
        if (typeof startedAt === 'number' && Number.isFinite(startedAt)) {
          const elapsedMs = Math.max(0, now - startedAt);
          messages = [...messages, { kind: 'run-divider', id: crypto.randomUUID(), elapsedMs }];
        }
        runStartedAt = null;
      }

      const progress = session.runState === runState ? session.progress : '';
      const progressKind = session.runState === runState ? session.progressKind : '';
      next.set(sessionKey, { ...session, messages, runState, activeRunId: runId, runStartedAt, progress, progressKind });
      return next;
    });
  }

  function setSessionProgress(sessionKey: string, progress: string, kind: ProgressKind = ''): void {
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }

    const nextProgress = progress ? truncateMiddle(progress, 260) : '';
    const nextKind: ProgressKind = nextProgress ? kind : '';
    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      if (session.progress === nextProgress && session.progressKind === nextKind) {
        return prev;
      }
      next.set(targetSessionKey, { ...session, progress: nextProgress, progressKind: nextKind });
      return next;
    });
  }

  function appendActivityItem(sessionKey: string, item: Omit<ActivityItem, 'id' | 'ts'>): void {
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      const entry: ActivityItem = { id: crypto.randomUUID(), ts: Date.now(), ...item };
      const extractCommandKey = (detail: string): string => {
        const raw = (detail || '').trim();
        if (!raw) {
          return '';
        }
        // Completed entries may include extra lines (e.g. exit code).
        return raw.split('\n')[0].trim();
      };
      const normalizePhaseBaseTitle = (title: string): string => {
        const raw = (title || '').trim();
        if (!raw) {
          return '';
        }
        return raw.replace(/\s+(started|completed)\s*$/i, '').trim();
      };
      const extractGenericKey = (title: string, detail: string): string => {
        const base = normalizePhaseBaseTitle(title);
        const firstLine = (detail || '').trim().split('\n')[0].trim();
        return `${base}::${firstLine}`;
      };

      const messages = session.messages;

      // Avoid noisy duplicates like repeated "Reasoning step" lines.
      if (entry.category === 'reasoning') {
        const last = messages[messages.length - 1];
        if (last && last.kind === 'activity') {
          const previousItem = last.item;
          if (
            previousItem.category === entry.category &&
            previousItem.phase === entry.phase &&
            previousItem.title === entry.title &&
            previousItem.detail === entry.detail
          ) {
            return prev;
          }
        }
      }

      // If we have a corresponding "started" command, update it in place instead of appending.
      if (entry.category === 'command' && entry.phase === 'completed') {
        const key = extractCommandKey(entry.detail);
        if (key) {
          for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const msg = messages[idx];
            if (msg.kind !== 'activity') {
              continue;
            }
            const existing = msg.item;
            if (existing.category !== 'command' || existing.phase !== 'started') {
              continue;
            }
            if (extractCommandKey(existing.detail) !== key) {
              continue;
            }
            const updated: ActivityItem = {
              ...existing,
              phase: 'completed',
              title: entry.title,
              detail: entry.detail,
              raw: entry.raw,
            };
            const updatedMessages: ChatEntry[] = [
              ...messages.slice(0, idx),
              { ...msg, item: updated },
              ...messages.slice(idx + 1),
            ];
            next.set(targetSessionKey, { ...session, messages: updatedMessages });
            return next;
          }
        }
      }

      // Generic: If we have a corresponding "started" tool/event line, update it in place.
      // This keeps pairs like "Web Search started" -> "Web Search completed" on a single line.
      if (entry.phase === 'completed') {
        const key = extractGenericKey(entry.title, entry.detail);
        if (key) {
          for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
            const msg = messages[idx];
            if (msg.kind !== 'activity') {
              continue;
            }
            const existing = msg.item;
            if (existing.phase !== 'started') {
              continue;
            }
            if (extractGenericKey(existing.title, existing.detail) !== key) {
              continue;
            }
            const updated: ActivityItem = {
              ...existing,
              phase: 'completed',
              title: entry.title,
              detail: entry.detail,
              raw: entry.raw,
            };
            const updatedMessages: ChatEntry[] = [
              ...messages.slice(0, idx),
              { ...msg, item: updated },
              ...messages.slice(idx + 1),
            ];
            next.set(targetSessionKey, { ...session, messages: updatedMessages });
            return next;
          }
        }
      }

      const updatedMessages: ChatEntry[] = [...messages, { kind: 'activity', id: entry.id, item: entry }];
      next.set(targetSessionKey, { ...session, messages: updatedMessages });
      return next;
    });
  }

  function setSessionPairing(
    sessionKey: string,
    pairing: {
      pairedOk: boolean | null;
      pairedPath: string;
      pairedOsPath: string;
      pairedMessage: string;
      notebookMode: NotebookMode | null;
    }
  ): void {
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      next.set(targetSessionKey, {
        ...session,
        ...pairing,
        notebookMode: pairing.notebookMode ?? session.notebookMode,
      });
      return next;
    });
  }

  function setSessionConversationMode(sessionKey: string, rawMode: unknown): void {
    const mode = coerceConversationMode(rawMode);
    if (!mode) {
      return;
    }
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      if (session.conversationMode === mode) {
        return prev;
      }
      next.set(targetSessionKey, { ...session, conversationMode: mode });
      return next;
    });
  }

  function resolveMessageSessionKey(msg: any): string {
    const messagePath = typeof msg.notebookPath === 'string' ? msg.notebookPath : '';
    const sessionContextKey = typeof msg.sessionContextKey === 'string' ? msg.sessionContextKey : '';
    if (sessionContextKey) {
      return sessionContextKey;
    }

    const runId = typeof msg.runId === 'string' ? msg.runId : '';
    if (runId) {
      const mapped = runToSessionKeyRef.current.get(runId);
      if (mapped) {
        return mapped;
      }
    }

    if (messagePath) {
      if (runId) {
        const activeSessionKey = activeSessionKeyByPathRef.current.get(messagePath);
        if (activeSessionKey) {
          runToSessionKeyRef.current.set(runId, activeSessionKey);
          return activeSessionKey;
        }
      }
      const activeSessionKey = activeSessionKeyByPathRef.current.get(messagePath);
      if (activeSessionKey) {
        return activeSessionKey;
      }
      return makeSessionKey(messagePath);
    }

    if (runId) {
      const mapped = runToSessionKeyRef.current.get(runId);
      if (mapped) {
        return mapped;
      }
    }

    return currentNotebookSessionKeyRef.current || '';
  }

  function appendMessage(sessionKey: string, role: TextRole, text: string): void {
    if (!text) {
      return;
    }
    const targetSessionKey = sessionKey || currentNotebookSessionKeyRef.current || '';
    if (!targetSessionKey) {
      return;
    }
    const nextText = normalizeSystemText(role, text);

    updateSessions(prev => {
      const next = new Map(prev);
      const session =
        next.get(targetSessionKey) ?? createSession('', `Session started`, { sessionKey: targetSessionKey });
      const messages = session.messages;
      // Keep each incoming message as a distinct bubble for readability.
      const updatedMessages: ChatEntry[] = [
        ...messages,
        { kind: 'text', id: crypto.randomUUID(), role, text: nextText }
      ];

      next.set(targetSessionKey, { ...session, messages: updatedMessages });
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

  function clearRunMappingForSessionKey(targetSessionKey: string): void {
    const runToSessionKey = runToSessionKeyRef.current;
    const next = new Map(runToSessionKey);
    for (const [runId, mappedSessionKey] of runToSessionKey) {
      if (mappedSessionKey === targetSessionKey) {
        next.delete(runId);
      }
    }
    runToSessionKeyRef.current = next;
  }

  async function clearAllSessions(): Promise<void> {
    const count = getStoredSessionThreadCount();
    if (!count && sessions.size === 0) {
      return;
    }

    const result = await showDialog({
      title: 'Delete all conversations',
      body: `This will delete ${count} saved conversation(s) and all in-memory messages in this panel.`,
      buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Delete' })]
    });
    if (!result.button.accept) {
      return;
    }

    const activeSessionKey = currentNotebookSessionKeyRef.current || '';
    if (activeSessionKey) {
      clearRunMappingForSessionKey(activeSessionKey);
    }
    markDeleteAllPending();
    if (!deleteAllSessionsOnServer() && activeSessionKey) {
      appendMessage(activeSessionKey, 'system', 'Delete request could not be sent now. It will be retried when you reconnect.');
    }
    runToSessionKeyRef.current = new Map();
    activeSessionKeyByPathRef.current = new Map();
    safeLocalStorageRemove(SESSION_THREADS_STORAGE_KEY);
    clearStoredSelectionPreviews();
    replaceSessions(new Map());
    clearInputForCurrentSession();
    clearPendingImages();
  }

  async function refreshNotebook(sessionKey: string): Promise<void> {
    const { path } = parseSessionKey(sessionKey);
    if (!path) {
      return;
    }

    const widget = findDocumentWidgetByPath(props.app, path, activeDocumentWidgetRef.current);
    if (!widget) {
      pendingRefreshPathsRef.current.add(sessionKey);
      return;
    }
    const context: any = getDocumentContext(widget);
    if (!context || typeof context.revert !== 'function') {
      pendingRefreshPathsRef.current.add(sessionKey);
      return;
    }
    activeDocumentWidgetRef.current = widget;

    if (context.model.dirty) {
      const result = await showDialog({
        title: 'Document has unsaved changes',
        body: 'Codex updated source files. Reload this document now? (Unsaved changes will be lost.)',
        buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Reload' })]
      });
      if (!result.button.accept) {
        pendingRefreshPathsRef.current.add(sessionKey);
        return;
      }
    }

    const viewState = captureDocumentViewState(widget);
    try {
      await context.revert();
      restoreDocumentViewState(widget, viewState);
      appendMessage(sessionKey, 'system', 'Document refreshed due to file changes.');
      pendingRefreshPathsRef.current.delete(sessionKey);
    } catch (err) {
      appendMessage(sessionKey, 'system', `Failed to refresh document: ${String(err)}`);
      pendingRefreshPathsRef.current.add(sessionKey);
    }
  }

  useEffect(() => {
    const updateNotebook = () => {
      const activeWidget = getActiveDocumentWidget(props.app, activeDocumentWidgetRef.current);
      if (activeWidget) {
        activeDocumentWidgetRef.current = activeWidget;
      }
      const path = getSupportedDocumentPath(activeWidget);
      const sessionKey = resolveSessionKey(path);
      const previousKey = currentNotebookSessionKeyRef.current;
      if (sessionKey && sessionKey === previousKey) {
        return;
      }

      if (previousKey) {
        saveCurrentInputDraft(inputRef.current);
      }

      currentNotebookPathRef.current = path;
      setCurrentNotebookPath(path);
      setCurrentNotebookSessionKey(sessionKey);
      currentNotebookSessionKeyRef.current = sessionKey;
      if (!sessionKey) {
        clearInputForCurrentSession();
        return;
      }
      restoreInput(sessionKey);
      clearPendingImages();
      setIsAtBottom(true);

      if (!path) {
        return;
      }

      const session = ensureSession(path, sessionKey);
      activeSessionKeyByPathRef.current.set(path, sessionKey);
      sendStartSession(session, path, sessionKey);
      if (pendingRefreshPathsRef.current.has(sessionKey)) {
        void refreshNotebook(sessionKey);
        return;
      }
    };

    updateNotebook();
    const shellChanged = props.app.shell.currentChanged;
    if (shellChanged) {
      shellChanged.connect(updateNotebook);
    }
    props.notebooks.currentChanged.connect(updateNotebook);

    return () => {
      if (shellChanged) {
        shellChanged.disconnect(updateNotebook);
      }
      props.notebooks.currentChanged.disconnect(updateNotebook);
    };
  }, [props.app, props.notebooks]);

  useEffect(() => {
    const onActiveCellChanged = (_tracker: INotebookTracker, _cell: unknown) => {
      if (!includeActiveCell || !excludeCellAttachmentForNextSend) {
        return;
      }

      const currentNotebookWidget = props.notebooks.currentWidget as DocumentWidgetLike | null;
      const currentNotebookWidgetPath = getSupportedDocumentPath(currentNotebookWidget);
      if (!currentNotebookWidgetPath || currentNotebookWidgetPath !== currentNotebookPathRef.current) {
        return;
      }
      setExcludeCellAttachmentForNextSend(false);
    };

    props.notebooks.activeCellChanged.connect(onActiveCellChanged);
    return () => {
      props.notebooks.activeCellChanged.disconnect(onActiveCellChanged);
    };
  }, [props.notebooks, includeActiveCell, excludeCellAttachmentForNextSend]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_THREADS_EVENT_KEY || !event.newValue) {
        return;
      }

      const syncEvent = coerceSessionThreadSyncEvent(event.newValue);
      if (!syncEvent) {
        return;
      }
      if (syncEvent.source === sessionThreadSyncIdRef.current) {
        return;
      }

      const notebookPath = syncEvent.notebookPath;
      const sessionKey = syncEvent.sessionKey;
      const threadId = syncEvent.threadId;
      if (!notebookPath || !sessionKey || !threadId) {
        return;
      }

      const resolvedSessionKey = resolveSessionKey(notebookPath);
      if (!resolvedSessionKey || resolvedSessionKey !== sessionKey) {
        return;
      }

      const resetSession = createThreadResetSession(notebookPath, sessionKey, threadId);
      const currentPath = currentNotebookPathRef.current;

      updateSessions(prev => {
        const next = new Map(prev);
        const existing = next.get(sessionKey);
        if (existing && existing.threadId === threadId) {
          return prev;
        }
        next.set(sessionKey, resetSession);
        return next;
      });
      activeSessionKeyByPathRef.current.set(notebookPath, sessionKey);
      clearRunMappingForSessionKey(sessionKey);

      if (currentPath === notebookPath && currentNotebookSessionKeyRef.current !== sessionKey) {
        setCurrentNotebookSessionKey(sessionKey);
      }
      if (currentPath === notebookPath) {
        clearInputForCurrentSession();
        clearPendingImages();
      }
      sendStartSession(resetSession, notebookPath, sessionKey);
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function onSocketOpen(): void {
    if (hasDeleteAllPending()) {
      deleteAllSessionsOnServer();
    }

    const activeWidget = getActiveDocumentWidget(props.app, activeDocumentWidgetRef.current);
    if (activeWidget) {
      activeDocumentWidgetRef.current = activeWidget;
    }
    const notebookPath = currentNotebookPathRef.current || getSupportedDocumentPath(activeWidget);
    if (!notebookPath) {
      return;
    }

    const currentSessionKey = resolveCurrentSessionKey(notebookPath);
    const session = ensureSession(notebookPath, currentSessionKey);
    sendStartSession(session, notebookPath, currentSessionKey);
  }

  function onSocketClose(): void {
    runToSessionKeyRef.current = new Map();
  }

  function onSocketMessage(rawMessage: unknown): void {
    handleCodexSocketMessage(rawMessage, {
      appendMessage,
      clearDeleteAllPending,
      coerceModelCatalog: parseModelCatalog,
      coerceReasoningEffort,
      coerceRateLimitsSnapshot,
      coerceSessionHistory,
      coerceNotebookMode,
      createSession,
      deleteAllSessionsOnServer,
      getCommandPath: () => commandPath,
      getCurrentSessionKey: () => currentNotebookSessionKeyRef.current,
      getStoredSelectionPreviews: () => storedSelectionPreviewsRef.current,
      hashSelectionPreviewContent,
      hasDeleteAllPending,
      isNoiseCodexEvent,
      isSessionStartNotice,
      markDeleteAllPending,
      normalizeSystemText,
      notifyRunDone,
      refreshNotebook,
      resolveMessageSessionKey,
      runToSessionKeyRef,
      setCliDefaults,
      setCommandPath,
      setRateLimits,
      setSessionConversationMode,
      setSessionPairing,
      setSessionProgress,
      setSessionRunState,
      summarizeCodexEvent,
      appendActivityItem,
      syncEffectiveSandboxFromStatus,
      updateSessions: updater =>
        updateSessions(
          previous => updater(previous as Map<string, Record<string, unknown>>) as Map<string, NotebookSession>
        )
    });
  }

  useEffect(() => {
    if (!isAtBottom) {
      return;
    }
    const id = window.requestAnimationFrame(() => scrollToBottom());
    return () => window.cancelAnimationFrame(id);
  }, [isAtBottom, sessions, currentNotebookPath, socketConnected]);

  function autosizeComposerTextarea(el?: HTMLTextAreaElement | null): void {
    const textarea = el ?? composerTextareaRef.current;
    if (!textarea) {
      return;
    }

    // Reset first so it can shrink as content is removed.
    textarea.style.height = 'auto';

    const cs = window.getComputedStyle(textarea);

    // Prefer CSS-controlled min/max heights so the JS sizing stays consistent
    // with the visual design (and any future CSS tweaks).
    let minHeight = Number.parseFloat(cs.minHeight || '');
    let maxHeight = Number.parseFloat(cs.maxHeight || '');

    if (!Number.isFinite(minHeight) || minHeight <= 0) {
      const fontSize = Number.parseFloat(cs.fontSize || '13');
      let lineHeight = Number.parseFloat(cs.lineHeight || '');
      if (!Number.isFinite(lineHeight)) {
        lineHeight = fontSize * 1.35;
      }
      minHeight = lineHeight;
    }

    if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
      const fontSize = Number.parseFloat(cs.fontSize || '13');
      let lineHeight = Number.parseFloat(cs.lineHeight || '');
      if (!Number.isFinite(lineHeight)) {
        lineHeight = fontSize * 1.35;
      }
      maxHeight = lineHeight * 3;
    }

    const scrollHeight = textarea.scrollHeight;
    const isEmpty = textarea.value.length === 0;
    const unclampedHeight = isEmpty ? minHeight : scrollHeight;
    const nextHeight = Math.ceil(Math.min(Math.max(unclampedHeight, minHeight), maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight + 1 ? 'auto' : 'hidden';
  }

  useEffect(() => {
    // Defer to the next frame so layout reflects the latest value.
    const id = window.requestAnimationFrame(() => autosizeComposerTextarea());
    return () => window.cancelAnimationFrame(id);
  }, [input]);

  useEffect(() => {
    const onResize = () => autosizeComposerTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function startNewThread(): Promise<void> {
    const path = currentNotebookPathRef.current || '';
    const sessionKey = currentNotebookSessionKeyRef.current || '';
    if (!path) {
      return;
    }
    if (!sessionKey) {
      return;
    }

    const existing = sessionsRef.current.get(sessionKey);
    const hasConversation =
      existing?.messages.some(
        msg => msg.kind === 'text' && (msg.role === 'user' || msg.role === 'assistant')
      ) ?? false;
    if (hasConversation) {
      const result = await showDialog({
        title: 'Start a new thread?',
        body:
          'Starting a new thread will reset the current conversation, and you will not be able to view the previous conversation in this panel.\nContinue?',
        buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'New thread' })]
      });
      if (!result.button.accept) {
        return;
      }
    }

    const newSessionBase = createThreadResetSession(path, sessionKey, createSessionEventId());
    const newSession: NotebookSession = {
      ...newSessionBase,
      selectedModelOption: modelOption,
      selectedReasoningEffort: reasoningEffort,
      selectedSandboxMode: sandboxMode,
    };
    updateSessions(prev => {
      const next = new Map(prev);
      next.set(sessionKey, newSession);
      return next;
    });
    clearRunMappingForSessionKey(sessionKey);
    clearInputForCurrentSession();
    clearPendingImages();
    sendStartSession(newSession, path, sessionKey, { forceNewThread: true });
    emitSessionThreadEvent(sessionKey, path, newSession.threadId);
  }

  function cancelRun(): void {
    const socket = wsRef.current;
    const sessionKey = currentNotebookSessionKeyRef.current || '';
    if (!sessionKey) {
      return;
    }
    const session = sessionKey ? sessionsRef.current.get(sessionKey) : null;
    const runId = session?.activeRunId ?? null;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendMessage(sessionKey, 'system', 'Cancel failed: WebSocket is not connected.');
      return;
    }
    if (!runId) {
      appendMessage(sessionKey, 'system', 'Cancel not available yet (waiting for run id).');
      return;
    }

    setSessionProgress(sessionKey, 'Cancelling...');
    socket.send(JSON.stringify(buildCancelMessage(runId)));
  }

  function clearPendingImages(): void {
    for (const image of pendingImagesRef.current) {
      URL.revokeObjectURL(image.previewUrl);
    }
    pendingImagesRef.current = [];
    setPendingImages([]);
  }

  function removePendingImage(id: string): void {
    setPendingImages(prev => {
      const removed = prev.find(image => image.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      const next = prev.filter(image => image.id !== id);
      pendingImagesRef.current = next;
      return next;
    });
  }

  function onComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) {
      return;
    }

    const found: File[] = [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      if (!item || item.kind !== 'file' || !item.type.startsWith('image/')) {
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        found.push(file);
      }
    }

    if (found.length === 0) {
      return;
    }

    const existingCount = pendingImagesRef.current.length;
    if (existingCount >= MAX_IMAGE_ATTACHMENTS) {
      appendMessage(
        currentNotebookSessionKeyRef.current || '',
        'system',
        `Too many images attached (max ${MAX_IMAGE_ATTACHMENTS}).`
      );
      return;
    }

    const remainingSlots = MAX_IMAGE_ATTACHMENTS - existingCount;
    const toAdd: PendingImageAttachment[] = [];
    let skippedLarge = 0;
    let skippedTotal = 0;
    let totalBytes = pendingImagesRef.current.reduce((sum, image) => sum + image.file.size, 0);
    for (const file of found.slice(0, remainingSlots)) {
      if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        skippedLarge += 1;
        continue;
      }
      if (totalBytes + file.size > MAX_IMAGE_ATTACHMENT_TOTAL_BYTES) {
        skippedTotal += 1;
        continue;
      }
      toAdd.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
      totalBytes += file.size;
    }

    if (skippedLarge > 0) {
      appendMessage(
        currentNotebookSessionKeyRef.current || '',
        'system',
        `Skipped ${skippedLarge} image(s): each must be <= ${Math.round(MAX_IMAGE_ATTACHMENT_BYTES / (1024 * 1024))}MB.`
      );
    }
    if (skippedTotal > 0) {
      appendMessage(
        currentNotebookSessionKeyRef.current || '',
        'system',
        `Skipped ${skippedTotal} image(s): total attachments must be <= ${Math.round(MAX_IMAGE_ATTACHMENT_TOTAL_BYTES / (1024 * 1024))}MB.`
      );
    }

    if (toAdd.length === 0) {
      return;
    }

    setPendingImages(prev => {
      const next = [...prev, ...toAdd];
      pendingImagesRef.current = next;
      return next;
    });
  }

  async function sendMessage(): Promise<void> {
    const socket = wsRef.current;
    const notebookPath = currentNotebookPathRef.current || '';
    const sessionKey = currentNotebookSessionKeyRef.current || '';

    if (!notebookPath) {
      return;
    }
    if (!sessionKey) {
      return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendMessage(sessionKey, 'system', 'WebSocket is not connected.');
      return;
    }

    const existing = sessionKey ? sessionsRef.current.get(sessionKey) : null;
    if (existing?.pairedOk === false) {
      appendMessage(
        sessionKey,
        'system',
        existing.pairedMessage ||
          `Jupytext paired file not found. Expected: ${existing.pairedOsPath || existing.pairedPath || '<notebook>.py'}`
      );
      return;
    }

    const trimmed = input.trim();
    const hasImages = pendingImagesRef.current.length > 0;
    if (!trimmed && !hasImages) {
      return;
    }

    const current = sessionKey ? sessionsRef.current.get(sessionKey) : null;
    if (current?.runState === 'running') {
      return;
    }

    const activeWidget = findDocumentWidgetByPath(props.app, notebookPath, activeDocumentWidgetRef.current);
    if (activeWidget) {
      activeDocumentWidgetRef.current = activeWidget;
    }
    const activeWidgetPath = getSupportedDocumentPath(activeWidget);
    const activeContext: any = activeWidget ? getDocumentContext(activeWidget) : null;
    if (
      autoSaveBeforeSend &&
      activeContext &&
      typeof activeContext.save === 'function' &&
      activeWidgetPath === notebookPath &&
      activeContext.model.dirty
    ) {
      try {
        await activeContext.save();
      } catch (err) {
        appendMessage(sessionKey, 'system', `Auto-save failed: ${String(err)}`);
        return;
      }
    }

    const notebookMode = current?.notebookMode ?? inferNotebookModeFromPath(notebookPath);
    const selectedContext = getSelectedContext(activeWidget, notebookMode);
    const selectedTextForContext = selectedContext?.text || '';
    let includeSelectionKey = false;
    let selection = '';
    const includeActiveCellForNextSend = includeActiveCell && !excludeCellAttachmentForNextSend;
    if (includeActiveCellForNextSend) {
      if (notebookMode === 'plain_py') {
        const selectedText =
          selectedTextForContext || getSelectedTextFromActiveCell(activeWidget) || getSelectedTextFromFileEditor(activeWidget);
        if (selectedText) {
          includeSelectionKey = true;
          selection = selectedText;
        }
      } else {
        includeSelectionKey = true;
        selection =
          selectedTextForContext || getActiveCellText(activeWidget) || getSelectedTextFromFileEditor(activeWidget);
      }
    }
    const messageSelectionPreview =
      toSelectionPreview(selectedContext) ||
      (includeSelectionKey ? toFallbackSelectionPreview(activeWidget, notebookMode, selection) : undefined);
    const includeCellOutputKey =
      includeActiveCellForNextSend && includeActiveCellOutput && notebookMode === 'ipynb';
    const cellOutput = includeCellOutputKey ? getActiveCellOutput(activeWidget) : '';
    const messageCellOutputPreview =
      includeCellOutputKey && cellOutput
        ? toCellOutputPreview(selectedContext, activeWidget, notebookMode, cellOutput)
        : undefined;
    const messageContextPreview: MessageContextPreview | undefined =
      messageSelectionPreview || messageCellOutputPreview
        ? {
            ...(messageSelectionPreview ? { selectionPreview: messageSelectionPreview } : {}),
            ...(messageCellOutputPreview ? { cellOutputPreview: messageCellOutputPreview } : {})
          }
        : undefined;
    const session = ensureSession(notebookPath, sessionKey);
    const modelForSend = current?.selectedModelOption ?? modelOption;
    const reasoningForSend = current?.selectedReasoningEffort ?? reasoningEffort;
    const sandboxForSend = current?.selectedSandboxMode ?? sandboxMode;
    const selectedModelForSend =
      modelForSend === '__config__' ? (autoModel || '').trim() : modelForSend.trim();
    const selectedReasoningForSend =
      reasoningForSend === '__config__'
        ? coerceReasoningEffort(autoReasoningEffort || '') || resolveFallbackReasoningEffort(reasoningOptions)
        : reasoningForSend;
    if (!selectedModelForSend) {
      appendMessage(
        sessionKey,
        'system',
        'Model is not resolved yet. Wait for model defaults to load, or pick a model explicitly.'
      );
      return;
    }
    if (!selectedReasoningForSend) {
      appendMessage(
        sessionKey,
        'system',
        'Reasoning level is not resolved yet. Wait for defaults to load, or pick a reasoning level explicitly.'
      );
      return;
    }

    const content = trimmed || (hasImages ? 'Please analyze the attached image(s).' : '');
    let images: { name: string; dataUrl: string }[] | undefined;
    if (hasImages) {
      try {
        images = [];
        for (const image of pendingImagesRef.current) {
          const dataUrl = await blobToDataUrl(image.file);
          images.push({ name: image.file.name || 'clipboard-image', dataUrl });
        }
      } catch (err) {
        appendMessage(sessionKey, 'system', `Failed to attach image(s): ${String(err)}`);
        return;
      }
    }

    socket.send(
      JSON.stringify(
        buildSendMessage({
          sessionId: session.threadId,
          sessionContextKey: sessionKey,
          content,
          notebookPath,
          commandPath: commandPath.trim(),
          model: selectedModelForSend,
          reasoningEffort: selectedReasoningForSend,
          sandbox: sandboxForSend,
          ...(includeSelectionKey ? { selection } : {}),
          ...(includeCellOutputKey ? { cellOutput } : {}),
          ...(images ? { images } : {}),
          ...(messageSelectionPreview ? { uiSelectionPreview: messageSelectionPreview } : {}),
          ...(messageCellOutputPreview ? { uiCellOutputPreview: messageCellOutputPreview } : {})
        })
      )
    );
    appendStoredSelectionPreviewEntry(session.threadId, content, messageContextPreview);

    const imageCount = pendingImagesRef.current.length;
    const showReadOnlyWarning = sandboxForSend === 'read-only';
    updateSessions(prev => {
      const next = new Map(prev);
      const existing = next.get(sessionKey) ?? createSession('', `Session started`, { sessionKey });
      const warningEntry: ChatEntry[] = showReadOnlyWarning
        ? [
            {
              kind: 'text',
              id: crypto.randomUUID(),
              role: 'system',
              text: normalizeSystemText('system', READ_ONLY_PERMISSION_WARNING)
            }
          ]
        : [];
      const updatedMessages: ChatEntry[] = [
        ...existing.messages,
        ...warningEntry,
        {
          kind: 'text',
          id: crypto.randomUUID(),
          role: 'user',
          text: content,
          attachments: imageCount > 0 ? { images: imageCount } : undefined,
          selectionPreview: messageSelectionPreview,
          cellOutputPreview: messageCellOutputPreview
        }
      ];
      next.set(sessionKey, {
        ...existing,
        messages: updatedMessages,
        runState: 'running',
        activeRunId: null,
        runStartedAt: Date.now(),
        progress: '',
        progressKind: '',
      });
      return next;
    });
    clearInputForCurrentSession();
    clearPendingImages();
    setExcludeCellAttachmentForNextSend(false);
  }

  const currentSession = currentNotebookSessionKey ? sessions.get(currentNotebookSessionKey) : null;
  const messages = currentSession?.messages ?? [];
  const progress = currentSession?.progress ?? '';
  const progressKind = currentSession?.progressKind ?? '';
  const status: PanelStatus = socketConnected ? currentSession?.runState ?? 'ready' : 'disconnected';

  useEffect(() => {
    closeSelectionPopover();
  }, [currentNotebookSessionKey]);

  useEffect(() => {
    if (!selectionPopover) {
      return;
    }
    const exists = messages.some(entry => entry.kind === 'text' && entry.id === selectionPopover.messageId);
    if (exists) {
      return;
    }
    closeSelectionPopover();
  }, [messages, selectionPopover]);

  useEffect(() => {
    const previous = previousSessionThreadIdsRef.current;
    for (const [sessionKey, session] of sessions) {
      const nextThreadId = (session?.threadId || '').trim();
      const previousThreadId = (previous.get(sessionKey) || '').trim();
      if (previousThreadId && nextThreadId && previousThreadId !== nextThreadId) {
        migrateStoredSelectionPreviewEntries(previousThreadId, nextThreadId);
      }
    }

    const nextBySessionKey = new Map<string, string>();
    for (const [sessionKey, session] of sessions) {
      const threadId = (session?.threadId || '').trim();
      if (!sessionKey || !threadId) {
        continue;
      }
      nextBySessionKey.set(sessionKey, threadId);
    }
    previousSessionThreadIdsRef.current = nextBySessionKey;
  }, [sessions]);

  const displayPath = currentNotebookPath
    ? currentNotebookPath.split('/').pop() || 'Untitled'
    : 'No notebook';
  const includeActiveCellForNextSend = includeActiveCell && !excludeCellAttachmentForNextSend;
  const composerNotebookMode = currentSession?.notebookMode ?? inferNotebookModeFromPath(currentNotebookPath);
  const includeCellOutputForNextSend =
    includeActiveCellForNextSend && includeActiveCellOutput && composerNotebookMode === 'ipynb';
  const showCellAttachmentBadge =
    includeActiveCellForNextSend && currentNotebookPath.length > 0 && currentSession?.pairedOk !== false;
  const canSend =
    status === 'ready' &&
    currentNotebookPath.length > 0 &&
    currentSession?.pairedOk !== false;
  const runningSummary = status === 'running' ? progress || 'Working...' : '';
  const activeModelOption = currentSession?.selectedModelOption ?? modelOption;
  const activeReasoningEffort = currentSession?.selectedReasoningEffort ?? reasoningEffort;
  const activeSandboxMode = currentSession?.selectedSandboxMode ?? sandboxMode;
  const autoModelLabel = autoModel
    ? findModelLabel(autoModel, modelOptions)
    : 'Auto';
  const selectedModelLabel =
    activeModelOption === '__config__'
      ? autoModelLabel
      : findModelLabel(activeModelOption, modelOptions);
  const autoReasoningLabel = autoReasoningEffort
    ? findReasoningLabel(autoReasoningEffort, reasoningOptions)
    : 'Auto';
  const selectedReasoningLabel =
    activeReasoningEffort === '__config__'
      ? autoReasoningLabel
      : findReasoningLabel(activeReasoningEffort, reasoningOptions);
  const selectedSandboxLabel = SANDBOX_OPTIONS.find(option => option.value === activeSandboxMode)?.label ?? 'Permission';
  const notificationPermission = getBrowserNotificationPermission();
  const notificationsUnsupported = notificationPermission === 'unsupported';
  const minimumNotifyDurationLabel =
    notifyOnDoneMinSeconds === 0
      ? 'All completed runs'
      : `Runs taking at least ${notifyOnDoneMinSeconds} second${notifyOnDoneMinSeconds === 1 ? '' : 's'}`;
  const notificationHelpText =
    notificationPermission === 'unsupported'
      ? 'Browser notifications are not available in this environment.'
      : notificationPermission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in browser settings.'
        : notificationPermission === 'default'
          ? 'Permission will be requested when enabling this option.'
          : `Shows a browser notification for ${minimumNotifyDurationLabel}.`;
  const canStop = status === 'running' && Boolean(currentSession?.activeRunId);
  const nowMs = Date.now();
  const rateUpdatedAtMs = safeParseDateMs(rateLimits?.updatedAt ?? null);
  const rateAgeMs = rateUpdatedAtMs == null ? null : nowMs - rateUpdatedAtMs;
  const usageIsStale = rateAgeMs == null ? true : rateAgeMs > 10 * 60 * 1000;
  const sessionLeftPercent = percentLeftFromUsed(rateLimits?.primary?.usedPercent ?? null);
  const weeklyLeftPercent = percentLeftFromUsed(rateLimits?.secondary?.usedPercent ?? null);
  const usageIsUnknown = rateUpdatedAtMs == null && sessionLeftPercent == null && weeklyLeftPercent == null;
  const sessionResetsIn = formatResetsIn(rateLimits?.primary?.resetsAt ?? null, nowMs);
  const weeklyResetsIn = formatResetsIn(rateLimits?.secondary?.resetsAt ?? null, nowMs);
  const usageIsOverdue =
    sessionResetsIn === 'Overdue' || weeklyResetsIn === 'Overdue' || (rateAgeMs != null && rateAgeMs > 60 * 60 * 1000);
  const batteryLevel = sessionLeftPercent == null ? null : sessionLeftPercent / 100;
  const usageUpdatedAgo = rateAgeMs == null ? 'Unknown' : `${formatDurationShort(rateAgeMs)} ago`;
  const sessionWindowMinutes = rateLimits?.primary?.windowMinutes ?? null;
  const weeklyWindowMinutes = rateLimits?.secondary?.windowMinutes ?? null;
  const sessionWindowLabel = sessionWindowMinutes == null ? '' : `Window: ${Math.round(sessionWindowMinutes / 60)}h`;
  const weeklyWindowLabel =
    weeklyWindowMinutes == null ? '' : `Window: ${Math.round(weeklyWindowMinutes / (60 * 24))}d`;
  const contextWindowTokens = rateLimits?.contextWindow?.windowTokens ?? null;
  const contextUsedTokens = rateLimits?.contextWindow?.usedTokens ?? null;
  const contextLeftTokens = rateLimits?.contextWindow?.leftTokens ?? null;
  const contextUsedPercent = rateLimits?.contextWindow?.usedPercent ?? null;
  const contextLevel =
    typeof contextUsedPercent === 'number' && Number.isFinite(contextUsedPercent)
      ? clampNumber(contextUsedPercent / 100, 0, 1)
      : null;
  const contextUsedLabel = formatTokenCount(contextUsedTokens);
  const contextLeftLabel = formatTokenCount(contextLeftTokens);
  const contextWindowLabel = formatTokenCount(contextWindowTokens);
  const contextUsedPercentLabel =
    typeof contextUsedPercent === 'number' && Number.isFinite(contextUsedPercent)
      ? `${Math.round(clampNumber(contextUsedPercent, 0, 100))}%`
      : 'Unknown';
  const hasContextUsageSnapshot = rateLimits?.contextWindow != null;

  useLayoutEffect(() => {
    const target = notebookLabelRef.current;
    if (!target) {
      setIsNotebookLabelTruncated(false);
      return;
    }

    const update = (): void => {
      const next = target.scrollWidth - target.clientWidth > 1;
      setIsNotebookLabelTruncated(prev => (prev === next ? prev : next));
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => {
        window.removeEventListener('resize', update);
      };
    }

    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(target);
    if (target.parentElement) {
      observer.observe(target.parentElement);
    }
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [currentNotebookPath]);

  return (
    <div className="jp-CodexChat">
      <div className="jp-CodexChat-header">
        <div className="jp-CodexChat-header-top">
          <div className="jp-CodexChat-header-left">
            <StatusPill status={status} />
            <span className="jp-CodexChat-notebookWrap" data-full-name={isNotebookLabelTruncated ? displayPath : undefined}>
              <span className="jp-CodexChat-notebook" ref={notebookLabelRef} title={isNotebookLabelTruncated ? displayPath : undefined}>
                {displayPath}
              </span>
            </span>
          </div>
	          <div className="jp-CodexChat-header-actions">
	            <button
	              type="button"
	              onClick={() => void startNewThread()}
	              className="jp-CodexHeaderBtn"
	              disabled={!currentNotebookPath || status === 'running'}
	              aria-label="New thread"
	              title="New thread"
	            >
	              <PlusIcon width={16} height={16} />
	            </button>
	            <div
	              className="jp-CodexMenuWrap"
	              ref={usageMenuWrapRef}
	            >
	              <button
	                type="button"
	                className={`jp-CodexHeaderBtn jp-CodexHeaderBtn-icon jp-CodexUsageBtn${usagePopoverOpen ? ' is-active is-open' : ''}${usageIsStale ? ' is-stale' : ''}${usageIsOverdue ? ' is-overdue' : ''}`}
	                ref={usageBtnRef}
	                onClick={() => toggleUsagePopover()}
	                aria-label={sessionLeftPercent == null ? 'Codex usage' : `Codex usage: ${sessionLeftPercent}% left`}
	                aria-haspopup="dialog"
	                aria-expanded={usagePopoverOpen}
	                title={
	                  sessionLeftPercent == null
	                    ? 'Codex usage: unknown'
	                    : `Codex usage: ${sessionLeftPercent}% left (resets in ${sessionResetsIn})`
	                }
	              >
	                <BatteryIcon level={batteryLevel} width={16} height={16} />
	              </button>
	            </div>
	            <PortalMenu
	              open={usagePopoverOpen}
	              anchorRef={usageBtnRef}
	              popoverRef={usagePopoverRef}
	              className="jp-CodexUsagePopover"
	              ariaLabel="Codex usage"
	              role="dialog"
	              align="right"
	            >
	              {(usageIsOverdue || usageIsStale) && (
	                <div
	                  className={`jp-CodexUsageNotice${usageIsOverdue ? ' is-overdue' : usageIsStale ? ' is-stale' : ''}`}
	                >
	                  <div className="jp-CodexUsageNoticeTitle">
	                    {usageIsUnknown
	                      ? 'Usage unavailable'
	                      : usageIsOverdue
	                        ? 'Overdue usage snapshot'
	                        : 'Stale usage snapshot'}
	                  </div>
	                  <div className="jp-CodexUsageNoticeBody">
	                    {usageIsUnknown ? 'Run Codex once to fetch usage limits.' : 'Run Codex again to refresh these numbers.'}
	                  </div>
	                </div>
	              )}

	              <div className="jp-CodexUsageSection">
	                <div className="jp-CodexUsageSectionTop">
	                  <div className="jp-CodexUsageSectionTitle">Session</div>
	                  <div className="jp-CodexUsageSectionReset">Resets in {sessionResetsIn}</div>
	                </div>
	                <div className="jp-CodexUsageBar">
	                  <div
	                    className={`jp-CodexUsageBarFill${usageIsStale ? ' is-stale' : ''}`}
	                    style={{ width: `${sessionLeftPercent ?? 0}%` }}
	                  />
	                </div>
	                <div className="jp-CodexUsageMeta">
	                  <div className="jp-CodexUsageMetaLeft">
	                    {sessionLeftPercent == null ? '--% left' : `${sessionLeftPercent}% left`}
	                  </div>
	                  <div className="jp-CodexUsageMetaRight">{sessionWindowLabel}</div>
	                </div>
	              </div>

	              <div className="jp-CodexMenuDivider" role="separator" />

	              <div className="jp-CodexUsageSection">
	                <div className="jp-CodexUsageSectionTop">
	                  <div className="jp-CodexUsageSectionTitle">Weekly</div>
	                  <div className="jp-CodexUsageSectionReset">Resets in {weeklyResetsIn}</div>
	                </div>
	                <div className="jp-CodexUsageBar">
	                  <div
	                    className={`jp-CodexUsageBarFill${usageIsStale ? ' is-stale' : ''}`}
	                    style={{ width: `${weeklyLeftPercent ?? 0}%` }}
	                  />
	                </div>
	                <div className="jp-CodexUsageMeta">
	                  <div className="jp-CodexUsageMetaLeft">
	                    {weeklyLeftPercent == null ? '--% left' : `${weeklyLeftPercent}% left`}
	                  </div>
	                  <div className="jp-CodexUsageMetaRight">{weeklyWindowLabel}</div>
	                </div>
	              </div>

	              <div className="jp-CodexUsageFooter">Last updated: {usageUpdatedAgo}</div>
	            </PortalMenu>
	            <button
	              type="button"
	              onClick={() => {
                  setSettingsOpen(open => !open);
                  setModelMenuOpen(false);
                  setReasoningMenuOpen(false);
                  setUsagePopoverOpen(false);
                  setPermissionMenuOpen(false);
                }}
	              className={`jp-CodexHeaderBtn jp-CodexHeaderBtn-icon${settingsOpen ? ' is-active' : ''}`}
	              aria-label="Settings"
              aria-expanded={settingsOpen}
              title="Settings"
            >
	              <GearIcon width={16} height={16} />
	            </button>
	          </div>
	        </div>

        {currentSession?.pairedOk === false && (
          <div className="jp-CodexPairingNotice" role="status" aria-live="polite">
            <div className="jp-CodexPairingNotice-title">Jupytext pairing required</div>
            <div className="jp-CodexPairingNotice-body">
              {currentSession.pairedMessage ||
                'This notebook must be paired (.ipynb ↔ .py) via Jupytext to enable running.'}
            </div>
          </div>
        )}

      </div>

      <div className="jp-CodexChat-body">
        <div className="jp-CodexChat-messages" ref={scrollRef} onScroll={onScrollMessages}>
          {status === 'disconnected' && (
            <div className="jp-CodexChat-message jp-CodexChat-system jp-CodexChat-reconnectNotice">
              <div className="jp-CodexChat-role">system</div>
              <div className="jp-CodexChat-text">Codex connection was lost. Reconnect to continue.</div>
              <button
                type="button"
                className="jp-CodexReconnectBtn"
                onClick={() => reconnectSocket()}
                disabled={isReconnecting}
                aria-label={isReconnecting ? 'Codex reconnecting' : 'Reconnect to Codex'}
                title={isReconnecting ? 'Attempting to reconnect...' : 'Reconnect to Codex'}
              >
                {isReconnecting ? 'Connecting...' : 'Reconnect'}
              </button>
            </div>
          )}
          {messages.length === 0 && (
            <div className="jp-CodexChat-message jp-CodexChat-system">
              <div className="jp-CodexChat-role">system</div>
              <div className="jp-CodexChat-text">Select a notebook, then start a conversation.</div>
            </div>
          )}
	          {messages.map(entry => {
		            if (entry.kind === 'text') {
	              const systemVariant =
	                entry.role === 'system'
	                  ? isSessionStartNotice(entry.text)
	                    ? ' is-success'
	                    : ''
	                  : '';
		              const imageCount = entry.attachments?.images ?? 0;
                const selectionPreview = entry.selectionPreview;
                const cellOutputPreview = entry.cellOutputPreview;
                const hasSelectionPreview =
                  entry.role === 'user' &&
                  Boolean(selectionPreview?.locationLabel && selectionPreview?.previewText);
                const hasCellOutputPreview =
                  entry.role === 'user' &&
                  Boolean(cellOutputPreview?.locationLabel && cellOutputPreview?.previewText);
                const hasContextPreview = hasSelectionPreview || hasCellOutputPreview;
                const isSelectionPreviewOpen = hasContextPreview && selectionPopover?.messageId === entry.id;
                const messageClassName = `jp-CodexChat-message jp-CodexChat-${entry.role}${systemVariant}${
                  hasContextPreview ? ' has-selection-preview' : ''
                }${isSelectionPreviewOpen ? ' is-selection-open' : ''}`;
	              return (
	                <div
	                  key={entry.id}
	                  className={messageClassName}
	                >
	                  <div className="jp-CodexChat-role">{entry.role}</div>
	                  <MessageText text={entry.text} canCopyCode={entry.role === 'assistant'} />
	                  {imageCount > 0 && (
	                    <div
	                      className="jp-CodexChat-attachments"
	                      aria-label={`${imageCount} image attachment(s)`}
	                      title={`${imageCount} image attachment(s)`}
	                    >
	                      <span className="jp-CodexChat-attachmentPill">
	                        <ImageIcon width={14} height={14} />
	                        <span className="jp-CodexChat-attachmentCount">{imageCount}</span>
	                      </span>
	                    </div>
	                  )}
                    {hasContextPreview && (
                      <button
                        type="button"
                        className={`jp-CodexChat-selectionToggle${isSelectionPreviewOpen ? ' is-open' : ''}`}
                        onClick={event =>
                          toggleSelectionPopover(
                            entry.id,
                            {
                              ...(selectionPreview ? { selectionPreview } : {}),
                              ...(cellOutputPreview ? { cellOutputPreview } : {})
                            },
                            event
                          )
                        }
                        aria-label={isSelectionPreviewOpen ? 'Hide message context' : 'Show message context'}
                      >
                        <PlusIcon width="1em" height="1em" />
                      </button>
                    )}
	                </div>
		              );
		            }
              if (entry.kind === 'run-divider') {
                return (
                  <div key={entry.id} className="jp-CodexRunDivider" role="separator" aria-label="Run duration">
                    <span className="jp-CodexRunDividerLabel">Worked for {formatRunDuration(entry.elapsedMs)}</span>
                  </div>
                );
              }

	            const item = entry.item;
            const trimmedDetail = (item.detail || '').trim();
            const isExpandable = Boolean(trimmedDetail);
            const activityClassName = `jp-CodexChat-message jp-CodexChat-activity${
              isExpandable ? ' is-expandable' : ''
            } is-${item.category}${item.phase ? ` is-${item.phase}` : ''}`;
            const icon =
              item.category === 'file' ? (
                <FileIcon width={14} height={14} />
              ) : item.phase === 'completed' ? (
                <CheckIcon width={14} height={14} />
              ) : item.phase === 'started' ? (
                <span className="jp-CodexActivityDot" />
              ) : (
                <span className="jp-CodexActivityDot is-idle" />
              );

            const summaryContent = (
              <>
                <span className="jp-CodexActivityLineIcon" aria-hidden="true">
                  {icon}
                </span>
                <span className="jp-CodexActivityLineText">
                  <span className="jp-CodexActivityLineTitle">{item.title}</span>
                </span>
              </>
            );

            if (isExpandable) {
              return (
                <details
                  key={entry.id}
                  className={activityClassName}
                  role="status"
                  aria-live="polite"
                >
                  <summary className="jp-CodexActivitySummary">{summaryContent}</summary>
                  <div className="jp-CodexActivityBody">
                    <pre className="jp-CodexActivityCode">
                      <code>{trimmedDetail}</code>
                    </pre>
                  </div>
                </details>
              );
            }
            return (
              <div
                key={entry.id}
                className={activityClassName}
                role="status"
                aria-live="polite"
              >
                <div className="jp-CodexActivitySummary jp-CodexActivitySummaryStatic">
                  {summaryContent}
                </div>
              </div>
            );
          })}

	          {status === 'running' && (
	            <div
	              className={`jp-CodexChat-loading${progressKind === 'reasoning' ? ' is-reasoning' : ''}`}
	              aria-label={progressKind === 'reasoning' ? 'Reasoning' : 'Running'}
	            >
	              <div className="jp-CodexChat-loading-dots">
	                <span></span>
	                <span></span>
	                <span></span>
	              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>
      <PortalMenu
        open={Boolean(selectionPopover)}
        anchorRef={selectionPopoverAnchorRef}
        popoverRef={selectionPopoverRef}
        className="jp-CodexChat-selectionPopover"
        ariaLabel="Message context"
        constrainHeightToViewport={true}
        viewportMargin={20}
        role="dialog"
        align="right"
      >
        {selectionPopover && (
          <div className="jp-CodexChat-selectionCard" role="note" aria-label="Message context">
            {selectionPopover.preview.selectionPreview && (
              <div className="jp-CodexChat-contextSection">
                <div className="jp-CodexChat-selectionMeta">{selectionPopover.preview.selectionPreview.locationLabel}</div>
                <SelectionPreviewCode code={selectionPopover.preview.selectionPreview.previewText} />
              </div>
            )}
            {selectionPopover.preview.cellOutputPreview && (
              <div className="jp-CodexChat-contextSection">
                <div className="jp-CodexChat-selectionMeta">{selectionPopover.preview.cellOutputPreview.locationLabel}</div>
                <SelectionPreviewCode code={selectionPopover.preview.cellOutputPreview.previewText} />
              </div>
            )}
          </div>
        )}
      </PortalMenu>

      <div className="jp-CodexChat-input">
        <div className={`jp-CodexJumpBar${isAtBottom ? '' : ' is-visible'}`}>
          <button
            type="button"
            className="jp-CodexJumpToLatestBtn"
            onClick={scrollToBottom}
            aria-label="Jump to latest"
            aria-hidden={isAtBottom}
            tabIndex={isAtBottom ? -1 : 0}
            title="Jump to latest"
          >
            <ArrowDownIcon width={20} height={20} />
          </button>
        </div>
	        <div className="jp-CodexComposer">
            <div
              className={`jp-CodexComposer-cellAttachmentWrap${showCellAttachmentBadge ? ' is-visible' : ''}`}
              aria-hidden={!showCellAttachmentBadge}
            >
              <div
                className="jp-CodexComposer-cellAttachment"
                role="group"
                aria-label="Pending active-cell attachment"
                title={
                  includeCellOutputForNextSend
                    ? 'Active cell and output will be attached on next send.'
                    : 'Active cell will be attached on next send.'
                }
              >
                <span className="jp-CodexComposer-cellAttachmentLabel">Cell Attached</span>
                <button
                  type="button"
                  className="jp-CodexComposer-cellAttachmentRemove"
                  onClick={() => setExcludeCellAttachmentForNextSend(true)}
                  aria-label="Do not attach cell on next send"
                  title="Do not attach cell on next send"
                  disabled={!showCellAttachmentBadge}
                  tabIndex={showCellAttachmentBadge ? 0 : -1}
                >
                  <XIcon width={10} height={10} />
                </button>
              </div>
            </div>
	          <textarea
	            ref={composerTextareaRef}
	            value={input}
	            onChange={e => {
	              updateInput(e.currentTarget.value);
	              // Resize using the current target so typing feels immediate.
	              window.requestAnimationFrame(() => autosizeComposerTextarea(e.currentTarget));
	            }}
	            onPaste={onComposerPaste}
	            placeholder={
	              currentSession?.pairedOk === false
	                ? 'Disabled: missing Jupytext paired file (.py)'
	                : currentNotebookPath
	                  ? 'Ask Codex...'
	                  : 'Select a notebook first'
	            }
	            rows={1}
	            onKeyDown={e => {
	              // Avoid interfering with IME composition (Korean/Japanese/etc.)
	              const native = e.nativeEvent as unknown as { isComposing?: boolean; keyCode?: number };
	              if (native.isComposing || native.keyCode === 229) {
	                return;
	              }
	              if (e.key === 'Enter' && !e.shiftKey && canSend && (input.trim() || pendingImages.length > 0)) {
	                e.preventDefault();
	                void sendMessage();
	              }
	            }}
	          />
	          {pendingImages.length > 0 && (
	            <div className="jp-CodexComposer-attachments" role="group" aria-label="Attachments">
	              {pendingImages.map(image => (
	                <div key={image.id} className="jp-CodexComposer-attachment">
	                  <img src={image.previewUrl} alt={image.file.name || 'Pasted image'} />
	                  <button
	                    type="button"
	                    className="jp-CodexComposer-attachmentRemove"
	                    onClick={() => removePendingImage(image.id)}
	                    aria-label="Remove image"
	                    title="Remove image"
	                  >
	                    <XIcon width={14} height={14} />
	                  </button>
	                </div>
	              ))}
	            </div>
	          )}
	          <div className="jp-CodexComposer-toolbar">
	            <div className="jp-CodexComposer-toolbarLeft">
	              <div className="jp-CodexMenuWrap jp-CodexModelWrap" ref={modelMenuWrapRef}>
	                <button
                  type="button"
                  ref={modelBtnRef}
                  className={`jp-CodexModelBtn ${modelMenuOpen ? 'is-open' : ''}`}
                  onClick={() => {
                    setModelMenuOpen(open => !open);
                    setReasoningMenuOpen(false);
                    setUsagePopoverOpen(false);
                    setPermissionMenuOpen(false);
                  }}
                  disabled={status === 'running'}
                  aria-label={`Model: ${selectedModelLabel}`}
                  aria-haspopup="menu"
	                  aria-expanded={modelMenuOpen}
	                  title={`Model: ${selectedModelLabel}`}
	                >
	                  <span className="jp-CodexModelBtn-label">{selectedModelLabel}</span>
	                </button>
	              </div>
	              <PortalMenu
	                open={modelMenuOpen}
	                anchorRef={modelBtnRef}
                popoverRef={modelPopoverRef}
                role="menu"
                ariaLabel="Model"
                align="left"
              >
                {modelOptions.length === 0 && (
                  <div className="jp-CodexMenuItem">No models available</div>
                )}
                {modelOptions.map(option => {
                  const inferred =
                    activeModelOption === '__config__' && autoModel && modelOptions.some(option => option.value === autoModel)
                      ? (autoModel as ModelOptionValue)
                      : activeModelOption;
                  const isActive = inferred === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`jp-CodexMenuItem ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setCurrentSessionModelOption(option.value);
                        setModelMenuOpen(false);
                      }}
                    >
                      <span className="jp-CodexMenuItemLabel">{option.label}</span>
                      {isActive && (
                        <CheckIcon className="jp-CodexMenuCheck" width={16} height={16} />
                      )}
                    </button>
                  );
                })}
              </PortalMenu>

              <div className="jp-CodexMenuWrap" ref={reasoningMenuWrapRef}>
                <button
                  type="button"
                  ref={reasoningBtnRef}
                  className={`jp-CodexIconBtn ${reasoningMenuOpen ? 'is-open' : ''}`}
                  onClick={() => {
                    setReasoningMenuOpen(open => !open);
                    setModelMenuOpen(false);
                    setUsagePopoverOpen(false);
                    setPermissionMenuOpen(false);
                  }}
                  disabled={status === 'running'}
                  aria-label={`Reasoning: ${selectedReasoningLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={reasoningMenuOpen}
                  title={`Reasoning: ${selectedReasoningLabel}`}
                >
                  <ReasoningEffortIcon
                    effort={
                      (activeReasoningEffort === '__config__' && autoReasoningEffort
                        ? autoReasoningEffort
                        : activeReasoningEffort) as ReasoningOptionValue
                    }
                    effortOptions={reasoningOptions}
                    width={17}
                    height={17}
                  />
                </button>
              </div>
                <PortalMenu
                open={reasoningMenuOpen}
                anchorRef={reasoningBtnRef}
                popoverRef={reasoningPopoverRef}
                role="menu"
                ariaLabel="Reasoning"
                align="left"
              >
                {reasoningOptions.length === 0 && (
                  <div className="jp-CodexMenuItem">No reasoning options</div>
                )}
                {reasoningOptions.map(option => {
                  const inferred =
                    activeReasoningEffort === '__config__' && autoReasoningEffort ? autoReasoningEffort : activeReasoningEffort;
                  const isActive = inferred === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`jp-CodexMenuItem ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setCurrentSessionReasoningEffort(option.value);
                        setReasoningMenuOpen(false);
                      }}
                    >
                      <span className="jp-CodexMenuItemLabel">{option.label}</span>
                      {isActive && (
                        <CheckIcon className="jp-CodexMenuCheck" width={16} height={16} />
                      )}
                    </button>
                  );
                })}
	              </PortalMenu>
	
	              <div className="jp-CodexMenuWrap" ref={permissionMenuWrapRef}>
	                <button
	                  type="button"
	                  className={`jp-CodexIconBtn jp-CodexPermissionBtn${permissionMenuOpen ? ' is-open' : ''}${activeSandboxMode === 'danger-full-access' ? ' is-danger' : ''}${activeSandboxMode === 'read-only' ? ' is-warning' : ''}`}
	                  ref={permissionBtnRef}
                  onClick={() => {
                    setPermissionMenuOpen(open => !open);
                    setModelMenuOpen(false);
                    setReasoningMenuOpen(false);
                    setUsagePopoverOpen(false);
                  }}
                  disabled={status === 'running'}
                  aria-label={`Permission: ${selectedSandboxLabel}`}
                  aria-haspopup="menu"
                  aria-expanded={permissionMenuOpen}
                  title={`Permission: ${selectedSandboxLabel}`}
                >
                  <ShieldIcon width={17} height={17} />
                </button>
              </div>
              <PortalMenu
                open={permissionMenuOpen}
                anchorRef={permissionBtnRef}
                popoverRef={permissionPopoverRef}
                role="menu"
                ariaLabel="Permissions"
                align="right"
              >
	                {SANDBOX_OPTIONS.map(option => (
	                  <button
	                    key={option.value}
	                    type="button"
	                    className={`jp-CodexMenuItem ${activeSandboxMode === option.value ? 'is-active' : ''}`}
	                    onClick={() => {
	                      setCurrentSessionSandboxMode(option.value);
	                      setPermissionMenuOpen(false);
	                    }}
	                  >
                    <span className="jp-CodexMenuItemLabel">{option.label}</span>
                    {activeSandboxMode === option.value && <CheckIcon className="jp-CodexMenuCheck" width={16} height={16} />}
                  </button>
                ))}
              </PortalMenu>
              {hasContextUsageSnapshot && (
                <div className="jp-CodexContextWrap">
                  <button
                    type="button"
                    className={`jp-CodexIconBtn jp-CodexContextBtn${usageIsStale ? ' is-stale' : ''}`}
                    aria-label={
                      contextUsedTokens == null || contextLeftTokens == null
                        ? 'Context window usage unavailable'
                        : `Context window: used ${contextUsedLabel} tokens, left ${contextLeftLabel} tokens`
                    }
                    title={
                      contextUsedTokens == null || contextLeftTokens == null
                        ? 'Context window usage unavailable'
                        : `Used ${contextUsedLabel} / left ${contextLeftLabel}`
                    }
                  >
                    <ContextWindowIcon level={contextLevel} width={20} height={20} />
                  </button>
                  <div className="jp-CodexContextPopover" role="tooltip">
                    <div className="jp-CodexContextPopoverTitle">Context window</div>
                    <div className="jp-CodexContextPopoverRow">
                      <span>Used</span>
                      <strong>{contextUsedLabel}</strong>
                    </div>
                    <div className="jp-CodexContextPopoverRow">
                      <span>Left</span>
                      <strong>{contextLeftLabel}</strong>
                    </div>
                    <div className="jp-CodexContextPopoverMeta">
                      {contextWindowTokens == null
                        ? 'Window size unavailable'
                        : `Window: ${contextWindowLabel} tokens (${contextUsedPercentLabel} used)`}
                    </div>
                  </div>
                </div>
              )}
            </div>

	            <div className="jp-CodexComposer-toolbarRight">
	              <button
	                type="button"
	                className={`jp-CodexSendBtn${status === 'running' ? ' is-stop' : ''}`}
                onClick={() => {
                  if (status === 'running') {
                    cancelRun();
                    return;
                  }
                  void sendMessage();
                }}
                disabled={status === 'running' ? !canStop : !canSend || (!input.trim() && pendingImages.length === 0)}
                aria-label={status === 'running' ? 'Stop run' : 'Send'}
                title={
                  status === 'running'
                    ? currentSession?.activeRunId
                      ? `runId: ${currentSession.activeRunId}`
                      : 'Waiting for run id...'
                    : status === 'disconnected'
                      ? 'Connecting...'
                      : 'Send'
                }
              >
                {status === 'running' ? (
                  <StopIcon width={18} height={18} />
                ) : (
                  <ArrowUpIcon width={18} height={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="jp-CodexSettingsOverlay" role="dialog" aria-modal="true" aria-label="Settings">
          <button
            type="button"
            className="jp-CodexSettingsBackdrop"
            onClick={() => setSettingsOpen(false)}
            aria-label="Dismiss settings"
            title="Dismiss settings"
          />
          <div className="jp-CodexSettingsPanel" onClick={e => e.stopPropagation()}>
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
            <div className="jp-CodexSettingsPanel-sections">
              <section className="jp-CodexSettingsSection" aria-label="General settings">
                <div className="jp-CodexSettingsSection-title">General</div>
                <label className="jp-CodexSettingsField">
                  <span className="jp-CodexSettingsField-label">Codex command path</span>
                  <input
                    type="text"
                    className="jp-CodexChat-model-input"
                    placeholder="codex"
                    value={commandPath}
                    disabled={status === 'running'}
                    onChange={e => setCommandPath(e.currentTarget.value.trimStart())}
                    title="Leave empty to use PATH lookup."
                  />
                  <span className="jp-CodexSettingsField-help">Leave empty to use PATH lookup.</span>
                </label>
              </section>

              <section className="jp-CodexSettingsSection" aria-label="Message options">
                <div className="jp-CodexSettingsSection-title">Message Options</div>
                <div className="jp-CodexSettingsOptions">
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
                      checked={includeActiveCell}
                      onChange={e => setIncludeActiveCell(e.currentTarget.checked)}
                      disabled={status === 'running'}
                    />
                    Include active cell
                  </label>
                  <label className="jp-CodexChat-toggle">
                    <input
                      type="checkbox"
                      checked={includeActiveCellOutput}
                      onChange={e => setIncludeActiveCellOutput(e.currentTarget.checked)}
                      disabled={status === 'running' || !includeActiveCell}
                    />
                    Include active cell output
                  </label>
                </div>
              </section>

              <section className="jp-CodexSettingsSection" aria-label="Notification options">
                <div className="jp-CodexSettingsSection-title">NOTIFICATION</div>
                <div className="jp-CodexSettingsOptions">
                  <label className="jp-CodexChat-toggle">
                    <input
                      type="checkbox"
                      checked={notifyOnDone}
                      onChange={e => void updateNotifyOnDone(e.currentTarget.checked)}
                      disabled={status === 'running' || notificationsUnsupported}
                    />
                    Notify when run finishes
                  </label>
                  <label className="jp-CodexSettingsField">
                    <span className="jp-CodexSettingsField-label">Minimum runtime (seconds)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="jp-CodexChat-model-input"
                      value={notifyOnDoneMinSeconds}
                      onChange={e =>
                        setNotifyOnDoneMinSeconds(
                          Number.isFinite(Number(e.currentTarget.value)) ? Math.max(0, Math.floor(Number(e.currentTarget.value))) : 0
                        )
                      }
                      disabled={notificationsUnsupported}
                    />
                    <span className="jp-CodexSettingsField-help">
                      0 means notify for every finished run. Enter only when you want delayed notifications.
                    </span>
                  </label>
                  <span className="jp-CodexSettingsField-help">{notificationHelpText}</span>
                </div>
              </section>

              <section className="jp-CodexSettingsSection jp-CodexSettingsSection-danger" aria-label="Danger zone">
                <div className="jp-CodexSettingsSection-title jp-CodexSettingsSection-title-danger">Danger Zone</div>
                <div className="jp-CodexSettingsPanel-stats">
                  <span className="jp-CodexSettingsPanel-stat">
                    Saved conversations: {storedThreadCount}
                  </span>
                </div>
                <div className="jp-CodexSettingsDanger">
                  <button
                    type="button"
                    className="jp-CodexBtn jp-CodexBtn-xs jp-CodexBtn-danger"
                    onClick={() => void clearAllSessions()}
                    disabled={status === 'running' || (storedThreadCount === 0 && sessions.size === 0)}
                    title={
                      status === 'running'
                        ? 'Cannot delete while a run is in progress.'
                        : 'Delete all saved conversations'
                    }
                  >
                    Delete all
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type DocumentWidgetLike = {
  isDisposed?: boolean;
  context?: {
    path?: string;
    model?: { dirty?: boolean };
    save?: () => Promise<void>;
    revert?: () => Promise<void>;
  };
  content?: any;
};

function getDocumentContext(widget: DocumentWidgetLike | null): any {
  return widget && widget.context ? widget.context : null;
}

function getSupportedDocumentPath(widget: DocumentWidgetLike | null): string {
  const rawPath = typeof widget?.context?.path === 'string' ? widget.context.path.trim() : '';
  if (!rawPath) {
    return '';
  }
  const lower = rawPath.toLowerCase();
  if (lower.endsWith('.ipynb') || lower.endsWith('.py')) {
    return rawPath;
  }
  return '';
}

function getActiveDocumentWidget(
  app: JupyterFrontEnd,
  fallbackWidget: DocumentWidgetLike | null
): DocumentWidgetLike | null {
  const current = app.shell.currentWidget as any;
  const currentPath = getSupportedDocumentPath(current as DocumentWidgetLike | null);
  if (currentPath) {
    return current as DocumentWidgetLike;
  }

  if (fallbackWidget && !fallbackWidget.isDisposed && getSupportedDocumentPath(fallbackWidget)) {
    return fallbackWidget;
  }
  return null;
}

function findDocumentWidgetByPath(
  app: JupyterFrontEnd,
  path: string,
  fallbackWidget: DocumentWidgetLike | null = null
): DocumentWidgetLike | null {
  const normalizedPath = (path || '').trim();
  if (!normalizedPath) {
    return null;
  }

  const current = app.shell.currentWidget as any;
  if (getSupportedDocumentPath(current as DocumentWidgetLike | null) === normalizedPath) {
    return current as DocumentWidgetLike;
  }

  if (
    fallbackWidget &&
    !fallbackWidget.isDisposed &&
    getSupportedDocumentPath(fallbackWidget) === normalizedPath
  ) {
    return fallbackWidget;
  }

  const iterator: any = app.shell.widgets('main');
  if (iterator && typeof iterator.next === 'function') {
    while (true) {
      const candidate = iterator.next() as any;
      if (!candidate) {
        break;
      }
      if (getSupportedDocumentPath(candidate as DocumentWidgetLike) === normalizedPath) {
        return candidate as DocumentWidgetLike;
      }
    }
  }
  return null;
}

function isNotebookWidget(widget: DocumentWidgetLike | null): boolean {
  return Boolean(widget && widget.content && 'activeCell' in widget.content);
}

type DocumentViewState = {
  scrollTop: number;
  scrollLeft: number;
  activeCellIndex: number | null;
};

function isScrollableElement(element: HTMLElement | null): element is HTMLElement {
  if (!element) {
    return false;
  }
  return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return Boolean(value && value instanceof HTMLElement);
}

function querySelectorIncludingSelf(root: HTMLElement, selector: string): HTMLElement | null {
  if (root.matches(selector)) {
    return root;
  }
  return root.querySelector(selector) as HTMLElement | null;
}

function getPrimaryDocumentScrollContainer(widget: DocumentWidgetLike | null): HTMLElement | null {
  const contentNode = (widget as any)?.content?.node;
  const widgetNode = (widget as any)?.node;
  const roots = [contentNode, widgetNode].filter(isHTMLElement);
  if (roots.length === 0) {
    return null;
  }

  const candidates = [
    '.jp-WindowedPanel-outer',
    '.jp-Notebook .jp-WindowedPanel-outer',
    '.jp-NotebookPanel-notebook .jp-WindowedPanel-outer',
    '.jp-FileEditor .cm-scroller',
    '.jp-FileEditor .jp-CodeMirrorEditor',
    '.cm-scroller',
    '.jp-FileEditor'
  ];

  for (const root of roots) {
    for (const selector of candidates) {
      const node = querySelectorIncludingSelf(root, selector);
      if (isScrollableElement(node)) {
        return node;
      }
    }
  }

  for (const root of roots) {
    if (isScrollableElement(root)) {
      return root;
    }
  }

  return null;
}

function captureDocumentViewState(widget: DocumentWidgetLike | null): DocumentViewState {
  const scrollContainer = getPrimaryDocumentScrollContainer(widget);
  const notebookContent: any = isNotebookWidget(widget) ? (widget as any).content : null;
  const rawActiveCellIndex = Number(notebookContent?.activeCellIndex);
  const activeCellIndex = Number.isFinite(rawActiveCellIndex) ? Math.max(0, Math.floor(rawActiveCellIndex)) : null;
  return {
    scrollTop: scrollContainer?.scrollTop ?? 0,
    scrollLeft: scrollContainer?.scrollLeft ?? 0,
    activeCellIndex
  };
}

function restoreDocumentViewState(widget: DocumentWidgetLike | null, viewState: DocumentViewState): void {
  if (isNotebookWidget(widget) && viewState.activeCellIndex !== null) {
    try {
      const notebookContent: any = (widget as any).content;
      const cellsLengthRaw = Number(notebookContent?.widgets?.length);
      if (Number.isFinite(cellsLengthRaw) && cellsLengthRaw > 0) {
        const maxIndex = Math.floor(cellsLengthRaw) - 1;
        notebookContent.activeCellIndex = Math.max(0, Math.min(viewState.activeCellIndex, maxIndex));
      }
    } catch {
      // Ignore active-cell restore failures.
    }
  }

  const applyScroll = () => {
    const scrollContainer = getPrimaryDocumentScrollContainer(widget);
    if (!scrollContainer) {
      return;
    }
    scrollContainer.scrollTop = viewState.scrollTop;
    scrollContainer.scrollLeft = viewState.scrollLeft;
  };

  applyScroll();
  window.requestAnimationFrame(() => {
    applyScroll();
    window.requestAnimationFrame(applyScroll);
  });
  window.setTimeout(applyScroll, 120);
}

function getActiveCellText(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }
  const source =
    typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
  return typeof source === 'string' ? source : '';
}

type CodeEditorSelection = {
  text: string;
  startLine: number | null;
};

type SelectedContext =
  | {
      kind: 'cell';
      number: number;
      text: string;
    }
  | {
      kind: 'line';
      number: number;
      text: string;
    };

function getSelectionFromCodeEditor(editor: any, source: string): CodeEditorSelection | null {
  if (!editor || typeof editor.getSelection !== 'function' || typeof editor.getOffsetAt !== 'function') {
    return null;
  }

  const range = editor.getSelection();
  if (!range || !range.start || !range.end) {
    return null;
  }

  const startOffset = Number(editor.getOffsetAt(range.start));
  const endOffset = Number(editor.getOffsetAt(range.end));
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
    return null;
  }

  const from = Math.max(0, Math.min(startOffset, endOffset));
  const to = Math.max(0, Math.max(startOffset, endOffset));
  if (to <= from || !source) {
    return null;
  }

  const text = source.slice(from, to);
  if (!text) {
    return null;
  }

  const startLineRaw = Number(range.start.line);
  const endLineRaw = Number(range.end.line);
  const startLine =
    Number.isFinite(startLineRaw) && Number.isFinite(endLineRaw)
      ? Math.max(1, Math.min(startLineRaw, endLineRaw) + 1)
      : null;

  return { text, startLine };
}

function getSelectedTextFromCodeEditor(editor: any, source: string): string {
  const selection = getSelectionFromCodeEditor(editor, source);
  return selection?.text || '';
}

function getSelectedTextFromActiveCell(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }

  try {
    const source =
      typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
    return getSelectedTextFromCodeEditor((activeCell as any).editor, typeof source === 'string' ? source : '');
  } catch {
    return '';
  }
}

function getSelectedContextFromActiveCell(widget: DocumentWidgetLike | null): SelectedContext | null {
  if (!isNotebookWidget(widget)) {
    return null;
  }
  const notebookContent: any = (widget as any).content;
  const activeCell = notebookContent?.activeCell;
  if (!activeCell) {
    return null;
  }

  try {
    const source =
      typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
    const selection = getSelectionFromCodeEditor(
      (activeCell as any).editor,
      typeof source === 'string' ? source : ''
    );
    if (!selection?.text) {
      return null;
    }

    const rawCellIndex = Number(notebookContent?.activeCellIndex);
    const cellNumber = Number.isFinite(rawCellIndex) ? Math.max(1, Math.floor(rawCellIndex) + 1) : 1;
    return {
      kind: 'cell',
      number: cellNumber,
      text: selection.text
    };
  } catch {
    return null;
  }
}

function getSelectedTextFromFileEditor(widget: DocumentWidgetLike | null): string {
  if (!widget || isNotebookWidget(widget)) {
    return '';
  }

  try {
    const editor: any = (widget as any).content?.editor;
    if (!editor) {
      return '';
    }
    const source =
      typeof editor.model?.sharedModel?.getSource === 'function' ? editor.model.sharedModel.getSource() : '';
    return getSelectedTextFromCodeEditor(editor, typeof source === 'string' ? source : '');
  } catch {
    return '';
  }
}

function getSelectedContextFromFileEditor(widget: DocumentWidgetLike | null): SelectedContext | null {
  if (!widget || isNotebookWidget(widget)) {
    return null;
  }

  try {
    const editor: any = (widget as any).content?.editor;
    if (!editor) {
      return null;
    }
    const source =
      typeof editor.model?.sharedModel?.getSource === 'function' ? editor.model.sharedModel.getSource() : '';
    const selection = getSelectionFromCodeEditor(editor, typeof source === 'string' ? source : '');
    if (!selection?.text) {
      return null;
    }
    const lineNumber = selection.startLine ?? 1;
    return {
      kind: 'line',
      number: lineNumber,
      text: selection.text
    };
  } catch {
    return null;
  }
}

function getSelectedContext(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode
): SelectedContext | null {
  if (notebookMode === 'plain_py') {
    return getSelectedContextFromFileEditor(widget) ?? getSelectedContextFromActiveCell(widget);
  }
  return getSelectedContextFromActiveCell(widget) ?? getSelectedContextFromFileEditor(widget);
}

function inferLocationLabelFromWidget(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode
): string {
  if (isNotebookWidget(widget) || notebookMode === 'ipynb' || notebookMode === 'jupytext_py') {
    const rawCellIndex = Number((widget as any)?.content?.activeCellIndex);
    if (Number.isFinite(rawCellIndex)) {
      return `Cell ${Math.max(1, Math.floor(rawCellIndex) + 1)}`;
    }
    return 'Cell';
  }

  try {
    const editor: any = widget && !isNotebookWidget(widget) ? (widget as any).content?.editor : null;
    if (editor && typeof editor.getCursorPosition === 'function') {
      const cursor = editor.getCursorPosition();
      const lineRaw = Number(cursor?.line);
      if (Number.isFinite(lineRaw)) {
        return `Line ${Math.max(1, Math.floor(lineRaw) + 1)}`;
      }
    }
  } catch {
    // Ignore location inference errors and fallback to a generic label.
  }

  return notebookMode === 'plain_py' ? 'Line' : 'Selection';
}

function toSelectionPreview(context: SelectedContext | null): SelectionPreview | undefined {
  if (!context) {
    return undefined;
  }
  const normalized = normalizeSelectionPreviewText(context.text);
  if (!normalized) {
    return undefined;
  }
  const locationLabel = context.kind === 'cell' ? `Cell ${context.number}` : `Line ${context.number}`;
  return {
    locationLabel,
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

function formatSelectionPreviewTextForDisplay(previewText: string): string {
  return truncateEnd(normalizeSelectionPreviewText(previewText), MESSAGE_SELECTION_PREVIEW_DISPLAY_MAX_CHARS);
}

function toFallbackSelectionPreview(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode,
  text: string
): SelectionPreview | undefined {
  const normalized = normalizeSelectionPreviewText(text);
  if (!normalized) {
    return undefined;
  }
  return {
    locationLabel: inferLocationLabelFromWidget(widget, notebookMode),
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

function toCellOutputPreview(
  context: SelectedContext | null,
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode,
  outputText: string
): SelectionPreview | undefined {
  const normalized = normalizeSelectionPreviewText(outputText);
  if (!normalized) {
    return undefined;
  }
  const locationBase =
    context?.kind === 'cell'
      ? `Cell ${context.number}`
      : inferLocationLabelFromWidget(widget, notebookMode);
  return {
    locationLabel: `${locationBase} Output`,
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

const ACTIVE_CELL_OUTPUT_MAX_CHARS = 6000;
const ACTIVE_CELL_OUTPUT_MAX_ITEMS = 24;

function stripAnsi(value: string): string {
  // Best-effort removal of ANSI escape codes (tracebacks sometimes include them).
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function coerceText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string').join('');
  }
  return '';
}

function formatJupyterOutput(output: any): string {
  if (!output || typeof output !== 'object') {
    return '';
  }
  const outputType = typeof output.output_type === 'string' ? output.output_type : '';
  if (!outputType) {
    return '';
  }

  if (outputType === 'stream') {
    const text = coerceText(output.text);
    if (!text) {
      return '';
    }
    const name = typeof output.name === 'string' ? output.name : '';
    const cleaned = stripAnsi(text).replace(/\s+$/, '');
    if (!cleaned) {
      return '';
    }
    return name === 'stderr' ? `[stderr]\n${cleaned}` : cleaned;
  }

  if (outputType === 'error') {
    const traceback = Array.isArray(output.traceback)
      ? output.traceback.filter((line: unknown) => typeof line === 'string')
      : [];
    const tbText = stripAnsi(traceback.join('\n')).replace(/\s+$/, '');
    if (tbText) {
      return tbText;
    }
    const ename = typeof output.ename === 'string' ? output.ename : '';
    const evalue = typeof output.evalue === 'string' ? output.evalue : '';
    const summary = [ename, evalue].filter(Boolean).join(': ').trim();
    return summary;
  }

  if (outputType === 'execute_result' || outputType === 'display_data' || outputType === 'update_display_data') {
    const data = output.data && typeof output.data === 'object' ? output.data : null;
    if (!data) {
      return '';
    }
    const textPlain = coerceText((data as any)['text/plain']);
    if (textPlain) {
      const cleaned = stripAnsi(textPlain).replace(/\s+$/, '');
      if (!cleaned) {
        return '';
      }
      if (outputType === 'execute_result' && typeof output.execution_count === 'number') {
        return `Out[${output.execution_count}]:\n${cleaned}`;
      }
      return cleaned;
    }

    const mimeTypes = Object.keys(data as any).filter(mime => mime && mime !== 'text/plain');
    if (mimeTypes.length > 0) {
      return `[non-text output omitted: ${mimeTypes.slice(0, 6).join(', ')}${mimeTypes.length > 6 ? ', ...' : ''}]`;
    }
    return '';
  }

  return '';
}

function summarizeJupyterOutputs(outputs: any[]): string {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return '';
  }

  let combined = '';
  let appended = 0;
  let truncated = false;

  for (const output of outputs) {
    if (appended >= ACTIVE_CELL_OUTPUT_MAX_ITEMS) {
      truncated = true;
      break;
    }
    const chunk = formatJupyterOutput(output);
    if (!chunk) {
      continue;
    }
    appended += 1;

    const sep = combined ? '\n\n' : '';
    const remaining = ACTIVE_CELL_OUTPUT_MAX_CHARS - combined.length - sep.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const slice = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
    combined += sep + slice;
    if (slice.length !== chunk.length) {
      truncated = true;
      break;
    }
  }

  combined = combined.replace(/\s+$/, '');
  if (!combined) {
    return '';
  }
  if (truncated) {
    combined += '\n\n... (truncated)';
  }
  return combined;
}

function getActiveCellOutput(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }

  try {
    const model: any = activeCell.model as any;
    const cellType = typeof model?.type === 'string' ? model.type : '';
    if (cellType && cellType !== 'code') {
      return '';
    }
    const json = typeof model?.toJSON === 'function' ? model.toJSON() : null;
    const outputs = json && Array.isArray((json as any).outputs) ? (json as any).outputs : [];
    return summarizeJupyterOutputs(outputs);
  } catch {
    return '';
  }
}
