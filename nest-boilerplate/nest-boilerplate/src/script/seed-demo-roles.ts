import { dataSourceOptions } from "@/config/database.config";
import { DataSource } from "typeorm";
import { seedDemoAccounts } from "@/modules/roles/demo-accounts";

/** Development and course-demo only. Prints each new account's random password once. Usage: pnpm seed:demo-roles */
async function main() {
  const db = new DataSource(dataSourceOptions);
  await db.initialize();
  try {
    for (const account of await seedDemoAccounts(db, { production: process.env.NODE_ENV === "production" })) {
      console.log(`${account.email}  roles: ${account.roles.join(", ")}  ${account.password ? `password: ${account.password}` : "(existing account, password unchanged)"}`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: { message?: string }) => {
  console.error(`Not done: ${error.message ?? error}`);
  process.exit(1);
});
