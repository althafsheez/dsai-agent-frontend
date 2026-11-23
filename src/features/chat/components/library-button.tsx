import { BookOpen, Check } from "lucide-react";
import { useState } from "react";
import type { ContextFile } from "@/features/context-sidebar";

export function LibraryButton({ file, onToggle }: { file?: ContextFile; onToggle?: (file: ContextFile) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  if (!file || !onToggle) return null;
  const saved = file.in_library ?? file.saved ?? false;
  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${file.name} from Library` : `Add ${file.name} to Library`}
      aria-pressed={saved}
      title={saved ? "Remove from Library" : "Add to Library"}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try { await onToggle(file); } finally { setPending(false); }
      }}
      className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground disabled:opacity-50"
    >
      <BookOpen className="size-4" />
      {saved && <Check className="absolute bottom-0 right-0 size-3 rounded-full bg-sage text-sidebar" />}
    </button>
  );
}
