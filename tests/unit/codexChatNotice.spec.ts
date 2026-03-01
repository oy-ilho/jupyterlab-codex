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

test('normalizeSessionStartedNotice accepts Japanese/Chinese locale forms', () => {
  expect(normalizeSessionStartedNotice('会話を開始しました (21:45)')).toBe('会話を開始しました (21:45)');
  expect(normalizeSessionStartedNotice('对话开始')).toBe('对话开始');
});

test('isSessionStartNotice accepts locale variants', () => {
  expect(isSessionStartNotice('Session start: resumed')).toBe(true);
  expect(isSessionStartNotice('세션 시작 됨')).toBe(true);
  expect(isSessionStartNotice('세션이 시작되었습니다')).toBe(true);
  expect(isSessionStartNotice('new thread started')).toBe(true);
  expect(isSessionStartNotice('会話を開始しました')).toBe(true);
  expect(isSessionStartNotice('会话开始')).toBe(true);
  expect(isSessionStartNotice('スレッドが開始')).toBe(true);
  expect(isSessionStartNotice('セッション開始')).toBe(true);
  expect(isSessionStartNotice('Nueva sesión iniciada')).toBe(true);
});

test('isSessionStartNotice rejects unrelated system messages', () => {
  expect(isSessionStartNotice('No start token found')).toBe(false);
  expect(isSessionStartNotice('Authentication required')).toBe(false);
  expect(isSessionStartNotice('Session is running normally')).toBe(false);
  expect(isSessionStartNotice('会話は進行中です')).toBe(false);
});
