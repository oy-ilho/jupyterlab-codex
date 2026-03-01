type SessionNoticeParseResult = {
  rest: string;
  value: string | null;
};

const SESSION_STARTED_EN_PATTERN = /^(?:session started|session start|new thread started)/i;
const SESSION_STARTED_EN_COLON_PATTERN = /^(?:session start:|new thread started:)/i;
const SESSION_STARTED_I18N_PATTERN =
  /^(?:세션|새로운\s*세션|새\s*세션|스레드|새로운\s*스레드|새\s*스레드|セッション|会话|会議|对话|会話).*?(?:시작|開始|開始する|开始|已开始|已啟動|開始しました|开始しました|已啟動しました|始まった)/i;

function extractTrailingParenValue(text: string): SessionNoticeParseResult {
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

export function normalizeSessionStartedNotice(text: string): string | null {
  const raw = text.trim();
  const { rest, value } = extractTrailingParenValue(raw);

  if (SESSION_STARTED_EN_PATTERN.test(rest) || SESSION_STARTED_EN_COLON_PATTERN.test(rest)) {
    return formatSessionStartedNotice('Session started', value);
  }

  if (SESSION_STARTED_I18N_PATTERN.test(rest)) {
    return `${rest}${value ? ` (${value})` : ''}`;
  }

  return null;
}

export function isSessionStartNotice(text: string): boolean {
  if (normalizeSessionStartedNotice(text) !== null) {
    return true;
  }

  const trimmed = text.trimStart();
  const lower = trimmed.toLowerCase();
  return (
    SESSION_STARTED_EN_COLON_PATTERN.test(lower) ||
    /^(?:new thread started|session started|session start)/i.test(trimmed) ||
    SESSION_STARTED_I18N_PATTERN.test(trimmed)
  );
}

