import { expect, test } from '@playwright/test';

import { resolveCellAttachmentState } from '../../src/codexChatAttachmentState';

test('resolveCellAttachmentState shows notebook cell attachment for jupytext notebook editor', () => {
  expect(
    resolveCellAttachmentState({
      includeActiveCellForNextSend: true,
      includeActiveCellOutput: true,
      notebookMode: 'jupytext_py',
      isNotebookEditor: true,
      currentNotebookPath: '/tmp/example.py',
      pairedOk: true
    })
  ).toEqual({
    showBadge: true,
    contentEnabled: true,
    outputEnabled: true
  });
});

test('resolveCellAttachmentState hides cell attachment for jupytext text editor', () => {
  expect(
    resolveCellAttachmentState({
      includeActiveCellForNextSend: true,
      includeActiveCellOutput: true,
      notebookMode: 'jupytext_py',
      isNotebookEditor: false,
      currentNotebookPath: '/tmp/example.py',
      pairedOk: true
    })
  ).toEqual({
    showBadge: false,
    contentEnabled: false,
    outputEnabled: false
  });
});

test('resolveCellAttachmentState hides badge for plain python notebook mode', () => {
  expect(
    resolveCellAttachmentState({
      includeActiveCellForNextSend: true,
      includeActiveCellOutput: true,
      notebookMode: 'plain_py',
      isNotebookEditor: true,
      currentNotebookPath: '/tmp/example.py',
      pairedOk: true
    })
  ).toEqual({
    showBadge: false,
    contentEnabled: false,
    outputEnabled: false
  });
});
