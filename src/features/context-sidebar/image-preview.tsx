import Image from "next/image";
import type { ArtifactResource } from "./types";

interface ImagePreviewProps {
  artifact: ArtifactResource;
}

export function ImagePreview({ artifact }: ImagePreviewProps) {
  if (!artifact.preview_url) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Image preview unavailable.</div>;

  return (
    <div className="relative min-h-56 w-full overflow-hidden rounded-md border bg-background">
      <Image src={artifact.preview_url} alt={`Preview of ${artifact.name}`} fill sizes="320px" className="object-contain" unoptimized />
    </div>
  );
}
