export interface ParsedTable { columns: string[]; rows: string[][] }

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

/** Reads a GitHub-style pipe table (header, separator, rows) from one markdown paragraph. */
export function parseMarkdownTable(paragraph: string): ParsedTable | null {
  const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3 || !lines.every((line) => line.includes("|"))) return null;
  if (!/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(lines[1])) return null;
  const columns = cells(lines[0]);
  if (columns.length < 2) return null;
  const rows = lines.slice(2).map((line) => {
    const row = cells(line);
    return columns.map((_, index) => row[index] ?? "");
  });
  return { columns, rows };
}
