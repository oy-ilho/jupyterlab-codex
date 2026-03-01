import { expect, test } from '@playwright/test';

import { makeSessionKey, resolveCurrentSessionKey, resolveSessionKey } from '../../src/codexChatSessionKey';

test('makeSessionKey trims and keeps empty fallback', () => {
  expect(makeSessionKey('  /tmp/notebook.ipynb  ')).toBe('/tmp/notebook.ipynb');
  expect(makeSessionKey('   ')).toBe('');
});

test('resolveSessionKey normalizes via makeSessionKey', () => {
  expect(resolveSessionKey('/tmp/notebook.ipynb')).toBe('/tmp/notebook.ipynb');
  expect(resolveSessionKey('   ')).toBe('');
});

test('resolveCurrentSessionKey delegates to resolveSessionKey', () => {
  expect(resolveCurrentSessionKey('/tmp/other.ipynb')).toBe('/tmp/other.ipynb');
});

