import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import { getDiagramNodeSize } from '@/lib/diagram-geometry';

const elk = new ELK();

// We map React Flow nodes and edges to ELK graph format
export async function performLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const elkNode: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '75',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
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
    const { nodes, edges, id } = e.data;
    try {
      const layoutedNodes = await performLayout(nodes, edges);
      self.postMessage({ nodes: layoutedNodes, id });
    } catch (error: unknown) {
      self.postMessage({ nodes, id, error: error instanceof Error ? error.message : 'Layout failed' });
    }
  });
}
