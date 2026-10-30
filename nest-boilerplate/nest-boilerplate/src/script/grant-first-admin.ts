import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";
import { AccountRolesService } from "@/modules/roles/account-roles.service";

/**
 * One-time server command: makes the first Admin from an existing account. It refuses once any Admin exists, so it
 * cannot be used to add more (that is the Admin API's job). Usage: pnpm admin:bootstrap -- --email=you@example.com
 */
async function main() {
  const email = process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length);
  if (!email) {
    console.error("Usage: pnpm admin:bootstrap -- --email=<existing account email>");
    process.exit(2);
  }
  const db = new DataSource(dataSourceOptions);
  await db.initialize();
  try {
    const result = await new AccountRolesService(db).bootstrapAdmin(email);
    console.log(`Admin created. Roles now: ${result.roles.join(", ")}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: { message?: string }) => {
  console.error(`Not done: ${error.message ?? error}`);
  process.exit(1);
});
