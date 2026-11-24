"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowRight,
  LayoutGrid,
  List,
  BarChart3,
  BriefcaseBusiness,
  ChartLine,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  Folder,
  Landmark,
  MessageSquare,
  MoreHorizontal,
  Sigma,
  Telescope,
  Database,
  FileSpreadsheet,
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
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { disconnectPostgres, getPostgresConnections, type PostgresConnection } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ApiError, disconnectGoogleDrive, getConnectors, startGoogleDriveAuth } from "@/lib/api";
import { DriveBrowserDialog } from "./drive-browser-dialog";
import { dataSourceConnector } from "../catalog";
import { readConnected, toggleId, writeConnected } from "../connection-store";
import { PostgresSetup } from "./postgres-setup";
import { PostgresBrowser } from "./postgres-browser";

type ExtensionTab = "mine" | "database" | "app" | "skill";
type Sort = "popular" | "name";

interface ConnectorPreview {
  id: string;
  name: string;
  description: string;
  category: Exclude<ExtensionTab, "mine">;
  icon: typeof Plug;
  logo?: string;
}

const connectorPreviews: ConnectorPreview[] = [
  { ...dataSourceConnector("postgresql"), category: "database", logo: "postgresql" },
  { ...dataSourceConnector("mysql"), category: "database", logo: "mysql" },
  { ...dataSourceConnector("bigquery"), name: "BigQuery", category: "database", logo: "googlebigquery" },
  { ...dataSourceConnector("snowflake"), category: "database", logo: "snowflake" },
  { id: "sql-server", name: "SQL Server", category: "database", description: "Analyze tables from Microsoft SQL Server.", icon: Database },
  { id: "mongodb", name: "MongoDB", category: "database", description: "Explore collections and documents.", icon: Database, logo: "mongodb" },
  { ...dataSourceConnector("google-drive"), category: "app", logo: "googledrive" },
  { ...dataSourceConnector("google-sheets"), category: "app", logo: "googlesheets" },
  { id: "gmail", name: "Gmail", category: "app", description: "Find messages and attachments.", icon: Mail, logo: "gmail" },
  { id: "slack", name: "Slack", category: "app", description: "Find relevant conversations and files.", icon: MessageSquare, logo: "slack" },
  { id: "jira", name: "Jira", category: "app", description: "Explore issues and project activity.", icon: PanelsTopLeft, logo: "jira" },
  { id: "notion", name: "Notion", category: "app", description: "Bring in pages and database content.", icon: NotebookTabs, logo: "notion" },
  { id: "salesforce", name: "Salesforce", category: "app", description: "Analyze sales and customer records.", icon: BriefcaseBusiness, logo: "salesforce" },
  { id: "hubspot", name: "HubSpot", category: "app", description: "Explore marketing and CRM data.", icon: BriefcaseBusiness, logo: "hubspot" },
  { id: "google-analytics", name: "Google Analytics", category: "app", description: "Analyze site traffic and engagement.", icon: ChartNoAxesCombined, logo: "googleanalytics" },
  { id: "data-cleaning", name: "Data Cleaning", category: "skill", description: "Clean, transform, and prepare messy datasets.", icon: Sparkles },
  { id: "data-visualization", name: "Data Visualization", category: "skill", description: "Create charts and interactive visuals from your data.", icon: BarChart3 },
  { id: "exploratory-analysis", name: "Exploratory Analysis", category: "skill", description: "Find patterns and relationships in a dataset.", icon: Telescope },
  { id: "financial-analysis", name: "Financial Analysis", category: "skill", description: "Explore financial metrics and trends.", icon: Landmark },
  { id: "forecasting", name: "Forecasting", category: "skill", description: "Estimate future values from historical data.", icon: ChartLine },
  { id: "statistical-analysis", name: "Statistical Analysis", category: "skill", description: "Test hypotheses and measure relationships.", icon: Sigma },
  { id: "report-writing", name: "Report Writing", category: "skill", description: "Turn findings into clear reports.", icon: FileText },
  { id: "business-analysis", name: "Business Analysis", category: "skill", description: "Evaluate business performance and opportunities.", icon: BriefcaseBusiness },
];

