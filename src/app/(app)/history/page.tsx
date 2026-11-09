import type { Metadata } from "next";
import { Suspense } from "react";
import { HistoryPage } from "@/features/history/components/history-page";
export const metadata: Metadata = { title: "History" };
export default function Page() {
  return <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-6 py-10 text-xs text-muted-foreground">Loading history…</div>}><HistoryPage /></Suspense>;
}
