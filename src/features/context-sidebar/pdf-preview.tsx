import { useEffect, useState } from "react";
import { getResourcePreview } from "@/lib/api";
import type { ArtifactResource } from "./types";

interface PDFPreviewProps {
  artifact: ArtifactResource;
}

export function PDFPreview({ artifact }: PDFPreviewProps) {
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

  if (!artifact.preview_url || failed) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">PDF preview unavailable.</div>;
  if (!url) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Loading PDF preview…</div>;
  return <iframe src={url} title={`Preview of ${artifact.name}`} className="h-[520px] w-full rounded-md border bg-white" />;
}
