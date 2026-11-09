import { WelcomeComposer } from "@/features/chat/components/welcome-composer";
import { ChartNoAxesCombined } from "lucide-react";

export default function WelcomePage() {
  return <section className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-5 py-12 sm:px-8">
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="mb-6 grid size-11 place-items-center rounded-xl border bg-surface"><ChartNoAxesCombined className="size-5 text-sage" strokeWidth={1.5} /></div>
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Your analysis starts here</p>
      <h1 className="text-[28px] font-medium tracking-[-0.035em] sm:text-[34px]">What would you like to understand?</h1>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">Bring your data. Ask a question. Find the story behind the numbers.</p>
    </div>
    <WelcomeComposer />
    <div className="h-10 shrink-0 sm:h-16" />
  </section>;
}

