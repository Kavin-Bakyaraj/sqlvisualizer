import type { Node } from '@xyflow/react';
import type { TableDefinition } from '@/lib/sql-parser';

export const NODE_MIN_WIDTH = 280;
export const NODE_HEADER_HEIGHT = 48;
export const NODE_VERTICAL_PADDING = 16;
export const NODE_ROW_HEIGHT = 32;
export const NODE_HORIZONTAL_PADDING = 32;
export const NODE_TEXT_GAP = 40;

export type DiagramNodeSize = {
  width: number;
  height: number;
};

function estimateTextWidth(text: string, characterWidth: number): number {
  return text.length * characterWidth;
}

export function getTableNodeSize(table: TableDefinition): DiagramNodeSize {
  const titleWidth = estimateTextWidth(table.name, 8) + NODE_HORIZONTAL_PADDING;
  const columnWidth = table.columns.reduce((maxWidth, column) => {
    const nameWidth = estimateTextWidth(column.name, 7);
    const typeWidth = estimateTextWidth(column.type, 6);
    return Math.max(maxWidth, nameWidth + typeWidth + NODE_TEXT_GAP + NODE_HORIZONTAL_PADDING);
  }, 0);

  return {
    width: Math.ceil(Math.max(NODE_MIN_WIDTH, titleWidth, columnWidth)),
    height: NODE_HEADER_HEIGHT + NODE_VERTICAL_PADDING + (table.columns.length * NODE_ROW_HEIGHT),
  };
}

export function getNodeTable(node: Node): TableDefinition {
  return node.data as TableDefinition;
}

export function getDiagramNodeSize(node: Node): DiagramNodeSize {
  return getTableNodeSize(getNodeTable(node));
}

export function getColumnHandleY(table: TableDefinition, columnName: string): number {
  const columnIndex = table.columns.findIndex(column => column.name === columnName);
  const safeIndex = Math.max(columnIndex, 0);
  return NODE_HEADER_HEIGHT + (NODE_VERTICAL_PADDING / 2) + (safeIndex * NODE_ROW_HEIGHT) + (NODE_ROW_HEIGHT / 2);
}