const catalogTabs = [
  { value: "database", label: "Databases", icon: Database },
  { value: "app", label: "Apps", icon: Wrench },
  { value: "skill", label: "Skills", icon: GraduationCap },
] as const;

const tabs = [{ value: "mine", label: "My Connections", icon: Layers3 }, ...catalogTabs] as const;

const GOOGLE_DRIVE_ID = "google-drive";

interface LiveState {
  /** The backend owns this connector's connection: no demo toggle. */
  unavailable: boolean;
  busy: boolean;
  email: string | null;
  onBrowse: () => void;
}

function ExtensionIcon({ extension, large = false }: { extension: ConnectorPreview; large?: boolean }) {
  const Icon = extension.icon;
  const logoSize = large ? 34 : 22;
  const iconStyle = extension.id === "postgresql" ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
    : extension.id === GOOGLE_DRIVE_ID ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
    : extension.category === "skill" ? "border-violet-400/20 bg-violet-400/10 text-violet-300"
    : "bg-raised text-foreground";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl border", large ? "size-12" : "size-11", iconStyle)}>
      {extension.logo ? (
        <Image src={`/extension-logos/${extension.logo}.svg`} alt="" width={logoSize} height={logoSize} unoptimized />
      ) : (
        <Icon aria-hidden="true" className={large ? "size-7" : "size-5"} strokeWidth={1.5} />
      )}
    </span>
  );
}

function ConnectorRow({ connector, connected, onToggle, live, onAdd, managing = false }: {
  connector: ConnectorPreview;
  connected: boolean;
  onToggle: () => void;
  live?: LiveState;
  onAdd: () => void;
  managing?: boolean;
}) {
  const postgres = connector.id === "postgresql";
  const canAdd = postgres || Boolean(live && !live.unavailable && !live.busy && !connected);
  const removeAction = connector.category === "skill" ? "Disable" : "Disconnect";
  return (
    <article className="flex min-w-0 items-start gap-3 rounded-xl border bg-surface/50 p-3.5 transition-colors hover:border-border-strong">
      <ExtensionIcon extension={connector} />
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">{connector.name}</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {live?.unavailable ? "Google Drive is not configured." : connected && live?.email ? `Connected as ${live.email}` : connector.description}
        </p>
        {!canAdd && !live && !managing && <p className="mt-1 text-[10px] text-muted-foreground">Coming soon</p>}
        {managing && (
          <div className="mt-3 flex flex-wrap gap-2">
            {live && <Button type="button" size="sm" variant="outline" onClick={live.onBrowse}>Import files</Button>}
            <Button type="button" size="sm" variant="ghost" aria-label={`${removeAction} ${connector.name}`}
              disabled={live?.busy} onClick={onToggle}>
              {removeAction}
            </Button>
          </div>
        )}
      </div>
      {!managing && (
        <Button type="button" size="sm" variant="outline" disabled={!canAdd} aria-label={`Add ${connector.name}`}
          onClick={postgres ? onAdd : onToggle}>
          <Plus aria-hidden="true" className="size-3.5" /> Add
        </Button>
      )}
    </article>
  );
}

interface ExtensionConnection {
  id: string;
  name: string;
  note?: "Needs attention" | "Workspace" | "OAuth" | "Demo";
}

const connectionNoteStyles = {
  "Needs attention": "bg-amber-400/10 text-amber-200",
  Workspace: "bg-violet-400/15 text-violet-200",
  OAuth: "bg-emerald-400/15 text-emerald-200",
  Demo: "bg-raised text-muted-foreground",
};

