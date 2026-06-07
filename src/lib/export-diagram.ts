import type { Edge, Node } from '@xyflow/react';
import {
  getColumnHandleY,
  getDiagramNodeSize,
  getNodeTable,
  NODE_HEADER_HEIGHT,
  NODE_ROW_HEIGHT,
  NODE_VERTICAL_PADDING,
} from '@/lib/diagram-geometry';

export type ExportFormat = 'svg' | 'png' | 'pdf';

type DiagramBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

const EXPORT_PADDING = 80;
const BACKGROUND_COLOR = '#f8fafc';
const GRID_COLOR = '#d7dde7';
const NODE_BORDER = '#d1d5db';
const NODE_HEADER = '#d6e6fe';
const EDGE_COLOR = '#6CA7FF';
const TEXT_COLOR = '#1f2937';
const MUTED_TEXT_COLOR = '#6b7280';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function getDiagramBounds(nodes: Node[]): DiagramBounds {
  const minX = Math.min(...nodes.map(node => node.position.x));
  const minY = Math.min(...nodes.map(node => node.position.y));
  const maxX = Math.max(...nodes.map(node => node.position.x + getDiagramNodeSize(node).width));
  const maxY = Math.max(...nodes.map(node => node.position.y + getDiagramNodeSize(node).height));

  return {
    minX,
    minY,
    width: Math.ceil(maxX - minX + (EXPORT_PADDING * 2)),
    height: Math.ceil(maxY - minY + (EXPORT_PADDING * 2)),
  };
}

function getExportPosition(node: Node, bounds: DiagramBounds) {
  return {
    x: node.position.x - bounds.minX + EXPORT_PADDING,
    y: node.position.y - bounds.minY + EXPORT_PADDING,
  };
}

