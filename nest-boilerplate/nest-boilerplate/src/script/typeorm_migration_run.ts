import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";

async function main() {
  // Migration jobs are explicit/offline; do not relax the API's short query deadlines.
  const ds = new DataSource({ ...dataSourceOptions, extra: { ...dataSourceOptions.extra,
    statement_timeout: 60000, query_timeout: 65000, idle_in_transaction_session_timeout: 60000,
  } });
  await ds.initialize();
  const ran = await ds.runMigrations();
  console.log(
    ran.length
      ? `Applied: ${ran.map((m) => m.name).join(", ")}`
      : "Database is up to date",
  );
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
