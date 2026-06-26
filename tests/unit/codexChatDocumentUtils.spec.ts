import { expect, test } from '@playwright/test';

import {
  ACTIVE_CELL_OUTPUT_MAX_CHARS,
  ERROR_CELL_OUTPUT_MAX_CHARS,
  summarizeJupyterOutputs,
  toMessageSelectionPreview
} from '../../src/codexChatDocumentUtils';

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

test('summarizeJupyterOutputs truncates long non-error output lines before sending', () => {
  const output = summarizeJupyterOutputs([
    {
      output_type: 'stream',
      name: 'stdout',
      text: 'A'.repeat(ACTIVE_CELL_OUTPUT_MAX_CHARS + 100)
    }
  ]);

  expect(output.startsWith('A'.repeat(16))).toBeTruthy();
  expect(output).toContain('[long line truncated]');
  expect(output.length).toBeLessThanOrEqual(ACTIVE_CELL_OUTPUT_MAX_CHARS);
});

test('summarizeJupyterOutputs keeps the end of error output when truncating', () => {
  const tail = 'ValueError: final failure details';
  const output = summarizeJupyterOutputs([
    {
      output_type: 'error',
      traceback: ['trace line', 'B'.repeat(ACTIVE_CELL_OUTPUT_MAX_CHARS), tail]
    }
  ]);

  expect(output).toContain('[long line truncated]');
  expect(output.endsWith(tail)).toBeTruthy();
  expect(output.length).toBeLessThanOrEqual(ERROR_CELL_OUTPUT_MAX_CHARS);
});

test('summarizeJupyterOutputs applies a smaller total cap to error output', () => {
  const tail = 'RuntimeError: compact final detail';
  const output = summarizeJupyterOutputs([
    {
      output_type: 'error',
      traceback: Array.from({ length: 12 }, (_, index) => `trace ${index}: ${'C'.repeat(1800)}`).concat(tail)
    }
  ]);

  expect(output.startsWith('... (truncated)')).toBeTruthy();
  expect(output.endsWith(tail)).toBeTruthy();
  expect(output.length).toBeLessThanOrEqual(ERROR_CELL_OUTPUT_MAX_CHARS);
});
