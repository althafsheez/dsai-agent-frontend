import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"><p className="text-xs text-muted-foreground">404</p><h1 className="text-2xl font-medium">This page isn’t here.</h1><p className="text-sm text-muted-foreground">Return to your workspace to start again.</p><Button asChild><Link href="/">New Analysis</Link></Button></main>;
}

