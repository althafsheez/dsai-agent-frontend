"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  Check,
  Database,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Layers3,
  Mail,
  NotebookTabs,
  PanelsTopLeft,
  Plug,
  Plus,
  Search,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError, disconnectGoogleDrive, getConnectors, startGoogleDriveAuth } from "@/lib/api";
import { DriveBrowserDialog } from "./drive-browser-dialog";
import { dataSourceConnector } from "../catalog";
import { readConnected, toggleId, writeConnected } from "../connection-store";

type ConnectorCategory = "all" | "skill" | "data" | "app";
type Sort = "popular" | "name";

interface ConnectorPreview {
  id: string;
  name: string;
  description: string;
  category: Exclude<ConnectorCategory, "all">;
  group: "popular" | "yours";
  icon: typeof Plug;
  rank: number;
}

const connectorPreviews: ConnectorPreview[] = [
  { id: "data-cleaning", name: "Data Cleaning", description: "Clean, transform, and prepare messy datasets.", category: "skill", group: "popular", icon: Sparkles, rank: 1 },
  { ...dataSourceConnector("snowflake"), category: "data", group: "popular", rank: 2 },
  { id: "gmail", name: "Gmail", description: "Read emails and prepare automated reports.", category: "app", group: "popular", icon: Mail, rank: 3 },
  { ...dataSourceConnector("postgresql"), category: "data", group: "popular", rank: 4 },
  { id: "notion", name: "Notion", description: "Create reports and manage documentation.", category: "app", group: "popular", icon: NotebookTabs, rank: 5 },
  { id: "jira", name: "Jira", description: "Turn insights into tasks and track issues.", category: "app", group: "popular", icon: PanelsTopLeft, rank: 6 },
  { id: "data-visualization", name: "Data Visualization", description: "Create charts and interactive visuals from your data.", category: "skill", group: "yours", icon: BarChart3, rank: 7 },
  { ...dataSourceConnector("google-drive"), category: "data", group: "yours", rank: 8 },
];

const tabs: Array<{ value: ConnectorCategory; label: string; icon: typeof Plug }> = [
  { value: "all", label: "All", icon: Sparkles },
  { value: "skill", label: "Skills", icon: GraduationCap },
  { value: "data", label: "Data Sources", icon: Database },
  { value: "app", label: "Apps & Tools", icon: Wrench },
];

function categoryLabel(category: ConnectorPreview["category"]) {
  if (category === "skill") return "Skill";
  if (category === "data") return "Data Source";
  return "App";
}

const GOOGLE_DRIVE_ID = "google-drive";

interface LiveState {
  /** The backend owns this connector's connection: no demo toggle. */
  unavailable: boolean;
  busy: boolean;
  email: string | null;
  onBrowse: () => void;
}

