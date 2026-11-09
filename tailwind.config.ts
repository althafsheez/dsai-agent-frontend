import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    fontFamily: { sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    colors: {
      background: "var(--background)", foreground: "var(--foreground)",
      surface: "var(--surface)", raised: "var(--surface-raised)",
      border: "var(--border)", "border-strong": "var(--border-strong)",
      primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
      muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
      sidebar: { DEFAULT: "var(--sidebar)", foreground: "var(--sidebar-foreground)", accent: "var(--sidebar-accent)" },
      sage: "var(--sage)", slate: "var(--slate)", ring: "var(--ring)",
    },
    borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
  }},
  plugins: [],
} satisfies Config;

