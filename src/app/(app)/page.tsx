import { WelcomeComposer } from "@/features/landing/components/welcome-composer";
import { RecentChats } from "@/features/landing/components/recent-chats";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Folder,
  Network,
  Pin,
} from "lucide-react";

const pinnedItems = [
  {
    title: "Customer Churn Analysis",
    detail: "Workflow · 6 steps",
    icon: Network,
  },
  {
    title: "Revenue Overview",
    detail: "Dashboard · 4 charts",
    icon: BarChart3,
  },
  {
    title: "E-commerce Analytics",
    detail: "Workspace · 12 files",
    icon: Folder,
  },
] as const;

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
          <div className="space-y-2">
            {pinnedItems.map(({ title, detail, icon: Icon }) => (
              <div
                key={title}
                className="group flex items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-raised text-slate">
                  <Icon className="size-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {detail}
                  </p>
                </div>
                <Pin className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
