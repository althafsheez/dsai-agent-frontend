import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    fontFamily: { sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    colors: {
      background: "var(--background)", foreground: "var(--foreground)",
      surface: {
        DEFAULT: "var(--surface)",
        2: "var(--surface-2)",
        3: "var(--surface-3)",
      },
      raised: "var(--surface-raised)",
      border: {
        DEFAULT: "var(--border)",
        strong: "var(--border-strong)",
      },
      input: "var(--input)",
      popover: "var(--popover)",
      primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
      muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
      sidebar: {
        DEFAULT: "var(--sidebar)",
        foreground: "var(--sidebar-foreground)",
        accent: "var(--sidebar-accent)",
        "accent-foreground": "var(--sidebar-accent-foreground)",
        border: "var(--sidebar-border)",
      },
      sage: "var(--sage)", slate: "var(--slate)", navy: "var(--navy)",
      destructive: "var(--destructive)", success: "var(--success)", ring: "var(--ring)",
    },
    borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
  }},
  plugins: [],
} satisfies Config;

