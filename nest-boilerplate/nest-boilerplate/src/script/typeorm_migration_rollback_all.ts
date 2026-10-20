import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";

async function main() {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  const applied = await ds.query(`SELECT count(*)::int AS n FROM "migrations"`);
  // undoLastMigration must run one at a time and be awaited.
  for (let i = 0; i < applied[0].n; i++) await ds.undoLastMigration();
  console.log("All migrations rolled back");
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
