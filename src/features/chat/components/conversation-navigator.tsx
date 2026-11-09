"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import type { ChatMessage, UserMessage } from "../types";
import { cn } from "@/lib/utils";

export function ConversationNavigator({ messages, activeId, onNavigate }: { messages: ChatMessage[]; activeId?: string; onNavigate: (id: string) => void }) {
  const questions = messages.filter((message): message is UserMessage => message.role === "user");
  return <nav aria-label="Conversation sections" className="hidden w-11 shrink-0 flex-col items-center border-r py-5 sm:flex">
    <span className="mb-4 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Q</span>
    <div className="flex w-full flex-col items-center gap-3">{questions.map((question) => {
      const questionIndex = messages.findIndex((message) => message.id === question.id);
      const answer = messages.slice(questionIndex + 1).find((message) => message.role === "assistant");
      const answerPreview = answer?.role === "assistant" && answer.blocks.find((block) => block.type === "markdown");
      return <HoverCard.Root key={question.id} openDelay={180} closeDelay={80}>
        <HoverCard.Trigger asChild><button onClick={() => onNavigate(question.id)} aria-label={`Go to question: ${question.content}`} aria-current={activeId === question.id ? "location" : undefined} className={cn("h-1.5 w-4 rounded-full bg-border-strong transition-all hover:w-6 hover:bg-muted-foreground", activeId === question.id && "w-6 bg-sage")} /></HoverCard.Trigger>
        <HoverCard.Portal><HoverCard.Content side="right" sideOffset={12} className="z-50 w-64 rounded-lg border bg-surface p-3 shadow-xl">
          <p className="line-clamp-2 text-xs font-medium leading-5">{question.content}</p>
          {answerPreview?.type === "markdown" && <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{answerPreview.content.replace(/[#*`]/g, "")}</p>}
          <time className="mt-2 block text-[10px] text-muted-foreground">{new Date(question.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </HoverCard.Content></HoverCard.Portal>
      </HoverCard.Root>;
    })}</div>
  </nav>;
}
