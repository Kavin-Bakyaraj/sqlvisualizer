import { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { TableDefinition } from '@/lib/sql-parser';
import { getTableNodeSize } from '@/lib/diagram-geometry';
import { Key, Link2 } from 'lucide-react';

type TableNodeData = TableDefinition & {
  incomingColumns?: string[];
  isDimmed?: boolean;
  matchedColumns?: string[];
};

export default memo(function TableNode({ data }: { data: TableNodeData }) {
  const size = useMemo(() => getTableNodeSize(data), [data]);
  const matchedColumns = useMemo(() => new Set(data.matchedColumns || []), [data.matchedColumns]);
  const incomingColumns = useMemo(() => new Set(data.incomingColumns || []), [data.incomingColumns]);
  const handleStyle = {
    width: 8,
    height: 8,
    background: '#6CA7FF',
    border: 'none',
    top: '50%',
    transform: 'translateY(-50%)',
  };

  return (
    <div
      className={`bg-white dark:bg-zinc-900 border shadow-md rounded-lg font-sans ${data.isDimmed ? 'opacity-25' : 'opacity-100'} border-gray-200 dark:border-zinc-800`}
      style={{ width: size.width, willChange: 'transform' }}
    >
      <div className="bg-[#d6e6fe] dark:bg-[#1b253b] px-4 py-3 border-b border-[#6CA7FF]/30 dark:border-[#6CA7FF]/20 rounded-t-lg flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-800 dark:text-zinc-100 text-sm truncate">{data.name}</h3>
        <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-white/70 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full">
          {data.columns.length} cols
        </span>
      </div>
      
      <div className="flex flex-col py-2">
        {data.columns.map((col) => (
          <div
            key={col.name}
            title={col.references ? `References ${col.references.table}.${col.references.column}` : undefined}
            className={`relative flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800/50 text-xs transition-colors ${matchedColumns.has(col.name) ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}`}
          >
            <div className="flex items-center gap-2">
              {col.isPrimaryKey ? (
                <Key className="w-3 h-3 text-yellow-500" />
              ) : col.isForeignKey ? (
                <Link2 className="w-3 h-3 text-blue-500" />
              ) : (
                <div className="w-3 h-3" />
              )}
              <span className="font-medium text-gray-700 dark:text-zinc-300">{col.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {col.isForeignKey && (
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">FK</span>
              )}
              {col.isPrimaryKey && (
                <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">PK</span>
              )}
              <span className="text-gray-400 dark:text-zinc-500 font-mono text-[10px] uppercase">{col.type}</span>
            </div>
            
            {incomingColumns.has(col.name) && (
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.name}-in`}
                style={handleStyle}
              />
            )}
            {col.isForeignKey && (
              <Handle
                type="source"
                position={Position.Right}
                id={`${col.name}-out`}
                style={handleStyle}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
