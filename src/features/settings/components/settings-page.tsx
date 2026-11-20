"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UsageAnalytics } from "@/features/usage/usage-analytics";
import {
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  CreditCard,
  Database,
  FlaskConical,
  KeyRound,
  Laptop,
  MoreHorizontal,
  Pencil,
  ServerCog,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/utils";

type Detail = "profile" | "api" | "authentication" | "plan" | "usage";

const settingsCards: Array<{
  view: Detail;
  title: string;
  description: string;
  icon: typeof UserRound;
  badge?: string;
}> = [
  { view: "profile", title: "Profile and preferences", description: "Manage your identity, role, and personalization details.", icon: UserRound },
  { view: "api", title: "API configuration", description: "Review backend-managed model provider configuration.", icon: KeyRound },
  { view: "plan", title: "Your plan", description: "View the current preview plan, usage limits, and available tiers.", icon: CreditCard },
  { view: "usage", title: "Usage analytics", description: "Explore AI credits, disk space, and compute time.", icon: BarChart3, badge: "Sample data" },
];

const tabs: Array<{ value: Exclude<Detail, "plan" | "usage">; label: string }> = [
  { value: "profile", label: "Profile" },
  { value: "api", label: "API keys" },
  { value: "authentication", label: "Authentication" },
];

function DetailTabs({ view, onChange }: { view: Detail; onChange: (view: Detail) => void }) {
  if (view === "plan" || view === "usage") return null;
  return (
    <div role="tablist" aria-label="Account settings" className="mt-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={view === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "relative h-10 shrink-0 px-4 text-xs text-muted-foreground hover:text-foreground",
            view === tab.value && "bg-raised text-foreground font-medium after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-slate"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const roles = [
  { label: "Data Analyst", icon: BarChart3 },
  { label: "Data Scientist", icon: FlaskConical },
  { label: "ML Engineer", icon: Database },
  { label: "Business Analyst", icon: BriefcaseBusiness },
  { label: "Executive", icon: UsersRound },
  { label: "Developer", icon: Code2 },
  { label: "Other", icon: MoreHorizontal },
];

function ProfilePanel() {
  const { user } = useAuth();
  const [role, setRole] = useState("Business Analyst");
  const [saved, setSaved] = useState(false);

  return (
    <div role="tabpanel" className="mt-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-surface/50 p-5">
          <div className="flex items-center justify-between gap-4 border-b pb-3">
            <h2 className="text-base font-semibold tracking-tight">Identity details</h2>
            <Button type="button" variant="outline" size="sm" disabled title="Demo identity editing is not connected" className="text-xs h-7">
              <Pencil className="size-3" /> Edit
            </Button>
          </div>
          <dl className="mt-4 grid grid-cols-[120px_1fr] gap-x-5 gap-y-2.5 text-xs">
            <dt className="text-muted-foreground">Display name</dt>
            <dd className="font-medium text-foreground">{user?.name ?? "Demo user"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{user?.email ?? "demo@dsai.ai"}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="text-foreground">November 2026</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd>
              <span className="rounded-full bg-slate/15 px-2 py-0.5 text-[10px] font-medium text-slate">Free Preview</span>
            </dd>
          </dl>
        </section>

        <section className="rounded-xl border bg-surface/50 p-5">
          <h2 className="text-base font-semibold tracking-tight">Usage</h2>
          <div className="mt-5 space-y-4">
            {[
              { label: "AI credits", value: "3,250 / 5,000", width: "65%", icon: Sparkles },
              { label: "Compute", value: "42h / 100h", width: "42%", icon: Cpu },
              { label: "Storage", value: "40.44 KB / 100 MB", width: "2%", icon: Database },
            ].map((item) => (
              <div key={item.label} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-xs">
                <span className="flex items-center gap-2">
                  <item.icon className="size-3.5 text-slate" />
                  {item.label}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-raised">
                  <span className="block h-full rounded-full bg-slate" style={{ width: item.width }} />
                </span>
                <span className="text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Role</h2>
        <p className="mt-1 text-xs text-muted-foreground">Select the role that best describes how you use DSAI.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {roles.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-pressed={role === label}
              onClick={() => {
                setRole(label);
                setSaved(false);
              }}
              className={cn(
                "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border bg-background/20 px-2 text-xs hover:border-border-strong",
                role === label && "border-slate bg-slate/10 text-foreground font-medium"
              )}
            >
              <Icon className="size-5 text-slate" />
              {label}
              {role === label && (
                <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-slate text-background">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Profile information</h2>
        <p className="mt-1 text-xs text-muted-foreground">Help personalize the preview experience.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Department
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-foreground outline-none">
              <option>Software Development</option>
              <option>Data & Analytics</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Industry
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-foreground outline-none">
              <option>Technology</option>
              <option>Finance</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Preferred technology
            <input
              defaultValue="Python, SQL, dbt, Snowflake"
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-foreground outline-none"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Primary goals
            <input
              defaultValue="Analyze data, build insights, and support decisions"
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-foreground outline-none"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3 border-t pt-4">
          {saved && <span role="status" className="text-xs text-sage">Preview preferences saved</span>}
          <Button type="button" onClick={() => setSaved(true)} className="h-8 text-xs">
            Save changes
          </Button>
        </div>
      </section>
    </div>
  );
}

function ApiKeysPanel() {
  return (
    <div role="tabpanel" className="mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Bring your own AI keys.</h2>
        <p className="mt-1.5 max-w-3xl text-xs leading-5 text-muted-foreground">
          Provider credentials stay safely on the backend and are never entered or stored in the browser.
        </p>
      </div>
      <section className="rounded-xl border bg-surface/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-10 place-items-center rounded-lg border bg-raised text-slate">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold text-foreground">Google Gemini</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Managed via backend environment variables</p>
          </div>
          <Button type="button" variant="outline" disabled title="Configure provider credentials in the backend environment" className="text-xs h-8">
            <ServerCog className="size-3.5" /> Backend managed
          </Button>
        </div>
      </section>
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Configuration status</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-background/20 p-4">
            <p className="text-xs text-muted-foreground">Allowed models</p>
            <p className="mt-1 text-sm font-medium">Provided by <code className="text-slate">GET /api/models</code></p>
          </div>
          <div className="rounded-lg border bg-background/20 p-4">
            <p className="text-xs text-muted-foreground">Secret storage</p>
            <p className="mt-1 text-sm font-medium">Backend environment only</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthenticationPanel() {
  const { user } = useAuth();

  return (
    <div role="tabpanel" className="mt-6 space-y-4">
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Sign-in details</h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-12 gap-y-3 text-sm">
          <span className="text-muted-foreground">Identity</span>
          <span className="font-medium text-foreground">{user?.name ?? "Demo user"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/15 px-2 py-0.5 text-xs text-sage">
            <CheckCircle2 className="size-3.5" /> Active
          </span>
        </div>
      </section>
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Authentication</h2>
        <div className="mt-4 rounded-lg border border-dashed bg-background/20 px-5 py-6">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 text-slate" />
            <div>
              <h3 className="text-sm font-medium">Demo authentication</h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                This project uses predefined demo identities. Password changes and production sign-in methods are intentionally unavailable in this preview.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">Current session</h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-raised text-slate">
            <Laptop className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Current browser session</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Local demo environment</p>
          </div>
          <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-[11px] text-sage">Active</span>
        </div>
      </section>
    </div>
  );
}

const plans = [
  { name: "Free", badge: "Current plan", features: ["100 MB storage", "Basic analysis", "5 active workspaces", "Community support"] },
  { name: "Pro", badge: "Coming soon", features: ["5 GB storage", "Advanced analysis", "Unlimited active workspaces", "Priority support", "Custom integrations"] },
  { name: "Pro+", badge: "Coming soon", features: ["Unlimited storage", "All Pro features", "Team collaboration", "Dedicated support", "Custom SLA", "API access"] },
];

function PlanPanel() {
  return (
    <div className="mt-7 space-y-5">
      <section className="rounded-xl border bg-surface/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Storage usage</h2>
          <span className="text-xs text-muted-foreground">40.44 KB of 100 MB</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-raised">
          <span className="block h-full min-w-3 rounded-full bg-slate" style={{ width: "1%" }} />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <section key={plan.name} className="rounded-xl border bg-surface/50 p-5">
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <h2 className="text-xl font-semibold tracking-tight">{plan.name}</h2>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium",
                  plan.name === "Free" ? "bg-primary text-primary-foreground" : "bg-slate/15 text-slate"
                )}
              >
                {plan.badge}
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-slate/15 text-slate">
                    <Check className="size-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const requested = useSearchParams().get("view");
  const [view, setView] = useState<"overview" | Detail>(requested === "usage" ? "usage" : "overview");

  const initials = (user?.name ?? "Demo User")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (view === "overview") {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <div className="mt-6 flex items-center gap-4 rounded-xl border bg-surface/50 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-slate/15 text-sm font-semibold text-slate">
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight">{user?.name ?? "Demo user"}</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {user?.email ?? "demo@dsai.ai"} · Personal workspace
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {settingsCards.map(({ view: target, title, description, icon: Icon, badge }) => (
            <button
              key={target}
              type="button"
              onClick={() => setView(target)}
              className="flex w-full items-center gap-4 rounded-xl border bg-surface/50 p-4 text-left transition-colors hover:border-border-strong hover:bg-surface"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-raised text-slate">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{title}</span>
                  {badge && (
                    <span className="rounded-full bg-slate/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    );
  }

  const title = view === "plan" ? "Your plan" : view === "usage" ? "Usage analytics" : "Settings";
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setView("overview")}
        className="-ml-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Settings overview
      </Button>
      <div className="mt-4 flex items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-slate/15 font-semibold text-slate text-sm">
          {initials}
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {view !== "plan" && view !== "usage" && (
            <p className="mt-0.5 text-xs text-muted-foreground">{user?.name ?? "Demo user"}</p>
          )}
        </div>
      </div>
      <DetailTabs view={view} onChange={setView} />
      {view === "profile" && <ProfilePanel />}
      {view === "api" && <ApiKeysPanel />}
      {view === "authentication" && <AuthenticationPanel />}
      {view === "plan" && <PlanPanel />}
      {view === "usage" && <UsageAnalytics />}
    </section>
  );
}
