import {
  roleDirectoryQuerySchema,
  roleDirectorySchema,
} from "@/common/contracts/phase3/roles.schema";
import { AccountRolesService } from "@/modules/roles/account-roles.service";
import type { DataSource } from "typeorm";
describe("Admin role directory", () => {
  it("strictly validates allowed filters, bounded pages and paired cursors", () => {
    expect(roleDirectoryQuerySchema.parse({})).toEqual({ limit: 12 });
    for (const q of [
      { role: "reviewer" },
      { role: "user" },
      { role: "admin' OR true--" },
      { limit: 21 },
      { limit: 0 },
      { before: "2026-11-26T00:00:00Z" },
      { beforeId: "10000000-0000-4000-8000-000000000001" },
      { unknown: "x" },
    ])
      expect(roleDirectoryQuerySchema.safeParse(q).success).toBe(false);
  });
  it("parameterizes filters and projects only account details, with stable effective legacy roles", async () => {
    const row = {
      id: "10000000-0000-4000-8000-000000000001",
      display_name: "Admin",
      email: "admin@example.test",
      account_status: "active",
      created_at: new Date("2026-11-26T00:00:00Z"),
      legacy: "admin",
      granted: ["support"],
      password: "must not leak",
    };
    const query = jest.fn().mockResolvedValue([row, row]);
    const service = new AccountRolesService({ query } as unknown as DataSource);
    const page = await service.directory({ role: "admin", limit: 1 });
    expect(query.mock.calls[0][1]).toEqual(["admin", null, null, 2]);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].roles).toEqual(["user", "support", "admin"]);
    expect(Object.keys(page.items[0]).sort()).toEqual([
      "createdAt",
      "displayName",
      "email",
      "id",
      "roles",
      "status",
    ]);
    expect(page.next).toEqual({ at: row.created_at.toISOString(), id: row.id });
    expect(roleDirectorySchema.parse(page)).toEqual(page);
  });
});