function ConnectorRow({ connector, connected, onToggle, live }: { connector: ConnectorPreview; connected: boolean; onToggle: () => void; live?: LiveState }) {
  const Icon = connector.icon;
  return (
    <article className="flex min-w-0 items-center gap-3.5 rounded-xl border bg-surface/50 p-3.5 transition-colors hover:border-border-strong hover:bg-surface">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-raised text-foreground">
        <Icon className="size-5" strokeWidth={1.6} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-xs font-semibold text-foreground">{connector.name}</h3>
          <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            {categoryLabel(connector.category)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-muted-foreground">
          {live?.unavailable ? "Not configured on this server. Add Google credentials to the backend to enable it." : connected && live?.email ? `Connected as ${live.email}` : connector.description}
        </p>
      </div>
      {connected ? <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300 sm:inline-flex"><Check className="size-3" />Connected</span> : null}
      {live && connected ? (
        <button type="button" onClick={live.onBrowse} className="h-8 shrink-0 rounded-md bg-foreground px-3 text-xs text-background hover:opacity-90">Import files</button>
      ) : null}
      <button
        type="button"
        aria-pressed={connected}
        aria-label={`${connected ? "Disconnect" : "Connect"} ${connector.name}`}
        onClick={onToggle}
        disabled={live ? live.busy || (live.unavailable && !connected) : false}
        className={`h-8 shrink-0 rounded-md px-3 text-xs transition-colors disabled:opacity-50 ${connected ? "bg-raised text-muted-foreground hover:text-foreground" : "bg-foreground text-background hover:opacity-90"}`}
      >
        {live?.busy ? "Working…" : connected ? "Disconnect" : "Connect"}
      </button>
    </article>
  );
}

export function ConnectorsPage() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => setConnected(readConnected()), []);
  const connectors$ = useQuery({ queryKey: ["connectors"], queryFn: getConnectors });
  const drive = connectors$.data?.items.find((item) => item.id === GOOGLE_DRIVE_ID);
  const [driveNotice, setDriveNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);

  // Google sends the browser back with ?connected=google-drive or ?error=<code>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (params.get("connected") === GOOGLE_DRIVE_ID) setDriveNotice({ tone: "ok", text: "Google Drive connected." });
    else if (error) setDriveNotice({ tone: "error", text: error === "access_denied" ? "Google Drive access was not granted." : "Google Drive could not be connected. Try again." });
    else return;
    window.history.replaceState(null, "", window.location.pathname);
    void queryClient.invalidateQueries({ queryKey: ["connectors"] });
  }, [queryClient]);

  const connectDrive = useMutation({
    mutationFn: startGoogleDriveAuth,
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => setDriveNotice({ tone: "error", text: error instanceof ApiError ? error.message : "Could not start Google sign-in." }),
  });
  const disconnectDrive = useMutation({
    mutationFn: disconnectGoogleDrive,
    onSuccess: () => { setDriveNotice({ tone: "ok", text: "Google Drive disconnected." }); void queryClient.invalidateQueries({ queryKey: ["connectors"] }); },
    onError: () => setDriveNotice({ tone: "error", text: "Could not disconnect Google Drive. Try again." }),
  });
  const driveConnected = drive?.status === "connected";
  const liveState: LiveState = {
    unavailable: drive?.status === "unavailable",
    busy: connectDrive.isPending || disconnectDrive.isPending,
    email: drive?.account_email ?? null,
    onBrowse: () => setBrowserOpen(true),
  };

  function toggleConnection(id: string) {
    if (id === GOOGLE_DRIVE_ID) {
      setDriveNotice(null);
      if (driveConnected) disconnectDrive.mutate(); else connectDrive.mutate();
      return;
    }
    const next = toggleId(connected, id);
    setConnected(next);
    writeConnected(next);
  }
  const isConnected = (id: string) => (id === GOOGLE_DRIVE_ID ? driveConnected : connected.includes(id));
  const liveFor = (id: string) => (id === GOOGLE_DRIVE_ID ? liveState : undefined);
  const [category, setCategory] = useState<ConnectorCategory>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [dataOnly, setDataOnly] = useState(false);
  const [showAddHelp, setShowAddHelp] = useState(false);

  const connectors = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return connectorPreviews
      .filter((connector) => category === "all" || connector.category === category)
      .filter((connector) => !dataOnly || connector.category === "data")
      .filter(
        (connector) =>
          !normalizedQuery ||
          connector.name.toLocaleLowerCase().includes(normalizedQuery) ||
          connector.description.toLocaleLowerCase().includes(normalizedQuery)
      )
      .sort((left, right) => (sort === "name" ? left.name.localeCompare(right.name) : left.rank - right.rank));
  }, [category, dataOnly, query, sort]);

  const popular = connectors.filter((connector) => connector.group === "popular");
  const yours = connectors.filter((connector) => connector.group === "yours");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex items-start justify-between gap-5">
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate">
            <Layers3 className="size-5" strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">Connectors</h1>
              <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Extend DSAI with external data sources, analytical skills, and productivity integrations
            </p>
          </div>
        </div>
      </header>

      {driveNotice && (
        <div role={driveNotice.tone === "error" ? "alert" : "status"} className={cn("mb-5 rounded-md border px-4 py-3 text-xs", driveNotice.tone === "error" ? "border-red-400/30 text-red-300" : "border-emerald-400/30 text-emerald-300")}>
          {driveNotice.text}
        </div>
      )}

      {showAddHelp && (
        <div
          role="status"
          className="mb-5 rounded-md border border-slate/30 bg-surface px-4 py-3 text-xs leading-relaxed text-muted-foreground"
        >
          External connectors are coming soon. Local file selection is available when starting an analysis;
          direct connector installation is not connected yet.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Connector categories"
          className="flex max-w-full overflow-x-auto rounded-lg border bg-surface p-0.5"
        >
          {tabs.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
                category === value && "bg-raised text-foreground font-medium shadow-sm"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <span className="sr-only">Search connectors</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search connectors..."
              className="h-9 w-full rounded-md border bg-surface pl-9 pr-9 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>

          <button
            type="button"
            aria-label="Show data sources only"
            aria-pressed={dataOnly}
            onClick={() => setDataOnly((current) => !current)}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
              dataOnly && "bg-raised text-slate"
            )}
          >
            <Filter className="size-3.5" />
          </button>

          <label className="relative grid size-9 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong">
            <span className="sr-only">Sort connectors</span>
            <ArrowDownUp className="size-3.5" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            >
              <option value="popular">Popular</option>
              <option value="name">Name</option>
            </select>
          </label>

          <Button
            type="button"
            className="h-9 px-3.5 text-xs"
            onClick={() => setShowAddHelp((current) => !current)}
            aria-expanded={showAddHelp}
          >
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </div>

      {connectors.length ? (
        <div className="mt-8 space-y-8">
          {popular.length > 0 && (
            <section aria-labelledby="popular-connectors">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="popular-connectors" className="text-sm font-semibold tracking-tight">
                  Popular connectors
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setQuery("");
                    setDataOnly(false);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate hover:underline"
                >
                  Show all <ArrowRight className="size-3" />
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {popular.map((connector) => (
                  <ConnectorRow key={connector.id} connector={connector} connected={isConnected(connector.id)} onToggle={() => toggleConnection(connector.id)} live={liveFor(connector.id)} />
                ))}
              </div>
            </section>
          )}

          {yours.length > 0 && (
            <section aria-labelledby="your-connectors">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="your-connectors" className="text-sm font-semibold tracking-tight">
                  Your connectors
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setQuery("");
                    setDataOnly(false);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate hover:underline"
                >
                  Show all <ArrowRight className="size-3" />
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {yours.map((connector) => (
                  <ConnectorRow key={connector.id} connector={connector} connected={isConnected(connector.id)} onToggle={() => toggleConnection(connector.id)} live={liveFor(connector.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center">
          <FileSpreadsheet className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">No matching connectors</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another category, search query, or filter.</p>
          <button
            type="button"
            onClick={() => {
              setCategory("all");
              setQuery("");
              setDataOnly(false);
            }}
            className="mt-4 text-xs font-medium text-slate hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      )}
      <DriveBrowserDialog open={browserOpen} onOpenChange={setBrowserOpen} onReauth={() => setDriveNotice({ tone: "error", text: "Google access expired. Reconnect Google Drive." })} />
    </section>
  );
}
