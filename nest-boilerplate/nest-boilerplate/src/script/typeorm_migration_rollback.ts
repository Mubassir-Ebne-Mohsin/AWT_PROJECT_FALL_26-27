import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";

async function main() {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  await ds.undoLastMigration();
  console.log("Rolled back the last migration");
  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
