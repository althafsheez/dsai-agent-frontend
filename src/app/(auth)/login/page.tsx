"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, users, switchUser, login } = useAuth();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("••••••••••••");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    login(email);
    setTimeout(() => {
      router.push("/");
    }, 250);
  };

  const handleSelectDemoUser = (selectedId: string) => {
    switchUser(selectedId);
    const target = users.find((u) => u.id === selectedId);
    if (target) {
      setEmail(target.email);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-foreground selection:bg-slate/25">
      <div className="mb-8">
        <Link href="/" aria-label="DSAI home" className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Brand />
        </Link>
      </div>

      <div className="w-full max-w-[380px] rounded-2xl border border-border-strong bg-surface/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1 text-xs text-muted-foreground">Sign in to your DSAI workspace to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full text-xs font-medium h-9">
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative my-5 flex items-center justify-center">
          <div className="w-full border-t border-border" />
          <span className="absolute bg-surface px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            or
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full justify-center gap-2 text-xs font-normal text-muted-foreground cursor-not-allowed opacity-75 h-9"
          title="Google SSO will be available with production authentication"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Google (unavailable in demo)
        </Button>

        {/* Demo User Quick Switcher */}
        <div className="mt-5 rounded-lg border border-border/80 bg-background/50 p-3">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="size-3 text-sage" />
            <span>Predefined demo profiles</span>
          </div>
          <div className="space-y-1">
            {users.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectDemoUser(item.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  item.id === user.id
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-[9px] font-semibold text-foreground">
                    {item.avatarInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] leading-tight">{item.name}</p>
                    <p className="truncate text-[9px] text-muted-foreground">{item.role}</p>
                  </div>
                </div>
                {item.id === user.id && <Check className="size-3 text-sage shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline inline-flex items-center gap-0.5">
            Sign up <ArrowRight className="size-3 inline" />
          </Link>
        </p>
      </div>
    </main>
  );
}
