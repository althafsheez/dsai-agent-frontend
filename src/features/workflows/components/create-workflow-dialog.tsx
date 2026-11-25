"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSaveWorkflow } from "../use-workflows";

export function CreateWorkflowDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const save = useSaveWorkflow();
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || save.isPending) return;
    try {
      const workflow = await save.mutateAsync({ name: name.trim(), description: description.trim(), prompt: "", state: "draft", trigger: { kind: "manual", config: { show_on_canvas: false } }, steps: [] });
      setOpen(false);
      router.push(`/workflows/${workflow.id}/edit`);
    } catch {
      // Keep the form open with the entered values and show the error below.
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!save.isPending) { setOpen(next); if (!next) { setName(""); setDescription(""); save.reset(); } } }}>
    <DialogTrigger asChild><Button type="button"><Plus />New workflow</Button></DialogTrigger>
    <DialogContent className="max-w-lg p-0">
      <form onSubmit={(event) => void submit(event)}>
        <div className="border-b px-6 py-5"><DialogTitle className="text-xl font-semibold">Create workflow</DialogTitle><DialogDescription className="mt-1 text-xs text-muted-foreground">Name your workflow, then configure its trigger and steps in the editor.</DialogDescription></div>
        <div className="space-y-4 px-6 py-5">
          <label className="block text-xs font-medium">Workflow name <span className="text-destructive">*</span><input autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Daily sales report" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-border-strong" /></label>
          <label className="block text-xs font-medium">Description <span className="text-muted-foreground">(optional)</span><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should this workflow do?" className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-border-strong" /></label>
          {save.isError && <p role="alert" className="text-xs text-destructive">{save.error.message || "Could not create workflow."}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!name.trim() || save.isPending}>{save.isPending ? "Creating…" : "Create workflow"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
