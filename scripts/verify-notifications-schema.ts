import { createDbClient } from "../database/client.js";
import { sql } from "drizzle-orm";
import { loadMonorepoEnv } from "@avana/config";

loadMonorepoEnv();

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();

async function main() {
  const { db, close } = createDbClient(connectionString);

  try {
    // 1. Check table existence
    const tableRes = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'notifications';
    `);
    console.log("TABLE_CHECK:", JSON.stringify(tableRes.rows));

    // 2. Check foreign key to users
    const fkRes = await db.execute(sql`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'notifications' AND tc.constraint_type = 'FOREIGN KEY';
    `);
    console.log("FOREIGN_KEYS:", JSON.stringify(fkRes.rows));

    // 3. Check indexes
    const indexRes = await db.execute(sql`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'notifications';
    `);
    console.log("INDEXES:", JSON.stringify(indexRes.rows, null, 2));
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
