import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsPage } from "@/features/settings/components/settings-page";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <Suspense><SettingsPage /></Suspense>;
}
