"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { searchablePages } from "./navigation";

export function SearchDialog({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchablePages.filter((page) => page.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery(""); }}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Search pages" title="Search pages"><Search /></Button></DialogTrigger>
    <DialogContent>
      <DialogTitle className="text-sm font-medium">Search your workspace</DialogTitle>
      <DialogDescription className="mt-1 text-xs text-muted-foreground">Navigate to a page. Conversation search will be available with chat history.</DialogDescription>
      <label className="mt-5 flex items-center gap-2 rounded-md border bg-background px-3">
        <Search className="size-4 text-muted-foreground" />
        <span className="sr-only">Search pages</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" className="h-10 w-full bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-3 max-h-72 space-y-1 overflow-y-auto" aria-live="polite">
        {results.map((page) => <Link key={page.href} href={page.href} onClick={() => { setOpen(false); setQuery(""); onNavigate?.(); }} className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-raised">
          <span><span className="block text-xs font-medium">{page.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{page.description}</span></span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </Link>)}
        {results.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No pages match “{query}”.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

