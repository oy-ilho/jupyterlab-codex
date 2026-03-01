import { normalizeSelectionPreviewText, type NotebookMode } from './codexChatDocumentUtils';

const ACTIVE_CELL_ATTACHMENT_SIGNATURE_SEPARATOR = '\u241f';

export type ActiveCellAttachmentSignatureInput = {
  notebookMode: NotebookMode;
  selection: string;
  cellOutput: string;
  selectionLocationLabel?: string;
  cellOutputLocationLabel?: string;
};

export function makeActiveCellAttachmentDedupKey(sessionKey: string, threadId: string): string {
  const normalizedThreadId = (threadId || '').trim();
  if (normalizedThreadId) {
    return `thread:${normalizedThreadId}`;
  }
  return `session:${(sessionKey || '').trim()}`;
}

export function buildActiveCellAttachmentSignature(input: ActiveCellAttachmentSignatureInput): string {
  const notebookMode = input.notebookMode;
  const selection = normalizeSelectionPreviewText(input.selection || '');
  const cellOutput = normalizeSelectionPreviewText(input.cellOutput || '');
  const selectionLocationLabel = (input.selectionLocationLabel || '').trim();
  const cellOutputLocationLabel = (input.cellOutputLocationLabel || '').trim();

  return [
    notebookMode,
    selectionLocationLabel,
    selection,
    cellOutputLocationLabel,
    cellOutput
  ].join(ACTIVE_CELL_ATTACHMENT_SIGNATURE_SEPARATOR);
}

export function isDuplicateActiveCellAttachmentSignature(previous: string | undefined, next: string): boolean {
  if (!previous || !next) {
    return false;
  }
  return previous === next;
}
