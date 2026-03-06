import type { NotebookMode } from './codexChatDocumentUtils';

export type CellAttachmentStateInput = {
  includeActiveCellForNextSend: boolean;
  includeActiveCellOutput: boolean;
  notebookMode: NotebookMode;
  isNotebookEditor: boolean;
  currentNotebookPath: string;
  pairedOk: boolean | null | undefined;
};

export type CellAttachmentState = {
  showBadge: boolean;
  contentEnabled: boolean;
  outputEnabled: boolean;
};

export function resolveCellAttachmentState(input: CellAttachmentStateInput): CellAttachmentState {
  const canAttachCurrentCellContent =
    input.includeActiveCellForNextSend &&
    input.isNotebookEditor &&
    (input.notebookMode === 'ipynb' || input.notebookMode === 'jupytext_py');
  const canAttachCurrentCellOutput =
    canAttachCurrentCellContent && input.includeActiveCellOutput;
  const showBadge =
    canAttachCurrentCellContent &&
    input.currentNotebookPath.length > 0 &&
    input.pairedOk !== false;

  return {
    showBadge,
    contentEnabled: canAttachCurrentCellContent,
    outputEnabled: canAttachCurrentCellOutput
  };
}
