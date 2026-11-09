"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Menu } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./app-sidebar";
import { SearchDialog } from "./search-dialog";
import { navigation } from "./navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const pathname = usePathname();
  const isChat = pathname.startsWith("/chat/");
  const menuButton = useRef<HTMLButtonElement>(null);
  const title = pathname === "/" ? "New Analysis" : navigation.find((item) => pathname.startsWith(item.href))?.label ?? (pathname.startsWith("/chat/") ? "Conversation" : "Settings");

  return <div className="flex h-dvh min-h-0">
    <a href="#main-content" className="sr-only z-[70] rounded bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
    <aside aria-label="Global sidebar" className={cn("hidden shrink-0 border-r md:block", collapsed ? "w-14" : "w-60")}><SidebarContent /></aside>
    <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-64 border-r" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuButton.current?.focus(); }}>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <SidebarContent mobile />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <div className="flex min-w-0 flex-1 flex-col">
      {!isChat && <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
        <Button ref={menuButton} variant="ghost" size="icon" aria-label="Open navigation" aria-expanded={mobileOpen} className="md:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button>
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className="ml-auto rounded border px-2 py-1 text-[10px] text-muted-foreground">Frontend preview</span>
        <div className="md:hidden"><SearchDialog onNavigate={() => setMobileOpen(false)} /></div>
      </header>}
      <main id="main-content" tabIndex={-1} className={cn("flex min-h-0 flex-1 flex-col outline-none", isChat ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
    </div>
  </div>;
}
