import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { AccountRole, type GrantableRole } from "@/common/enums/account-role.enum";
import { Role } from "@/common/enums/role.enum";
import { User } from "@/modules/users/entities/user.entity";
import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";

/** One demo account per role, so all four can be shown in the course demo. Reserved example domain, never real. */
export const DEMO_ACCOUNTS: Array<{ email: string; displayName: string; roles: GrantableRole[] }> = [
  { email: "demo-user@example.test", displayName: "Demo User", roles: [] },
  { email: "demo-instructor@example.test", displayName: "Demo Instructor", roles: [AccountRole.INSTRUCTOR] },
  { email: "demo-reviewer@example.test", displayName: "Demo Reviewer", roles: [AccountRole.REVIEWER] },
  { email: "demo-admin@example.test", displayName: "Demo Admin", roles: [AccountRole.ADMIN] },
];

/**
 * Development and course-demo only: refuses to run in production. Passwords are random per account and returned once
 * (null for an account that already existed, whose password is left alone). Re-running only re-applies the roles.
 */
export async function seedDemoAccounts(db: DataSource, options: { production: boolean }) {
  if (options.production) throw new Error("Demo accounts are never created in production");
  const roles = new AccountRolesService(db);
  const users = db.getRepository(User);
  const created: Array<{ email: string; password: string | null; roles: AccountRole[] }> = [];
  for (const account of DEMO_ACCOUNTS) {
    let user = await users.findOneBy({ email: account.email });
    let password: string | null = null;
    if (!user) {
      password = randomBytes(15).toString("base64url");
      user = await users.save(users.create({ email: account.email, displayName: account.displayName, passwordHash: await argon2.hash(password), role: Role.USER }));
    }
    for (const role of account.roles) await roles.grant(OPERATOR, user.id, { role });
    created.push({ email: account.email, password, roles: await roles.rolesOf(user.id) });
  }
  return created;
}
