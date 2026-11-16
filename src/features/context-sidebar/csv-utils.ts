import Papa from "papaparse";

export const CSV_EDITOR_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_EDITOR_MAX_CELLS = 200_000;

export interface ParsedCsv {
  rows: string[][];
  cellCount: number;
}

export type CsvParseResult = { ok: true; data: ParsedCsv } | { ok: false; error: string };

/**
 * Parse CSV without coercing values. In particular, IDs such as `00123` must
 * remain text when they are placed in the worksheet.
 */
export function parseCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    dynamicTyping: false,
    skipEmptyLines: false,
  });

  if (parsed.errors.length) {
    return { ok: false, error: parsed.errors.map((entry) => entry.message).join(" ") };
  }

  const rows = parsed.data.map((row) => row.map((value) => value ?? ""));
  const cellCount = rows.reduce((total, row) => total + row.length, 0);
  return { ok: true, data: { rows, cellCount } };
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return Papa.unparse(rows.map((row) => [...row]), { newline: "\r\n" });
}

export function csvCopyName(name: string): string {
  return name.toLowerCase().endsWith(".csv")
    ? `${name.slice(0, -4)}-copy.csv`
    : `${name}-copy.csv`;
}
