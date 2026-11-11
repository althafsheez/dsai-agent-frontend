"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  ArrowUp,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleGauge,
  Database,
  FilePlus2,
  FileText,
  Folder,
  Link2,
  LoaderCircle,
  Mic,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChat, getModels, getWorkspaces } from "@/lib/api";
import { cn } from "@/lib/utils";
import { savePendingRun } from "@/features/chat/pending-run";

const suggestions = [
  { icon: ChartNoAxesCombined, label: "Explore trends", prompt: "Help me explore trends in my data." },
  { icon: Search, label: "Find what changed", prompt: "What changed in my data, and what might explain it?" },
  { icon: FileText, label: "Create a report", prompt: "Create a concise report with the key findings from my data." },
] as const;

type OpenMenu = "add" | "workspace" | "model" | "effort" | null;

interface DraftAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

function fileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortFileType(file: File) {
  const extension = file.name.split(".").pop();
  if (extension && extension.length <= 6) return extension.toUpperCase();
  return file.type.split("/").pop()?.toUpperCase() || "FILE";
}

export function WelcomeComposer() {
  const router = useRouter();
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("");
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const datasetInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const attachmentsRef = useRef<DraftAttachment[]>([]);

  const workspaces = [
    { id: null, label: "Standalone" },
    ...(workspacesQuery.data?.items.map((workspace) => ({ id: workspace.id, label: workspace.name })) ?? []),
  ];
  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];
  const efforts = selectedModel?.supported_efforts.map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  })) ?? [];
  const selectedEffort = efforts.find((option) => option.id === effort) ?? efforts[0];
  const canSend = draft.trim().length > 0 && !submitting && Boolean(selectedModel) && attachments.length === 0;

  useEffect(() => {
    if (!models.length) return;
    if (!models.some((model) => model.id === modelId)) {
      setModelId(modelsQuery.data?.default_model_id ?? models[0].id);
    }
  }, [modelId, models, modelsQuery.data?.default_model_id]);

  useEffect(() => {
    if (!selectedModel) return;
    if (!selectedModel.supported_efforts.includes(effort)) {
      setEffort(selectedModel.default_effort ?? selectedModel.supported_efforts[0] ?? "");
    }
  }, [effort, selectedModel]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 76), 208)}px`;
    input.style.overflowY = input.scrollHeight > 208 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenu(null);
      openerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  function toggleMenu(menu: Exclude<OpenMenu, null>, target: HTMLElement) {
    openerRef.current = target;
    setOpenMenu((current) => current === menu ? null : menu);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = Array.from(fileList).map<DraftAttachment>((file) => ({
      id: fileId(file),
      file,
      previewUrl: file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    }));
    setAttachments((current) => [...current, ...next]);
    setError(null);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  async function submit() {
    if (!canSend) return;
    setSubmitting(true);
    setError(null);
    try {
      const createRequestId = crypto.randomUUID();
      const result = await createChat({
        content: draft,
        workspace_id: workspaceId,
        client_request_id: createRequestId,
      });
      savePendingRun({
        chatId: result.chat.id,
        userMessageId: result.message.id,
        modelId: selectedModel.id,
        effort: selectedEffort?.id ?? null,
        clientRequestId: crypto.randomUUID(),
      });
      router.push(`/chat/${result.chat.id}`);
    } catch (caught) {
      setSubmitting(false);
      setError(caught instanceof Error ? caught.message : "Could not start this analysis. Try again.");
    }
  }

  return <div className="w-full" ref={composerRef}>
    <div className="relative rounded-xl border border-border-strong bg-surface transition-colors focus-within:border-ring">
      {attachments.length > 0 && <div aria-label="Selected attachments" className="flex gap-2 overflow-x-auto px-3 pt-3 sm:flex-wrap sm:overflow-visible">
        {attachments.map((attachment) => <div key={attachment.id} className="group relative flex min-w-[180px] max-w-[240px] items-center gap-2.5 rounded-lg border bg-raised p-2 pr-8">
          <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-surface text-[9px] font-medium text-muted-foreground">
            {attachment.previewUrl
              ? <Image src={attachment.previewUrl} alt="" width={36} height={36} unoptimized className="size-full object-cover" />
              : <><FileText className="size-4" aria-hidden="true" /><span className="sr-only">{shortFileType(attachment.file)}</span></>}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-foreground">{attachment.file.name}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{shortFileType(attachment.file)} · {formatFileSize(attachment.file.size)}</p>
          </div>
          <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`Remove ${attachment.file.name}`}
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>)}
      </div>}

      <label htmlFor="analysis-question" className="sr-only">Analysis question</label>
      <textarea
        ref={inputRef}
        id="analysis-question"
        value={draft}
        onChange={(event) => { setDraft(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask anything about your data…"
        className="block min-h-[108px] w-full resize-none bg-transparent px-4 pb-3 pt-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground sm:px-5 sm:pt-5"
        aria-describedby="composer-hint composer-status"
      />

      <div className="flex items-center gap-1 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
        <div className="relative">
          <Button type="button" variant="ghost" size="icon" aria-label="Add to analysis" aria-haspopup="menu" aria-expanded={openMenu === "add"}
            onClick={(event) => toggleMenu("add", event.currentTarget)}><Plus /></Button>
          {openMenu === "add" && <div role="menu" aria-label="Add to analysis" className="absolute bottom-10 left-0 z-20 w-52 rounded-lg border border-border-strong bg-raised p-1.5 shadow-2xl">
            <button role="menuitem" type="button" onClick={() => { setOpenMenu(null); fileInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface"><FilePlus2 className="size-4 text-muted-foreground" />Upload file</button>
            <button role="menuitem" type="button" onClick={() => { setOpenMenu(null); datasetInputRef.current?.click(); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface"><Database className="size-4 text-muted-foreground" />Add dataset</button>
            <button role="menuitem" type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground opacity-60"><Link2 className="size-4" />Connect source<span className="ml-auto text-[9px] uppercase">Soon</span></button>
            <button role="menuitem" type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground opacity-60"><Sparkles className="size-4" />Add skill<span className="ml-auto text-[9px] uppercase">Soon</span></button>
          </div>}
        </div>

        <div className="relative">
          <Button type="button" variant="ghost" size="sm" aria-label={`Workspace: ${selectedWorkspace.label}`} aria-haspopup="menu" aria-expanded={openMenu === "workspace"}
            onClick={(event) => toggleMenu("workspace", event.currentTarget)} className="max-w-[128px] px-2 sm:max-w-[180px]">
            <Folder /><span className="hidden truncate sm:inline">{selectedWorkspace.label}</span><ChevronDown className="!size-3" />
          </Button>
          {openMenu === "workspace" && <div role="menu" aria-label="Select workspace" className="absolute bottom-10 left-0 z-20 w-52 rounded-lg border border-border-strong bg-raised p-1.5 shadow-2xl">
            <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Save analysis in</p>
            {workspaces.map((workspace) => <button key={workspace.id ?? "standalone"} type="button" role="menuitemradio" aria-checked={workspace.id === workspaceId}
              onClick={() => { setWorkspaceId(workspace.id); setOpenMenu(null); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface">
              <Folder className="size-4 text-muted-foreground" /><span className="truncate">{workspace.label}</span>{workspace.id === workspaceId && <Check className="ml-auto size-3.5 text-sage" />}
            </button>)}
          </div>}
        </div>

        <span className="mx-0.5 h-4 w-px bg-border sm:mx-1" aria-hidden="true" />

        <div className="relative">
          <Button type="button" variant="ghost" size="sm" disabled={!selectedModel} aria-label={`Model: ${selectedModel?.label ?? "Unavailable"}`} aria-haspopup="menu" aria-expanded={openMenu === "model"}
            onClick={(event) => toggleMenu("model", event.currentTarget)} className="max-w-[58px] px-1.5 sm:max-w-none sm:px-2.5">
            <span className="truncate sm:hidden">{selectedModel?.label.split(" ").at(-1) ?? "Model"}</span><span className="hidden sm:inline">{selectedModel?.label ?? "No models"}</span><ChevronDown className="!size-3" />
          </Button>
          {openMenu === "model" && <div role="menu" aria-label="Select model" className="absolute bottom-10 left-0 z-20 w-52 rounded-lg border border-border-strong bg-raised p-1.5 shadow-2xl">
            {!models.length && <p className="px-2.5 py-2 text-xs text-muted-foreground">No configured models</p>}
            {models.map((model) => <button key={model.id} type="button" role="menuitemradio" aria-checked={model.id === modelId} onClick={() => { setModelId(model.id); setOpenMenu(null); }} className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface">
              <span>{model.label}</span>{model.id === modelId && <Check className="ml-auto size-3.5 text-sage" />}
            </button>)}
          </div>}
        </div>

        <div className="relative">
          <Button type="button" variant="ghost" size="sm" disabled={!selectedEffort} aria-label={`Reasoning effort: ${selectedEffort?.label ?? "Default"}`} aria-haspopup="menu" aria-expanded={openMenu === "effort"}
            onClick={(event) => toggleMenu("effort", event.currentTarget)} className="px-1.5 sm:px-2.5"><CircleGauge /><span className="hidden sm:inline">{selectedEffort?.label ?? "Default"}</span><ChevronDown className="!size-3" /></Button>
          {openMenu === "effort" && <div role="menu" aria-label="Select reasoning effort" className="absolute bottom-10 left-0 z-20 w-40 rounded-lg border border-border-strong bg-raised p-1.5 shadow-2xl">
            {efforts.map((option) => <button key={option.id} type="button" role="menuitemradio" aria-checked={option.id === effort} onClick={() => { setEffort(option.id); setOpenMenu(null); }} className="flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs hover:bg-surface">
              <span>{option.label}</span>{option.id === effort && <Check className="ml-auto size-3.5 text-sage" />}
            </button>)}
          </div>}
        </div>

        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon" disabled aria-label="Voice input unavailable"><Mic /></Button>
          <Button type="button" size="icon" disabled={!canSend} onClick={submit} aria-label={submitting ? "Starting analysis" : "Send analysis"}>
            {submitting ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>

    </div>

    <input ref={fileInputRef} className="sr-only" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} aria-label="Upload files" />
    <input ref={datasetInputRef} className="sr-only" type="file" multiple accept=".csv,.xls,.xlsx,.parquet" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} aria-label="Add datasets" />

    <div id="composer-status" className="mt-2 min-h-5 text-center text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">
      {error
        ? <p role="alert" className="text-red-300">{error}</p>
        : attachments.length > 0
          ? <p role="alert" className="text-amber-200">File upload is not connected yet. Remove attachments to start this chat.</p>
          : modelsQuery.isError
            ? <p role="alert" className="text-red-300">Could not load Gemini models. Is the backend running on port 8000?</p>
            : modelsQuery.data && !models.length
              ? <p role="alert" className="text-amber-200">{modelsQuery.data.configuration_status}</p>
        : <p id="composer-hint"><span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span><span className="sm:hidden">Add files, choose a workspace, then send</span></p>}
    </div>

    <div className="mt-5 flex flex-wrap justify-center gap-2 sm:mt-7">
      {suggestions.map(({ icon: Icon, label, prompt }) => <button key={label} type="button" onClick={() => { setDraft(prompt); setError(null); inputRef.current?.focus(); }}
        className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface hover:text-foreground", submitting && "pointer-events-none opacity-50")}>
        <Icon className="size-3.5" strokeWidth={1.5} />{label}
      </button>)}
    </div>
  </div>;
}
