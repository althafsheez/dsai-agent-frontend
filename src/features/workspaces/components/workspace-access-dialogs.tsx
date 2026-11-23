"use client";

import { useState } from "react";
import { Shield, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ShareWorkspaceDialog } from "./share-workspace-dialog";

interface WorkspaceAccessDialogsProps {
  workspaceName: string;
  workspaceId: string;
}

export function WorkspaceAccessDialogs({ workspaceName, workspaceId }: WorkspaceAccessDialogsProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" type="button" onClick={() => setTransferOpen(true)}><Shield />Transfer</Button>
        <Button variant="outline" size="sm" type="button" onClick={() => setShareOpen(true)}><UserRoundPlus />Share</Button>
      </div>

      <ShareWorkspaceDialog open={shareOpen} onOpenChange={setShareOpen} workspaceId={workspaceId} workspaceName={workspaceName} />

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <div className="pr-8 text-center"><DialogTitle className="text-lg font-semibold">Transfer Ownership</DialogTitle><DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">This action is permanent. You will lose administrative control over “{workspaceName}”.</DialogDescription></div>
          <div className="mt-5 rounded-md border border-red-400/40 bg-red-950/15 p-3 text-xs leading-5 text-red-300"><span className="font-medium">Warning:</span> Only transfer ownership to someone you trust. Existing workspace content and access will remain in place.</div>
          <label className="mt-4 grid gap-1.5 text-[11px] text-muted-foreground">New owner email<input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="name@example.com" className="h-9 rounded-md border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-border-strong" /></label>
          <label className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">Type <span className="font-semibold text-red-300">TRANSFER</span> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-xs text-foreground outline-none focus:border-border-strong" /></label>
          <div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button type="button" variant="ghost" onClick={() => setTransferOpen(false)}>Cancel</Button><Button type="button" disabled={!ownerEmail.trim() || confirmation !== "TRANSFER"} className="bg-red-900 text-red-100 hover:bg-red-800" title="Ownership persistence will be connected to the workspace membership backend">Transfer Ownership</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
