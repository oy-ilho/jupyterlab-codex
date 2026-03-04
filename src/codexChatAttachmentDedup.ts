import { normalizeSelectionPreviewText, type NotebookMode } from './codexChatDocumentUtils';

const ACTIVE_CELL_ATTACHMENT_SIGNATURE_SEPARATOR = '\u241f';
const ACTIVE_CELL_ATTACHMENT_KIND_SELECTION = 'selection';
const ACTIVE_CELL_ATTACHMENT_KIND_OUTPUT = 'output';

export type ActiveCellAttachmentSignatureInput = {
  notebookMode: NotebookMode;
  text: string;
  locationLabel?: string;
};

export function makeActiveCellAttachmentDedupKey(sessionKey: string, threadId: string): string {
  const normalizedThreadId = (threadId || '').trim();
  if (normalizedThreadId) {
    return `thread:${normalizedThreadId}`;
  }
  return `session:${(sessionKey || '').trim()}`;
}

function buildActiveCellAttachmentSignature(kind: string, input: ActiveCellAttachmentSignatureInput): string {
  const notebookMode = input.notebookMode;
  const text = normalizeSelectionPreviewText(input.text || '');
  const locationLabel = (input.locationLabel || '').trim();

  return [
    kind,
    notebookMode,
    locationLabel,
    text
  ].join(ACTIVE_CELL_ATTACHMENT_SIGNATURE_SEPARATOR);
}

export function buildActiveCellSelectionSignature(input: ActiveCellAttachmentSignatureInput): string {
  return buildActiveCellAttachmentSignature(ACTIVE_CELL_ATTACHMENT_KIND_SELECTION, input);
}

export function buildActiveCellOutputSignature(input: ActiveCellAttachmentSignatureInput): string {
  return buildActiveCellAttachmentSignature(ACTIVE_CELL_ATTACHMENT_KIND_OUTPUT, input);
}

export function isDuplicateActiveCellAttachmentSignature(previous: string | undefined, next: string): boolean {
  if (!previous || !next) {
    return false;
  }
  return previous === next;
}
