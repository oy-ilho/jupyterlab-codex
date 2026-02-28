import type {
  CodexRateLimitsSnapshot,
  ContextWindowSnapshot,
  HistoryEntry,
  RateLimitWindowSnapshot,
  TextRole
} from './codexMessageTypes';

export type { HistoryEntry, TextRole };

export type ProgressKind = '' | 'reasoning';
export type ActivityPhase = 'started' | 'completed' | '';
export type ActivityCategory = 'reasoning' | 'command' | 'file' | 'tool' | 'event';

export interface SelectionPreview {
  locationLabel: string;
  previewText: string;
}

export interface MessageContextPreview {
  selectionPreview?: SelectionPreview;
  cellOutputPreview?: SelectionPreview;
}

export interface ActivityItem {
  category: ActivityCategory;
  phase: ActivityPhase;
  title: string;
  detail: string;
  raw: string;
}

export interface ActivitySummary {
  activity: Omit<ActivityItem, 'id' | 'ts'>;
  progress: string;
  progressKind: ProgressKind;
}

export interface SessionPreviewSplit {
  selectionPreview?: unknown;
  cellOutputPreview?: unknown;
}

export function truncateEnd(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max <= 3) {
    return text.slice(0, max);
  }
  return `${text.slice(0, max - 3)}...`;
}

export function coerceSelectionPreview(
  value: unknown,
  options: {
    maxChars?: number;
    normalize?: (value: string) => string;
  } = {}
): SelectionPreview | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const locationLabel = typeof raw.locationLabel === 'string' ? raw.locationLabel.trim() : '';
  const normalizer = options.normalize ?? ((text: string) => text.trim());
  const maxChars = options.maxChars ?? 500;
  const previewText =
    typeof raw.previewText === 'string' ? truncateEnd(normalizer(raw.previewText), maxChars) : '';
  if (!locationLabel || !previewText) {
    return undefined;
  }
  return { locationLabel, previewText };
}

export function coerceMessageContextPreview(
  value: unknown,
  options: {
    maxChars?: number;
    normalize?: (value: string) => string;
  } = {}
): MessageContextPreview | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const selectionPreview = coerceSelectionPreview(raw.selectionPreview, options);
  const cellOutputPreview = coerceSelectionPreview(raw.cellOutputPreview, options);
  if (selectionPreview || cellOutputPreview) {
    return {
      ...(selectionPreview ? { selectionPreview } : {}),
      ...(cellOutputPreview ? { cellOutputPreview } : {})
    };
  }

  // Legacy format: a single preview object was stored directly as selection preview.
  const legacySelectionPreview = coerceSelectionPreview(raw, options);
  if (legacySelectionPreview) {
    return { selectionPreview: legacySelectionPreview };
  }
  return undefined;
}

export function coerceSessionHistory(
  raw: unknown,
  options: {
    maxChars?: number;
    normalize?: (value: string) => string;
  } = {}
): HistoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: HistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const role = (item as any).role;
    const content = (item as any).content;
    if ((role !== 'user' && role !== 'assistant' && role !== 'system') || typeof content !== 'string') {
      continue;
    }
    const selectionPreview = coerceSelectionPreview((item as any).selectionPreview, options);
    const cellOutputPreview = coerceSelectionPreview((item as any).cellOutputPreview, options);
    result.push({
      role,
      content,
      selectionPreview,
      cellOutputPreview
    });
  }
  return result;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function coerceRateLimitWindow(raw: unknown): RateLimitWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const usedPercent = coerceFiniteNumber(record.usedPercent);
  const windowMinutesValue = coerceFiniteNumber(record.windowMinutes);
  const resetsAtValue = coerceFiniteNumber(record.resetsAt);
  const windowMinutes = windowMinutesValue === null ? null : Math.round(windowMinutesValue);
  const resetsAt = resetsAtValue === null ? null : Math.round(resetsAtValue);
  return { usedPercent, windowMinutes, resetsAt };
}

export function coerceContextWindowSnapshot(raw: unknown): ContextWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const windowTokensValue = coerceFiniteNumber(record.windowTokens);
  const usedTokensValue = coerceFiniteNumber(record.usedTokens);
  const leftTokensValue = coerceFiniteNumber(record.leftTokens);
  const usedPercent = coerceFiniteNumber(record.usedPercent);
  const windowTokens = windowTokensValue === null ? null : Math.round(windowTokensValue);
  const usedTokens = usedTokensValue === null ? null : Math.round(usedTokensValue);
  const leftTokens = leftTokensValue === null ? null : Math.round(leftTokensValue);
  if (windowTokens == null && usedTokens == null && leftTokens == null && usedPercent == null) {
    return null;
  }
  return { windowTokens, usedTokens, leftTokens, usedPercent };
}

export function coerceRateLimitsSnapshot(raw: unknown): CodexRateLimitsSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const rawRecord = raw as Record<string, unknown>;
  const updatedAt = typeof rawRecord.updatedAt === 'string' && rawRecord.updatedAt.trim() ? rawRecord.updatedAt : null;
  return {
    updatedAt,
    primary: coerceRateLimitWindow(rawRecord.primary),
    secondary: coerceRateLimitWindow(rawRecord.secondary),
    contextWindow: coerceContextWindowSnapshot(rawRecord.contextWindow)
  };
}

export function splitStoredMessagePreview(value: unknown): SessionPreviewSplit {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const hasNestedPreview =
    Object.prototype.hasOwnProperty.call(raw, 'selectionPreview') ||
    Object.prototype.hasOwnProperty.call(raw, 'cellOutputPreview');
  if (hasNestedPreview) {
    return {
      selectionPreview: raw.selectionPreview,
      cellOutputPreview: raw.cellOutputPreview
    };
  }

  // Legacy format: a single preview object was stored directly as selectionPreview.
  if (Object.prototype.hasOwnProperty.call(raw, 'locationLabel') && Object.prototype.hasOwnProperty.call(raw, 'previewText')) {
    return { selectionPreview: raw };
  }
  return {};
}
