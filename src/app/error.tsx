"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-10"><h1 className="text-xl font-medium">Something went wrong</h1><p className="text-sm text-muted-foreground">We couldn’t load this page. Please try again.</p><Button onClick={reset}>Try again</Button></div>;
}

