"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";

export default function SignupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    login(email || "newuser@dsai.internal");
    setTimeout(() => {
      router.push("/");
    }, 250);
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
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Create account</h1>
          <p className="mt-1 text-xs text-muted-foreground">Start analyzing your datasets with agentic analytics</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-name" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Full name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Vance"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Work email
            </label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@company.com"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full text-xs font-medium h-9">
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline inline-flex items-center gap-0.5">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
