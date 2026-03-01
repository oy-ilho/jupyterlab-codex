import { expect, test } from '@playwright/test';

import { isSessionStartNotice, normalizeSessionStartedNotice } from '../../src/codexChatNotice';

test('normalizeSessionStartedNotice keeps English start notice format', () => {
  const normalized = normalizeSessionStartedNotice('Session started (10:00 AM)');
  expect(normalized).toBe('Session started (10:00 AM)');
});

test('normalizeSessionStartedNotice keeps Korean start notice', () => {
  const normalized = normalizeSessionStartedNotice('세션이 시작되었습니다');
  expect(normalized).toBe('세션이 시작되었습니다');
});

test('normalizeSessionStartedNotice accepts Korean start notice with timestamp', () => {
  const normalized = normalizeSessionStartedNotice('새 스레드 시작됨 (14:00)');
  expect(normalized).toBe('새 스레드 시작됨 (14:00)');
});

test('isSessionStartNotice accepts locale variants', () => {
  expect(isSessionStartNotice('Session start: resumed')).toBe(true);
  expect(isSessionStartNotice('세션 시작 됨')).toBe(true);
  expect(isSessionStartNotice('new thread started')).toBe(true);
});

test('isSessionStartNotice rejects unrelated system messages', () => {
  expect(isSessionStartNotice('No start token found')).toBe(false);
  expect(isSessionStartNotice('Authentication required')).toBe(false);
});
