import { expect, test } from '@playwright/test';

import { toMessageSelectionPreview } from '../../src/codexChatDocumentUtils';

test('toMessageSelectionPreview keeps line labels for jupytext text-editor selections', () => {
  expect(
    toMessageSelectionPreview(
      { kind: 'line', number: 7, text: 'print("hello")\nprint("world")' },
      null,
      'jupytext_py',
      'print("hello")\nprint("world")'
    )
  ).toEqual({
    locationLabel: 'Line 7',
    previewText: 'print("hello")\nprint("world")'
  });
});

test('toMessageSelectionPreview uses the attached text after payload truncation', () => {
  expect(
    toMessageSelectionPreview(
      { kind: 'cell', number: 3, text: 'original content that was longer' },
      null,
      'ipynb',
      'trimmed content'
    )
  ).toEqual({
    locationLabel: 'Cell 3',
    previewText: 'trimmed content'
  });
});
