export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function hasStoredValue(key: string): boolean {
  return safeLocalStorageGet(key) !== null;
}

export function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; settings still work for current session.
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; settings still work for current session.
  }
}
