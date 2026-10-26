import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import { SavedDesign } from "@/modules/designs/entities/design.entity";
import { SimulationService } from "@/modules/simulation/simulation.service";

describe("M9 provisional request identity", () => {
  it("does not let an invalid revision poison a concurrent valid request key", async () => {
    const db = {
      getRepository: () => ({ findOneBy: async () => null }),
    } as unknown as DataSource;
    const designs = new DesignsService(db);
    jest
      .spyOn(designs, "owned")
      .mockResolvedValue({ revision: 1 } as SavedDesign);
    const service = new RunsService(db, designs, {} as SimulationService);
    let rejectInvalid: (() => void) | undefined;
    jest
      .spyOn(
        service as unknown as {
          admit: (...args: unknown[]) => Promise<unknown>;
        },
        "admit",
      )
      .mockImplementation(async (...args) => {
        const request = args[3] as { expectedRevision: number };
        if (request.expectedRevision === 2)
          return new Promise((_, reject) => {
            rejectInvalid = () =>
              reject(
                new AppException("CONFLICT", "Wrong revision", {
                  reason: "REVISION_MISMATCH",
                }),
              );
          });
        return { run: { id: "accepted-valid-revision" } };
      });
    const invalid = service.submit("owner", "design", "simulation", {
      expectedRevision: 2,
      requestId: "one-key",
    });
    void invalid.catch(() => undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const valid = service.submit("owner", "design", "simulation", {
      expectedRevision: 1,
      requestId: "one-key",
    });
    void valid.catch(() => undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    rejectInvalid?.();
    const results = await Promise.allSettled([invalid, valid]);
    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: { code: "CONFLICT" },
    });
    expect(results[1]).toMatchObject({
      status: "fulfilled",
      value: { run: { id: "accepted-valid-revision" } },
    });
  });
});
