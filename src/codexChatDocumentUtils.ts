import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { MessageContextPreview, SelectionPreview } from './handlers/codexMessageUtils';
import { truncateEnd as truncateEndShared } from './handlers/codexMessageUtils';
const truncateEnd = truncateEndShared;

export type { MessageContextPreview, SelectionPreview };

export type NotebookMode = 'ipynb' | 'jupytext_py' | 'plain_py' | 'unsupported';

export const MESSAGE_SELECTION_PREVIEW_DISPLAY_MAX_CHARS = 500;
export const MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS = 500;

export type DocumentWidgetLike = {
  isDisposed?: boolean;
  context?: {
    path?: string;
    model?: { dirty?: boolean };
    save?: () => Promise<void>;
    revert?: () => Promise<void>;
  };
  content?: any;
};

export function getDocumentContext(widget: DocumentWidgetLike | null): any {
  return widget && widget.context ? widget.context : null;
}

export function getSupportedDocumentPath(widget: DocumentWidgetLike | null): string {
  const rawPath = typeof widget?.context?.path === 'string' ? widget.context.path.trim() : '';
  if (!rawPath) {
    return '';
  }
  const lower = rawPath.toLowerCase();
  if (lower.endsWith('.ipynb') || lower.endsWith('.py')) {
    return rawPath;
  }
  return '';
}

export function getActiveDocumentWidget(
  app: JupyterFrontEnd,
  fallbackWidget: DocumentWidgetLike | null
): DocumentWidgetLike | null {
  const current = app.shell.currentWidget as any;
  const currentPath = getSupportedDocumentPath(current as DocumentWidgetLike | null);
  if (currentPath) {
    return current as DocumentWidgetLike;
  }

  if (fallbackWidget && !fallbackWidget.isDisposed && getSupportedDocumentPath(fallbackWidget)) {
    return fallbackWidget;
  }
  return null;
}

export function findDocumentWidgetByPath(
  app: JupyterFrontEnd,
  path: string,
  fallbackWidget: DocumentWidgetLike | null = null
): DocumentWidgetLike | null {
  const normalizedPath = (path || '').trim();
  if (!normalizedPath) {
    return null;
  }

  const current = app.shell.currentWidget as any;
  if (getSupportedDocumentPath(current as DocumentWidgetLike | null) === normalizedPath) {
    return current as DocumentWidgetLike;
  }

  if (
    fallbackWidget &&
    !fallbackWidget.isDisposed &&
    getSupportedDocumentPath(fallbackWidget) === normalizedPath
  ) {
    return fallbackWidget;
  }

  const iterator: any = app.shell.widgets('main');
  if (iterator && typeof iterator.next === 'function') {
    while (true) {
      const candidate = iterator.next() as any;
      if (!candidate) {
        break;
      }
      if (getSupportedDocumentPath(candidate as DocumentWidgetLike) === normalizedPath) {
        return candidate as DocumentWidgetLike;
      }
    }
  }
  return null;
}

