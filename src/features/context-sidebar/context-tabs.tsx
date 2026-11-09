"use client";

import { cn } from "@/lib/utils";

export type ContextTab = "datasets" | "artifacts";

interface ContextTabsProps {
  value: ContextTab;
  onValueChange: (value: ContextTab) => void;
}

const tabs: { value: ContextTab; label: string }[] = [
  { value: "datasets", label: "Datasets" },
  { value: "artifacts", label: "Artifacts" },
];

export function ContextTabs({ value, onValueChange }: ContextTabsProps) {
  return (
    <div className="grid grid-cols-2 border-b px-4" role="tablist" aria-label="Context resources">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          aria-controls={`${tab.value}-panel`}
          className={cn(
            "relative h-11 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === tab.value && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-foreground",
          )}
          onClick={() => onValueChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
