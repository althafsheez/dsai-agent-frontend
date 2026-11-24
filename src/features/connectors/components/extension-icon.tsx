import Image from "next/image";
import { cn } from "@/lib/utils";
import type { ConnectorPreview } from "../catalog";

export function ExtensionIcon({ extension, large = false, compact = false }: { extension: ConnectorPreview; large?: boolean; compact?: boolean }) {
  const Icon = extension.icon;
  const logoSize = large ? 34 : compact ? 16 : 22;
  const iconStyle = extension.id === "postgresql" ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
    : extension.id === "google-drive" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
    : extension.category === "skill" ? "border-violet-400/20 bg-violet-400/10 text-violet-300"
    : "bg-raised text-foreground";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl border", large ? "size-12" : compact ? "size-8 rounded-md" : "size-11", iconStyle)}>
      {extension.logo ? (
        <Image src={`/extension-logos/${extension.logo}.svg`} alt="" width={logoSize} height={logoSize} unoptimized />
      ) : (
        <Icon aria-hidden="true" className={large ? "size-7" : compact ? "size-4" : "size-5"} strokeWidth={1.5} />
      )}
    </span>
  );
}
