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
import { Fraunces } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "400",
});
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

function todayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(new Date())
    .toUpperCase();
}

export default function WelcomePage() {
  return (
    <section className="mx-auto w-full max-w-[1080px] px-5 pb-14 pt-8 sm:px-8 sm:pt-10 lg:px-10 lg:pt-12">
      <div className="mb-10 sm:mb-12">
        <p className="mb-1.5 font-serif text-[15px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
          {todayLabel()}
        </p>
        <h1
          className={`${fraunces.className} text-[53px] leading-none tracking-[-0.035em] text-foreground sm:text-[90px]`}
        >
          Good morning, Yusuf.
        </h1>
      </div>

      <WelcomeComposer />

      <div className="mt-12 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)] lg:gap-14">
        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2
                id="recent-heading"
                className="text-lg font-semibold tracking-[-0.015em]"
              >
                Continue where you left off
              </h2>
              <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </span>
            </div>
            <Link
              href="/history"
              className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              All activity <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <RecentChats />
        </section>

        <section aria-labelledby="pinned-heading">
          <div className="mb-4 flex items-center justify-between">
            <h2
              id="pinned-heading"
              className="text-lg font-semibold tracking-[-0.015em]"
            >
              Pinned
            </h2>
            <Link
              href="/library"
              className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              All <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {pinnedItems.map(({ title, detail, icon: Icon }) => (
              <div
                key={title}
                className="group flex items-center gap-3 rounded-xl border bg-surface/70 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-raised text-slate">
                  <Icon className="size-[18px]" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{title}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {detail}
                  </p>
                </div>
                <Pin className="size-3.5 text-foreground" strokeWidth={1.5} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
