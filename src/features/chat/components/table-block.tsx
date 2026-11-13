import type { MessageBlock } from "../types";

type TableData = Extract<MessageBlock, { type: "table" }>;

export function TableBlock({ columns, rows, caption }: Omit<TableData, "type">) {
  return <figure className="my-4 overflow-hidden rounded-lg border bg-surface">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        {caption && <caption className="border-b px-4 py-3 text-left text-xs font-medium text-foreground">{caption}</caption>}
        <thead className="bg-raised text-muted-foreground"><tr>{columns.map((column, index) => <th key={`${column}-${index}`} scope="col" className="border-b px-4 py-2.5 font-medium">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b last:border-0 hover:bg-raised/50">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-2.5 tabular-nums">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
