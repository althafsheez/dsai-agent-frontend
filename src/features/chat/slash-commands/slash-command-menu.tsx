"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "./commands";

interface SlashCommandMenuProps {
  id: string;
  commands: SlashCommand[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (command: SlashCommand) => void;
}

export function slashOptionId(menuId: string, index: number) {
  return `${menuId}-option-${index}`;
}

export function SlashCommandMenu({ id, commands, activeIndex, onHover, onPick }: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`#${CSS.escape(slashOptionId(id, activeIndex))}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, id]);

  return (
    <div className="absolute inset-x-0 bottom-full z-30 mb-2 origin-bottom animate-pop-in overflow-hidden rounded-xl border border-border-strong bg-popover shadow-2xl">
      <div className="flex items-center justify-between border-b px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Commands</span>
        <span className="normal-case tracking-normal">↑↓ to move · Enter to run · Esc to close</span>
      </div>
      <div ref={listRef} id={id} role="listbox" aria-label="Slash commands" className="max-h-72 overflow-y-auto p-1">
        {commands.length === 0 ? <p className="px-3 py-3 text-xs text-muted-foreground">No matching command.</p> : null}
        {commands.map((command, index) => (
          <div
            key={command.name}
            id={slashOptionId(id, index)}
            role="option"
            aria-selected={index === activeIndex}
            aria-disabled={command.unavailable ? true : undefined}
            onMouseEnter={() => onHover(index)}
            // mousedown keeps focus in the composer so typing can continue.
            onMouseDown={(event) => { event.preventDefault(); onPick(command); }}
            className={cn(
              "flex cursor-pointer items-baseline gap-3 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              index === activeIndex ? "bg-raised text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="w-40 shrink-0 truncate font-mono text-[12px] text-foreground">
              /{command.name}
              {command.args ? <span className="text-muted-foreground"> {command.args}</span> : null}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", command.unavailable && "opacity-60")}>{command.description}</span>
            {command.aliases?.length ? <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">/{command.aliases.join(" /")}</span> : null}
            {command.unavailable ? <span className="shrink-0 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider text-muted-foreground">Soon</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
