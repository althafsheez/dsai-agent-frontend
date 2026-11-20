import React from "react";
import {
  AlertCircle,
  BarChart2,
  Columns,
  Database,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  Table2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DataReferenceResource = {
  id: string;
  name: string;
  kind?: string;
  resourceType?: "dataset" | "artifact" | "table" | "file";
};

/**
 * Resolves a reference name or ID against known chat datasets and artifacts.
 */
export function resolveResource(
  target: string,
  availableResources: DataReferenceResource[] = []
): { resource?: DataReferenceResource; isAvailable: boolean } {
  const normalized = target.trim().toLowerCase();

  // 1. Direct ID match
  const byId = availableResources.find((r) => r.id === target || r.id.toLowerCase() === normalized);
  if (byId) return { resource: byId, isAvailable: true };

  // 2. Direct exact name match
  const byName = availableResources.find((r) => r.name.toLowerCase() === normalized);
  if (byName) return { resource: byName, isAvailable: true };

  // 3. Basename / extension-agnostic match
  const byBasename = availableResources.find(
    (r) => r.name.toLowerCase().includes(normalized) || normalized.includes(r.name.toLowerCase())
  );
  if (byBasename) return { resource: byBasename, isAvailable: true };

  // If availableResources were provided and no match was found, it's missing/unavailable
  if (availableResources.length > 0) {
    return { isAvailable: false };
  }

  // Fallback: If no availableResources catalog is loaded yet, assume the target might be valid
  return {
    resource: { id: target, name: target },
    isAvailable: true,
  };
}

/**
 * Clickable reference chip for datasets, artifacts, query tables, and files.
 */
export function DataReferenceChip({
  kind,
  name,
  resourceId,
  isAvailable = true,
  onSelect,
}: {
  kind: "dataset" | "artifact" | "table" | "file";
  name: string;
  resourceId?: string;
  isAvailable?: boolean;
  onSelect?: (id: string) => void;
}) {
  const getIcon = () => {
    if (!isAvailable) return FileQuestion;
    if (kind === "dataset") return Database;
    if (kind === "table") return Table2;
    if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".parquet")) return FileSpreadsheet;
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".svg")) return BarChart2;
    return FileText;
  };

  const Icon = getIcon();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAvailable && resourceId && onSelect) {
      onSelect(resourceId);
    }
  };

  if (!isAvailable) {
    return (
      <span
        role="status"
        aria-label={`${name} (resource unavailable)`}
        title="This resource is not available or has been deleted"
        className="inline-flex items-center gap-1.5 mx-1 my-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-raised/50 text-muted-foreground border border-dashed border-border/80 cursor-not-allowed select-none align-middle"
      >
        <AlertCircle className="size-3 shrink-0 text-amber-400/70" />
        <span className="truncate max-w-[180px]">{name}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-normal">
          unavailable
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Open data reference: ${name}`}
      className={cn(
        "inline-flex items-center gap-1.5 mx-1 my-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 align-middle shadow-xs",
        "bg-sage/10 text-sage hover:bg-sage/20 hover:text-sage-light border border-sage/30 active:scale-[0.98] cursor-pointer"
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate max-w-[200px]">{name}</span>
    </button>
  );
}

/**
 * Non-clickable highlighted badge for metrics, currencies, percentages, and column names.
 */
export function HighlightedValue({
  type,
  value,
  label,
}: {
  type: "currency" | "percent-positive" | "percent-negative" | "percent" | "column" | "metric" | "result";
  value: string;
  label?: string;
}) {
  if (type === "percent-positive") {
    return (
      <span className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11.5px] font-medium align-middle">
        <TrendingUp className="size-3 shrink-0" aria-hidden="true" />
        {label ? <span className="font-sans text-[10px] text-muted-foreground mr-0.5">{label}:</span> : null}
        {value}
      </span>
    );
  }

  if (type === "percent-negative") {
    return (
      <span className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[11.5px] font-medium align-middle">
        <TrendingDown className="size-3 shrink-0" aria-hidden="true" />
        {label ? <span className="font-sans text-[10px] text-muted-foreground mr-0.5">{label}:</span> : null}
        {value}
      </span>
    );
  }

  if (type === "currency") {
    return (
      <span className="inline-block mx-0.5 px-1.5 py-0.2 rounded bg-surface text-foreground font-semibold border border-border-strong font-mono text-[11.5px] align-middle shadow-2xs">
        {value}
      </span>
    );
  }

  if (type === "column") {
    return (
      <span className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono text-[11px] align-middle">
        <Columns className="size-2.5 shrink-0 text-sky-400" aria-hidden="true" />
        {value}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-surface text-foreground font-medium border border-border font-mono text-[11.5px] align-middle">
      {label ? <span className="font-sans text-[10px] text-muted-foreground">{label}:</span> : null}
      {value}
    </span>
  );
}

/**
 * Parses inline text with data references, highlighted values, bold, and code.
 * Streaming-safe: unclosed brackets or incomplete tokens fall through gracefully.
 */
export function renderRichText(
  text: string,
  availableResources: DataReferenceResource[] = [],
  onFileSelect?: (id: string) => void
): React.ReactNode {
  // Master regex matching:
  // 1. Markdown Links with dataset:/artifact: schema: [Label](dataset:id_or_name)
  // 2. Explicit data references: [(dataset|artifact|table|file):target]
  // 3. File references with extension in brackets: [sales.csv]
  // 4. Explicit metric/column/result tags: [(metric|column|result):value]
  // 5. Currency figures: $1,250,000, $4.2M, €45K, £100B
  // 6. Signed/unsigned percentages: +14.5%, -5.2%, 28.4%
  // 7. Markdown bold (**text**)
  // 8. Markdown inline code (`code`)
  const pattern = /(?:\[([^\]]+)\]\((dataset|artifact):([^)]+)\))|(?:\[(dataset|artifact|table|file):([^\]]+)\])|(?:\[([a-zA-Z0-9_\-./ ]+\.(?:csv|tsv|parquet|xlsx|json|png|jpg|jpeg|svg|pdf))\])|(?:\[(metric|column|result):([^\]]+)\])|(\$|€|£|¥)(?:\s?\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbBtT](?:\+|-)?|\b))|(?:(\+|-)\d+(?:\.\d+)?%)|(\*\*[^*]+\*\*)|(`[^`]+`)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = pattern.lastIndex;

    // Plain text before match
    if (matchStart > lastIndex) {
      elements.push(text.slice(lastIndex, matchStart));
    }

    const [
      fullMatch,
      linkText,
      linkKind,
      linkTarget,
      explicitKind,
      explicitTarget,
      fileRefName,
      tagType,
      tagContent,
      currencySymbol,
      percentSign,
      boldText,
      inlineCode,
    ] = match;

    const key = `ref-${matchStart}-${matchEnd}`;

    // Case 1: Markdown link with scheme [Label](dataset:target)
    if (linkText && linkKind && linkTarget) {
      const resolved = resolveResource(linkTarget, availableResources);
      elements.push(
        <DataReferenceChip
          key={key}
          kind={linkKind as "dataset" | "artifact"}
          name={linkText}
          resourceId={resolved.resource?.id ?? linkTarget}
          isAvailable={resolved.isAvailable}
          onSelect={onFileSelect}
        />
      );
    }
    // Case 2: Explicit [(dataset|artifact|table|file):target]
    else if (explicitKind && explicitTarget) {
      const parts = explicitTarget.split(":");
      const target = parts[0];
      const displayName = parts[1] || parts[0];
      const resolved = resolveResource(target, availableResources);
      elements.push(
        <DataReferenceChip
          key={key}
          kind={explicitKind as "dataset" | "artifact" | "table" | "file"}
          name={displayName}
          resourceId={resolved.resource?.id ?? target}
          isAvailable={resolved.isAvailable}
          onSelect={onFileSelect}
        />
      );
    }
    // Case 3: Bracketed filename [filename.ext]
    else if (fileRefName) {
      const isDataset = /\.(csv|tsv|parquet|xlsx|json)$/i.test(fileRefName);
      const kind = isDataset ? "dataset" : "artifact";
      const resolved = resolveResource(fileRefName, availableResources);
      elements.push(
        <DataReferenceChip
          key={key}
          kind={kind}
          name={fileRefName}
          resourceId={resolved.resource?.id ?? fileRefName}
          isAvailable={resolved.isAvailable}
          onSelect={onFileSelect}
        />
      );
    }
    // Case 4: Explicit tag [(metric|column|result):value]
    else if (tagType && tagContent) {
      if (tagType === "column") {
        elements.push(<HighlightedValue key={key} type="column" value={tagContent.trim()} />);
      } else if (tagType === "metric" || tagType === "result") {
        const parts = tagContent.split(":");
        const label = parts.length > 1 ? parts[0].trim() : undefined;
        const val = (parts.length > 1 ? parts.slice(1).join(":") : parts[0]).trim();
        const isPos = val.startsWith("+");
        const isNeg = val.startsWith("-");
        const isPct = val.endsWith("%");
        const type = isPct && isPos ? "percent-positive" : isPct && isNeg ? "percent-negative" : "metric";
        elements.push(<HighlightedValue key={key} type={type} value={val} label={label} />);
      }
    }
    // Case 5: Currency value ($4.2M, €50,000, etc.)
    else if (currencySymbol) {
      elements.push(<HighlightedValue key={key} type="currency" value={fullMatch} />);
    }
    // Case 6: Signed percentage (+14.5%, -5.2%)
    else if (percentSign) {
      elements.push(
        <HighlightedValue
          key={key}
          type={percentSign === "+" ? "percent-positive" : "percent-negative"}
          value={fullMatch}
        />
      );
    }
    // Case 7: Bold markdown
    else if (boldText) {
      elements.push(
        <strong key={key} className="font-semibold text-foreground">
          {boldText.slice(2, -2)}
        </strong>
      );
    }
    // Case 8: Inline code
    else if (inlineCode) {
      elements.push(
        <code key={key} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em]">
          {inlineCode.slice(1, -1)}
        </code>
      );
    }

    lastIndex = matchEnd;
  }

  // Remainder plain text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <>{elements}</>;
}
