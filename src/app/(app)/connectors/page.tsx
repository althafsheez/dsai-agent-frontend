import type { Metadata } from "next";
import { ConnectorsPage } from "@/features/connectors/components/connectors-page";

export const metadata: Metadata = { title: "Connectors" };

export default function Page() {
  return <ConnectorsPage />;
}
