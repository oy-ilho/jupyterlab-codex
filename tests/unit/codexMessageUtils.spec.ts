import { test, expect } from '@playwright/test';

import {
  coerceMessageContextPreview,
  coerceRateLimitsSnapshot,
  coerceSelectionPreview,
  coerceSessionHistory,
  splitStoredMessagePreview,
  truncateEnd
} from '../../src/handlers/codexMessageUtils';

test('coerceSelectionPreview enforces required fields', () => {
  expect(coerceSelectionPreview({ locationLabel: 'Cell 1', previewText: 'hello' })).toEqual({
    locationLabel: 'Cell 1',
    previewText: 'hello'
  });
  expect(coerceSelectionPreview({ locationLabel: '', previewText: 'hello' })).toBeUndefined();
  expect(truncateEnd('abcdef', 3)).toBe('abc');
  expect(truncateEnd('abcdef', 6)).toBe('abcdef');
});

test('coerceMessageContextPreview supports legacy and nested shapes', () => {
  expect(
    coerceMessageContextPreview({
      selectionPreview: { locationLabel: 'Selection', previewText: 'abc' },
      cellOutputPreview: { locationLabel: 'Output', previewText: 'xyz' }
    })
  ).toEqual({
    selectionPreview: { locationLabel: 'Selection', previewText: 'abc' },
    cellOutputPreview: { locationLabel: 'Output', previewText: 'xyz' }
  });

  expect(coerceMessageContextPreview({ locationLabel: 'Legacy', previewText: 'text' })).toEqual({
    selectionPreview: { locationLabel: 'Legacy', previewText: 'text' }
  });
});

test('coerceSessionHistory drops invalid entries', () => {
  expect(
    coerceSessionHistory([
      { role: 'user', content: 'hello', selectionPreview: { locationLabel: 'Cell', previewText: 'x' } },
      { role: 'invalid', content: 'bad' },
      { role: 'assistant', content: 'ok', extra: 'x' }
    ])
  ).toEqual([
    { role: 'user', content: 'hello', selectionPreview: { locationLabel: 'Cell', previewText: 'x' }, cellOutputPreview: undefined },
    { role: 'assistant', content: 'ok', selectionPreview: undefined, cellOutputPreview: undefined }
  ]);
});

test('coerceRateLimitsSnapshot normalizes nested windows and context window', () => {
  const snapshot = coerceRateLimitsSnapshot({
    updatedAt: '2024-01-01T00:00:00Z',
    primary: { usedPercent: '20.1', windowMinutes: '10.2', resetsAt: '99.9' },
    secondary: { usedPercent: '12.2', windowMinutes: '5', resetsAt: '40' },
    contextWindow: { windowTokens: '10.5', usedTokens: '5.2', leftTokens: '4.8', usedPercent: '50.5' }
  });
  expect(snapshot).toEqual({
    updatedAt: '2024-01-01T00:00:00Z',
    primary: { usedPercent: 20.1, windowMinutes: 10, resetsAt: 100 },
    secondary: { usedPercent: 12.2, windowMinutes: 5, resetsAt: 40 },
    contextWindow: { windowTokens: 11, usedTokens: 5, leftTokens: 5, usedPercent: 50.5 }
  });
});

test('splitStoredMessagePreview handles nested and legacy payloads', () => {
  expect(splitStoredMessagePreview({ selectionPreview: { a: 1 }, cellOutputPreview: { b: 2 } })).toEqual({
    selectionPreview: { a: 1 },
    cellOutputPreview: { b: 2 }
  });

  expect(splitStoredMessagePreview({ locationLabel: 'x', previewText: 'y' })).toEqual({
    selectionPreview: { locationLabel: 'x', previewText: 'y' }
  });
});
