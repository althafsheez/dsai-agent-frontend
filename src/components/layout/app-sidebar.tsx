"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings, X } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Brand } from "./brand";
import { SearchDialog } from "./search-dialog";
import { SidebarSection } from "./sidebar-section";
import { SidebarNavItem } from "./sidebar-nav-item";
import { navigation } from "./navigation";

export function SidebarContent({ mobile = false }: { mobile?: boolean }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const compact = collapsed && !mobile;
  const closeMobile = () => { if (mobile) setMobileOpen(false); };

  return <div className="flex h-full flex-col bg-sidebar">
    <div className={compact ? "flex h-16 items-center justify-center" : "flex h-16 items-center gap-1 px-4"}>
      {!compact && <Link href="/" onClick={closeMobile} aria-label="Atelier AI home" className="mr-auto rounded"><Brand /></Link>}
      {!compact && !mobile && <SearchDialog />}
      <Button variant="ghost" size="icon" onClick={mobile ? closeMobile : toggleSidebar} aria-label={mobile ? "Close navigation" : compact ? "Expand sidebar" : "Collapse sidebar"}>
        {mobile ? <X /> : compact ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
    </div>
    <div className={compact ? "px-2" : "px-3"}>
      <Button asChild size="sm" className={compact ? "w-full px-0" : "w-full justify-start"}>
        <Link href="/" onClick={closeMobile} aria-label="New Analysis"><Plus />{!compact && "New Analysis"}</Link>
      </Button>
      {compact && <div className="mt-2 flex justify-center"><SearchDialog /></div>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-6">
      {!compact && <p className="mb-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Workspace</p>}
      <nav aria-label="Main navigation" className="space-y-0.5">
        {navigation.map((item) => <SidebarNavItem key={item.href} {...item} compact={compact} onNavigate={closeMobile} />)}
      </nav>
      {!compact && <div className="px-0.5">
        <SidebarSection title="Pinned"><p className="text-xs leading-relaxed text-muted-foreground">Keep important work close.<br />Your pinned items will appear here.</p></SidebarSection>
        <SidebarSection title="Activity"><div className="flex items-start gap-2 text-xs text-muted-foreground"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-border-strong" /><span>All quiet for now.</span></div></SidebarSection>
      </div>}
    </div>
    <div className={compact ? "flex flex-col items-center gap-2 border-t py-3" : "flex items-center gap-2.5 border-t px-4 py-3"}>
      <Link href="/login" onClick={closeMobile} aria-label="Demo user account" className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong bg-raised text-[10px] font-medium">DU</Link>
      {!compact && <div className="min-w-0 flex-1"><p className="text-xs font-medium">Demo user</p><p className="mt-0.5 text-[10px] text-muted-foreground">Personal workspace</p></div>}
      <Button asChild variant="ghost" size="icon"><Link href="/settings" onClick={closeMobile} aria-label="Settings"><Settings strokeWidth={1.5} /></Link></Button>
    </div>
  </div>;
}
