import Image from "next/image";
import { useEffect, useState } from "react";
import { getResourcePreview } from "@/lib/api";
import type { ArtifactResource } from "./types";

interface ImagePreviewProps {
  artifact: ArtifactResource;
}

export function ImagePreview({ artifact }: ImagePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!artifact.preview_url) return;
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    void getResourcePreview(artifact.preview_url).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact.preview_url]);

  if (!artifact.preview_url || failed) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Image preview unavailable.</div>;
  if (!url) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Loading image preview…</div>;

  return (
    <div className="relative min-h-56 w-full overflow-hidden rounded-md border bg-background">
      <Image src={url} alt={`Preview of ${artifact.name}`} fill sizes="320px" className="object-contain" unoptimized />
    </div>
  );
}
