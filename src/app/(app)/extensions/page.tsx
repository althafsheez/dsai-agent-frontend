import type { Metadata } from "next";
import { ExtensionsPage } from "@/features/connectors/components/connectors-page";

export const metadata: Metadata = { title: "Extensions" };

export default function Page() {
  return <ExtensionsPage />;
}
