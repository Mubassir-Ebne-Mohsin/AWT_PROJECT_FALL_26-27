import { DataSource } from "typeorm";
import { z } from "zod";
import { dataSourceOptions } from "@/config/database.config";
import { seedFoundationPack } from "@/modules/challenges/foundation-pack";
async function main() {
  const i = process.argv.indexOf("--instructor-id"),
    id = z.uuid().parse(i < 0 ? undefined : process.argv[i + 1]);
  const db = new DataSource(dataSourceOptions);
  await db.initialize();
  try {
    const added = await seedFoundationPack(db, id);
    process.stdout.write(
      `Foundation challenges added: ${added}. Existing published content was not changed.\n`,
    );
  } finally {
    await db.destroy();
  }
}
void main().catch(() => {
  process.stderr.write(
    "Could not seed foundation challenges. Apply the latest migration, then supply --instructor-id for an active Instructor with room for six challenges.\n",
  );
  process.exitCode = 1;
});
