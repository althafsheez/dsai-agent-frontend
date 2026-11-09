export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatCount(value: number | null, singular: string, plural = `${singular}s`): string {
  if (value === null) return `${singular} count pending`;
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}
