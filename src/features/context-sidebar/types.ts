export type ResourceOrigin = "uploaded" | "generated";

export type DatasetScope = "workspace" | "chat";

export interface DatasetColumn {
  name: string;
  data_type: string;
}

export type DatasetCell = string | number | boolean | null;

export interface DatasetResource {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  origin: ResourceOrigin;
  preview_url: string | null;
  download_url: string;
  created_by: string;
  created_at: string;
  row_count: number | null;
  column_count: number | null;
  columns?: DatasetColumn[];
  preview_rows?: DatasetCell[][];
  scope_type: DatasetScope;
  run_id: string | null;
}

export type ArtifactKind = "image" | "chart" | "pdf" | "report" | "document" | "code" | "file";

export interface ArtifactResource {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  origin: ResourceOrigin;
  preview_url: string | null;
  download_url: string;
  kind: ArtifactKind;
  created_by: string;
  created_at: string;
  run_id: string | null;
  saved: boolean;
}

export type ContextFile = DatasetResource | ArtifactResource;

export function isDatasetResource(file: ContextFile): file is DatasetResource {
  return "scope_type" in file;
}

export interface ContextSidebarProps {
  chatId: string;
  workspaceId: string | null;
  datasets: DatasetResource[];
  artifacts: ArtifactResource[];
  onClose: () => void;
  onFileSelect: (file: ContextFile) => void;
}
