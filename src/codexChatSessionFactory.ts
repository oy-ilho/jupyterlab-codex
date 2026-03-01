export type TextRole = 'user' | 'assistant' | 'system';

export type SessionCreateOptions = {
  threadId?: string;
  reuseStoredThread?: boolean;
  sessionKey?: string;
};

export type SessionFactoryDefaults<TModelOption extends string, TReasoningOption extends string, TSandboxMode extends string> = {
  readStoredThreadId: (path: string, sessionKey: string) => string;
  readDefaultModelOption: () => TModelOption;
  readDefaultReasoningEffortOption: () => TReasoningOption;
  readDefaultSandboxModeOption: () => TSandboxMode;
  normalizeSystemText: (role: TextRole, text: string) => string;
};

export function createSession<TSession, TModelOption extends string, TReasoningOption extends string, TSandboxMode extends string>(
  path: string,
  intro: string,
  options: SessionCreateOptions | undefined,
  defaults: SessionFactoryDefaults<TModelOption, TReasoningOption, TSandboxMode>
): TSession {
  const generateId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 0x100000000).toString(16)}`;

  const defaultIntro = 'Session started';
  const systemText = defaults.normalizeSystemText('system', intro || defaultIntro);
  const requestedThreadId = (options?.threadId || '').trim();
  const storedThreadId = options?.reuseStoredThread === false ? '' : defaults.readStoredThreadId(path, options?.sessionKey || '');
  const threadId = requestedThreadId || storedThreadId || generateId();

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
        id: generateId(),
        role: 'system',
        text: systemText
      }
    ],
    pairedOk: null,
    pairedPath: '',
    pairedOsPath: '',
    pairedMessage: '',
    notebookMode: null,
    selectedModelOption: defaults.readDefaultModelOption(),
    selectedReasoningEffort: defaults.readDefaultReasoningEffortOption(),
    selectedSandboxMode: defaults.readDefaultSandboxModeOption(),
    effectiveSandboxMode: null,
    conversationMode: 'resume'
  } as unknown as TSession;
}

export function createThreadResetSession<TSession, TModelOption extends string, TReasoningOption extends string, TSandboxMode extends string>(
  path: string,
  sessionKey: string,
  threadId: string,
  defaults: SessionFactoryDefaults<TModelOption, TReasoningOption, TSandboxMode>
): TSession {
  const time = new Date().toLocaleTimeString();
  return createSession<TSession, TModelOption, TReasoningOption, TSandboxMode>(
    path,
    `Session started (${time})`,
    {
      threadId,
      reuseStoredThread: false,
      sessionKey
    },
    defaults
  );
}
