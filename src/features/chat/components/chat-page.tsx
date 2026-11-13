"use client";

import Image from "next/image";
import {
  ArrowUp,
  BarChart3,
  BrainCircuit,
  Calculator,
  CircleStop,
  ChevronRight,
  CirclePause,
  CornerDownRight,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Github,
  HardDrive,
  ListPlus,
  LoaderCircle,
  Mail,
  MessageSquare,
  NotebookTabs,
  Paperclip,
  PanelsTopLeft,
  Plus,
  Search,
  Sigma,
  Snowflake,
  Sparkles,
  TrendingUp,
  Workflow,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ContextSidebar, FilePreviewSidebar, type ContextFile } from "@/features/context-sidebar";
import {
  createMessage,
  downloadResource,
  cancelQueuedRun,
  cancelRun,
  getArtifacts,
  getChatRuns,
  getChat,
  getDatasets,
  getMessages,
  getRunEvents,
  getModels,
  getWorkspaces,
  queueRun,
  resumeChatQueue,
  steerRun,
  streamChatRun,
  uploadResource,
  type ExecutionEvent,
  type MessageDto,
} from "@/lib/api";
import type { AssistantMessage, ChatMessage, MessageBlock } from "../types";
import { replayTrace } from "../execution-trace";
import { takePendingRun } from "../pending-run";
import { ChatHeader } from "./chat-header";
import { ConversationNavigator } from "./conversation-navigator";
import { MessageList } from "./message-list";

function toMessage(message: MessageDto, resources = new Map<string, ContextFile>()): ChatMessage {
  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      content: message.content,
      createdAt: message.created_at,
      attachments: message.attachment_refs.map((reference) => {
        const resource = resources.get(reference.resource_id);
        return {
          id: reference.resource_id,
          name: resource?.name ?? "Attached file",
          kind: resource && "scope_type" in resource ? "Dataset" : resource?.kind ?? "File",
          size: resource ? formatFileSize(resource.size_bytes) : "Loading…",
        };
      }),
    };
  }
  const status: AssistantMessage["status"] = message.status === "completed"
    ? "completed"
    : message.status === "failed"
      ? "failed"
      : message.status === "interrupted" || message.status === "cancelled"
        ? "interrupted"
      : "running";
  const outputBlocks: Extract<MessageBlock, { type: "file" }>[] = message.attachment_refs.map((reference) => {
    const resource = resources.get(reference.resource_id);
    return {
      type: "file",
      id: reference.resource_id,
      name: resource?.name ?? "Generated file",
      kind: reference.resource_type === "dataset" ? "Dataset" : "Generated file",
      size: resource ? formatFileSize(resource.size_bytes) : "Loading…",
      description: resource?.origin === "generated" ? "Generated during this analysis" : "Attached output",
    };
  });
  return {
    id: message.id,
    role: "assistant",
    status,
    createdAt: message.created_at,
    blocks: [{ type: "markdown", content: message.content }, ...outputBlocks],
  };
}

function eventString(event: ExecutionEvent, key: string): string | null {
  const value = event.data[key];
  return typeof value === "string" ? value : null;
}

