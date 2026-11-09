export const MOCK_STORAGE_KEY = "dsai.mock.data.v1";

export interface MockEnvelope {
  version: 1;
  [section: string]: unknown;
}

export function readMockEnvelope(): MockEnvelope {
  if (typeof window === "undefined") return { version: 1 };
  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return { version: 1 };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1) return { version: 1 };
    return parsed as MockEnvelope;
  } catch {
    return { version: 1 };
  }
}

export function writeMockEnvelope(envelope: MockEnvelope): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify({ ...envelope, version: 1 }));
}

export function updateMockEnvelope(update: (current: MockEnvelope) => MockEnvelope): MockEnvelope {
  const next = update(readMockEnvelope());
  writeMockEnvelope(next);
  return next;
}
