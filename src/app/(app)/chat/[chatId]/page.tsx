import type { Metadata } from "next";
import { ChatPage } from "@/features/chat/components/chat-page";
export const metadata: Metadata = { title: "Conversation" };
export default async function Page({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  return <ChatPage chatId={chatId} />;
}
