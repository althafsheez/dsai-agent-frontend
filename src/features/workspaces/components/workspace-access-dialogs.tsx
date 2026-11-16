"use client";

import { useState } from "react";
import { Check, Clock3, Copy, Shield, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type WorkspaceRole = "viewer" | "contributor" | "admin";

interface WorkspaceMember {
  email: string;
  role: WorkspaceRole;
}

const roleLabels: Record<WorkspaceRole, string> = {
  viewer: "Viewer",
  contributor: "Contributor",
  admin: "Admin",
};

function RoleSelect({ value, onChange, label }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as WorkspaceRole)}
      className="h-9 rounded-md border bg-background px-2.5 text-xs text-foreground outline-none focus:border-border-strong"
    >
      {Object.entries(roleLabels).map(([role, roleLabel]) => <option key={role} value={role}>{roleLabel}</option>)}
    </select>
  );
}

interface WorkspaceAccessDialogsProps {
  workspaceName: string;
  workspaceId: string;
}

export function WorkspaceAccessDialogs({ workspaceName, workspaceId }: WorkspaceAccessDialogsProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("contributor");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [copied, setCopied] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const shareUrl = `/workspaces/${workspaceId}`;

  function addMember() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setMembers((current) => {
      const existing = current.findIndex((member) => member.email === normalizedEmail);
      if (existing === -1) return [...current, { email: normalizedEmail, role }];
      return current.map((member, index) => index === existing ? { ...member, role } : member);
    });
    setEmail("");
  }

  function updateRole(memberEmail: string, nextRole: WorkspaceRole) {
    setMembers((current) => current.map((member) => member.email === memberEmail ? { ...member, role: nextRole } : member));
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" type="button" onClick={() => setTransferOpen(true)}><Shield />Transfer</Button>
        <Button variant="outline" size="sm" type="button" onClick={() => setShareOpen(true)}><UserRoundPlus />Share</Button>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-xl">
          <div className="pr-8">
            <DialogTitle className="text-lg font-semibold">Share Workspace</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">Invite others to collaborate in {workspaceName}.</DialogDescription>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); addMember(); }} className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
            <label className="grid gap-1.5 text-[11px] text-muted-foreground">Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="h-9 rounded-md border bg-background px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-border-strong" /></label>
            <label className="grid gap-1.5 text-[11px] text-muted-foreground">Role<RoleSelect value={role} onChange={setRole} label="New member role" /></label>
            <Button type="submit" className="self-end" disabled={!email.trim()}>Add</Button>
          </form>

          <section className="mt-5 border-t pt-4" aria-labelledby="workspace-access-title">
            <div className="flex items-center gap-3"><h3 id="workspace-access-title" className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">People with access</h3><span className="h-px flex-1 bg-border" /></div>
            {members.length ? <div className="mt-3 divide-y rounded-md border">{members.map((member) => <div key={member.email} className="flex items-center gap-3 px-3 py-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-medium uppercase">{member.email.slice(0, 2)}</span><span className="min-w-0 flex-1 truncate text-xs">{member.email}</span><RoleSelect value={member.role} onChange={(nextRole) => updateRole(member.email, nextRole)} label={`Role for ${member.email}`} /></div>)}</div> : <p className="py-7 text-center text-xs italic text-muted-foreground">No one has access yet.</p>}
          </section>

          <section className="border-t pt-4" aria-labelledby="pending-invitations-title">
            <div className="flex items-center gap-2"><Clock3 className="size-3.5 text-muted-foreground" /><h3 id="pending-invitations-title" className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pending invitations</h3><span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-[10px] text-muted-foreground">0</span></div>
            <p className="py-5 text-center text-xs italic text-muted-foreground">No pending invitations.</p>
          </section>

          <div className="flex gap-2 border-t pt-4"><input readOnly value={shareUrl} aria-label="Workspace share link" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-xs text-muted-foreground outline-none" /><Button type="button" size="icon" onClick={() => void copyShareLink()} aria-label="Copy workspace link">{copied ? <Check /> : <Copy />}</Button></div>
        </DialogContent>
      </Dialog>

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