function ExtensionCard({ extension, connections, gridView, onAdd, onManage }: {
  extension: ConnectorPreview;
  connections: ExtensionConnection[];
  gridView: boolean;
  onAdd?: () => void;
  onManage: () => void;
}) {
  const skill = extension.category === "skill";
  const ConnectionIcon = extension.category === "database" ? Database : Folder;
  const categoryStyle = extension.category === "database" ? "text-sky-300" : skill ? "text-violet-300" : "text-emerald-300";
  const categoryLabel = skill ? "Skill" : extension.id === "snowflake" ? "Warehouse" : extension.category === "database" ? "Database" : "App";
  const CategoryIcon = skill ? Sparkles : extension.category === "database" ? Database : Plug;

  return (
    <article className={cn(
      "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface transition-colors hover:border-border-strong",
      gridView ? "aspect-[5/4] min-h-[248px]" : "h-[248px]"
    )}>
      <header className="mx-4 shrink-0 border-b border-border/60 pb-2.5 pt-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider", categoryStyle)}>
            <CategoryIcon aria-hidden="true" className="size-3.5" />
            {categoryLabel}
          </span>
          <button type="button" aria-label={`${extension.name} options`} onClick={onManage}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-3.5">
          <ExtensionIcon extension={extension} large />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{extension.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {skill ? "Enabled · Preview" : `${connections.length} ${connections.length === 1 ? "connection" : "connections"}`}
            </p>
          </div>
        </div>
      </header>

      {skill ? (
        <p className="min-h-0 flex-1 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{extension.description}</p>
      ) : (
        <ul aria-label={`${extension.name} connections`} tabIndex={connections.length > 3 ? 0 : undefined}
          className="mx-4 max-h-[102px] min-h-0 flex-1 divide-y divide-border/55 overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring">
          {connections.map(({ id, name, note }) => (
            <li key={id} className="flex h-[34px] items-center gap-4 px-1 text-sm">
              <ConnectionIcon aria-hidden="true" className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate font-medium" title={name}>{name}</span>
              {note && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", connectionNoteStyles[note])}>{note}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mx-4 mt-auto flex h-11 shrink-0 items-center border-t border-border/60">
        <Button type="button" size="sm" variant="ghost" aria-label={`Manage ${extension.name}`}
          className="h-8 min-w-0 flex-1 justify-start px-1 pr-3 text-xs hover:bg-surface hover:text-foreground" onClick={onManage}>
          <Wrench aria-hidden="true" className="size-3.5" />
          Manage <ArrowRight aria-hidden="true" className="ml-auto size-3.5" />
        </Button>
        {!skill && (
          <div className="shrink-0 border-l border-border/60 pl-3">
            <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={!onAdd}
              aria-label={`Add ${extension.name} connection`} onClick={onAdd}>
              <Plus aria-hidden="true" className="size-3.5" /> Add
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

export function ExtensionsPage() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<string[]>([]);
  useEffect(() => setConnected(readConnected()), []);
  const driveStatus = useQuery({ queryKey: ["connectors"], queryFn: getConnectors });
  const drive = driveStatus.data?.items.find((item) => item.id === GOOGLE_DRIVE_ID);
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
    onSuccess: () => { setManaging(null); setDriveNotice({ tone: "ok", text: "Google Drive disconnected." }); void queryClient.invalidateQueries({ queryKey: ["connectors"] }); },
    onError: () => setDriveNotice({ tone: "error", text: "Could not disconnect Google Drive. Try again." }),
  });
  const driveConnected = drive?.status === "connected";
  const liveState: LiveState = {
    unavailable: !drive?.configured,
    busy: connectDrive.isPending || disconnectDrive.isPending,
    email: drive?.account_email ?? null,
    onBrowse: () => { setManaging(null); setBrowserOpen(true); },
  };

  function toggleConnection(id: string) {
    if (id === GOOGLE_DRIVE_ID) {
      setDriveNotice(null);
      if (driveConnected) disconnectDrive.mutate(); else connectDrive.mutate();
      return;
    }
    setManaging(null);
    const next = toggleId(connected, id);
    setConnected(next);
    writeConnected(next);
  }
  const isConnected = (id: string) => id === GOOGLE_DRIVE_ID ? driveConnected : id !== "postgresql" && connected.includes(id);
  const liveFor = (id: string) => (id === GOOGLE_DRIVE_ID ? liveState : undefined);
  const [managing, setManaging] = useState<ConnectorPreview | null>(null);
  const [connectionType, setConnectionType] = useState<"all" | "database" | "app">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState<ExtensionTab>("mine");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [setup, setSetup] = useState<"new" | PostgresConnection | null>(null);
  const [browsing, setBrowsing] = useState<PostgresConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState<PostgresConnection | null>(null);
  const [disconnectError, setDisconnectError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const saved = useQuery({
    queryKey: ["postgres-connections"], queryFn: () => getPostgresConnections(), retry: false,
  });

  async function disconnect() {
    if (!disconnecting || pending) return;
    setPending(true);
    setDisconnectError("");
    try {
      await disconnectPostgres(disconnecting.id);
      await queryClient.invalidateQueries({ queryKey: ["postgres-connections"] });
      setNotice(`${disconnecting.name} disconnected.`);
      setDisconnecting(null);
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect PostgreSQL.");
    } finally {
      setPending(false);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (...fields: string[]) => fields.some((field) => field.toLocaleLowerCase().includes(normalizedQuery));
  const connectors = useMemo(() => (
    sort === "name" ? [...connectorPreviews].sort((left, right) => left.name.localeCompare(right.name)) : connectorPreviews
  ), [sort]);
  const shown = connectors.filter((connector) => matches(connector.name, connector.description, connector.id === GOOGLE_DRIVE_ID ? drive?.account_email ?? "" : ""));
  const catalog = shown.filter((connector) => connector.category === category);
  const savedConnections = saved.data?.items ?? [];
  const connections = shown.filter((connector) => connector.category !== "skill" && isConnected(connector.id));
  const skills = shown.filter((connector) => connector.category === "skill" && isConnected(connector.id));
  const postgres = connectors.find((connector) => connector.id === "postgresql");
  if (postgres && savedConnections.length && savedConnections.some((connection) => matches(connection.name, connection.database, postgres.name))) {
    connections.push(postgres);
    connections.sort((left, right) => connectors.indexOf(left) - connectors.indexOf(right));
  }
  const visibleConnections = connectionType === "all" ? connections : connections.filter((connector) => connector.category === connectionType);
  const visibleSkills = connectionType === "all" ? skills : [];
  const hasFilters = Boolean(normalizedQuery) || connectionType !== "all";
  const loadingConnections = saved.isPending || driveStatus.isPending;
  const connectionError = saved.isError || driveStatus.isError;
  const cardGrid = cn("grid gap-5", view === "grid" && "sm:grid-cols-2 lg:grid-cols-4");

  function selectCategory(value: ExtensionTab) {
    setCategory(value);
    setQuery("");
    setConnectionType("all");
  }

  function renderConnector(connector: ConnectorPreview, managing = false) {
    return <ConnectorRow key={connector.id} connector={connector} connected={isConnected(connector.id)}
      onToggle={() => toggleConnection(connector.id)} live={liveFor(connector.id)} managing={managing} onAdd={() => setSetup("new")} />;
  }

  function renderExtension(extension: ConnectorPreview) {
    const postgres = extension.id === "postgresql";
    let entries: ExtensionConnection[] = [];
    if (postgres) {
      entries = savedConnections.map((connection) => ({
        id: connection.id,
        name: connection.name,
        note: connection.status === "failed" ? "Needs attention" : connection.workspace_id ? "Workspace" : undefined,
      }));
    } else if (extension.id === GOOGLE_DRIVE_ID) {
      entries = [{ id: extension.id, name: drive?.account_email ?? extension.name, note: "OAuth" }];
    } else if (extension.category !== "skill") {
      entries = [{ id: extension.id, name: extension.name, note: "Demo" }];
    }
    return <ExtensionCard
      key={extension.id}
      extension={extension}
      connections={entries}
      gridView={view === "grid"}
      onAdd={postgres ? () => setSetup("new") : undefined}
      onManage={() => setManaging(extension)}
    />;
  }

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-9">
      <header className="mb-6 flex items-start justify-between gap-4 sm:items-center">
        <div className="flex items-start gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-surface text-foreground">
            <Layers3 className="size-5" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{category === "mine" ? "My Connections" : "Extensions"}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {category === "mine" ? "Your connected data sources and apps used across analyses, workspaces, and workflows." : "Browse databases, apps, and analytical skills."}
            </p>
          </div>
        </div>
        <Button type="button" className="h-9 shrink-0 px-3.5 text-xs" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" /> {category === "mine" ? "Add connection" : "Add"}
        </Button>
      </header>
      {notice && <p role="status" className="mb-3 text-xs text-muted-foreground">{notice}</p>}
      {driveNotice && (
        <div role={driveNotice.tone === "error" ? "alert" : "status"} className={cn("mb-5 rounded-md border px-4 py-3 text-xs", driveNotice.tone === "error" ? "border-red-400/30 text-red-300" : "border-emerald-400/30 text-emerald-300")}>
          {driveNotice.text}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Extension categories"
          className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-surface p-0.5"
        >
          {tabs.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={category === value}
              onClick={() => selectCategory(value)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:text-foreground",
                category === value && "bg-slate/15 text-foreground font-medium shadow-sm"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 basis-[290px] items-center gap-2 sm:justify-end sm:gap-3">
          <label className="relative min-w-0 flex-1 sm:max-w-60">
            <span className="sr-only">{category === "mine" ? "Search connections" : "Search extensions"}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={category === "mine" ? "Search connections..." : "Search extensions..."}
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

          {category === "mine" ? (
            <div className="relative shrink-0">
              <select aria-label="Connection type" value={connectionType}
                onChange={(event) => setConnectionType(event.target.value as typeof connectionType)}
                className="h-9 appearance-none rounded-lg border bg-surface py-0 pl-3 pr-8 text-xs text-foreground">
                <option value="all">All types</option>
                <option value="database">Databases</option>
                <option value="app">Apps</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          ) : (
            <label className="relative grid size-9 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong">
              <span className="sr-only">Sort extensions</span>
              <ArrowDownUp className="size-3.5" />
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
              >
                <option value="popular">Default order</option>
                <option value="name">Name</option>
              </select>
            </label>
          )}

          {category === "mine" && (
            <div role="group" aria-label="Extension layout" className="flex shrink-0 rounded-lg border bg-surface p-0.5">
              {([{ value: "grid", label: "Grid view", icon: LayoutGrid }, { value: "list", label: "List view", icon: List }] as const).map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" aria-label={label} aria-pressed={view === value}
                  onClick={() => setView(value)} className={cn("grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground",
                    view === value && "bg-slate/15 text-foreground")}>
                  <Icon aria-hidden="true" className="size-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {category === "mine" ? (
        <div className="mt-5 space-y-6">
          {loadingConnections && <p role="status" className="text-xs text-muted-foreground">Loading connections…</p>}
          {saved.error && <p role="alert" className="text-xs text-red-300">{saved.error.message}</p>}
          {driveStatus.error && <p role="alert" className="text-xs text-red-300">Google Drive status could not be loaded.</p>}
          {visibleConnections.length > 0 && (
            <section aria-labelledby="extension-connections">
              <h2 id="extension-connections" className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Connections</h2>
              <div className={cardGrid}>{visibleConnections.map(renderExtension)}</div>
            </section>
          )}
          {visibleSkills.length > 0 && (
            <section aria-labelledby="enabled-skills">
              <h2 id="enabled-skills" className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Enabled skills</h2>
              <div className={cardGrid}>{visibleSkills.map(renderExtension)}</div>
            </section>
          )}
          {!loadingConnections && !connectionError && !visibleConnections.length && !visibleSkills.length && (
            <div className="rounded-xl border border-dashed bg-surface/30 px-6 py-14 text-center">
              <Layers3 aria-hidden="true" className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
              <h2 className="mt-3 text-sm font-semibold">{hasFilters ? "No matching extensions" : "No extensions yet"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasFilters ? "Try another search or connection type." : "Connect a database, add an app, or enable a skill to get started."}
              </p>
              <Button type="button" size="sm" className="mt-4" onClick={() => hasFilters ? selectCategory("mine") : setAddOpen(true)}>
                {!hasFilters && <Plus aria-hidden="true" className="size-3.5" />}
                {hasFilters ? "Clear filters" : "Add your first extension"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <section className="mt-8" aria-labelledby="extension-catalog">
          <h2 id="extension-catalog" className="mb-3 text-sm font-semibold tracking-tight">{catalogTabs.find((tab) => tab.value === category)?.label}</h2>
          {category === "skill" && <p className="mb-3 text-xs text-muted-foreground">Skill settings are a preview.</p>}
          {catalog.length ? <div className="grid gap-3 lg:grid-cols-2">{catalog.map((connector) => renderConnector(connector))}</div> : (
            <div className="rounded-xl border border-dashed px-6 py-16 text-center">
              <FileSpreadsheet className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium">No matching extensions</p>
              <Button type="button" variant="ghost" className="mt-3" onClick={() => setQuery("")}>Clear search</Button>
            </div>
          )}
        </section>
      )}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogTitle className="font-semibold">Add an extension</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Choose a category to browse.</DialogDescription>
          <div className="grid gap-2">
            {catalogTabs.map(({ value, label, icon: Icon }) => (
              <Button key={value} type="button" variant="outline" className="justify-start"
                onClick={() => { selectCategory(value); setAddOpen(false); }}>
                <Icon className="size-3.5" aria-hidden="true" /> {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {managing && <Dialog open onOpenChange={(open) => { if (!open) setManaging(null); }}>
        <DialogContent>
          <DialogTitle className="font-semibold">Manage {managing.name}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {managing.id === "postgresql" ? "Browse tables or update your saved connections." :
              managing.id === GOOGLE_DRIVE_ID ? "Import files or disconnect your Drive account." : "Manage this preview extension."}
          </DialogDescription>
          {managing.id === "postgresql" ? (
            <>
              <div className="my-3 max-h-[50vh] space-y-2 overflow-y-auto">
                {savedConnections.map((connection) => (
                  <article key={connection.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
                    <div className="min-w-32 flex-1">
                      <h3 className="break-all text-sm font-medium">{connection.name}</h3>
                      <p className="text-xs text-muted-foreground">{connection.database} · {connection.status === "connected" ? "Connected" : "Connection failed"}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setManaging(null); setBrowsing(connection); }}>Browse tables</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setManaging(null); setSetup(connection); }}>Edit</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setManaging(null); setDisconnectError(""); setDisconnecting(connection); }}>Disconnect</Button>
                  </article>
                ))}
              </div>
              <Button type="button" onClick={() => { setManaging(null); setSetup("new"); }}>
                <Plus aria-hidden="true" className="size-3.5" /> Add connection
              </Button>
            </>
          ) : renderConnector(managing, true)}
        </DialogContent>
      </Dialog>}
      {setup && <PostgresSetup open connection={setup === "new" ? undefined : setup} onClose={() => setSetup(null)}
        onSaved={(connection) => { setNotice(`${connection.name} saved.`); selectCategory("mine"); }} />}
      {browsing && <PostgresBrowser connection={browsing} onClose={() => setBrowsing(null)} />}
      {disconnecting && <Dialog open onOpenChange={(open) => { if (!open && !pending) setDisconnecting(null); }}>
        <DialogContent>
          <DialogTitle className="font-semibold">Disconnect PostgreSQL</DialogTitle>
          <DialogDescription className="my-3 text-sm text-muted-foreground">Remove the saved connection to {disconnecting.name}?</DialogDescription>
          {disconnectError && <p role="alert" className="mb-3 text-sm text-red-300">{disconnectError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setDisconnecting(null)}>Cancel</Button>
            <Button type="button" disabled={pending} onClick={() => void disconnect()}>{pending ? "Disconnecting…" : "Disconnect"}</Button>
          </div>
        </DialogContent>
      </Dialog>}
      <DriveBrowserDialog open={browserOpen} onOpenChange={setBrowserOpen} onReauth={() => setDriveNotice({ tone: "error", text: "Google access expired. Reconnect Google Drive." })} />
    </section>
  );
}
