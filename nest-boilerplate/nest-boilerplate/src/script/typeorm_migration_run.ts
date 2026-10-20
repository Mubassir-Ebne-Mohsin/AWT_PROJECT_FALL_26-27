import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";

async function main() {
  const ds = new DataSource(dataSourceOptions);
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
