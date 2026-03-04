export function makeSessionKey(path: string): string {
  const normalizedPath = (path || '').trim();
  if (!normalizedPath) {
    return '';
  }
  return normalizedPath;
}

export function resolveSessionKey(path: string): string {
  return makeSessionKey(path || '');
}

export function resolveCurrentSessionKey(path: string): string {
  return resolveSessionKey(path);
}

