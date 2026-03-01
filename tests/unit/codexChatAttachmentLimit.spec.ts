import { expect, test } from '@playwright/test';

import {
  buildAttachmentTruncationNotice,
  limitActiveCellAttachmentPayload
} from '../../src/codexChatAttachmentLimit';

test('limitActiveCellAttachmentPayload keeps payload unchanged when within max', () => {
  const result = limitActiveCellAttachmentPayload('abc', 'def', 10);
  expect(result).toEqual({
    selection: 'abc',
    cellOutput: 'def',
    selectionTruncated: false,
    cellOutputTruncated: false
  });
});

test('limitActiveCellAttachmentPayload preserves output first, then input', () => {
  const result = limitActiveCellAttachmentPayload('12345', 'abcdef', 8);
  expect(result).toEqual({
    selection: '12',
    cellOutput: 'abcdef',
    selectionTruncated: true,
    cellOutputTruncated: false
  });
});

test('limitActiveCellAttachmentPayload truncates output first when output exceeds max', () => {
  const result = limitActiveCellAttachmentPayload('12345', 'abcdefghij', 4);
  expect(result).toEqual({
    selection: '',
    cellOutput: 'abcd',
    selectionTruncated: true,
    cellOutputTruncated: true
  });
});

test('buildAttachmentTruncationNotice includes source hint when input is truncated', () => {
  const notice = buildAttachmentTruncationNotice(true, false, 4000);
  expect(notice).toContain('source file/cell');
  expect(notice).toContain('4000');
});
