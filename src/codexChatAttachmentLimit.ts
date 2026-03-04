export type ActiveCellAttachmentLimitResult = {
  selection: string;
  cellOutput: string;
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
  maxTotalChars: number
): ActiveCellAttachmentLimitResult {
  const sourceSelection = typeof selection === 'string' ? selection : '';
  const sourceCellOutput = typeof cellOutput === 'string' ? cellOutput : '';
  const maxChars = clampNonNegativeInteger(maxTotalChars);

  if (maxChars <= 0) {
    return {
      selection: '',
      cellOutput: '',
      selectionTruncated: sourceSelection.length > 0,
      cellOutputTruncated: sourceCellOutput.length > 0
    };
  }

  const totalLength = sourceSelection.length + sourceCellOutput.length;
  if (totalLength <= maxChars) {
    return {
      selection: sourceSelection,
      cellOutput: sourceCellOutput,
      selectionTruncated: false,
      cellOutputTruncated: false
    };
  }

  // Preserve output first, then use remaining budget for input.
  const nextCellOutput = sliceByCharLimit(sourceCellOutput, maxChars);
  const remainingForSelection = Math.max(0, maxChars - nextCellOutput.length);
  const nextSelection = sliceByCharLimit(sourceSelection, remainingForSelection);
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
  maxTotalChars: number
): string | null {
  if (!selectionTruncated && !cellOutputTruncated) {
    return null;
  }

  const maxChars = String(clampNonNegativeInteger(maxTotalChars));
  if (selectionTruncated && cellOutputTruncated) {
    return `Attached input and output were truncated to stay within ${maxChars} total characters before sending. The full input can be checked directly from the source file/cell.`;
  }
  if (selectionTruncated) {
    return `Attached input was truncated to stay within ${maxChars} total characters before sending. The full input can be checked directly from the source file/cell.`;
  }
  return `Attached output was truncated to stay within ${maxChars} total characters before sending.`;
}