function toolLabel(name: string): string {
  return name.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

interface QueuedQuestion {
  runId: string;
  content: string;
  position: number;
  removing: boolean;
  paused: boolean;
}

interface DraftAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

type ConnectorCategory = "all" | "skills" | "data" | "apps";

const connectorItems = [
  { name: "Data Cleaning", category: "skills" as const, icon: Sparkles },
  { name: "Data Visualization", category: "skills" as const, icon: BarChart3 },
  { name: "Forecasting", category: "skills" as const, icon: TrendingUp },
  { name: "Statistical Analysis", category: "skills" as const, icon: Sigma },
  { name: "Anomaly Detection", category: "skills" as const, icon: FileSearch },
  { name: "Machine Learning", category: "skills" as const, icon: BrainCircuit },
  { name: "Report Generation", category: "skills" as const, icon: FileText },
  { name: "Snowflake", category: "data" as const, icon: Snowflake },
  { name: "Google BigQuery", category: "data" as const, icon: Database },
  { name: "PostgreSQL", category: "data" as const, icon: Database },
  { name: "MySQL", category: "data" as const, icon: Database },
  { name: "Google Sheets", category: "data" as const, icon: FileSpreadsheet },
  { name: "Microsoft Excel", category: "data" as const, icon: FileSpreadsheet },
  { name: "Google Drive", category: "data" as const, icon: HardDrive },
  { name: "Gmail", category: "apps" as const, icon: Mail },
  { name: "Slack", category: "apps" as const, icon: MessageSquare },
  { name: "Notion", category: "apps" as const, icon: NotebookTabs },
  { name: "Jira", category: "apps" as const, icon: PanelsTopLeft },
  { name: "GitHub", category: "apps" as const, icon: Github },
  { name: "Zapier", category: "apps" as const, icon: Workflow },
  { name: "Calculator", category: "apps" as const, icon: Calculator },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileType(file: File) {
  return file.name.split(".").pop()?.toUpperCase() || "FILE";
}

export function ChatPage({ chatId }: { chatId: string }) {
  const queryClient = useQueryClient();
  const chatQuery = useQuery({ queryKey: ["chat", chatId], queryFn: () => getChat(chatId) });
  const messagesQuery = useQuery({ queryKey: ["chat", chatId, "messages"], queryFn: () => getMessages(chatId) });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [connectorCategory, setConnectorCategory] = useState<ConnectorCategory>("all");
  const [connectorQuery, setConnectorQuery] = useState("");
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("");
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [queuedQuestions, setQueuedQuestions] = useState<QueuedQuestion[]>([]);
  const [composerPending, setComposerPending] = useState<"queue" | "steer" | null>(null);
  const [stopPending, setStopPending] = useState(false);
  const [composerStatus, setComposerStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>();
  const [traceEvents, setTraceEvents] = useState<ExecutionEvent[]>([]);
  const datasetsQuery = useQuery({
    queryKey: ["chat", chatId, "datasets"],
    queryFn: () => getDatasets(chatId),
  });
  const artifactsQuery = useQuery({
    queryKey: ["chat", chatId, "artifacts"],
    queryFn: () => getArtifacts(chatId),
  });
  const runsQuery = useQuery({ queryKey: ["chat", chatId, "runs"], queryFn: () => getChatRuns(chatId) });
  const traceHistoryQuery = useQuery({
    queryKey: ["chat", chatId, "trace-events", runsQuery.data?.items.map((run) => run.id).join(",")],
    enabled: Boolean(runsQuery.data?.items.length),
    queryFn: async () => (await Promise.all((runsQuery.data?.items ?? []).map(async (run) => (await getRunEvents(run.id)).items))).flat(),
  });
  const sections = useRef(new Map<string, HTMLElement>());
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const initialRunChecked = useRef(false);
  const streamController = useRef<AbortController | null>(null);
  const queuedQuestionsRef = useRef<QueuedQuestion[]>([]);
  const models = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data?.models]);
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0];
  const supportedEfforts = selectedModel?.supported_efforts ?? [];
  const workspaceName = workspacesQuery.data?.items.find(
    (workspace) => workspace.id === chatQuery.data?.workspace_id,
  )?.name;
  const visibleConnectors = connectorItems.filter((connector) => (
    (connectorCategory === "all" || connector.category === connectorCategory)
    && connector.name.toLowerCase().includes(connectorQuery.trim().toLowerCase())
  ));
  const resources = useMemo(() => new Map<string, ContextFile>([
    ...(datasetsQuery.data?.items ?? []),
    ...(artifactsQuery.data?.items ?? []),
  ].map((resource) => [resource.id, resource])), [artifactsQuery.data?.items, datasetsQuery.data?.items]);
  const traceReplay = useMemo(() => replayTrace(traceEvents), [traceEvents]);

  useEffect(() => {
    if (traceHistoryQuery.data) setTraceEvents(traceHistoryQuery.data);
  }, [traceHistoryQuery.data]);

  useEffect(() => {
    if (!messagesQuery.data) return;
    const next = messagesQuery.data.items.map((message) => toMessage(message, resources));
    setMessages((current) => next.map((message) => {
      if (message.role !== "assistant") return message;
      const existing = current.find((item): item is AssistantMessage => item.role === "assistant" && item.id === message.id);
      const historicalOutputs = (traceReplay.outputsByMessage.get(message.id) ?? []).map((output): Extract<MessageBlock, { type: "file" }> => ({
        type: "file", id: output.id, name: output.name, kind: output.resourceType === "dataset" ? "Dataset" : "Generated file", size: output.sizeBytes ? formatFileSize(output.sizeBytes) : "Saved output", description: "Generated during this analysis",
      }));
      const outputBlocks = [...(existing?.blocks.filter((block) => block.type === "file") ?? []), ...historicalOutputs];
      const uniqueOutputs = outputBlocks.filter((output, index, all) => output.type === "file" && all.findIndex((candidate) => candidate.type === "file" && candidate.id === output.id) === index);
      const trace = traceReplay.stepsByMessage.get(message.id) ?? existing?.trace;
      return trace?.length || uniqueOutputs.length
        ? { ...message, trace, blocks: [...message.blocks, ...uniqueOutputs.filter((output) => !message.blocks.some((block) => block.type === "file" && block.id === output.id))] }
        : message;
    }));
    setActiveSection((current) => current ?? next.find((message) => message.role === "user")?.id);
  }, [messagesQuery.data, resources, traceReplay]);

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

  useEffect(() => () => streamController.current?.abort(), []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAttachmentMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => {
    queuedQuestionsRef.current = queuedQuestions;
  }, [queuedQuestions]);

  const runMessage = useCallback(async (input:
    | { type: "message"; userMessageId: string; modelId: string; effort: string | null; clientRequestId: string }
    | { type: "resume-queue" }
  ) => {
    const placeholderId = input.type === "message" ? `assistant-pending-${input.clientRequestId}` : "";
    let assistantId = placeholderId;
    let streamRunId: string | null = null;
    const controller = new AbortController();
    streamController.current = controller;
    setRunning(true);
    setError(null);
    if (input.type === "message") {
      setMessages((current) => [
        ...current,
        {
          id: placeholderId,
          role: "assistant",
          status: "running",
          createdAt: new Date().toISOString(),
          blocks: [{ type: "markdown", content: "" }],
        },
      ]);
    }

    function updateAssistant(update: (message: AssistantMessage) => AssistantMessage) {
      setMessages((current) => current.map((message) => (
        message.role === "assistant" && (message.id === assistantId || message.id === placeholderId)
          ? update(message)
          : message
      )));
    }

    function onEvent(event: ExecutionEvent) {
      setTraceEvents((current) => current.some((item) => item.event_id === event.event_id) ? current : [...current, event]);
      if (event.type === "agent.started") {
        const run = event.data.run;
        if (run && typeof run === "object") {
          const runData = run as { id?: unknown; assistant_message_id?: unknown };
          const nextRunId = typeof runData.id === "string" ? runData.id : null;
          const id = runData.assistant_message_id;
          if (nextRunId) setActiveRunId(nextRunId);
          const startsQueuedRun = nextRunId && typeof id === "string" && (
            (streamRunId !== null && nextRunId !== streamRunId) || input.type === "resume-queue"
          );
          if (startsQueuedRun) {
            const queued = queuedQuestionsRef.current.find((item) => item.runId === nextRunId);
            setQueuedQuestions((current) => {
              const next = current.filter((item) => item.runId !== nextRunId);
              queuedQuestionsRef.current = next;
              return next;
            });
            assistantId = id;
            if (queued) {
              setMessages((current) => [
                ...current,
                { id: `queued-user-${nextRunId}`, role: "user", content: queued.content, createdAt: new Date().toISOString() },
                { id, role: "assistant", status: "running", createdAt: new Date().toISOString(), blocks: [{ type: "markdown", content: "" }] },
              ]);
            }
          } else if (typeof id === "string") {
            assistantId = id;
            updateAssistant((message) => ({ ...message, id }));
          }
          if (nextRunId) streamRunId = nextRunId;
        }
        return;
      }
      if (event.type === "message.created") {
        const id = eventString(event, "message_id");
        if (id) {
          assistantId = id;
          updateAssistant((message) => ({ ...message, id }));
        }
        return;
      }
      if (event.type === "message.delta") {
        const text = eventString(event, "text");
        if (!text) return;
        updateAssistant((message) => {
          const currentText = message.blocks[0]?.type === "markdown" ? message.blocks[0].content : "";
          return {
            ...message,
            blocks: [{ type: "markdown", content: currentText + text }, ...message.blocks.filter((block) => block.type === "file")],
          };
        });
        return;
      }
      if (event.type === "tool.started") {
        const id = eventString(event, "tool_call_id");
        const name = eventString(event, "name");
        if (!id || !name) return;
        updateAssistant((message) => ({
          ...message,
          trace: [...(message.trace ?? []), {
            id: eventString(event, "step_id") ?? `${event.run_id}:${id}`,
            runId: event.run_id,
            messageId: assistantId,
            label: toolLabel(name),
            summary: eventString(event, "summary") ?? "Starting tool.",
            detail: "Tool is running",
            status: "running",
            startedAt: event.timestamp,
          }],
        }));
        return;
      }
      if (event.type === "tool.completed" || event.type === "tool.failed") {
        const id = eventString(event, "tool_call_id");
        if (!id) return;
        const failed = event.type === "tool.failed";
        updateAssistant((message) => ({
          ...message,
          trace: (message.trace ?? []).map((step) => step.id === (eventString(event, "step_id") ?? `${event.run_id}:${id}`)
            ? { ...step, detail: failed ? eventString(event, "error") ?? "Tool failed" : "Completed", status: failed ? "failed" : "completed", completedAt: event.timestamp }
            : step),
        }));
        return;
      }
      if (event.type === "dataset.created" || event.type === "artifact.created") {
        const resourceKey = event.type === "dataset.created" ? "dataset" : "artifact";
        const resource = event.data[resourceKey];
        if (!resource || typeof resource !== "object") return;
        const data = resource as { id?: unknown; name?: unknown; size_bytes?: unknown };
        if (typeof data.id !== "string" || typeof data.name !== "string") return;
        const outputBlock: Extract<MessageBlock, { type: "file" }> = {
          type: "file",
          id: data.id,
          name: data.name,
          kind: event.type === "dataset.created" ? "Dataset" : "Generated file",
          size: typeof data.size_bytes === "number" ? formatFileSize(data.size_bytes) : "Saved output",
          description: "Generated during this analysis",
        };
        updateAssistant((message) => {
          const blocks = message.blocks.some((block) => block.type === "file" && block.id === data.id)
            ? message.blocks
            : [...message.blocks, outputBlock];
          return { ...message, blocks };
        });
        void queryClient.invalidateQueries({ queryKey: ["chat", chatId, event.type === "dataset.created" ? "datasets" : "artifacts"] });
        return;
      }
      if (event.type === "message.completed") {
        const content = eventString(event, "content") ?? "";
        updateAssistant((message) => ({
          ...message,
          status: "completed",
          blocks: [{ type: "markdown", content }, ...message.blocks.filter((block) => block.type === "file")],
        }));
        return;
      }
      if (event.type === "steer.applied") {
        setComposerStatus("Steering instruction applied to the active run.");
        return;
      }
      if (event.type === "steer.unapplied") {
        setComposerStatus("The response finished before the steering instruction could be applied.");
        return;
      }
      if (event.type === "agent.failed") {
        const failure = event.data.error;
        const message = failure && typeof failure === "object" && "message" in failure
          ? String((failure as { message: unknown }).message)
          : "Gemini could not complete this response.";
        setError(message);
        setQueuedQuestions((current) => current.map((item) => ({ ...item, paused: true })));
        updateAssistant((assistant) => ({ ...assistant, status: "failed" }));
        return;
      }
      if (event.type === "agent.cancelled" || event.type === "agent.interrupted") {
        setComposerStatus(event.type === "agent.cancelled" ? "Run stopped." : "Run interrupted.");
        updateAssistant((message) => ({ ...message, status: "interrupted" }));
      }
    }

    try {
      if (input.type === "message") {
        await streamChatRun(chatId, {
          user_message_id: input.userMessageId,
          model_id: input.modelId,
          effort: input.effort ?? undefined,
          client_request_id: input.clientRequestId,
        }, onEvent, controller.signal);
      } else {
        await resumeChatQueue(chatId, onEvent, controller.signal);
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        updateAssistant((message) => ({ ...message, status: "interrupted" }));
      } else {
        const message = caught instanceof Error ? caught.message : "The Gemini request failed.";
        setError(message);
        updateAssistant((assistant) => ({ ...assistant, status: "failed" }));
      }
    } finally {
      if (streamController.current === controller) streamController.current = null;
      setActiveRunId(null);
      setRunning(false);
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    }
  }, [chatId, queryClient]);

  useEffect(() => {
    if (initialRunChecked.current || !messagesQuery.data) return;
    initialRunChecked.current = true;
    const pending = takePendingRun(chatId);
    if (!pending) return;
    setModelId(pending.modelId);
    setEffort(pending.effort ?? "");
    void runMessage({
      type: "message",
      userMessageId: pending.userMessageId,
      modelId: pending.modelId,
      effort: pending.effort,
      clientRequestId: pending.clientRequestId,
    });
  }, [chatId, messagesQuery.data, runMessage]);

  function selectFile(file: ContextFile) {
    setSelectedFile(file);
    setPanelOpen(true);
  }

  function selectFileById(id: string) {
    const resource = resources.get(id);
    if (resource) selectFile(resource);
  }

  function downloadFileById(id: string) {
    const resource = resources.get(id);
    if (resource) void downloadResource(resource.download_url, resource.name);
  }

  function togglePanel() {
    setPanelOpen((open) => {
      if (open) setSelectedFile(null);
      return !open;
    });
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = Array.from(fileList).map<DraftAttachment>((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: file.type.startsWith("image/") && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    }));
    setAttachments((current) => [...current, ...next]);
    setError(null);
    setAttachmentMenuOpen(false);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selectedModel || running) return;
    setRunning(true);
    setError(null);
    try {
      const userMessage = await createMessage(chatId, {
        content,
        client_request_id: crypto.randomUUID(),
      });
      for (const attachment of attachments) {
        await uploadResource({
          file: attachment.file,
          scopeType: "chat",
          scopeId: chatId,
          messageId: userMessage.id,
          clientUploadId: attachment.id,
        });
      }
      setMessages((current) => [...current, toMessage(userMessage, resources)]);
      setDraft("");
      setAttachments((current) => {
        current.forEach((attachment) => {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        });
        return [];
      });
      if (attachments.length) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["chat", chatId, "datasets"] }),
          queryClient.invalidateQueries({ queryKey: ["chat", chatId, "artifacts"] }),
          queryClient.invalidateQueries({ queryKey: ["chat", chatId, "messages"] }),
        ]);
        setPanelOpen(true);
      }
      await runMessage({
        type: "message",
        userMessageId: userMessage.id,
        modelId: selectedModel.id,
        effort: effort || null,
        clientRequestId: crypto.randomUUID(),
      });
    } catch (caught) {
      setRunning(false);
      setError(caught instanceof Error ? caught.message : "Could not send this message.");
    }
  }

  async function queueDraft() {
    const content = draft.trim();
    if (!content || !activeRunId || !selectedModel || composerPending) return;
    setComposerPending("queue");
    setComposerStatus(null);
    setError(null);
    try {
      const result = await queueRun(activeRunId, {
        content,
        model_id: selectedModel.id,
        effort: effort || undefined,
        client_request_id: crypto.randomUUID(),
      });
      const queuedQuestion = {
        runId: result.run.id,
        content: result.message.content,
        position: result.position,
        removing: false,
        paused: false,
      };
      setQueuedQuestions((current) => {
        const next = [...current, queuedQuestion];
        queuedQuestionsRef.current = next;
        return next;
      });
      setDraft("");
      setComposerStatus("Question added to the queue.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue this question.");
    } finally {
      setComposerPending(null);
    }
  }

  async function steerDraft() {
    const content = draft.trim();
    if (!content || !activeRunId || composerPending) return;
    setComposerPending("steer");
    setComposerStatus(null);
    setError(null);
    try {
      await steerRun(activeRunId, { content, client_request_id: crypto.randomUUID() });
      setDraft("");
      setComposerStatus("Steering instruction sent to the active run.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not steer the active run.");
    } finally {
      setComposerPending(null);
    }
  }

  async function stopActiveRun() {
    if (!activeRunId || stopPending) return;
    setStopPending(true);
    setError(null);
    setComposerStatus("Stopping the active run…");
    try {
      await cancelRun(activeRunId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not stop the active run.");
      setStopPending(false);
    }
  }

  async function removeQueuedQuestion(runId: string) {
    setQueuedQuestions((current) => current.map((item) => item.runId === runId ? { ...item, removing: true } : item));
    setError(null);
    try {
      await cancelQueuedRun(runId);
      setQueuedQuestions((current) => {
        const next = current.filter((item) => item.runId !== runId);
        queuedQuestionsRef.current = next;
        return next;
      });
      setComposerStatus("Queued question removed.");
    } catch (caught) {
      setQueuedQuestions((current) => current.map((item) => item.runId === runId ? { ...item, removing: false } : item));
      setError(caught instanceof Error ? caught.message : "Could not remove the queued question.");
    }
  }

  function resumePausedQueue() {
    if (running || !queuedQuestions.some((item) => item.paused)) return;
    void runMessage({ type: "resume-queue" });
  }

  return (
    <section className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
        <div className="col-span-2 row-start-1">
          <ChatHeader
            title={chatQuery.data?.title ?? "Loading conversation…"}
            workspaceName={workspaceName}
            panelOpen={panelOpen}
            onToggleRightPanel={togglePanel}
          />
        </div>
        <ConversationNavigator
          messages={messages}
          activeId={activeSection}
          onNavigate={(id) => {
            setActiveSection(id);
            sections.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <div className="col-start-2 row-start-2 min-h-0 overflow-y-auto">
          {messagesQuery.isError ? (
            <div role="alert" className="mx-auto max-w-3xl px-5 py-10 text-sm text-red-300">
              Could not load this conversation. Is the backend running on port 8000?
            </div>
          ) : (
            <MessageList
              messages={messages}
              onFileSelect={selectFileById}
              onFileDownload={downloadFileById}
              registerSection={(id, node) => {
                if (node) sections.current.set(id, node);
                else sections.current.delete(id);
              }}
            />
          )}
        </div>
        <form className="col-start-2 row-start-3 bg-background p-3 sm:p-4" onSubmit={submit}>
          {queuedQuestions.length ? (
            <div className="mx-auto mb-2 max-w-3xl space-y-1.5" aria-label="Queued questions">
              {queuedQuestions.map((item) => (
                <div key={item.runId} className="flex items-center gap-2 rounded-md border border-border bg-raised px-3 py-2 text-xs">
                  {item.paused ? <CirclePause className="size-3.5 shrink-0 text-amber-300" aria-hidden="true" /> : <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
                  <span className="shrink-0 font-medium text-foreground">{item.paused ? "Paused" : `Queued${item.position > 1 ? ` · ${item.position}` : ""}`}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.content}</span>
                  {item.paused ? (
                    <button type="button" onClick={resumePausedQueue} aria-label="Resume queued questions" className="rounded px-1.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-surface hover:text-amber-100">
                      Resume
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void removeQueuedQuestion(item.runId)}
                    disabled={item.removing}
                    aria-label={`Remove queued question: ${item.content}`}
                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
                  >
                    {item.removing ? <LoaderCircle className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {running && activeRunId ? (
            <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2" aria-label="Active run actions">
              <button type="button" onClick={() => void stopActiveRun()} disabled={stopPending} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-400/40 bg-red-950/20 px-3 text-xs font-medium text-red-200 hover:bg-red-950/40 disabled:opacity-40">
                {stopPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <CircleStop className="size-3.5" />}
                Stop
              </button>
              {draft.trim() ? <>
              <button type="button" onClick={() => void queueDraft()} disabled={Boolean(composerPending)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-raised px-3 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-40">
                {composerPending === "queue" ? <LoaderCircle className="size-3.5 animate-spin" /> : <ListPlus className="size-3.5" />}
                Queue
              </button>
              <button type="button" onClick={() => void steerDraft()} disabled={Boolean(composerPending)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-40">
                {composerPending === "steer" ? <LoaderCircle className="size-3.5 animate-spin" /> : <CornerDownRight className="size-3.5" />}
                Steer
              </button>
              </> : null}
            </div>
          ) : null}
          <div ref={composerRef} className="relative mx-auto max-w-3xl rounded-lg border border-border-strong bg-surface p-2 focus-within:border-ring">
            {attachments.length ? (
              <div aria-label="Selected chat attachments" className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative flex min-w-[180px] max-w-[240px] items-center gap-2 rounded-lg border bg-raised p-2 pr-8">
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-surface text-muted-foreground">
                      {attachment.previewUrl ? (
                        <Image src={attachment.previewUrl} alt="" width={36} height={36} unoptimized className="size-full object-cover" />
                      ) : <FileText className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-medium text-foreground">{attachment.file.name}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{fileType(attachment.file)} · {formatFileSize(attachment.file.size)}</span>
                    </span>
                    <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={`Remove ${attachment.file.name}`} className="absolute right-1 top-1 grid size-6 place-items-center rounded text-muted-foreground hover:bg-surface hover:text-foreground"><X className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="relative">
                <button type="button" aria-label="Add files or connectors" aria-haspopup="dialog" aria-expanded={attachmentMenuOpen} disabled={running || messagesQuery.isError} onClick={() => setAttachmentMenuOpen((open) => !open)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-40"><Plus className="size-4" /></button>
                {attachmentMenuOpen ? (
                  <div role="dialog" aria-label="Add files and connectors" className="absolute bottom-[calc(100%+8px)] left-0 z-50 flex h-[320px] w-[min(300px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border-strong bg-[#191b1e] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.48)]">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-border-strong bg-[linear-gradient(110deg,#303744,#242a33)] p-2 text-left hover:border-slate/70">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[#b8cef0] text-[#172033]"><Paperclip className="size-[18px]" /></span>
                      <span><span className="block text-xs font-semibold leading-4 text-foreground">Add files</span><span className="block text-[10px] leading-4 text-foreground/65">From your device</span></span>
                      <ChevronRight className="ml-auto size-3.5 text-foreground" />
                    </button>
                    <label className="relative mt-2 block shrink-0"><span className="sr-only">Find a connector</span><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input value={connectorQuery} onChange={(event) => setConnectorQuery(event.target.value)} placeholder="Find a connector…" className="h-8 w-full rounded-md border bg-transparent pl-8 pr-2.5 text-[11px] outline-none placeholder:text-muted-foreground focus:border-ring" /></label>
                    <div role="tablist" aria-label="Connector categories" className="mt-1.5 grid shrink-0 grid-cols-4 gap-0.5 border-b pb-1.5">
                      {([['all', 'All'], ['skills', 'Skills'], ['data', 'Data Sources'], ['apps', 'Apps & Tools']] as const).map(([value, label]) => (
                        <button key={value} type="button" role="tab" aria-selected={connectorCategory === value} onClick={() => setConnectorCategory(value)} className={`min-h-8 rounded px-1 py-0.5 text-[11px] leading-[14px] ${connectorCategory === value ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
                      {visibleConnectors.map(({ name, icon: Icon }) => (
                        <button key={name} type="button" disabled title={`${name} is coming soon`} className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-foreground opacity-70"><Icon className="size-3.5" /><span>{name}</span><span className="ml-auto text-[8px] uppercase tracking-wide text-muted-foreground">Soon</span></button>
                      ))}
                      {!visibleConnectors.length ? <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No matching connectors.</p> : null}
                    </div>
                    <p className="shrink-0 border-t px-1.5 pt-1.5 text-[9px] text-muted-foreground">Local files are available now. External connectors are coming soon.</p>
                  </div>
                ) : null}
              </div>
              <label htmlFor="chat-message" className="sr-only">Ask anything about your data</label>
              <textarea
                id="chat-message"
                value={draft}
                disabled={messagesQuery.isError}
                onChange={(event) => { setDraft(event.target.value); setError(null); setComposerStatus(null); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                placeholder={running ? "Type a follow-up to queue or steer…" : "Ask anything about your data…"}
                className="max-h-32 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              <button type="submit" disabled={!draft.trim() || running || !selectedModel} aria-label="Send message" className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-30">
                {running ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </button>
            </div>
            <input ref={fileInputRef} type="file" multiple accept=".csv,.xls,.xlsx,.parquet,.png,.jpg,.jpeg,.pdf,.txt,.md,.json" className="sr-only" aria-label="Add files to chat" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
            <div className="mt-1.5 flex items-center justify-end gap-2 border-t px-1 pt-2">
              <label htmlFor="chat-model" className="text-[10px] text-muted-foreground">Model</label>
              <select id="chat-model" aria-label="Model" value={selectedModel?.id ?? ""} disabled={running || !models.length} onChange={(event) => setModelId(event.target.value)} className="max-w-[180px] rounded border bg-raised px-2 py-1 text-[11px] outline-none focus:border-ring disabled:opacity-50">
                {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <label htmlFor="chat-effort" className="text-[10px] text-muted-foreground">Effort</label>
              <select id="chat-effort" aria-label="Reasoning effort" value={effort} disabled={running || !supportedEfforts.length} onChange={(event) => setEffort(event.target.value)} className="rounded border bg-raised px-2 py-1 text-[11px] capitalize outline-none focus:border-ring disabled:opacity-50">
                {supportedEfforts.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          </div>
          <div className="mx-auto mt-1.5 min-h-4 max-w-3xl text-[11px] text-muted-foreground" aria-live="polite">
            {error ? <p role="alert" className="text-red-300">{error}</p> : null}
            {!error && composerStatus ? <p>{composerStatus}</p> : null}
          </div>
        </form>
      </div>

      {panelOpen ? (
        <div className="absolute inset-y-0 right-0 z-40 w-full bg-sidebar shadow-2xl sm:max-w-[360px] xl:static xl:z-auto xl:w-[340px] xl:max-w-none xl:shrink-0 xl:shadow-none">
          <ContextSidebar
            chatId={chatId}
            workspaceId={chatQuery.data?.workspace_id ?? null}
            datasets={datasetsQuery.data?.items ?? []}
            artifacts={artifactsQuery.data?.items ?? []}
            onClose={() => { setSelectedFile(null); setPanelOpen(false); }}
            onFileSelect={selectFile}
          />
        </div>
      ) : null}
      {selectedFile ? (
        <div className="absolute inset-y-0 right-0 z-50 w-full bg-sidebar shadow-2xl sm:max-w-[360px] xl:w-[340px] xl:max-w-none">
          <FilePreviewSidebar file={selectedFile} onBack={() => setSelectedFile(null)} onClose={() => setSelectedFile(null)} />
        </div>
      ) : null}
    </section>
  );
}