export function normalizeSelectionPreviewText(text: string): string {
  return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function isNotebookWidget(widget: DocumentWidgetLike | null): boolean {
  return Boolean(widget && widget.content && 'activeCell' in widget.content);
}

export type DocumentViewState = {
  scrollTop: number;
  scrollLeft: number;
  activeCellIndex: number | null;
};

export function isScrollableElement(element: HTMLElement | null): element is HTMLElement {
  if (!element) {
    return false;
  }
  return element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return Boolean(value && value instanceof HTMLElement);
}

export function querySelectorIncludingSelf(root: HTMLElement, selector: string): HTMLElement | null {
  if (root.matches(selector)) {
    return root;
  }
  return root.querySelector(selector) as HTMLElement | null;
}

export function getPrimaryDocumentScrollContainer(widget: DocumentWidgetLike | null): HTMLElement | null {
  const contentNode = (widget as any)?.content?.node;
  const widgetNode = (widget as any)?.node;
  const roots = [contentNode, widgetNode].filter(isHTMLElement);
  if (roots.length === 0) {
    return null;
  }

  const candidates = [
    '.jp-WindowedPanel-outer',
    '.jp-Notebook .jp-WindowedPanel-outer',
    '.jp-NotebookPanel-notebook .jp-WindowedPanel-outer',
    '.jp-FileEditor .cm-scroller',
    '.jp-FileEditor .jp-CodeMirrorEditor',
    '.cm-scroller',
    '.jp-FileEditor'
  ];

  for (const root of roots) {
    for (const selector of candidates) {
      const node = querySelectorIncludingSelf(root, selector);
      if (isScrollableElement(node)) {
        return node;
      }
    }
  }

  for (const root of roots) {
    if (isScrollableElement(root)) {
      return root;
    }
  }

  return null;
}

export function captureDocumentViewState(widget: DocumentWidgetLike | null): DocumentViewState {
  const scrollContainer = getPrimaryDocumentScrollContainer(widget);
  const notebookContent: any = isNotebookWidget(widget) ? (widget as any).content : null;
  const rawActiveCellIndex = Number(notebookContent?.activeCellIndex);
  const activeCellIndex = Number.isFinite(rawActiveCellIndex) ? Math.max(0, Math.floor(rawActiveCellIndex)) : null;
  return {
    scrollTop: scrollContainer?.scrollTop ?? 0,
    scrollLeft: scrollContainer?.scrollLeft ?? 0,
    activeCellIndex
  };
}

export function restoreDocumentViewState(widget: DocumentWidgetLike | null, viewState: DocumentViewState): void {
  if (isNotebookWidget(widget) && viewState.activeCellIndex !== null) {
    try {
      const notebookContent: any = (widget as any).content;
      const cellsLengthRaw = Number(notebookContent?.widgets?.length);
      if (Number.isFinite(cellsLengthRaw) && cellsLengthRaw > 0) {
        const maxIndex = Math.floor(cellsLengthRaw) - 1;
        notebookContent.activeCellIndex = Math.max(0, Math.min(viewState.activeCellIndex, maxIndex));
      }
    } catch {
      // Ignore active-cell restore failures.
    }
  }

  const applyScroll = () => {
    const scrollContainer = getPrimaryDocumentScrollContainer(widget);
    if (!scrollContainer) {
      return;
    }
    scrollContainer.scrollTop = viewState.scrollTop;
    scrollContainer.scrollLeft = viewState.scrollLeft;
  };

  applyScroll();
  window.requestAnimationFrame(() => {
    applyScroll();
    window.requestAnimationFrame(applyScroll);
  });
  window.setTimeout(applyScroll, 120);
}

export function getActiveCellText(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }
  const source =
    typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
  return typeof source === 'string' ? source : '';
}

export type CodeEditorSelection = {
  text: string;
  startLine: number | null;
};

export type SelectedContext =
  | {
      kind: 'cell';
      number: number;
      text: string;
    }
  | {
      kind: 'line';
      number: number;
      text: string;
    };

export function getSelectionFromCodeEditor(editor: any, source: string): CodeEditorSelection | null {
  if (!editor || typeof editor.getSelection !== 'function' || typeof editor.getOffsetAt !== 'function') {
    return null;
  }

  const range = editor.getSelection();
  if (!range || !range.start || !range.end) {
    return null;
  }

  const startOffset = Number(editor.getOffsetAt(range.start));
  const endOffset = Number(editor.getOffsetAt(range.end));
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
    return null;
  }

  const from = Math.max(0, Math.min(startOffset, endOffset));
  const to = Math.max(0, Math.max(startOffset, endOffset));
  if (to <= from || !source) {
    return null;
  }

  const text = source.slice(from, to);
  if (!text) {
    return null;
  }

  const startLineRaw = Number(range.start.line);
  const endLineRaw = Number(range.end.line);
  const startLine =
    Number.isFinite(startLineRaw) && Number.isFinite(endLineRaw)
      ? Math.max(1, Math.min(startLineRaw, endLineRaw) + 1)
      : null;

  return { text, startLine };
}

export function getSelectedTextFromCodeEditor(editor: any, source: string): string {
  const selection = getSelectionFromCodeEditor(editor, source);
  return selection?.text || '';
}

export function getSelectedTextFromActiveCell(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }

  try {
    const source =
      typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
    return getSelectedTextFromCodeEditor((activeCell as any).editor, typeof source === 'string' ? source : '');
  } catch {
    return '';
  }
}

