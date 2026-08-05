/**
 * Scoped database access layer for AVANA.
 *
 * Provides a configured Drizzle ORM client bound to a node-postgres pool.
 * Keeps database access isolated from application routes and domain logic.
 *
 * Usage:
 *   import { createDbClient } from "../../database/client.js";
 *   const db = createDbClient(connectionString);
 *   const result = await db.select().from(users);
 */

import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type DbClient = NodePgDatabase<typeof schema>;

export interface ScopedDb {
  db: DbClient;
  close: () => Promise<void>;
}

export function createDbClient(connectionString: string): ScopedDb {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema }) as DbClient;
  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}
