import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Library" };
export default function Page() {
  return <PlaceholderPage title="Library" description="A home for the artifacts you choose to keep." next="Saved charts, reports and files will appear here without duplicating the originals." />;
}

