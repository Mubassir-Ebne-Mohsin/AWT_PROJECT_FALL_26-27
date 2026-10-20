import { Client } from "pg";
import * as dotenv from "dotenv";

// Creates the e2e database on first run so `pnpm test:e2e` needs no manual SQL.
export default async function globalSetup() {
  dotenv.config({ quiet: true });
  const database = process.env.DB_TEST_DATABASE ?? "stressforge_test";
  if (!/^[a-z0-9_]+$/i.test(database)) {
    throw new Error(`Unsafe DB_TEST_DATABASE name: ${database}`);
  }
  const admin = new Client({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      database,
    ]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
}
