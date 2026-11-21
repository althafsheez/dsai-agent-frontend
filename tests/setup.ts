import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);


// Newer Node versions expose a localStorage stub that throws or is undefined without --localstorage-file.
// Install an in-memory Storage when the real one is not usable so storage-backed code can be tested.
function installStorage(name: "localStorage" | "sessionStorage") {
  try {
    window[name].getItem("__probe__");
    if (typeof window[name].clear === "function") return;
  } catch { /* fall through to the in-memory replacement */ }
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
  Object.defineProperty(window, name, { value: storage, configurable: true });
}
installStorage("localStorage");
installStorage("sessionStorage");
