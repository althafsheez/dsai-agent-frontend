import type { ArtifactResource } from "./types";

interface PDFPreviewProps {
  artifact: ArtifactResource;
}

export function PDFPreview({ artifact }: PDFPreviewProps) {
  if (!artifact.preview_url) return <div className="grid min-h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">PDF preview unavailable.</div>;
  return <iframe src={artifact.preview_url} title={`Preview of ${artifact.name}`} className="h-[520px] w-full rounded-md border bg-white" />;
}
