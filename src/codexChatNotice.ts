type SessionNoticeParseResult = {
  rest: string;
  value: string | null;
};

const SESSION_STARTED_EN_PATTERN = /^(?:session started|session start|new thread started)/i;
const SESSION_STARTED_EN_COLON_PATTERN = /^(?:session start:|new thread started:)/i;
const SESSION_STARTED_I18N_PREFIX =
  /^(?:session|new thread|new session|thread|conversation|セッション|スレッド|チャット|会話|会議|会话|对话|대화|세션|새로운\s*세션|새\s*세션|스레드|새로운\s*스레드|새\s*스레드|sesión|conversación|conversacion|hilo|nueva sesión|nuevo hilo)/i;
const SESSION_STARTED_I18N_SUFFIX =
  /(?:start(?:ed|ing)?|started|start|resume|resumed|resolving|initialize(?:d|s)?|initializing|restarted|reopen|restart|시작|시작됨|시작되었습니다|起動|开始|已开始|已啟動|開始しました|开始しました|已啟動しました|始ま|始動|会话开始|会議開始|会話開始|会話を開始|iniciada|iniciado|iniciar|inicio|inicio de|comenzó|comenzada|开始しました|始動|開始され|始まった)/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitLeadingPhrases(value: string): boolean {
  const leading = value.slice(0, 72);
  return SESSION_STARTED_I18N_PREFIX.test(leading);
}

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

  const normalizedRest = normalizeWhitespace(rest);
  if (SESSION_STARTED_I18N_PREFIX.test(normalizedRest) && SESSION_STARTED_I18N_SUFFIX.test(normalizedRest)) {
    if (splitLeadingPhrases(normalizedRest) && normalizedRest.length <= 120) {
      return `${normalizedRest}${value ? ` (${value})` : ''}`;
    }
  }

  return null;
}

export function isSessionStartNotice(text: string): boolean {
  const normalized = normalizeSessionStartedNotice(text);
  if (normalized !== null) {
    return true;
  }

  const trimmed = text.trimStart();
  const normalizedTrimmed = normalizeWhitespace(trimmed);
  return (
    SESSION_STARTED_EN_COLON_PATTERN.test(normalizedTrimmed) ||
    /^(?:new thread started|session started|session start)/i.test(normalizedTrimmed) ||
    (SESSION_STARTED_I18N_PREFIX.test(normalizedTrimmed) && SESSION_STARTED_I18N_SUFFIX.test(normalizedTrimmed))
  );
}