function getEdgePath(edge: Edge, nodesById: Map<string, Node>, bounds: DiagramBounds): string | null {
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const sourceTable = getNodeTable(sourceNode);
  const targetTable = getNodeTable(targetNode);
  const sourceSize = getDiagramNodeSize(sourceNode);
  const sourceColumn = String(edge.sourceHandle || '').replace(/-out$/, '');
  const targetColumn = String(edge.targetHandle || '').replace(/-in$/, '');
  const sourcePosition = getExportPosition(sourceNode, bounds);
  const targetPosition = getExportPosition(targetNode, bounds);
  const sourceX = sourcePosition.x + sourceSize.width;
  const sourceY = sourcePosition.y + getColumnHandleY(sourceTable, sourceColumn);
  const targetX = targetPosition.x;
  const targetY = targetPosition.y + getColumnHandleY(targetTable, targetColumn);
  const controlOffset = Math.max(80, Math.abs(targetX - sourceX) / 2);

  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

export function createDiagramSvg(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) {
    throw new Error('Generate a diagram before downloading.');
  }

  const bounds = getDiagramBounds(nodes);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const edgeMarkup = edges
    .map(edge => getEdgePath(edge, nodesById, bounds))
    .filter(Boolean)
    .map(path => `<path d="${path}" fill="none" stroke="${EDGE_COLOR}" stroke-width="2.5" stroke-linecap="round"/>`)
    .join('');

  const nodeMarkup = nodes.map(node => {
    const table = getNodeTable(node);
    const size = getDiagramNodeSize(node);
    const position = getExportPosition(node, bounds);
    const rows = table.columns.map((column, index) => {
      const rowY = NODE_HEADER_HEIGHT + (NODE_VERTICAL_PADDING / 2) + (index * NODE_ROW_HEIGHT);
      const textY = rowY + 21;
      const keyMarkup = column.isPrimaryKey
        ? `<circle cx="18" cy="${rowY + 16}" r="5" fill="#facc15"/><text x="18" y="${rowY + 19}" font-size="7" font-weight="700" text-anchor="middle" fill="#713f12">K</text>`
        : '';

      return `
        <g>
          ${keyMarkup}
          <text x="32" y="${textY}" font-size="12" font-weight="600" fill="${TEXT_COLOR}">${escapeXml(column.name)}</text>
          <text x="${size.width - 16}" y="${textY}" font-size="10" font-family="monospace" text-anchor="end" fill="${MUTED_TEXT_COLOR}">${escapeXml(column.type.toUpperCase())}</text>
        </g>
      `;
    }).join('');

    return `
      <g transform="translate(${position.x}, ${position.y})">
        <rect width="${size.width}" height="${size.height}" rx="10" fill="#ffffff" stroke="${NODE_BORDER}"/>
        <rect width="${size.width}" height="${NODE_HEADER_HEIGHT}" rx="10" fill="${NODE_HEADER}"/>
        <path d="M 0 ${NODE_HEADER_HEIGHT} H ${size.width}" stroke="${EDGE_COLOR}" stroke-opacity="0.3"/>
        <text x="16" y="30" font-size="14" font-weight="700" fill="${TEXT_COLOR}">${escapeXml(table.name)}</text>
        ${rows}
      </g>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">
  <defs>
    <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${GRID_COLOR}"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="${BACKGROUND_COLOR}"/>
  <rect width="100%" height="100%" fill="url(#grid)" opacity="0.65"/>
  ${edgeMarkup}
  ${nodeMarkup}
</svg>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadSvg(svg: string) {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'sql-diagram.svg');
}

async function downloadPng(svg: string) {
  const width = Number(svg.match(/width="(\d+)"/)?.[1] || 0);
  const height = Number(svg.match(/height="(\d+)"/)?.[1] || 0);
  const maxPixels = 24000000;
  const scale = Math.min(2, Math.max(0.25, Math.sqrt(maxPixels / Math.max(width * height, 1))));
  const imageUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render diagram image.'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create PNG canvas.');
    }

    context.fillStyle = BACKGROUND_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Could not create PNG file.'));
        }
      }, 'image/png');
    });

    downloadBlob(blob, 'sql-diagram.png');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function pdfColor(hex: string, operator: 'rg' | 'RG'): string {
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} ${operator}`;
}

function createDiagramPdf(nodes: Node[], edges: Edge[]): Blob {
  const bounds = getDiagramBounds(nodes);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const pageWidth = bounds.width;
  const pageHeight = bounds.height;
  const y = (value: number) => pageHeight - value;
  const commands: string[] = [
    pdfColor(BACKGROUND_COLOR, 'rg'),
    `0 0 ${pageWidth} ${pageHeight} re f`,
    '2 w',
    pdfColor(EDGE_COLOR, 'RG'),
  ];

  edges.forEach(edge => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode || !targetNode) {
      return;
    }

    const sourceTable = getNodeTable(sourceNode);
    const targetTable = getNodeTable(targetNode);
    const sourceSize = getDiagramNodeSize(sourceNode);
    const sourceColumn = String(edge.sourceHandle || '').replace(/-out$/, '');
    const targetColumn = String(edge.targetHandle || '').replace(/-in$/, '');
    const sourcePosition = getExportPosition(sourceNode, bounds);
    const targetPosition = getExportPosition(targetNode, bounds);
    const sourceX = sourcePosition.x + sourceSize.width;
    const sourceY = sourcePosition.y + getColumnHandleY(sourceTable, sourceColumn);
    const targetX = targetPosition.x;
    const targetY = targetPosition.y + getColumnHandleY(targetTable, targetColumn);
    const controlOffset = Math.max(80, Math.abs(targetX - sourceX) / 2);

    commands.push(`${sourceX} ${y(sourceY)} m ${sourceX + controlOffset} ${y(sourceY)} ${targetX - controlOffset} ${y(targetY)} ${targetX} ${y(targetY)} c S`);
  });

  nodes.forEach(node => {
    const table = getNodeTable(node);
    const size = getDiagramNodeSize(node);
    const position = getExportPosition(node, bounds);
    const rectBottom = y(position.y + size.height);
    const headerBottom = y(position.y + NODE_HEADER_HEIGHT);

    commands.push(
      pdfColor('#ffffff', 'rg'),
      pdfColor(NODE_BORDER, 'RG'),
      `1 w ${position.x} ${rectBottom} ${size.width} ${size.height} re B`,
      pdfColor(NODE_HEADER, 'rg'),
      `${position.x} ${headerBottom} ${size.width} ${NODE_HEADER_HEIGHT} re f`,
      pdfColor(TEXT_COLOR, 'rg'),
      `BT /F1 14 Tf ${position.x + 16} ${y(position.y + 30)} Td (${escapePdfText(table.name)}) Tj ET`,
    );

    table.columns.forEach((column, index) => {
      const rowY = position.y + NODE_HEADER_HEIGHT + (NODE_VERTICAL_PADDING / 2) + (index * NODE_ROW_HEIGHT);
      const baseline = rowY + 21;

      if (column.isPrimaryKey) {
        commands.push(
          pdfColor('#facc15', 'rg'),
          `${position.x + 13} ${y(rowY + 21)} 10 10 re f`,
          pdfColor('#713f12', 'rg'),
          `BT /F1 7 Tf ${position.x + 16} ${y(rowY + 18)} Td (K) Tj ET`,
        );
      }

      commands.push(
        pdfColor(TEXT_COLOR, 'rg'),
        `BT /F1 11 Tf ${position.x + 32} ${y(baseline)} Td (${escapePdfText(column.name)}) Tj ET`,
        pdfColor(MUTED_TEXT_COLOR, 'rg'),
        `BT /F1 9 Tf ${position.x + size.width - 16 - (column.type.length * 5.4)} ${y(baseline)} Td (${escapePdfText(column.type.toUpperCase())}) Tj ET`,
      );
    });
  });

  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

async function downloadPdf(nodes: Node[], edges: Edge[]) {
  downloadBlob(createDiagramPdf(nodes, edges), 'sql-diagram.pdf');
}

export async function downloadDiagram(nodes: Node[], edges: Edge[], format: ExportFormat) {
  const svg = createDiagramSvg(nodes, edges);

  if (format === 'svg') {
    await downloadSvg(svg);
  } else if (format === 'png') {
    await downloadPng(svg);
  } else {
    await downloadPdf(nodes, edges);
  }
}
