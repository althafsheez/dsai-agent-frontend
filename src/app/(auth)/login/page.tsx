import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
export const metadata: Metadata = { title: "Demo access" };
export default function LoginPage() {
  return <main className="flex min-h-dvh flex-col items-center justify-center px-6">
    <Brand /><div className="mt-8 w-full max-w-sm rounded-xl border bg-surface p-7 text-center">
      <h1 className="text-xl font-medium tracking-tight">Your workspace awaits</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Demo user selection will be connected with persistence. You can explore the frontend foundation now.</p>
      <Button asChild className="mt-6 w-full"><Link href="/">Explore preview</Link></Button>
      <p className="mt-4 text-[11px] text-muted-foreground">Frontend preview · No authentication yet</p>
    </div>
  </main>;
}

