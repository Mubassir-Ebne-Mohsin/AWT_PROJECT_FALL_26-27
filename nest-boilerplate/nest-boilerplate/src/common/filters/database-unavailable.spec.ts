import { databaseUnavailable } from "@/common/filters/database-unavailable";
describe("Database availability error classification", () => {
  it("classifies a refused connection and a PostgreSQL restart as unavailable", () => {
    expect(
      databaseUnavailable(
        Object.assign(new Error("private credentials"), {
          code: "ECONNREFUSED",
        }),
      ),
    ).toBe(true);
    expect(
      databaseUnavailable(
        Object.assign(new Error("private SQL"), {
          driverError: { code: "57P01" },
        }),
      ),
    ).toBe(true);
  });
  it("does not disguise constraints or SQL defects as an outage", () => {
    for (const code of ["23505", "42703"])
      expect(
        databaseUnavailable(
          Object.assign(new Error("SQL"), { driverError: { code } }),
        ),
      ).toBe(false);
    expect(databaseUnavailable(new Error("bug"))).toBe(false);
  });
});
