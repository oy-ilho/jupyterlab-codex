import { expect, test } from '@playwright/test';

import {
  buildActiveCellOutputSignature,
  buildActiveCellSelectionSignature,
  isDuplicateActiveCellAttachmentSignature,
  makeActiveCellAttachmentDedupKey
} from '../../src/codexChatAttachmentDedup';

test('makeActiveCellAttachmentDedupKey prefers thread id', () => {
  expect(makeActiveCellAttachmentDedupKey('/notebook.ipynb', 'thread-123')).toBe('thread:thread-123');
  expect(makeActiveCellAttachmentDedupKey('/notebook.ipynb', '')).toBe('session:/notebook.ipynb');
});

test('buildActiveCellSelectionSignature normalizes text and includes location labels', () => {
  const signatureA = buildActiveCellSelectionSignature({
    notebookMode: 'ipynb',
    text: 'print(1)\r\n',
    locationLabel: 'Cell 1'
  });
  const signatureB = buildActiveCellSelectionSignature({
    notebookMode: 'ipynb',
    text: 'print(1)\n',
    locationLabel: 'Cell 1'
  });
  const signatureDifferentCell = buildActiveCellSelectionSignature({
    notebookMode: 'ipynb',
    text: 'print(1)\n',
    locationLabel: 'Cell 2'
  });

  expect(signatureA).toBe(signatureB);
  expect(signatureA).not.toBe(signatureDifferentCell);
});

test('selection and output signatures are independent', () => {
  const selectionSignature = buildActiveCellSelectionSignature({
    notebookMode: 'ipynb',
    text: 'value = 1',
    locationLabel: 'Cell 3'
  });
  const outputSignature = buildActiveCellOutputSignature({
    notebookMode: 'ipynb',
    text: '1',
    locationLabel: 'Cell 3 Output'
  });

  expect(selectionSignature).not.toBe(outputSignature);
});

test('isDuplicateActiveCellAttachmentSignature requires non-empty equal signatures', () => {
  expect(isDuplicateActiveCellAttachmentSignature('a', 'a')).toBe(true);
  expect(isDuplicateActiveCellAttachmentSignature('a', 'b')).toBe(false);
  expect(isDuplicateActiveCellAttachmentSignature(undefined, 'a')).toBe(false);
  expect(isDuplicateActiveCellAttachmentSignature('a', '')).toBe(false);
});
