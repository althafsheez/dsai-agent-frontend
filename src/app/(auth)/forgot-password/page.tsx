"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-foreground selection:bg-slate/25">
      <div className="mb-8">
        <Link href="/" aria-label="DSAI home" className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Brand />
        </Link>
      </div>

      <div className="w-full max-w-[380px] rounded-2xl border border-border-strong bg-surface/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        {submitted ? (
          <div className="text-center py-4">
            <CheckCircle2 className="size-10 text-sage mx-auto mb-3" />
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Check your inbox</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              We&apos;ve sent a password reset link to <span className="text-foreground font-medium">{email}</span>.
            </p>
            <Button asChild variant="outline" className="mt-6 w-full text-xs">
              <Link href="/login">Return to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Reset password</h1>
              <p className="mt-1 text-xs text-muted-foreground">Enter your work email and we&apos;ll send you a recovery link</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Work email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1.5 block w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <Button type="submit" className="w-full text-xs font-medium h-9">
                Send reset link
              </Button>
            </form>

            <div className="mt-5 text-center">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="size-3" /> Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
