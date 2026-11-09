"use client";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";

export function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Collapsible.Root defaultOpen className="mt-6">
    <Collapsible.Trigger className="group flex w-full items-center justify-between rounded px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.11em] text-muted-foreground hover:text-foreground">
      {title}<ChevronDown className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
    </Collapsible.Trigger>
    <Collapsible.Content className="px-2 pt-2">{children}</Collapsible.Content>
  </Collapsible.Root>;
}

