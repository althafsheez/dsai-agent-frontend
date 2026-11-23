"use client";

import { Globe, Lock, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usePeople } from "../use-dashboards";
import type { Dashboard } from "../types";

type Share = NonNullable<Dashboard["shares"]>[number];

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: Dashboard["status"];
  shares: Share[];
  saving?: boolean;
  onChange: (next: { status: Dashboard["status"]; shares: Array<{ user_id: string; role: "viewer" | "editor" }> }) => void;
}

const plain = (shares: Share[]) => shares.map(({ user_id, role }) => ({ user_id, role }));

/** Owner-only: who can open the dashboard and who can change it. */
export function ShareDialog({ open, onOpenChange, status, shares, saving, onChange }: ShareDialogProps) {
  const people = usePeople(open);
  const named = (id: string) => people.data?.find((person) => person.id === id)?.name ?? shares.find((share) => share.user_id === id)?.name ?? id;
  const addable = (people.data ?? []).filter((person) => !shares.some((share) => share.user_id === person.id));
  const select = "h-8 rounded-md border bg-surface px-1.5 text-xs";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <DialogTitle className="text-sm font-semibold">Share dashboard</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">Viewers can open it. Editors can also change charts and filters. Only you can share or delete it.</DialogDescription>

        <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
          {status === "published" ? <Globe className="size-4 shrink-0 text-emerald-300" /> : <Lock className="size-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">General access</p>
            <p className="text-[11px] text-muted-foreground">{status === "published" ? "Everyone on the team can view this dashboard." : "Only you and the people below can open it."}</p>
          </div>
          <select aria-label="General access" value={status} disabled={saving} onChange={(event) => onChange({ status: event.target.value as Dashboard["status"], shares: plain(shares) })} className={select}>
            <option value="draft">Restricted</option>
            <option value="published">Team can view</option>
          </select>
        </div>

        <h3 className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">People</h3>
        {shares.length ? (
          <ul className="space-y-1.5" aria-label="People with access">
            {shares.map((share) => (
              <li key={share.user_id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs">{named(share.user_id)}</span>
                <select aria-label={`Role for ${named(share.user_id)}`} value={share.role} disabled={saving} onChange={(event) => onChange({ status, shares: plain(shares).map((item) => (item.user_id === share.user_id ? { ...item, role: event.target.value as "viewer" | "editor" } : item)) })} className={select}>
                  <option value="viewer">Can view</option>
                  <option value="editor">Can edit</option>
                </select>
                <button type="button" aria-label={`Remove ${named(share.user_id)}`} disabled={saving} onClick={() => onChange({ status, shares: plain(shares).filter((item) => item.user_id !== share.user_id) })} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-red-300"><X className="size-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">Not shared with anyone yet.</p>}

        {addable.length ? (
          <select aria-label="Add person" value="" disabled={saving} onChange={(event) => event.target.value && onChange({ status, shares: [...plain(shares), { user_id: event.target.value, role: "viewer" }] })} className={`${select} mt-3 w-full border-dashed text-muted-foreground`}>
            <option value="">+ Add a person</option>
            {addable.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
