import { describe, expect, it } from "vitest";
import { parseMarkdownTable } from "./markdown-table";

describe("parseMarkdownTable", () => {
  it("parses a pipe table", () => {
    expect(parseMarkdownTable("| Age | Count |\n|---|---:|\n| 50 | 12 |\n| 60 | 7 |")).toEqual({ columns: ["Age", "Count"], rows: [["50", "12"], ["60", "7"]] });
  });
  it("pads short rows and rejects non-tables", () => {
    expect(parseMarkdownTable("| a | b |\n| - | - |\n| 1 |")?.rows).toEqual([["1", ""]]);
    expect(parseMarkdownTable("just a | pipe in text")).toBeNull();
    expect(parseMarkdownTable("| a | b |\n| 1 | 2 |")).toBeNull();
  });
});
