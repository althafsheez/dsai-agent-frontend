import { formatCount } from "./resource-utils";
import type { DatasetResource } from "./types";

interface DatasetPreviewProps {
  dataset: DatasetResource;
}

export function DatasetPreview({ dataset }: DatasetPreviewProps) {
  const columns = dataset.columns ?? [];
  const rows = (dataset.preview_rows ?? []).slice(0, 100);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section aria-labelledby="dataset-columns-title" className="shrink-0 rounded-md border bg-background/40 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <h2 id="dataset-columns-title" className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Columns</h2>
          <span className="text-[10px] text-muted-foreground">{formatCount(dataset.row_count, "row")} · {formatCount(dataset.column_count, "column")}</span>
        </div>
        {columns.length ? (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {columns.map((column, index) => (
              <span key={`${column.name}-${index}`} title={`${column.name} · ${column.data_type}`} className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded border bg-surface px-2 text-[10px]">
                <span className="max-w-32 truncate text-foreground">{column.name}</span>
                <span className="text-muted-foreground">{column.data_type}</span>
              </span>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground">Column metadata is not available yet.</p>}
      </section>

      <section aria-labelledby="dataset-table-title" className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="dataset-table-title" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Preview</h2>
          {rows.length ? <span className="text-[11px] text-muted-foreground">First {rows.length} rows</span> : null}
        </div>
        {columns.length && rows.length ? (
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border bg-background [scrollbar-gutter:stable]">
            <table className="min-w-max border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-20 bg-raised text-muted-foreground shadow-[0_1px_0_var(--border)]">
                <tr><th aria-label="Row" className="sticky left-0 z-30 w-12 min-w-12 border-b border-r bg-raised px-2 py-2 text-center font-medium">#</th>{columns.map((column, index) => <th key={`${column.name}-${index}`} scope="col" className="min-w-36 whitespace-nowrap border-b border-r px-3 py-2.5 font-medium last:border-r-0">{column.name}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b odd:bg-surface/25 hover:bg-raised/60 last:border-b-0">
                    <th scope="row" className="sticky left-0 z-10 w-12 min-w-12 border-r bg-background px-2 py-2 text-center font-normal tabular-nums text-muted-foreground">{rowIndex + 1}</th>
                    {columns.map((column, columnIndex) => (
                      <td key={`${column.name}-${columnIndex}`} title={row[columnIndex] === null || row[columnIndex] === undefined ? undefined : String(row[columnIndex])} className="max-w-64 whitespace-nowrap border-r px-3 py-2 text-sidebar-foreground last:border-r-0">
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
