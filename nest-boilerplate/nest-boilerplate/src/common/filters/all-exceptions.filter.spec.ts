import type { ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter, isUniqueViolation } from "@/common/filters/all-exceptions.filter";

function run(exception: unknown) {
  let status = 0;
  let body: unknown;
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: unknown) {
      body = b;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body };
}

describe("Unique violations", () => {
  it("answers 409 CONFLICT with a generic message and no database details", () => {
    const wrapped = Object.assign(new Error('duplicate key value violates "uq_secret_name"'), {
      driverError: { code: "23505", constraint: "uq_secret_name" },
    });
    const { status, body } = run(wrapped);
    expect(status).toBe(409);
    expect(body).toEqual({ error: { code: "CONFLICT", message: "That value already exists" } });
    expect(JSON.stringify(body)).not.toContain("uq_secret_name");
  });

  it("recognises the error straight from pg too", () => {
    expect(isUniqueViolation(Object.assign(new Error("x"), { code: "23505" }))).toBe(true);
  });

  it("leaves other database errors as 500 and other values alone", () => {
    expect(run(Object.assign(new Error("SQL"), { driverError: { code: "42703" } })).status).toBe(500);
    expect(run(new Error("bug")).status).toBe(500);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