export function getSelectedContextFromActiveCell(widget: DocumentWidgetLike | null): SelectedContext | null {
  if (!isNotebookWidget(widget)) {
    return null;
  }
  const notebookContent: any = (widget as any).content;
  const activeCell = notebookContent?.activeCell;
  if (!activeCell) {
    return null;
  }

  try {
    const source =
      typeof activeCell.model?.sharedModel?.getSource === 'function' ? activeCell.model.sharedModel.getSource() : '';
    const selection = getSelectionFromCodeEditor(
      (activeCell as any).editor,
      typeof source === 'string' ? source : ''
    );
    if (!selection?.text) {
      return null;
    }

    const rawCellIndex = Number(notebookContent?.activeCellIndex);
    const cellNumber = Number.isFinite(rawCellIndex) ? Math.max(1, Math.floor(rawCellIndex) + 1) : 1;
    return {
      kind: 'cell',
      number: cellNumber,
      text: selection.text
    };
  } catch {
    return null;
  }
}

export function getSelectedTextFromFileEditor(widget: DocumentWidgetLike | null): string {
  if (!widget || isNotebookWidget(widget)) {
    return '';
  }

  try {
    const editor: any = (widget as any).content?.editor;
    if (!editor) {
      return '';
    }
    const source =
      typeof editor.model?.sharedModel?.getSource === 'function' ? editor.model.sharedModel.getSource() : '';
    return getSelectedTextFromCodeEditor(editor, typeof source === 'string' ? source : '');
  } catch {
    return '';
  }
}

export function getSelectedContextFromFileEditor(widget: DocumentWidgetLike | null): SelectedContext | null {
  if (!widget || isNotebookWidget(widget)) {
    return null;
  }

  try {
    const editor: any = (widget as any).content?.editor;
    if (!editor) {
      return null;
    }
    const source =
      typeof editor.model?.sharedModel?.getSource === 'function' ? editor.model.sharedModel.getSource() : '';
    const selection = getSelectionFromCodeEditor(editor, typeof source === 'string' ? source : '');
    if (!selection?.text) {
      return null;
    }
    const lineNumber = selection.startLine ?? 1;
    return {
      kind: 'line',
      number: lineNumber,
      text: selection.text
    };
  } catch {
    return null;
  }
}

export function getSelectedContext(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode
): SelectedContext | null {
  if (notebookMode === 'plain_py') {
    return getSelectedContextFromFileEditor(widget) ?? getSelectedContextFromActiveCell(widget);
  }
  return getSelectedContextFromActiveCell(widget) ?? getSelectedContextFromFileEditor(widget);
}

export function inferLocationLabelFromWidget(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode
): string {
  if (isNotebookWidget(widget) || notebookMode === 'ipynb' || notebookMode === 'jupytext_py') {
    const rawCellIndex = Number((widget as any)?.content?.activeCellIndex);
    if (Number.isFinite(rawCellIndex)) {
      return `Cell ${Math.max(1, Math.floor(rawCellIndex) + 1)}`;
    }
    return 'Cell';
  }

  try {
    const editor: any = widget && !isNotebookWidget(widget) ? (widget as any).content?.editor : null;
    if (editor && typeof editor.getCursorPosition === 'function') {
      const cursor = editor.getCursorPosition();
      const lineRaw = Number(cursor?.line);
      if (Number.isFinite(lineRaw)) {
        return `Line ${Math.max(1, Math.floor(lineRaw) + 1)}`;
      }
    }
  } catch {
    // Ignore location inference errors and fallback to a generic label.
  }

  return notebookMode === 'plain_py' ? 'Line' : 'Selection';
}

