import { ReliableThrottlerStorage } from "@/providers/cache/redis/reliable-throttler-storage";
import { databaseUnavailable } from "@/common/filters/database-unavailable";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import {
  TimeoutError,
  SocketTimeoutError,
  SocketClosedUnexpectedlyError,
  ClientOfflineError,
  ClientClosedError,
  ConnectionTimeoutError,
} from "redis";
import { ArgumentsHost } from "@nestjs/common";

describe("M9 dependency safety", () => {
  const storage = (ready: boolean, call: () => Promise<unknown>) =>
    Object.assign(
      Object.create(
        ReliableThrottlerStorage.prototype,
      ) as ReliableThrottlerStorage,
      {
        redis: { status: ready ? "ready" : "reconnecting", call },
        scriptSrc: "audit",
      },
    );
  it("fails closed without enqueueing a rate-limit command while reconnecting", async () => {
    const call = jest.fn();
    await expect(
      storage(false, call).increment("k", 60000, 120, 60000, "default"),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(call).not.toHaveBeenCalled();
  });
  it("maps a command deadline to unavailable but preserves invalid Lua response defects", async () => {
    await expect(
      storage(true, async () => {
        throw new Error("Command timed out");
      }).increment("k", 60000, 120, 60000, "default"),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      storage(true, async () => "invalid").increment(
        "k",
        60000,
        120,
        60000,
        "default",
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });
  it("recognizes configured database deadlines without hiding schema/constraint errors", () => {
    for (const value of [
      Object.assign(new Error("cancelled"), { code: "57014" }),
      new Error("Query read timeout"),
      new Error("timeout exceeded when trying to connect"),
    ])
      expect(databaseUnavailable(value)).toBe(true);
    for (const code of ["23505", "42703"])
      expect(
        databaseUnavailable(Object.assign(new Error("SQL defect"), { code })),
      ).toBe(false);
    expect(databaseUnavailable(new Error("a generic timeout bug"))).toBe(false);
  });
  it.each([
    new TimeoutError(),
    new SocketTimeoutError(1000),
    new SocketClosedUnexpectedlyError(),
    new ClientOfflineError(),
    new ClientClosedError(),
    new ConnectionTimeoutError(),
  ])("maps Redis availability error %# to a safe503 envelope", (error) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(error, host);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "UNAVAILABLE",
        message: "A required service is temporarily unavailable",
      },
    });
  });
});
