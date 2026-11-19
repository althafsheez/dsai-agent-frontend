"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { searchablePages } from "./navigation";

export function SearchDialog({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const results = searchablePages.filter((page) =>
    page.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search pages"
          title="Search pages (⌘K or Ctrl+K)"
          className="size-8 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Search className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-popover p-0 shadow-2xl">
        <div className="border-b px-5 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold tracking-tight">Search your workspace</DialogTitle>
            <kbd className="rounded border bg-raised px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              Esc
            </kbd>
          </div>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            Navigate to any page or feature. Conversation search will be available with chat history.
          </DialogDescription>
        </div>
        <div className="p-4">
          <label className="flex items-center gap-2.5 rounded-md border bg-surface px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search pages</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages…"
              className="h-10 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto" aria-live="polite">
            {results.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  onNavigate?.();
                }}
                className="group flex items-center justify-between rounded-md px-3 py-2 text-xs transition-colors hover:bg-surface"
              >
                <div>
                  <span className="block font-medium text-foreground group-hover:text-foreground">
                    {page.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {page.description}
                  </span>
                </div>
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" />
              </Link>
            ))}
            {results.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No pages match “{query}”.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
