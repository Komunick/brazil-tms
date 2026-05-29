import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";

export type DB = PostgresJsDatabase<typeof schema>;

let instance: DB | undefined;

function init(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The BFF reaches Postgres via a direct, server-only connection (Drizzle).",
    );
  }
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

/** Returns the lazily-initialized singleton Drizzle client (server-only). */
export function getDb(): DB {
  return (instance ??= init());
}

/**
 * Ergonomic accessor: `db.select()...`, `db.transaction(...)`, etc. The underlying Postgres
 * connection is initialized lazily on first use so importing this module never requires
 * DATABASE_URL at build time.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
