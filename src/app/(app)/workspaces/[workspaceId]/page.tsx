import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
export const metadata: Metadata = { title: "Workspace" };
export default function Page() {
  return <PlaceholderPage title="Workspace" description="A shared place for this project’s datasets and analyses." next="Workspace details, linked chats and uploads will be connected in the next phase." />;
}

