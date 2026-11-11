import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
const compat = new FlatCompat({ baseDirectory: fileURLToPath(new URL(".", import.meta.url)) });
const config = [
  { ignores: [".next/**", ".next-dev/**", ".worktrees/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
export default config;
