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
  const nextSelection = sliceByCharLimit(sourceSelection, selectionLimit);
  const nextCellOutput = sliceByCharLimit(sourceCellOutput, cellOutputLimit);
  return {
    selection: nextSelection,
    cellOutput: nextCellOutput,
    selectionTruncated: nextSelection.length < sourceSelection.length,
    cellOutputTruncated: nextCellOutput.length < sourceCellOutput.length
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
