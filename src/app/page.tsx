"use client";

import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  Edge,
  Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { parseSqlSchema } from '@/lib/sql-parser';
import TableNode from '@/components/TableNode';
import { useLayout } from '@/hooks/useLayout';
import { downloadDiagram, ExportFormat } from '@/lib/export-diagram';
import { Download, Play } from 'lucide-react';

const nodeTypes = {
  table: TableNode,
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function matchesSearch(node: Node, searchTerm: string): boolean {
  const query = searchTerm.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const table = node.data as { name?: string; columns?: { name: string; type: string }[] };
  return Boolean(
    table.name?.toLowerCase().includes(query) ||
    table.columns?.some(column =>
      column.name.toLowerCase().includes(query) ||
      column.type.toLowerCase().includes(query)
    )
  );
}

function getMatchedColumns(node: Node, searchTerm: string): string[] {
  const query = searchTerm.trim().toLowerCase();

  if (!query) {
    return [];
  }

  const table = node.data as { columns?: { name: string; type: string }[] };
  return table.columns
    ?.filter(column =>
      column.name.toLowerCase().includes(query) ||
      column.type.toLowerCase().includes(query)
    )
    .map(column => column.name) || [];
}

const defaultSql = `CREATE TABLE users (
  id serial PRIMARY KEY,
  username varchar(50) NOT NULL,
  email varchar(255) NOT NULL,
  created_at timestamp
);

CREATE TABLE posts (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id),
  title varchar(255) NOT NULL,
  body text,
  published_at timestamp
);

CREATE TABLE comments (
  id serial PRIMARY KEY,
  post_id integer REFERENCES posts(id),
  user_id integer REFERENCES users(id),
  content text NOT NULL
);`;

function EditorPageContent() {
  const [sql, setSql] = useState(defaultSql);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();
  const { layout, isLayouting } = useLayout();
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const visibleNodes = nodes.map(node => {
    const isMatch = matchesSearch(node, searchTerm);

    return {
      ...node,
      data: {
        ...node.data,
        isDimmed: !isMatch,
        matchedColumns: getMatchedColumns(node, searchTerm),
      },
    };
  });
  const visibleNodeIds = new Set(visibleNodes.filter(node => !node.data.isDimmed).map(node => node.id));
  const visibleEdges = edges.map(edge => ({
    ...edge,
    hidden: Boolean(searchTerm.trim()) && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)),
  }));
  const totalColumns = nodes.reduce((sum, node) => sum + (((node.data as { columns?: unknown[] }).columns?.length) || 0), 0);
  const primaryKeys = nodes.reduce(
    (sum, node) => sum + (((node.data as { columns?: { isPrimaryKey?: boolean }[] }).columns || []).filter(column => column.isPrimaryKey).length),
    0
  );
  const connectedTableIds = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  const orphanTables = nodes.filter(node => !connectedTableIds.has(node.id)).length;

  const generateDiagram = useCallback(async () => {
    try {
      setError(null);
      const tables = parseSqlSchema(sql);

      if (tables.length === 0) {
        setNodes([]);
        setEdges([]);
        setError('No CREATE TABLE statements found in this SQL.');
        return;
      }
      
      const newNodes: Node[] = tables.map(table => ({
        id: table.name,
        type: 'table',
        position: { x: 0, y: 0 }, 
        data: table,
      }));

      const newEdges: Edge[] = [];
      tables.forEach(table => {
        table.foreignKeys.forEach((fk) => {
          newEdges.push({
            id: `${table.name}-${fk.fromColumn}-${fk.toTable}-${fk.toColumn}`,
            source: table.name,
            sourceHandle: `${fk.fromColumn}-out`,
            target: fk.toTable,
            targetHandle: `${fk.toColumn}-in`,
            type: 'smoothstep',
            label: `${fk.fromColumn} -> ${fk.toColumn}`,
            labelBgPadding: [6, 4],
            labelBgBorderRadius: 6,
            labelBgStyle: { fill: '#eff6ff', fillOpacity: 0.95 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#6CA7FF',
            },
            style: { stroke: '#6CA7FF', strokeWidth: 2 },
          });
        });
      });

      // Run ELK layout in web worker
      const laidOutNodes = await layout(newNodes, newEdges);
      
      setNodes(laidOutNodes);
      setEdges(newEdges);

      window.setTimeout(() => {
        reactFlow.fitView({ padding: 0.2, duration: 300 });
      }, 0);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to parse SQL'));
    }
  }, [sql, layout, reactFlow, setNodes, setEdges]);

  const handleDownload = useCallback(async (format: ExportFormat) => {
    try {
      setError(null);
      setIsExporting(true);
      await downloadDiagram(nodes, edges, format);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to download diagram'));
    } finally {
      setIsExporting(false);
    }
  }, [nodes, edges]);

  // Generate initial diagram
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void generateDiagram();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [generateDiagram]);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-gray-50">
      {/* Sidebar / Editor */}
      <div className="w-[400px] flex flex-col border-r border-gray-200 bg-white z-10 shadow-lg relative">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-bold text-gray-800">SQL Visualizer</h1>
              <p className="text-xs text-gray-400">Zero-login ER diagrams</p>
            </div>
            <button 
              onClick={generateDiagram}
              disabled={isLayouting}
              className="bg-[#6CA7FF] hover:bg-blue-500 text-white px-3 py-2 rounded-md shadow-sm transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {isLayouting ? 'Rendering...' : 'Run'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['png', 'svg', 'pdf'] as ExportFormat[]).map(format => (
              <button
                key={format}
                onClick={() => handleDownload(format)}
                disabled={isLayouting || isExporting || nodes.length === 0}
                className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-2 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                {format}
              </button>
            ))}
          </div>

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search tables, columns, or types..."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#6CA7FF] focus:ring-2 focus:ring-[#6CA7FF]/20"
          />

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-md bg-slate-50 p-2">
              <div className="text-sm font-bold text-slate-800">{nodes.length}</div>
              <div className="text-[10px] text-slate-400 uppercase">Tables</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <div className="text-sm font-bold text-slate-800">{totalColumns}</div>
              <div className="text-[10px] text-slate-400 uppercase">Columns</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <div className="text-sm font-bold text-slate-800">{edges.length}</div>
              <div className="text-[10px] text-slate-400 uppercase">FKs</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <div className="text-sm font-bold text-slate-800">{orphanTables}</div>
              <div className="text-[10px] text-slate-400 uppercase">Orphan</div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400">
            {primaryKeys} primary keys detected. Search dims unrelated tables and keeps exports complete.
          </div>
        </div>
        
        <div className="flex-1 relative">
          <textarea
            className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none bg-slate-900 text-slate-100"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
          />
        </div>
        
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-xs border-t border-red-100">
            {error}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          <MiniMap 
            nodeColor="#6CA7FF" 
            maskColor="rgba(240, 240, 240, 0.6)"
            className="bg-white rounded-lg shadow-md border border-gray-200"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <ReactFlowProvider>
      <EditorPageContent />
    </ReactFlowProvider>
  );
}
