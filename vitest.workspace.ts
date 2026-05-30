import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const emptyModule = fileURLToPath(new URL("./apps/web/test/empty.ts", import.meta.url));
const webRoot = fileURLToPath(new URL("./apps/web", import.meta.url));

export default defineWorkspace([
  {
    test: {
      name: "shared",
      root: "./packages/shared",
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  },
  {
    // Neutralize server-only / client-only guards so server lib units can be tested in node.
    resolve: {
      alias: {
        "server-only": emptyModule,
        "client-only": emptyModule,
        // tsconfig `@/*` path alias (apps/web). Vitest has no tsconfig-paths plugin, so the
        // master-data integration tests' `@/lib/...` imports need it spelled out here.
        "@/": `${webRoot}/`,
      },
    },
    test: {
      name: "web",
      root: "./apps/web",
      environment: "node",
      include: ["lib/**/*.test.ts"],
    },
  },
  {
    // Promoted trip-write services + any future @brazil-tms/db unit/integration tests (004 R2).
    resolve: {
      alias: {
        "server-only": emptyModule,
        "client-only": emptyModule,
      },
    },
    test: {
      name: "db",
      root: "./packages/db",
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  },
  {
    // Feature 004 — the activated worker (pg-boss jobs: parse/validate/detect-duplicates/confirm).
    resolve: {
      alias: {
        "server-only": emptyModule,
        "client-only": emptyModule,
      },
    },
    test: {
      name: "workers",
      root: "./workers",
      environment: "node",
      include: ["**/*.test.ts"],
    },
  },
]);
