export type ActivityPhase = 'started' | 'completed' | '';
export type ActivityCategory = 'reasoning' | 'command' | 'file' | 'tool' | 'event';

export interface ActivitySummary {
  activity: {
    category: ActivityCategory;
    phase: ActivityPhase;
    title: string;
    detail: string;
    raw: string;
  };
  progress: string;
  progressKind: '' | 'reasoning';
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

export function summarizeCodexEvent(payload: any): ActivitySummary {
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
    let progressKind: '' | 'reasoning' = '';

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
    detail = truncateMiddle(detail, 1400);

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

export function isNoiseCodexEvent(payload: any): boolean {
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
