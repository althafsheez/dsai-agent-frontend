"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  getWorkspaceInvites,
  inviteToWorkspace,
  removeWorkspaceInvite,
  updateWorkspaceInvite,
  type WorkspaceRole,
} from "@/lib/api";

const ROLE_LABELS: Record<WorkspaceRole, string> = { viewer: "Can view", editor: "Can edit" };

function RoleSelect({ value, onChange, label, disabled }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void; label: string; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as WorkspaceRole)}
      className="h-9 rounded-md border bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-border-strong disabled:opacity-60"
    >
      {(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
    </select>
  );
}

interface ShareWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  /** What the person is sharing; a Library folder and a chat both share their workspace. */
  subject?: "workspace" | "folder" | "chat" | "datasets";
}

const SUBJECT_COPY: Record<NonNullable<ShareWorkspaceDialogProps["subject"]>, { title: string; description: (name: string) => string }> = {
  workspace: { title: "Share workspace", description: (name) => `Invite people to ${name}. Access covers its chats, datasets and saved files.` },
  folder: { title: "Share folder", description: (name) => `Sharing this folder gives access to the ${name} workspace and every file in it.` },
  datasets: { title: "Share datasets", description: (name) => `Sharing these datasets gives access to the ${name} workspace and every file in it.` },
  chat: { title: "Share chat", description: (name) => `This chat lives in ${name}. Invited people get access to the whole workspace.` },
};

export function ShareWorkspaceDialog({ open, onOpenChange, workspaceId, workspaceName, subject = "workspace" }: ShareWorkspaceDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("viewer");
  const [copied, setCopied] = useState(false);
  const queryKey = ["workspace", workspaceId, "invites"];
  const invitesQuery = useQuery({ queryKey, queryFn: () => getWorkspaceInvites(workspaceId), enabled: open });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; role: WorkspaceRole }) => inviteToWorkspace(workspaceId, input),
    onSuccess: async () => { setEmail(""); await refresh(); },
  });
  const roleMutation = useMutation({
    mutationFn: ({ inviteId, nextRole }: { inviteId: string; nextRole: WorkspaceRole }) => updateWorkspaceInvite(workspaceId, inviteId, nextRole),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({
    mutationFn: (inviteId: string) => removeWorkspaceInvite(workspaceId, inviteId),
    onSuccess: refresh,
  });

  const shareUrl = `/workspaces/${workspaceId}`;
  const copy = SUBJECT_COPY[subject];
  const invites = invitesQuery.data?.items ?? [];
  const error = inviteMutation.error ?? roleMutation.error ?? removeMutation.error ?? invitesQuery.error;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (normalized) inviteMutation.mutate({ email: normalized, role });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="pr-8">
          <DialogTitle className="text-base font-semibold">{copy.title}</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">{copy.description(workspaceName)}</DialogDescription>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`share-email-${workspaceId}`}>Email address</label>
          <input
            id={`share-email-${workspaceId}`}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Add people by email"
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border-strong"
          />
          <RoleSelect value={role} onChange={setRole} label="Access for new person" />
          <Button type="submit" disabled={!email.trim() || inviteMutation.isPending}>
            {inviteMutation.isPending ? <LoaderCircle className="animate-spin" /> : null}Invite
          </Button>
        </form>
        {error ? <p role="alert" className="mt-2 text-[11px] text-red-300">{error instanceof Error ? error.message : "Sharing failed."}</p> : null}

        <section className="mt-5" aria-labelledby={`share-people-${workspaceId}`}>
          <h3 id={`share-people-${workspaceId}`} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">People with access</h3>
          <ul className="mt-2 divide-y rounded-md border">
            <li className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">You</span>
              <span className="min-w-0 flex-1 truncate text-xs">You</span>
              <span className="text-[11px] text-muted-foreground">Owner</span>
            </li>
            {invitesQuery.isLoading ? <li className="px-3 py-3 text-xs text-muted-foreground">Loading…</li> : null}
            {invites.map((invite) => (
              <li key={invite.id} className="flex animate-pop-in items-center gap-3 px-3 py-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-raised text-muted-foreground"><Mail className="size-3.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">{invite.email}</span>
                  <span className="block text-[10px] text-muted-foreground">Invited · pending</span>
                </span>
                <RoleSelect
                  value={invite.role}
                  label={`Access for ${invite.email}`}
                  disabled={roleMutation.isPending}
                  onChange={(nextRole) => roleMutation.mutate({ inviteId: invite.id, nextRole })}
                />
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(invite.id)}
                  aria-label={`Remove ${invite.email}`}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Invitations are saved here. Email delivery and sign-in for invitees arrive with real accounts.</p>
        </section>

        <div className="mt-4 flex gap-2 border-t pt-4">
          <input readOnly value={shareUrl} aria-label="Workspace share link" className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-xs text-muted-foreground outline-none" />
          <Button type="button" variant="outline" onClick={() => void copyLink()} aria-label="Copy workspace link">
            {copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
