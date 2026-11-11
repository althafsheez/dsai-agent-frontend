export interface PendingRun {
  chatId: string;
  userMessageId: string;
  modelId: string;
  effort: string | null;
  clientRequestId: string;
}

const key = (chatId: string) => `dsai:pending-run:${chatId}`;

export function savePendingRun(run: PendingRun): void {
  window.sessionStorage.setItem(key(run.chatId), JSON.stringify(run));
}

export function takePendingRun(chatId: string): PendingRun | null {
  const storageKey = key(chatId);
  const value = window.sessionStorage.getItem(storageKey);
  if (!value) return null;
  window.sessionStorage.removeItem(storageKey);
  try {
    return JSON.parse(value) as PendingRun;
  } catch {
    return null;
  }
}
