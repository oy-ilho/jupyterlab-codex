import { expect, test } from '@playwright/test';

import {
  buildActiveCellAttachmentSignature,
  isDuplicateActiveCellAttachmentSignature,
  makeActiveCellAttachmentDedupKey
} from '../../src/codexChatAttachmentDedup';

test('makeActiveCellAttachmentDedupKey prefers thread id', () => {
  expect(makeActiveCellAttachmentDedupKey('/notebook.ipynb', 'thread-123')).toBe('thread:thread-123');
  expect(makeActiveCellAttachmentDedupKey('/notebook.ipynb', '')).toBe('session:/notebook.ipynb');
});

test('buildActiveCellAttachmentSignature normalizes text and includes location labels', () => {
  const signatureA = buildActiveCellAttachmentSignature({
    notebookMode: 'ipynb',
    selection: 'print(1)\r\n',
    cellOutput: '1\r\n',
    selectionLocationLabel: 'Cell 1',
    cellOutputLocationLabel: 'Cell 1 Output'
  });
  const signatureB = buildActiveCellAttachmentSignature({
    notebookMode: 'ipynb',
    selection: 'print(1)\n',
    cellOutput: '1\n',
    selectionLocationLabel: 'Cell 1',
    cellOutputLocationLabel: 'Cell 1 Output'
  });
  const signatureDifferentCell = buildActiveCellAttachmentSignature({
    notebookMode: 'ipynb',
    selection: 'print(1)\n',
    cellOutput: '1\n',
    selectionLocationLabel: 'Cell 2',
    cellOutputLocationLabel: 'Cell 2 Output'
  });

  expect(signatureA).toBe(signatureB);
  expect(signatureA).not.toBe(signatureDifferentCell);
});

test('isDuplicateActiveCellAttachmentSignature requires non-empty equal signatures', () => {
  expect(isDuplicateActiveCellAttachmentSignature('a', 'a')).toBe(true);
  expect(isDuplicateActiveCellAttachmentSignature('a', 'b')).toBe(false);
  expect(isDuplicateActiveCellAttachmentSignature(undefined, 'a')).toBe(false);
  expect(isDuplicateActiveCellAttachmentSignature('a', '')).toBe(false);
});