export function toSelectionPreview(context: SelectedContext | null): SelectionPreview | undefined {
  if (!context) {
    return undefined;
  }
  const normalized = normalizeSelectionPreviewText(context.text);
  if (!normalized) {
    return undefined;
  }
  const locationLabel = context.kind === 'cell' ? `Cell ${context.number}` : `Line ${context.number}`;
  return {
    locationLabel,
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

export function formatSelectionPreviewTextForDisplay(previewText: string): string {
  return truncateEnd(normalizeSelectionPreviewText(previewText), MESSAGE_SELECTION_PREVIEW_DISPLAY_MAX_CHARS);
}

export function toFallbackSelectionPreview(
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode,
  text: string
): SelectionPreview | undefined {
  const normalized = normalizeSelectionPreviewText(text);
  if (!normalized) {
    return undefined;
  }
  return {
    locationLabel: inferLocationLabelFromWidget(widget, notebookMode),
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

export function toCellOutputPreview(
  context: SelectedContext | null,
  widget: DocumentWidgetLike | null,
  notebookMode: NotebookMode,
  outputText: string
): SelectionPreview | undefined {
  const normalized = normalizeSelectionPreviewText(outputText);
  if (!normalized) {
    return undefined;
  }
  const locationBase =
    context?.kind === 'cell'
      ? `Cell ${context.number}`
      : inferLocationLabelFromWidget(widget, notebookMode);
  return {
    locationLabel: `${locationBase} Output`,
    previewText: truncateEnd(normalized, MESSAGE_SELECTION_PREVIEW_STORED_MAX_CHARS)
  };
}

export const ACTIVE_CELL_OUTPUT_MAX_CHARS = 6000;
export const ACTIVE_CELL_OUTPUT_MAX_ITEMS = 24;

export function stripAnsi(value: string): string {
  // Best-effort removal of ANSI escape codes (tracebacks sometimes include them).
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function coerceText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string').join('');
  }
  return '';
}

export function formatJupyterOutput(output: any): string {
  if (!output || typeof output !== 'object') {
    return '';
  }
  const outputType = typeof output.output_type === 'string' ? output.output_type : '';
  if (!outputType) {
    return '';
  }

  if (outputType === 'stream') {
    const text = coerceText(output.text);
    if (!text) {
      return '';
    }
    const name = typeof output.name === 'string' ? output.name : '';
    const cleaned = stripAnsi(text).replace(/\s+$/, '');
    if (!cleaned) {
      return '';
    }
    return name === 'stderr' ? `[stderr]\n${cleaned}` : cleaned;
  }

  if (outputType === 'error') {
    const traceback = Array.isArray(output.traceback)
      ? output.traceback.filter((line: unknown) => typeof line === 'string')
      : [];
    const tbText = stripAnsi(traceback.join('\n')).replace(/\s+$/, '');
    if (tbText) {
      return tbText;
    }
    const ename = typeof output.ename === 'string' ? output.ename : '';
    const evalue = typeof output.evalue === 'string' ? output.evalue : '';
    const summary = [ename, evalue].filter(Boolean).join(': ').trim();
    return summary;
  }

  if (outputType === 'execute_result' || outputType === 'display_data' || outputType === 'update_display_data') {
    const data = output.data && typeof output.data === 'object' ? output.data : null;
    if (!data) {
      return '';
    }
    const textPlain = coerceText((data as any)['text/plain']);
    if (textPlain) {
      const cleaned = stripAnsi(textPlain).replace(/\s+$/, '');
      if (!cleaned) {
        return '';
      }
      if (outputType === 'execute_result' && typeof output.execution_count === 'number') {
        return `Out[${output.execution_count}]:\n${cleaned}`;
      }
      return cleaned;
    }

    const mimeTypes = Object.keys(data as any).filter(mime => mime && mime !== 'text/plain');
    if (mimeTypes.length > 0) {
      return `[non-text output omitted: ${mimeTypes.slice(0, 6).join(', ')}${mimeTypes.length > 6 ? ', ...' : ''}]`;
    }
    return '';
  }

  return '';
}

export function summarizeJupyterOutputs(outputs: any[]): string {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return '';
  }

  let combined = '';
  let appended = 0;
  let truncated = false;

  for (const output of outputs) {
    if (appended >= ACTIVE_CELL_OUTPUT_MAX_ITEMS) {
      truncated = true;
      break;
    }
    const chunk = formatJupyterOutput(output);
    if (!chunk) {
      continue;
    }
    appended += 1;

    const sep = combined ? '\n\n' : '';
    const remaining = ACTIVE_CELL_OUTPUT_MAX_CHARS - combined.length - sep.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const slice = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
    combined += sep + slice;
    if (slice.length !== chunk.length) {
      truncated = true;
      break;
    }
  }

  combined = combined.replace(/\s+$/, '');
  if (!combined) {
    return '';
  }
  if (truncated) {
    combined += '\n\n... (truncated)';
  }
  return combined;
}

export function getActiveCellOutput(widget: DocumentWidgetLike | null): string {
  if (!isNotebookWidget(widget)) {
    return '';
  }
  const activeCell = (widget as any).content.activeCell;
  if (!activeCell) {
    return '';
  }

  try {
    const model: any = activeCell.model as any;
    const cellType = typeof model?.type === 'string' ? model.type : '';
    if (cellType && cellType !== 'code') {
      return '';
    }
    const json = typeof model?.toJSON === 'function' ? model.toJSON() : null;
    const outputs = json && Array.isArray((json as any).outputs) ? (json as any).outputs : [];
    return summarizeJupyterOutputs(outputs);
  } catch {
    return '';
  }
}
