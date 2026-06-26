export type ActiveCellAttachmentLimitResult = {
  selection: string;
  cellOutput: string;
  selectionTruncated: boolean;
  cellOutputTruncated: boolean;
};

export type SentAttachmentTruncationResult = {
  selectionTruncated: boolean;
  cellOutputTruncated: boolean;
};

const ACTIVE_CELL_SELECTION_MAX_LINE_CHARS = 2000;
const ACTIVE_CELL_LONG_LINE_MARKER = ' ... [long line truncated] ... ';

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function sliceByCharLimit(value: string, limit: number): string {
  if (limit <= 0) {
    return '';
  }
  if (value.length <= limit) {
    return value;
  }
  return value.slice(0, limit);
}

function truncateMiddle(text: string, maxChars: number, marker: string): string {
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars <= marker.length) {
    return text.slice(0, maxChars);
  }
  const remaining = maxChars - marker.length;
  const headLength = Math.ceil(remaining / 2);
  const tailLength = Math.floor(remaining / 2);
  return `${text.slice(0, headLength)}${marker}${text.slice(text.length - tailLength)}`;
}

function truncateLongSelectionLines(value: string, totalLimit: number): string {
  if (totalLimit <= 0) {
    return '';
  }
  const lineLimit = Math.min(totalLimit, ACTIVE_CELL_SELECTION_MAX_LINE_CHARS);
  return value
    .split('\n')
    .map(line => truncateMiddle(line, lineLimit, ACTIVE_CELL_LONG_LINE_MARKER))
    .join('\n');
}

export function limitActiveCellAttachmentPayload(
  selection: string,
  cellOutput: string,
  maxSelectionChars: number,
  maxCellOutputChars: number
): ActiveCellAttachmentLimitResult {
  const sourceSelection = typeof selection === 'string' ? selection : '';
  const sourceCellOutput = typeof cellOutput === 'string' ? cellOutput : '';
  const selectionLimit = clampNonNegativeInteger(maxSelectionChars);
  const cellOutputLimit = clampNonNegativeInteger(maxCellOutputChars);
  const nextSelection = sliceByCharLimit(truncateLongSelectionLines(sourceSelection, selectionLimit), selectionLimit);
  const nextCellOutput = sliceByCharLimit(sourceCellOutput, cellOutputLimit);
  return {
    selection: nextSelection,
    cellOutput: nextCellOutput,
    selectionTruncated: nextSelection !== sourceSelection,
    cellOutputTruncated: nextCellOutput !== sourceCellOutput
  };
}

export function buildAttachmentTruncationNotice(
  selectionTruncated: boolean,
  cellOutputTruncated: boolean,
  maxSelectionChars: number,
  maxCellOutputChars: number
): string | null {
  if (!selectionTruncated && !cellOutputTruncated) {
    return null;
  }

  const selectionLimit = String(clampNonNegativeInteger(maxSelectionChars));
  const cellOutputLimit = String(clampNonNegativeInteger(maxCellOutputChars));
  if (selectionTruncated && cellOutputTruncated) {
    return `Attached input and output were truncated before sending (input: ${selectionLimit} chars, output: ${cellOutputLimit} chars). The full input can be checked directly from the source file/cell.`;
  }
  if (selectionTruncated) {
    return `Attached input was truncated before sending to stay within ${selectionLimit} characters. The full input can be checked directly from the source file/cell.`;
  }
  return `Attached output was truncated before sending to stay within ${cellOutputLimit} characters.`;
}

export function resolveSentAttachmentTruncation(input: {
  includeSelection: boolean;
  includeCellOutput: boolean;
  selectionTruncated: boolean;
  cellOutputTruncated: boolean;
}): SentAttachmentTruncationResult {
  return {
    selectionTruncated: input.includeSelection && input.selectionTruncated,
    cellOutputTruncated: input.includeCellOutput && input.cellOutputTruncated
  };
}
