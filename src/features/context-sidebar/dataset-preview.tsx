import { formatCount } from "./resource-utils";
import type { DatasetResource } from "./types";

interface DatasetPreviewProps {
  dataset: DatasetResource;
}

export function DatasetPreview({ dataset }: DatasetPreviewProps) {
  const columns = dataset.columns ?? [];
  const rows = (dataset.preview_rows ?? []).slice(0, 100);

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        {formatCount(dataset.row_count, "row")} · {formatCount(dataset.column_count, "column")}
      </p>

      <section aria-labelledby="dataset-columns-title">
        <h2 id="dataset-columns-title" className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Columns</h2>
        {columns.length ? (
          <div className="overflow-hidden rounded-md border">
            {columns.map((column) => (
              <div key={column.name} className="grid grid-cols-[minmax(0,1fr)_100px] border-b px-3 py-2 text-xs last:border-b-0">
                <span className="truncate text-foreground">{column.name}</span>
                <span className="truncate text-muted-foreground">{column.data_type}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">Column metadata is not available yet.</p>}
      </section>

      <section aria-labelledby="dataset-table-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="dataset-table-title" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Preview</h2>
          {rows.length ? <span className="text-[11px] text-muted-foreground">First {rows.length} rows</span> : null}
        </div>
        {columns.length && rows.length ? (
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 bg-raised text-muted-foreground">
                <tr>{columns.map((column) => <th key={column.name} scope="col" className="whitespace-nowrap border-b border-r px-2.5 py-2 font-medium last:border-r-0">{column.name}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-b-0">
                    {columns.map((column, columnIndex) => (
                      <td key={`${column.name}-${columnIndex}`} className="max-w-40 truncate whitespace-nowrap border-r px-2.5 py-2 text-sidebar-foreground last:border-r-0">
                        {row[columnIndex] === null || row[columnIndex] === undefined ? "—" : String(row[columnIndex])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">No preview rows available.</div>}
      </section>
    </div>
  );
}
