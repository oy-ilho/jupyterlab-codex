export type TextRole = 'user' | 'assistant' | 'system';

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

export interface HistoryEntry {
  role: TextRole;
  content: string;
  selectionPreview?: SelectionPreview;
  cellOutputPreview?: SelectionPreview;
}

export interface RateLimitWindowSnapshot {
  usedPercent: number | null;
  windowMinutes: number | null;
  resetsAt: number | null;
}

export interface ContextWindowSnapshot {
  windowTokens: number | null;
  usedTokens: number | null;
  leftTokens: number | null;
  usedPercent: number | null;
}

export interface CodexRateLimitsSnapshot {
  updatedAt: string | null;
  primary: RateLimitWindowSnapshot | null;
  secondary: RateLimitWindowSnapshot | null;
  contextWindow: ContextWindowSnapshot | null;
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

export function coerceRateLimitWindow(raw: unknown): RateLimitWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const usedPercent = typeof record.usedPercent === 'number' && Number.isFinite(record.usedPercent) ? record.usedPercent : null;
  const windowMinutes = Number.isFinite(record.windowMinutes as number)
    ? Math.round(record.windowMinutes as number)
    : null;
  const resetsAt = Number.isFinite(record.resetsAt as number) ? Math.round(record.resetsAt as number) : null;
  return { usedPercent, windowMinutes, resetsAt };
}

export function coerceContextWindowSnapshot(raw: unknown): ContextWindowSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const windowTokens =
    typeof record.windowTokens === 'number' && Number.isFinite(record.windowTokens)
      ? Math.round(record.windowTokens)
      : null;
  const usedTokens =
    typeof record.usedTokens === 'number' && Number.isFinite(record.usedTokens)
      ? Math.round(record.usedTokens)
      : null;
  const leftTokens =
    typeof record.leftTokens === 'number' && Number.isFinite(record.leftTokens)
      ? Math.round(record.leftTokens)
      : null;
  const usedPercent =
    typeof record.usedPercent === 'number' && Number.isFinite(record.usedPercent)
      ? record.usedPercent
      : null;
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
