import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TypeScript (no build step) — Next transpiles them.
  transpilePackages: ["@brazil-tms/shared", "@brazil-tms/db"],
  // The Postgres driver is a server-only native-ish dependency; keep it external to the bundle.
  serverExternalPackages: ["postgres"],
  // Linting is a separate quality-gate step (root `pnpm lint`, flat config). Don't double-lint
  // during `next build` (its legacy eslintrc detection conflicts with the flat config).
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
