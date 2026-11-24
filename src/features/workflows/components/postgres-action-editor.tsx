"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyWorkflowAction, generateWorkflowAction, testWorkflowAction,
  type WorkflowAction, type WorkflowActionRequest, type WorkflowActionTest,
} from "@/lib/api";
import { WorkflowQueryPreview } from "./workflow-query-preview";
import { useNow } from "../use-workflows";

const field = "block min-w-0 w-full resize-y rounded-md border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground [overflow-wrap:anywhere]";
const statusLabels = {
  supported: "Ready to review",
  unsupported: "Unsupported action",
  needs_clarification: "Clarification needed",
  missing_requirement: "Missing requirement",
};

export function PostgresActionEditor({ connectionId, instructions, applied, onInstructionsChange, onApply }: {
  connectionId: string;
  instructions: string;
  applied?: WorkflowAction;
  onInstructionsChange: (value: string) => void;
  onApply: (action: WorkflowAction | undefined) => void;
}) {
  const [candidate, setCandidate] = useState<WorkflowAction>();
  const [testResult, setTestResult] = useState<WorkflowActionTest>();
  const [bindings, setBindings] = useState<string>();
  const [bindingError, setBindingError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [modifying, setModifying] = useState(false);
  const generate = useMutation({ mutationFn: (body: WorkflowActionRequest) => generateWorkflowAction(body) });
  const test = useMutation({ mutationFn: (action: WorkflowAction) => testWorkflowAction(action) });
  const apply = useMutation({ mutationFn: ({ action, receipt }: { action: WorkflowAction; receipt?: string }) => applyWorkflowAction(action, receipt) });
  const action = candidate?.instructions === instructions.trim() ? candidate : applied;
  const busy = generate.isPending || test.isPending || apply.isPending;
  const now = useNow(busy);
  const pending = generate.isPending ? {
    label: generate.variables?.feedback ? "Revising and validating SQL" : "Preparing and validating SQL",
    started: generate.submittedAt,
  } : test.isPending ? { label: "Running a read-only PostgreSQL test", started: test.submittedAt }
    : apply.isPending ? { label: "Validating the action for this draft", started: apply.submittedAt } : null;
  const proposal = generate.variables?.instructions.trim() === instructions.trim() ? generate.data : undefined;
  const result = action && test.variables?.instructions === action.instructions
    && test.variables?.arguments.sql === action.arguments.sql ? testResult : undefined;

  function resetTest() {
    setTestResult(undefined);
    setBindingError("");
    test.reset();
    apply.reset();
  }

  function changeInstructions(value: string) {
    resetTest();
    setCandidate(undefined);
    setBindings(undefined);
    generate.reset();
    onInstructionsChange(value);
  }

  function build(revision?: string) {
    resetTest();
    generate.mutate({
      provider: "postgresql", connection_id: connectionId, instructions,
      previous_sql: revision ? action?.arguments.sql : undefined, feedback: revision,
    }, {
      onSuccess: (response) => {
        if (response.action) {
          setCandidate(response.action);
          setBindings(undefined);
          setFeedback("");
          setModifying(false);
        }
      },
    });
  }

  function edited(next: WorkflowAction) {
    resetTest();
    setCandidate({ ...next, test_status: "untested", test_receipt: null });
    if (applied) onApply(undefined);
  }

  function executable(): WorkflowAction | undefined {
    if (!action) return;
    if (bindings === undefined) return action;
    try {
      const values: unknown = JSON.parse(bindings);
      if (!Array.isArray(values) || !values.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))) {
        throw new Error();
      }
      return { ...action, arguments: { ...action.arguments, bindings: values } };
    } catch {
      setBindingError("Enter SQL bindings as a JSON array of strings, numbers, booleans or null.");
    }
  }

  function runTest() {
    const next = executable();
    if (!next) return;
    setTestResult(undefined);
    test.mutate(next, { onSuccess: setTestResult });
  }

  function applyCandidate() {
    const next = executable();
    if (!next) return;
    apply.mutate({ action: next, receipt: result?.status === "passed" ? result.receipt : undefined }, {
      onSuccess: (saved) => {
        onApply(saved);
        setCandidate(undefined);
        setBindings(undefined);
      },
    });
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border p-3 [overflow-wrap:anywhere]">
      <h3 className="text-xs font-semibold">Action</h3>
      {pending && <div role="status" className="sticky top-0 z-10 flex items-center gap-2 rounded-md border bg-raised px-2.5 py-2 text-xs shadow-sm">
        <LoaderCircle aria-hidden className="size-3.5 shrink-0 text-slate motion-safe:animate-spin" />
        <span className="min-w-0 flex-1">{pending.label}…</span>
        <span aria-hidden="true" title="Elapsed time" className="shrink-0 tabular-nums text-muted-foreground">
          {Math.max(0, Math.floor((now - pending.started) / 1000))}s
        </span>
      </div>}
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>Action instructions</span>
        <textarea value={instructions} maxLength={2000} rows={5} disabled={busy} placeholder="Describe what to query or calculate…"
          onChange={(event) => changeInstructions(event.target.value)} className={field} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || !instructions.trim()} onClick={() => build()}>
          {generate.isPending ? "Generating…" : action ? "Regenerate action" : "Generate action"}
        </Button>
        {action && <Button type="button" size="sm" variant="ghost" disabled={busy} aria-expanded={modifying}
          onClick={() => setModifying(!modifying)}>Modify with AI</Button>}
      </div>
      {modifying && <div className="space-y-2">
        <textarea aria-label="Describe the change" placeholder="Describe the change…" value={feedback} onChange={(event) => setFeedback(event.target.value)}
          rows={2} maxLength={2000} disabled={busy} className={field} />
        <Button type="button" size="sm" variant="outline" disabled={busy || !feedback.trim()} onClick={() => build(feedback.trim())}>Generate revision</Button>
      </div>}
      {(generate.error || test.error || apply.error || bindingError) && <p role="alert" className="text-xs text-destructive">
        {generate.error?.message || test.error?.message || apply.error?.message || bindingError}
      </p>}
      {proposal && proposal.status !== "supported" && <p role="status" className="rounded-md border px-2.5 py-2 text-xs">
        <strong>{statusLabels[proposal.status]}</strong><br />{proposal.message}
      </p>}
      {action && <>
        <div className="space-y-1 text-xs">
          <p className="font-medium">{candidate ? "Action preview" : "Applied action"}</p>
          <p className="text-muted-foreground">{action.summary}</p>
          {!candidate && <p className="text-muted-foreground">{action.test_status === "passed" ? "Test passed" : "Untested"}</p>}
        </div>
        <details className="min-w-0 space-y-2 rounded-md border p-2.5 text-xs">
          <summary className="cursor-pointer font-medium">View execution logic</summary>
          <label className="block space-y-1"><span>SQL</span>
            <textarea rows={6} value={action.arguments.sql} disabled={busy} maxLength={16_000} className={field + " font-mono"}
              onChange={(event) => edited({ ...action, arguments: { ...action.arguments, sql: event.target.value } })} />
          </label>
          {(action.arguments.bindings.length > 0 || /\$\d/.test(action.arguments.sql) || bindings !== undefined) &&
            <label className="block space-y-1"><span>SQL bindings (JSON)</span>
              <textarea rows={2} disabled={busy} value={bindings ?? JSON.stringify(action.arguments.bindings)} className={field + " font-mono"}
                onChange={(event) => { setBindings(event.target.value); edited(action); }} />
            </label>}
        </details>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || !action.arguments.sql.trim()} onClick={runTest}>
            {test.isPending ? "Testing…" : "Test action"}
          </Button>
          <Button type="button" size="sm" disabled={busy || !action.arguments.sql.trim() || result?.status === "failed" || (!candidate && !result)}
            onClick={applyCandidate}>{apply.isPending ? "Applying…" : "Apply action"}</Button>
        </div>
        {result && <div className="space-y-2 rounded-md border p-2.5 text-xs">
          {result.status === "passed" ? <>
            <p role="status" className="font-medium">Test passed</p>
            <WorkflowQueryPreview table={result.result} />
          </> : <>
            <p role="alert" className="text-destructive">{result.error}</p>
            <p className="text-muted-foreground">Test failed · {result.duration_ms} ms</p>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={() => build(`The last execution failed (${result.code}): ${result.error}. Fix the SQL.`)}>Fix with AI</Button>
          </>}
          <details><summary className="cursor-pointer text-muted-foreground">Execution logs</summary>
            <ul className="mt-1 space-y-1">{result.logs.map((line, index) => <li key={index}>{line}</li>)}</ul>
          </details>
        </div>}
      </>}
    </div>
  );
}
