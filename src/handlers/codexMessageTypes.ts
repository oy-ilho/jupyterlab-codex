export type TextRole = 'user' | 'assistant' | 'system';

export interface HistoryEntry {
  role: TextRole;
  content: string;
  selectionPreview?: {
    locationLabel: string;
    previewText: string;
  };
  cellOutputPreview?: {
    locationLabel: string;
    previewText: string;
  };
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
