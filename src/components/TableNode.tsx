import { Handle, Position } from '@xyflow/react';
import { TableDefinition } from '@/lib/sql-parser';
import { getColumnHandleY, getTableNodeSize } from '@/lib/diagram-geometry';
import { Key, Link2 } from 'lucide-react';

type TableNodeData = TableDefinition & {
  isDimmed?: boolean;
  matchedColumns?: string[];
};

export default function TableNode({ data }: { data: TableNodeData }) {
  const size = getTableNodeSize(data);
  const matchedColumns = new Set(data.matchedColumns || []);

  return (
    <div
      className={`bg-white border shadow-md rounded-lg font-sans transition-opacity ${data.isDimmed ? 'opacity-25' : 'opacity-100'} border-gray-200`}
      style={{ width: size.width }}
    >
      <div className="bg-[#d6e6fe] px-4 py-3 border-b border-[#6CA7FF]/30 rounded-t-lg flex items-center justify-between gap-3">
        <h3 className="font-bold text-gray-800 text-sm truncate">{data.name}</h3>
        <span className="text-[10px] font-semibold text-blue-700 bg-white/70 px-2 py-0.5 rounded-full">
          {data.columns.length} cols
        </span>
      </div>
      
      <div className="flex flex-col py-2">
        {data.columns.map((col) => (
          <div
            key={col.name}
            title={col.references ? `References ${col.references.table}.${col.references.column}` : undefined}
            className={`flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 text-xs ${matchedColumns.has(col.name) ? 'bg-yellow-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              {col.isPrimaryKey ? (
                <Key className="w-3 h-3 text-yellow-500" />
              ) : col.isForeignKey ? (
                <Link2 className="w-3 h-3 text-blue-500" />
              ) : (
                <div className="w-3 h-3" />
              )}
              <span className="font-medium text-gray-700">{col.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {col.isForeignKey && (
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">FK</span>
              )}
              {col.isPrimaryKey && (
                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">PK</span>
              )}
              <span className="text-gray-400 font-mono text-[10px] uppercase">{col.type}</span>
            </div>
            
            {/* Handles for connections */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-in`}
              className="w-1.5 h-1.5 bg-[#6CA7FF] border-none"
              style={{ top: getColumnHandleY(data, col.name) }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-out`}
              className="w-1.5 h-1.5 bg-[#6CA7FF] border-none"
              style={{ top: getColumnHandleY(data, col.name) }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
