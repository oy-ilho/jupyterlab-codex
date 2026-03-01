import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('codex chat session history cap is set to 100 entries', () => {
  const source = readFileSync(resolve(__dirname, '../../src/codexChat.tsx'), 'utf8');
  const match = source.match(/const MAX_SESSION_MESSAGES = (\d+);/);

  expect(match).not.toBeNull();
  expect(Number(match?.[1])).toBe(100);
});

test('codex chat trims session history using the configured max entry count', () => {
  const source = readFileSync(resolve(__dirname, '../../src/codexChat.tsx'), 'utf8');

  expect(source).toContain('if (messages.length <= MAX_SESSION_MESSAGES) {');
  expect(source).toContain('return messages.slice(messages.length - MAX_SESSION_MESSAGES);');
});
