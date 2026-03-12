import { expect, test } from '@playwright/test';

import {
  buildAttachmentTruncationNotice,
  limitActiveCellAttachmentPayload,
  resolveSentAttachmentTruncation
} from '../../src/codexChatAttachmentLimit';

test('limitActiveCellAttachmentPayload keeps payload unchanged when within max', () => {
  const result = limitActiveCellAttachmentPayload('abc', 'def', 10, 10);
  expect(result).toEqual({
    selection: 'abc',
    cellOutput: 'def',
    selectionTruncated: false,
    cellOutputTruncated: false
  });
});

test('limitActiveCellAttachmentPayload applies separate limits to input and output', () => {
  const result = limitActiveCellAttachmentPayload('12345', 'abcdef', 2, 6);
  expect(result).toEqual({
    selection: '12',
    cellOutput: 'abcdef',
    selectionTruncated: true,
    cellOutputTruncated: false
  });
});

test('limitActiveCellAttachmentPayload truncates output independently when output exceeds max', () => {
  const result = limitActiveCellAttachmentPayload('12345', 'abcdefghij', 4, 4);
  expect(result).toEqual({
    selection: '1234',
    cellOutput: 'abcd',
    selectionTruncated: true,
    cellOutputTruncated: true
  });
});

test('buildAttachmentTruncationNotice includes source hint when input is truncated', () => {
  const notice = buildAttachmentTruncationNotice(true, false, 4000, 20000);
  expect(notice).toContain('source file/cell');
  expect(notice).toContain('4000');
});

test('resolveSentAttachmentTruncation only reports truncation for attachments that were sent', () => {
  expect(
    resolveSentAttachmentTruncation({
      includeSelection: false,
      includeCellOutput: true,
      selectionTruncated: true,
      cellOutputTruncated: true
    })
  ).toEqual({
    selectionTruncated: false,
    cellOutputTruncated: true
  });
});
