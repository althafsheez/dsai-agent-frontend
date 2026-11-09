import { BookOpen, FolderKanban, History, LayoutDashboard, Plug, Workflow } from "lucide-react";

export const navigation = [
  { label: "Recent Analyses", href: "/history", icon: History, flyout: true },
  { label: "Workspaces", href: "/workspaces", icon: FolderKanban, flyout: true },
  { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard, flyout: true },
  { label: "Workflows", href: "/workflows", icon: Workflow, flyout: true },
  { label: "Library", href: "/library", icon: BookOpen, flyout: false },
  { label: "Connectors", href: "/connectors", icon: Plug, flyout: false },
] as const;
export const searchablePages = [
  { label: "New Analysis", href: "/", description: "Start with a question about your data" },
  ...navigation.map(({ label, href }) => ({ label, href, description: "Open " + label.toLowerCase() })),
  { label: "Settings", href: "/settings", description: "Application preferences" },
];

