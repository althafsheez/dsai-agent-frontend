import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Conversation" };
export default function Page() {
  return <PlaceholderPage title="Conversation" description="Your questions, data and execution history in one place." next="The shared chat interface and agent streaming are planned for the next phases." />;
}

