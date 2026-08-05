import type { Config } from "drizzle-kit";

// Drizzle Kit configuration for PR-6 baseline migrations.
// Kept inside the database layer to avoid coupling application runtime to migrations.

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "localhost";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}?sslmode=disable`;
}

const config: Config = {
  dialect: "postgresql",
  schema: "./database/schema/index.ts",
  out: "./database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? localConnectionString(),
  },
};

export default config;
