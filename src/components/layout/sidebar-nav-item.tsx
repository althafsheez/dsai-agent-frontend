"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string; href: string; icon: LucideIcon; flyout: boolean;
  compact: boolean; onNavigate?: () => void;
};
export function SidebarNavItem({ label, href, icon: Icon, flyout, compact, onNavigate }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = pathname === href || pathname.startsWith(href + "/");
  const link = <Link href={href} aria-label={compact ? label : undefined} aria-current={active ? "page" : undefined}
    onClick={() => { setOpen(false); onNavigate?.(); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
    className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors", compact && "justify-center px-0", active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
    {!compact && <span>{label}</span>}
  </Link>;
  if (!flyout && !compact) return link;
  return <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={300} closeDelay={100}>
    <HoverCard.Trigger asChild>{link}</HoverCard.Trigger>
    <HoverCard.Portal><HoverCard.Content side="right" align="start" sideOffset={12} className="z-50 w-56 rounded-lg border bg-surface p-3 shadow-xl" onEscapeKeyDown={() => setOpen(false)}>
      <p className="text-xs font-medium">{label}</p>
      {flyout && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">No recent items yet. Open {label.toLowerCase()} to get started.</p>}
    </HoverCard.Content></HoverCard.Portal>
  </HoverCard.Root>;
}

