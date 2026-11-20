import { WelcomeComposer } from "@/features/landing/components/welcome-composer";
import { RecentChats } from "@/features/landing/components/recent-chats";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PinnedOverview } from "@/features/pinning";

export default function WelcomePage() {
  return (
    <section className="mx-auto w-full max-w-[980px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-10">
      <div className="mb-8 text-center sm:mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Welcome back
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl lg:text-[34px]">
          What would you like to analyze?
        </h1>
      </div>

      <WelcomeComposer />

      <div className="mt-12 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] lg:gap-10">
        <section aria-labelledby="recent-heading">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2
                id="recent-heading"
                className="text-sm font-semibold tracking-[-0.01em] text-foreground"
              >
                Continue where you left off
              </h2>
            </div>
            <Link
              href="/history"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All activity <ArrowRight className="size-3" />
            </Link>
          </div>
          <RecentChats />
        </section>

        <section aria-labelledby="pinned-heading">
          <div className="mb-3.5 flex items-center justify-between">
            <h2
              id="pinned-heading"
              className="text-sm font-semibold tracking-[-0.01em] text-foreground"
            >
              Pinned
            </h2>
            <Link
              href="/library"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All <ArrowRight className="size-3" />
            </Link>
          </div>
          <PinnedOverview />
        </section>
      </div>
    </section>
  );
}
