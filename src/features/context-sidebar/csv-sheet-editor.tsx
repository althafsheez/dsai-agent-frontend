"use client";

import { AlertCircle, LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getResourcePreview, uploadResource } from "@/lib/api";
import type { DatasetResource } from "./types";
import {
  CSV_EDITOR_MAX_BYTES,
  CSV_EDITOR_MAX_CELLS,
  csvCopyName,
  parseCsv,
  serializeCsv,
  type ParsedCsv,
} from "./csv-utils";

type EditorState =
  | { kind: "loading" }
  | { kind: "ready"; csv: ParsedCsv }
  | { kind: "empty" }
  | { kind: "fallback"; detail: string }
  | { kind: "error"; detail: string };

interface CsvSheetEditorProps {
  file: DatasetResource;
  scopeId?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}

interface SheetRuntime {
  univer: { dispose: () => void };
  workbook: {
    getActiveSheet: () => {
      getRange: (row: number, column: number, rows: number, columns: number) => {
        getDisplayValues: () => string[][];
      };
    };
    onCommandExecuted: (callback: () => void) => { dispose: () => void };
  };
}

function readableLimit(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function CsvSheetEditor({ file, scopeId, onDirtyChange, onSaved }: CsvSheetEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SheetRuntime | null>(null);
  const [state, setState] = useState<EditorState>({ kind: "loading" });
  const [editorVersion, setEditorVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const setDraftDirty = useCallback((nextDirty: boolean) => {
    setDirty(nextDirty);
    onDirtyChange(nextDirty);
  }, [onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setSaveError(null);
    setSavedMessage(null);
    setDraftDirty(false);

    void getResourcePreview(file.download_url).then(async (blob) => {
      if (cancelled) return;
      if (blob.size > CSV_EDITOR_MAX_BYTES) {
        setState({ kind: "fallback", detail: `${readableLimit(blob.size)} exceeds the ${readableLimit(CSV_EDITOR_MAX_BYTES)} editor limit.` });
        return;
      }
      const parsed = parseCsv(await blob.text());
      if (cancelled) return;
      if (!parsed.ok) {
        setState({ kind: "error", detail: `This CSV could not be parsed: ${parsed.error}` });
        return;
      }
      const csv = parsed.data;
      if (!csv.rows.length || csv.rows.every((row) => row.every((cell) => cell === ""))) {
        setState({ kind: "empty" });
      } else if (csv.cellCount > CSV_EDITOR_MAX_CELLS) {
        setState({ kind: "fallback", detail: `${csv.cellCount.toLocaleString()} cells exceeds the ${CSV_EDITOR_MAX_CELLS.toLocaleString()} editor limit.` });
      } else {
        setState({ kind: "ready", csv });
      }
    }).catch((error: unknown) => {
      if (!cancelled) setState({ kind: "error", detail: error instanceof Error ? error.message : "The CSV could not be loaded." });
    });

    return () => { cancelled = true; };
  }, [editorVersion, file.download_url, setDraftDirty]);

  useEffect(() => {
    if (state.kind !== "ready" || !hostRef.current) return;
    let disposed = false;
    let commandSubscription: { dispose: () => void } | null = null;
    const host = hostRef.current;

    void Promise.all([
      import("@univerjs/presets"),
      import("@univerjs/preset-sheets-core"),
      import("@univerjs/preset-sheets-core/locales/en-US"),
    ]).then(([presets, sheets, locale]) => {
      if (disposed) return;
      const rowCount = Math.max(state.csv.rows.length, 1);
      const columnCount = Math.max(...state.csv.rows.map((row) => row.length), 1);
      const cellData = Object.fromEntries(state.csv.rows.map((row, rowIndex) => [
        rowIndex,
        Object.fromEntries(row.map((value, columnIndex) => [columnIndex, { v: value, t: presets.CellValueType.STRING }])),
      ]));
      const { univer, univerAPI } = presets.createUniver({
        locale: presets.LocaleType.EN_US,
        locales: { [presets.LocaleType.EN_US]: locale.default },
        presets: [sheets.UniverSheetsCorePreset({
          container: host,
          header: false,
          toolbar: false,
          formulaBar: false,
          footer: false,
        })],
      });
      const workbook = univerAPI.createWorkbook({
        id: `csv-${file.id}-${editorVersion}`,
        name: file.name,
        sheetOrder: ["csv"],
        sheets: {
          csv: {
            id: "csv",
            name: file.name.replace(/\.csv$/i, "") || "CSV",
            rowCount,
            columnCount,
            cellData,
          },
        },
      });
      runtimeRef.current = { univer, workbook };
      commandSubscription = workbook.onCommandExecuted(() => setDraftDirty(true));
    }).catch((error: unknown) => {
      if (!disposed) setState({ kind: "error", detail: error instanceof Error ? error.message : "The spreadsheet editor could not be started." });
    });

    return () => {
      disposed = true;
      commandSubscription?.dispose();
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      // Univer owns DOM, listeners, and workers; release all of them on file switches.
      queueMicrotask(() => runtime?.univer.dispose());
      host.replaceChildren();
    };
  }, [editorVersion, file.id, file.name, setDraftDirty, state]);

  const discard = () => {
    if (!dirty || window.confirm("Discard the local CSV edits?")) {
      setEditorVersion((version) => version + 1);
    }
  };

  const saveCopy = async () => {
    const runtime = runtimeRef.current;
    if (!runtime || state.kind !== "ready" || !scopeId) {
      setSaveError("This file's chat or workspace is unavailable, so a copy cannot be saved.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);
    try {
      const rows = runtime.workbook.getActiveSheet()
        .getRange(0, 0, state.csv.rows.length, Math.max(...state.csv.rows.map((row) => row.length), 1))
        .getDisplayValues()
        .map((row) => row.map((value) => value ?? ""));
      const contents = serializeCsv(rows);
      await uploadResource({
        file: new File([contents], csvCopyName(file.name), { type: "text/csv;charset=utf-8" }),
        scopeType: file.scope_type,
        scopeId,
        clientUploadId: crypto.randomUUID(),
      });
      setDraftDirty(false);
      setSavedMessage("Saved as a new CSV resource. The original file is unchanged.");
      onSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The edited CSV could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (state.kind === "loading") {
    return <div className="grid h-full min-h-52 place-items-center text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading CSV editor…</span></div>;
  }
  if (state.kind === "empty") {
    return <div className="grid h-full min-h-52 place-items-center rounded-md border border-dashed px-6 text-center text-xs text-muted-foreground">This CSV is empty.</div>;
  }
  if (state.kind === "fallback" || state.kind === "error") {
    return <div className="grid h-full min-h-52 place-items-center rounded-md border border-dashed px-6 text-center"><div><AlertCircle className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-xs text-foreground">{state.kind === "fallback" ? "This CSV is too large for in-panel editing." : "CSV preview is unavailable."}</p><p className="mt-1 max-w-md text-[11px] text-muted-foreground">{state.detail} Download the original file to view it locally.</p></div></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {dirty ? (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border bg-raised px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">Local edits are not saved.</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={discard} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"><RotateCcw className="size-3" />Discard</button>
            <button type="button" onClick={() => void saveCopy()} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{saving ? <LoaderCircle className="size-3 animate-spin" /> : <Save className="size-3" />}Save copy</button>
          </div>
        </div>
      ) : null}
      {saveError ? <p role="alert" className="shrink-0 rounded border border-red-900/70 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200">{saveError}</p> : null}
      {savedMessage ? <p className="shrink-0 rounded border border-emerald-900/70 bg-emerald-950/20 px-2 py-1.5 text-[11px] text-emerald-100">{savedMessage}</p> : null}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden rounded-md border bg-background" aria-label="CSV spreadsheet editor" />
      <p className="shrink-0 text-[10px] leading-4 text-muted-foreground">CSV saves cell values only. Formatting and formulas are not preserved; formula cells are saved as their calculated values.</p>
    </div>
  );
}
