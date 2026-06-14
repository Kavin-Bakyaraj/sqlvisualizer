import { parse, Statement } from 'pgsql-ast-parser';

export interface TableDefinition extends Record<string, unknown> {
  name: string;
  columns: ColumnDefinition[];
  foreignKeys: ForeignKeyDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface ForeignKeyDefinition {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

type SqlName = {
  name: string;
  schema?: string;
};

type SqlDataType = {
  name?: string;
  kind?: string;
  arrayOf?: SqlDataType | string;
};

type SqlColumn = {
  kind: string;
  name: SqlName;
  dataType?: SqlDataType | string;
  constraints?: SqlConstraint[];
};

type SqlConstraint = {
  type: string;
  foreignTable?: SqlName;
  foreignColumns?: SqlName[];
  localColumns?: SqlName[];
  columns?: SqlName[];
};

type CreateTableStatement = Statement & {
  columns?: SqlColumn[];
  constraints?: SqlConstraint[];
};

type AlterTableStatement = Statement & {
  table: SqlName;
  changes?: {
    type: string;
    constraint?: SqlConstraint;
  }[];
};

function normalizeSqlForDiagram(sql: string): string {
  return sql
    .replace(/`/g, '"')
    .replace(/CREATE\s+SCHEMA\s+[^;]+;/gi, '')
    .replace(/COMMENT\s+'[^']*'/gi, '')
    .replace(/\bENUM\s*\([^)]+\)/gi, 'text')
    .replace(/\bUSER-DEFINED\b/gi, 'text')
    .replace(/\bARRAY\b/gi, 'text[]');
}

function getSqlName(value: SqlName | string | undefined): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.schema ? `${value.schema}.${value.name}` : value.name;
}

function getDataTypeName(dataType: SqlDataType | string | undefined): string {
  if (!dataType) {
    return 'unknown';
  }

  if (typeof dataType === 'string') {
    return dataType;
  }

  if (dataType.name) {
    return dataType.name;
  }

  if (dataType.kind === 'array') {
    return `${getDataTypeName(dataType.arrayOf)}[]`;
  }

  return 'unknown';
}

export function parseSqlSchema(sql: string): TableDefinition[] {
  const tables: TableDefinition[] = [];
  
  try {
    const ast: Statement[] = parse(normalizeSqlForDiagram(sql));
    
    for (const stmt of ast) {
      if (stmt.type === 'create table') {
        const tableName = getSqlName(stmt.name as SqlName);
        const columns: ColumnDefinition[] = [];
        const foreignKeys: ForeignKeyDefinition[] = [];
        const createTableStmt = stmt as CreateTableStatement;
        
        for (const rawElement of createTableStmt.columns || []) {
          const element = rawElement;
          if (element.kind === 'column') {
            const columnName = element.name.name;
            const columnType = getDataTypeName(element.dataType);
            let isPrimaryKey = false;
            
            // Check constraints for primary key and foreign key
            for (const constraint of element.constraints || []) {
              if (constraint.type === 'primary key') {
                isPrimaryKey = true;
              } else if (constraint.type === 'reference') {
                const toTable = getSqlName(constraint.foreignTable);
                const toColumn = constraint.foreignColumns?.[0]?.name;

                if (toTable && toColumn) {
                  foreignKeys.push({
                    fromColumn: columnName,
                    toTable,
                    toColumn
                  });
                }
              }
            }
            
            columns.push({
              name: columnName,
              type: columnType,
              isPrimaryKey,
              isForeignKey: false
            });
          }
        }

        for (const constraint of createTableStmt.constraints || []) {
          if (constraint.type === 'primary key') {
            for (const primaryKeyColumn of constraint.columns || []) {
              const column = columns.find(col => col.name === primaryKeyColumn.name);
              if (column) {
                column.isPrimaryKey = true;
              }
            }
          } else if (constraint.type === 'foreign key') {
            const fromCol = constraint.localColumns?.[0]?.name;
            const toTable = getSqlName(constraint.foreignTable);
            const toCol = constraint.foreignColumns?.[0]?.name;
            
            if (fromCol && toTable && toCol) {
              foreignKeys.push({
                fromColumn: fromCol,
                toTable,
                toColumn: toCol
              });

              const column = columns.find(col => col.name === fromCol);
              if (column) {
                column.isForeignKey = true;
                column.references = {
                  table: toTable,
                  column: toCol
                };
              }
            }
          }
        }

        for (const foreignKey of foreignKeys) {
          const column = columns.find(col => col.name === foreignKey.fromColumn);
          if (column) {
            column.isForeignKey = true;
            column.references = {
              table: foreignKey.toTable,
              column: foreignKey.toColumn
            };
          }
        }
        
        tables.push({
          name: tableName,
          columns,
          foreignKeys
        });
      }
    }

    // Second pass for alter table constraints
    for (const stmt of ast) {
      if (stmt.type === 'alter table') {
        const alterTableStmt = stmt as AlterTableStatement;
        const tableName = getSqlName(alterTableStmt.table);
        
        // Robust table lookup supporting both schema-prefixed and schema-less references
        const table = tables.find(t => {
          if (t.name === tableName) return true;
          if (!tableName.includes('.') && t.name.endsWith(`.${tableName}`)) return true;
          if (!t.name.includes('.') && tableName.endsWith(`.${t.name}`)) return true;
          return false;
        });
        
        if (table) {
          for (const change of alterTableStmt.changes || []) {
            if (change.type === 'add constraint' && change.constraint?.type === 'foreign key') {
              const constraint = change.constraint;
              const fromCol = constraint.localColumns?.[0]?.name;
              const toTable = getSqlName(constraint.foreignTable);
              const toCol = constraint.foreignColumns?.[0]?.name;
              
              if (fromCol && toTable && toCol) {
                table.foreignKeys.push({
                  fromColumn: fromCol,
                  toTable,
                  toColumn: toCol
                });

                const column = table.columns.find(col => col.name === fromCol);
                if (column) {
                  column.isForeignKey = true;
                  column.references = {
                    table: toTable,
                    column: toCol
                  };
                }
              }
            }
          }
        }
      }
    }

    // Normalization pass to resolve schema-less target tables in foreign keys
    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        const targetTable = tables.find(t => 
          t.name === fk.toTable ||
          (!fk.toTable.includes('.') && t.name.endsWith(`.${fk.toTable}`))
        );
        if (targetTable) {
          fk.toTable = targetTable.name;
        }
      }
      for (const col of table.columns) {
        if (col.references) {
          const ref = col.references;
          const targetTable = tables.find(t =>
            t.name === ref.table ||
            (!ref.table.includes('.') && t.name.endsWith(`.${ref.table}`))
          );
          if (targetTable) {
            ref.table = targetTable.name;
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to parse SQL:", error);
    throw new Error(error instanceof Error ? error.message : 'Failed to parse SQL');
  }
  
  return tables;
}
