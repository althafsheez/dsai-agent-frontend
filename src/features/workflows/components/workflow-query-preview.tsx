import { DatasetPreview } from "@/features/context-sidebar/dataset-preview";
import type { WorkflowQueryTable } from "@/lib/api";

export function isWorkflowQueryTable(value: unknown): value is WorkflowQueryTable {
  if (!value || typeof value !== "object") return false;
  const table = value as Partial<WorkflowQueryTable>;
  return table.kind === "query_table" && Array.isArray(table.rows) && Array.isArray(table.columns) && Array.isArray(table.column_types);
}

export function WorkflowQueryPreview({ table }: { table: WorkflowQueryTable }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground">
        {table.row_count} rows returned · {table.duration_ms} ms{table.truncated ? " · Result limited" : ""}
      </p>
      <div className="h-64 min-w-0">
        <DatasetPreview dataset={{
          columns: table.columns.map((name, index) => ({ name, data_type: table.column_types[index] ?? "Unknown" })),
          column_count: table.columns.length,
          row_count: table.row_count,
          preview_rows: table.rows.map((row) => row.map((cell) => typeof cell === "object" && cell !== null ? JSON.stringify(cell) :
            cell as string | number | boolean | null)),
        }} />
      </div>
    </div>
  );
}
