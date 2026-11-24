import { ApiError } from "@/lib/api";

export type ExecutionDiagnostic = {
  component: string;
  category: string;
  message: string;
  code: string;
  stage: string;
  retryable: boolean;
  http_status?: number;
  tool?: string;
  step_id?: string;
  turn?: number;
  retry_attempts?: number;
  retry_limit?: number;
  duration_ms?: number;
  request_id?: string;
  correlation_id?: string;
  development?: Record<string, string>;
};

export function readDiagnostic(value: unknown): ExecutionDiagnostic | undefined {
  if (!value || typeof value !== "object") return;
  const error = value as Partial<ExecutionDiagnostic>;
  if (typeof error.component !== "string" || typeof error.category !== "string" ||
      typeof error.message !== "string" || typeof error.code !== "string" ||
      typeof error.stage !== "string" || typeof error.retryable !== "boolean") return;
  return error as ExecutionDiagnostic;
}

export function diagnosticHeadline(error: ExecutionDiagnostic): string {
  const status = error.http_status ? ` · HTTP ${error.http_status}` : "";
  return `${error.component}${status} — ${error.message}`;
}

export function diagnosticFields(error: ExecutionDiagnostic): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ["Component", error.component],
    ["Category", error.category.replaceAll("_", " ")],
    ["Message", error.message],
    ["Error code", error.code],
    ["Stage", error.stage.replaceAll("_", " ")],
  ];
  if (error.http_status !== undefined) fields.push(["HTTP status", String(error.http_status)]);
  if (error.tool) fields.push(["Tool", error.tool]);
  if (error.turn !== undefined) fields.push(["Agent turn", String(error.turn)]);
  fields.push(["Retry attempts", error.retry_attempts === undefined ? "Unavailable" : String(error.retry_attempts)]);
  if (error.retry_limit !== undefined) fields.push(["Automatic retry limit", String(error.retry_limit)]);
  if (error.duration_ms !== undefined) fields.push(["Duration", `${error.duration_ms.toLocaleString()} ms`]);
  if (error.request_id) fields.push(["Request ID", error.request_id]);
  if (error.correlation_id) fields.push(["Correlation ID", error.correlation_id]);
  fields.push(["Retryable", error.retryable ? "Yes" : "No"]);
  for (const [label, value] of Object.entries(error.development ?? {})) {
    fields.push([label, value]);
  }
  return fields;
}

export function interruptedDiagnostic(cancelled: boolean): ExecutionDiagnostic {
  return {
    component: "Agent", category: cancelled ? "cancelled" : "interrupted",
    message: cancelled ? "Run stopped by user" : "Run interrupted",
    code: cancelled ? "run_cancelled" : "run_interrupted", stage: "run_execution", retryable: true,
  };
}

export function requestDiagnostic(cause: unknown, startedAt: number, runId: string | null): ExecutionDiagnostic {
  const apiError = cause instanceof ApiError ? cause : undefined;
  const status = apiError?.status;
  const message = ({
    400: "Invalid request", 401: "Authentication failed", 403: "Access denied",
    404: "Resource not found", 408: "Request timed out", 409: "Request conflicts with the current run",
    422: "Run request failed validation", 429: "Rate limit exceeded", 500: "Server error",
    502: "Bad gateway", 503: "Service unavailable", 504: "Gateway timed out",
  } as Record<number, string>)[status ?? 0];
  const safeReasons: Record<string, string> = {
    invalid_model: "The selected model is unavailable",
    invalid_effort: "The selected reasoning effort is unsupported",
    invalid_run_request: "Check the analysis request fields",
    empty_stream: "The streaming response had no body",
  };
  const knownReason = apiError && Object.hasOwn(safeReasons, apiError.code) ? safeReasons[apiError.code] : undefined;
  return {
    component: apiError ? "FastAPI" : "Connection",
    category: apiError ? (status && status < 500 ? "request" : "service") : "connection",
    message: knownReason ?? message ?? (apiError ? "Run request failed" : "Connection to the analysis stream failed"),
    code: knownReason && apiError ? apiError.code : status ? `http_${status}` : "stream_connection_failed",
    stage: runId ? "execution_stream" : "start_run",
    retryable: !status || [408, 429].includes(status) || status >= 500,
    http_status: status,
    retry_attempts: 0,
    duration_ms: Math.round(performance.now() - startedAt),
    request_id: apiError?.requestId,
    correlation_id: runId ?? undefined,
  };
}
