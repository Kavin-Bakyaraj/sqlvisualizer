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
import Editor from '@monaco-editor/react';

import { parseSqlSchema } from '@/lib/sql-parser';
import TableNode from '@/components/TableNode';
import { useLayout } from '@/hooks/useLayout';
import { downloadDiagram, ExportFormat } from '@/lib/export-diagram';
import { Download, Play, Sliders, Sun, Moon } from 'lucide-react';

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

const spacingConfig = {
  compact: { node: 60, layer: 80 },
  standard: { node: 90, layer: 130 },
  spacious: { node: 140, layer: 200 }
};

function EditorPageContent() {
  const [sql, setSql] = useState(defaultSql);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();
  const { layout, isLayouting } = useLayout();
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const [direction, setDirection] = useState<'RIGHT' | 'DOWN'>('RIGHT');
  const [spacing, setSpacing] = useState<'compact' | 'standard' | 'spacious'>('standard');
  const [algorithm, setAlgorithm] = useState<'layered' | 'force' | 'radial' | 'mrtree'>('layered');

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Load initial SQL from URL or localStorage
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        setSql(atob(decodeURIComponent(hash)));
      } catch (e) {
        console.warn('Failed to decode SQL from URL hash', e);
      }
    } else {
      const savedSql = localStorage.getItem('sql-schema');
      if (savedSql) {
        setSql(savedSql);
      }
    }
  }, []);

  // Save SQL to URL and localStorage on change with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (sql !== defaultSql) {
        localStorage.setItem('sql-schema', sql);
        window.history.replaceState(null, '', '#' + encodeURIComponent(btoa(sql)));
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [sql]);

  // Load theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const targetTheme = savedTheme || systemTheme;
    if (targetTheme !== 'light') {
      window.setTimeout(() => {
        setTheme(targetTheme);
      }, 0);
    }
  }, []);

  // Save theme when it changes
  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const connectedToHovered = new Set<string>();
  if (hoveredNode) {
    connectedToHovered.add(hoveredNode);
    edges.forEach(edge => {
      if (edge.source === hoveredNode) connectedToHovered.add(edge.target);
      if (edge.target === hoveredNode) connectedToHovered.add(edge.source);
    });
  }

  const visibleNodes = nodes.map(node => {
    const isMatch = matchesSearch(node, searchTerm);
    const isDimmedBySearch = Boolean(searchTerm.trim()) && !isMatch;
    const isDimmedByHover = Boolean(hoveredNode) && !connectedToHovered.has(node.id);

    return {
      ...node,
      data: {
        ...node.data,
        isDimmed: isDimmedBySearch || isDimmedByHover,
        matchedColumns: getMatchedColumns(node, searchTerm),
      },
    };
  });
  const visibleNodeIds = new Set(visibleNodes.filter(node => !node.data.isDimmed).map(node => node.id));
  const visibleEdges = edges.map(edge => {
    const isHoveredEdge = Boolean(hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode));
    const isDimmedByHover = hoveredNode && !isHoveredEdge;
    
    return {
      ...edge,
      hidden: Boolean(searchTerm.trim()) && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)),
      animated: isHoveredEdge,
      style: {
        ...edge.style,
        opacity: isDimmedByHover ? 0.2 : 1,
        strokeWidth: isHoveredEdge ? 3 : 2
      }
    };
  });
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
      
      const newEdges: Edge[] = [];
      const incomingColumnsByTable = new Map<string, Set<string>>();

      tables.forEach(table => {
        table.foreignKeys.forEach((fk) => {
          if (!incomingColumnsByTable.has(fk.toTable)) {
            incomingColumnsByTable.set(fk.toTable, new Set());
          }

          incomingColumnsByTable.get(fk.toTable)?.add(fk.toColumn);

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

      const newNodes: Node[] = tables.map(table => ({
        id: table.name,
        type: 'table',
        position: { x: 0, y: 0 }, 
        data: {
          ...table,
          incomingColumns: Array.from(incomingColumnsByTable.get(table.name) || []),
        },
      }));

      // Run ELK layout in web worker
      const currentSpacing = spacingConfig[spacing];
      const laidOutNodes = await layout(newNodes, newEdges, {
        direction,
        spacingNodeNode: currentSpacing.node,
        spacingNodeLayer: currentSpacing.layer,
        algorithm
      });
      
      setNodes(laidOutNodes);
      setEdges(newEdges);

      window.setTimeout(() => {
        reactFlow.fitView({ padding: 0.2, duration: 300 });
      }, 0);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to parse SQL'));
    }
  }, [sql, layout, reactFlow, setNodes, setEdges, direction, spacing, algorithm]);

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
    <div className={`flex w-screen h-screen overflow-hidden transition-colors duration-200 ${theme === 'dark' ? 'dark bg-zinc-950' : 'bg-gray-50'}`}>
      {/* Sidebar / Editor */}
      <div className="w-[400px] flex flex-col border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#0f0f12] z-10 shadow-lg relative transition-colors duration-200">
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800/60 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-bold text-gray-800 dark:text-zinc-100">SQL Visualizer</h1>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Zero-login ER diagrams</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
              <button 
                onClick={generateDiagram}
                disabled={isLayouting}
                className="bg-[#6CA7FF] hover:bg-blue-500 text-white px-3 py-2 rounded-md shadow-sm transition-all flex items-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                {isLayouting ? 'Rendering...' : 'Run'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['png', 'svg', 'pdf'] as ExportFormat[]).map(format => (
              <button
                key={format}
                onClick={() => handleDownload(format)}
                disabled={isLayouting || isExporting || nodes.length === 0}
                className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 dark:border-zinc-850 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 px-2 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold uppercase disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
            className="w-full rounded-md border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-700 dark:text-zinc-200 outline-none focus:border-[#6CA7FF] dark:focus:border-[#6CA7FF] focus:ring-2 focus:ring-[#6CA7FF]/20 transition-colors"
          />

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-md bg-slate-50 dark:bg-zinc-900/60 p-2 transition-colors">
              <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">{nodes.length}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase">Tables</div>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-zinc-900/60 p-2 transition-colors">
              <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">{totalColumns}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase">Columns</div>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-zinc-900/60 p-2 transition-colors">
              <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">{edges.length}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase">FKs</div>
            </div>
            <div className="rounded-md bg-slate-50 dark:bg-zinc-900/60 p-2 transition-colors">
              <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">{orphanTables}</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase">Orphan</div>
            </div>
          </div>

          {/* Layout Settings Section */}
          <div className="border border-gray-200 dark:border-zinc-800 rounded-lg p-3 space-y-2.5 bg-slate-50/50 dark:bg-zinc-900/30 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-gray-500 dark:text-zinc-400" />
                Layout Options
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-bold mb-1">Direction</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setDirection('RIGHT')}
                    className={`text-xs px-2 py-1.5 rounded border transition-all cursor-pointer ${
                      direction === 'RIGHT'
                        ? 'bg-white border-[#6CA7FF] text-[#6CA7FF] dark:bg-zinc-900 dark:border-[#6CA7FF] dark:text-[#6CA7FF] font-semibold shadow-sm'
                        : 'bg-white/60 border-gray-200 text-gray-500 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-500 hover:bg-white dark:hover:bg-zinc-900'
                    }`}
                  >
                    Horizontal
                  </button>
                  <button
                    onClick={() => setDirection('DOWN')}
                    className={`text-xs px-2 py-1.5 rounded border transition-all cursor-pointer ${
                      direction === 'DOWN'
                        ? 'bg-white border-[#6CA7FF] text-[#6CA7FF] dark:bg-zinc-900 dark:border-[#6CA7FF] dark:text-[#6CA7FF] font-semibold shadow-sm'
                        : 'bg-white/60 border-gray-200 text-gray-500 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-500 hover:bg-white dark:hover:bg-zinc-900'
                    }`}
                  >
                    Vertical
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-bold mb-1 flex justify-between">
                  <span>Spacing</span>
                  {spacing === 'spacious' && <span className="text-[9px] text-[#6CA7FF] normal-case font-medium">Prevents overlaps</span>}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['compact', 'standard', 'spacious'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpacing(s)}
                      className={`text-xs px-1.5 py-1.5 rounded border capitalize transition-all cursor-pointer ${
                        spacing === s
                          ? 'bg-white border-[#6CA7FF] text-[#6CA7FF] dark:bg-zinc-900 dark:border-[#6CA7FF] dark:text-[#6CA7FF] font-semibold shadow-sm'
                          : 'bg-white/60 border-gray-200 text-gray-500 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-500 hover:bg-white dark:hover:bg-zinc-900'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-gray-400 dark:text-zinc-500 uppercase font-bold mb-1">Algorithm</div>
                <select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as 'layered' | 'force' | 'radial' | 'mrtree')}
                  className="w-full text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded px-2.5 py-1.5 outline-none text-gray-700 dark:text-zinc-300 focus:border-[#6CA7FF] dark:focus:border-[#6CA7FF] focus:ring-1 focus:ring-[#6CA7FF]/20 transition-colors"
                >
                  <option value="layered">Layered (Flow - Recommended)</option>
                  <option value="force">Force-Directed</option>
                  <option value="radial">Radial</option>
                  <option value="mrtree">Tree Structure</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 dark:text-zinc-500">
            {primaryKeys} primary keys detected. Search dims unrelated tables and keeps exports complete.
          </div>
        </div>
        
        <div className="flex-1 relative border-t border-gray-200 dark:border-zinc-800 pt-2 bg-slate-900 dark:bg-[#08080a]">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            value={sql}
            onChange={(value) => setSql(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              padding: { top: 16 }
            }}
          />
        </div>
        
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs border-t border-red-100 dark:border-red-950/50">
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
          onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
          onNodeMouseLeave={() => setHoveredNode(null)}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
        >
          <Background color={theme === 'dark' ? '#27272a' : '#ccc'} gap={16} />
          <Controls />
          <MiniMap 
            nodeColor={theme === 'dark' ? '#3b82f6' : '#6CA7FF'} 
            maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(240, 240, 240, 0.6)'}
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-md border border-gray-200 dark:border-zinc-800"
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
