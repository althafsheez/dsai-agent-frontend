import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@univerjs/preset-sheets-core/lib/index.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "DSAI — Your data, understood", template: "%s · DSAI" },
  description: "A focused workspace for exploring data and turning questions into insight.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
