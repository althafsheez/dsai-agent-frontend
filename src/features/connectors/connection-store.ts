import { readMockEnvelope, updateMockEnvelope } from "@/lib/mock/mock-store";

// Demo only: a connection is a saved on/off flag. No credentials are collected and no data source is contacted.
export function readConnected(): string[] {
  const stored = readMockEnvelope().connectorsDemo;
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

export function writeConnected(ids: string[]): void {
  try { updateMockEnvelope((current) => ({ ...current, connectorsDemo: ids })); } catch { /* storage unavailable: demo works per session */ }
}

export const toggleId = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
