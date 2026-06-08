import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import { getDiagramNodeSize } from '@/lib/diagram-geometry';

const elk = new ELK();

export interface LayoutSettings {
  direction: 'RIGHT' | 'DOWN';
  spacingNodeNode: number;
  spacingNodeLayer: number;
  algorithm: 'layered' | 'force' | 'radial' | 'mrtree';
}

// We map React Flow nodes and edges to ELK graph format
export async function performLayout(nodes: Node[], edges: Edge[], settings?: LayoutSettings): Promise<Node[]> {
  const direction = settings?.direction || 'RIGHT';
  const spacingNodeNode = settings?.spacingNodeNode || 75;
  const spacingNodeLayer = settings?.spacingNodeLayer || 100;
  const algorithm = settings?.algorithm || 'layered';

  const elkNode: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': algorithm,
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(spacingNodeNode),
      ...(algorithm === 'layered' ? {
        'elk.layered.spacing.nodeNodeBetweenLayers': String(spacingNodeLayer),
        'elk.spacing.edgeEdge': '25',
        'elk.spacing.edgeNode': '35',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      } : {}),
    },
    children: nodes.map(node => {
      const size = getDiagramNodeSize(node);

      return {
        ...node,
        id: node.id,
        width: node.width || size.width,
        height: node.height || size.height,
      };
    }),
    edges: edges.map(edge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(elkNode);
    
    if (!layoutedGraph.children) return nodes;

    return nodes.map(node => {
      const elkChild = layoutedGraph.children!.find(c => c.id === node.id);
      if (elkChild && elkChild.x !== undefined && elkChild.y !== undefined) {
        return {
          ...node,
          position: {
            x: elkChild.x,
            y: elkChild.y
          }
        };
      }
      return node;
    });
  } catch (error) {
    console.error('ELK layout error:', error);
    return nodes;
  }
}

// In the actual web worker environment:
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.addEventListener('message', async (e: MessageEvent) => {
    // Respond to ping checks immediately
    if (e.data && e.data.type === 'ping') {
      self.postMessage({ type: 'pong' });
      return;
    }

    const { nodes, edges, id, settings } = e.data;
    try {
      const layoutedNodes = await performLayout(nodes, edges, settings);
      self.postMessage({ nodes: layoutedNodes, id });
    } catch (error: unknown) {
      self.postMessage({ nodes, id, error: error instanceof Error ? error.message : 'Layout failed' });
    }
  });
}

